/**
 * service RAB terstruktur (T-087). Server-only.
 *
 *   baca    siapa yang melihat angka RAB = aturan lib/acara/service.ts
 *           (`muatAcara().boleh_rab`) — satu sumber, bukan salinan
 *   tulis   item & sub-section: `bisaTulisDivisi` (T-085, cermin RLS 039)
 *           DAN RAB masih terbuka (DRAFT/DIAJUKAN — INV-29) DAN periode aktif
 *   divisi  tambah: Admin/Ketua/Wakil, Kadept PIC, Ketua Pelaksana;
 *           hapus: tanpa Ketua Pelaksana (cermin RLS divisi_delete), dan
 *           ditolak bila divisi sudah punya nota (bukti keuangan tidak ikut
 *           terhapus lewat CASCADE)
 *
 * Total dihitung ulang di server dengan `terapkanUbah` yang sama dengan grid
 * (INV-27); nilai server yang dikembalikan menimpa nilai optimistis klien.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-087 · PRD F-9.1, F-9.3 · INV-26, INV-27, INV-29, INV-30
 */

import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { muatAcara } from '@/lib/acara/service';
import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { kadeptPic, putusanTulisDivisi } from '@/lib/kepanitiaan/akses';
import type { DataEksporRab } from '@/lib/rab/excel-export';
import { SkemaUbahItem, terapkanUbah, type DivisiRab, type ItemRab } from '@/lib/rab/item';

if (typeof window !== 'undefined') {
  throw new Error('lib/rab/service.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

type Klien = TxKlien | typeof db;

export type KodeGagalRab = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'RAB_TERKUNCI' | 'NAMA_TERPAKAI' | 'MASIH_DIPAKAI';
export const STATUS_GAGAL_RAB: Record<KodeGagalRab, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  RAB_TERKUNCI: 409,
  NAMA_TERPAKAI: 409,
  MASIH_DIPAKAI: 409,
};
export type Hasil<T> = { ok: true; nilai: T } | { ok: false; kode: KodeGagalRab; pesan: string };

const gagal = (kode: KodeGagalRab, pesan: string): Hasil<never> => ({ ok: false, kode, pesan });
const STATUS_TERBUKA = ['DRAFT', 'DIAJUKAN'];
const angka = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));

export interface DataRab {
  kepanitiaan_id: string;
  nama_acara: string;
  status: string;
  terbuka: boolean;
  dana_tak_terduga: number;
  boleh_tambah_divisi: boolean;
  boleh_hapus_divisi: boolean;
  /** Jejak status untuk StatusRabBar (T-089). */
  meta: { disetujui_oleh: string | null; disetujui_at: string | null; alasan_buka_kunci: string | null };
  /** Aksi status yang boleh dijalankan pengguna ini SEKARANG (T-089). */
  izin_status: IzinStatus;
  divisi: DivisiRab[];
}

export interface IzinStatus {
  ajukan: boolean;
  kunci: boolean;
  kembalikan: boolean;
  buka: boolean;
}

// ---------------------------------------------------------------------------
// Hak
// ---------------------------------------------------------------------------

async function hakDivisiAcara(k: Klien, konteks: Konteks, kepanitiaanId: string) {
  const kp = await k.kepanitiaan.findUnique({
    where: { id: kepanitiaanId },
    select: { ketua_pelaksana: true, proker: { select: { departemen_id: true, periode_id: true } } },
  });
  if (!kp || kp.proker.periode_id !== konteks.periodeId) return { tambah: false, hapus: false };
  const pimpinan = can(konteks.roles, 'kepanitiaan.update') && lingkupKonteks(konteks, 'kepanitiaan.update') === null;
  const pic = pimpinan || (await kadeptPic(konteks, kp.proker.departemen_id, k));
  const bukanBph = konteks.roles.some((r) => r !== 'BPH');
  return { tambah: pic || (bukanBph && kp.ketua_pelaksana === konteks.sesi.userId), hapus: pic };
}

/** Status RAB acara; tanpa rab_meta = DRAFT (sama dengan rab_terbuka() di SQL). */
async function statusRab(k: Klien, kepanitiaanId: string) {
  const m = await k.rab_meta.findUnique({
    where: { kepanitiaan_id: kepanitiaanId },
    select: { status: true, dana_tak_terduga: true, disetujui_at: true, alasan_buka_kunci: true, app_user: { select: { nama_lengkap: true } } },
  });
  return {
    status: m?.status ?? 'DRAFT',
    dana: angka(m?.dana_tak_terduga ?? null) ?? 0,
    meta: {
      disetujui_oleh: m?.app_user?.nama_lengkap ?? null,
      disetujui_at: m?.disetujui_at?.toISOString() ?? null,
      alasan_buka_kunci: m?.alasan_buka_kunci ?? null,
    },
  };
}

/**
 * Siapa boleh menjalankan transisi apa (USER_FLOW §11.3, T-089):
 *   ajukan      DRAFT → DIAJUKAN: panitia acara (koordinator/anggota divisi,
 *               Ketua Pelaksana), Admin, Bendum
 *   kunci       DIAJUKAN → DISETUJUI: `rab.lock` (Admin, Ketua, Wakil, Bendum)
 *   kembalikan  DIAJUKAN → DRAFT, wajib catatan: `rab.lock` atau Ketua Pelaksana
 *   buka        DISETUJUI → DRAFT, wajib alasan: `rab.lock`
 * Periode lain = arsip: tidak ada aksi. Tidak ada jalur paksa untuk Admin.
 */
async function hitungIzinStatus(k: Klien, konteks: Konteks, kepanitiaanId: string, status: string): Promise<IzinStatus> {
  const kp = await k.kepanitiaan.findUnique({
    where: { id: kepanitiaanId },
    select: {
      ketua_pelaksana: true,
      proker: { select: { periode_id: true } },
      divisi: { select: { koordinator_id: true, divisi_member: { select: { user_id: true } } } },
    },
  });
  const tidak = { ajukan: false, kunci: false, kembalikan: false, buka: false };
  if (!kp || kp.proker.periode_id !== konteks.periodeId) return tidak;
  const pelaku = { userId: konteks.sesi.userId, roles: konteks.roles, periodeId: konteks.periodeId };
  const fakta = (d: (typeof kp.divisi)[number]) => ({
    periodeId: kp.proker.periode_id,
    ketuaPelaksanaId: kp.ketua_pelaksana,
    koordinatorId: d.koordinator_id,
    anggotaIds: d.divisi_member.map((m) => m.user_id),
  });
  const bukanBph = konteks.roles.some((r) => r !== 'BPH');
  const ketuplak = bukanBph && kp.ketua_pelaksana === konteks.sesi.userId;
  const panitia = ketuplak || kp.divisi.some((d) => putusanTulisDivisi(pelaku, fakta(d)));
  const pengunci = can(konteks.roles, 'rab.lock');
  return {
    ajukan: status === 'DRAFT' && panitia,
    kunci: status === 'DIAJUKAN' && pengunci,
    kembalikan: status === 'DIAJUKAN' && (pengunci || ketuplak),
    buka: status === 'DISETUJUI' && pengunci,
  };
}

/** Pemeriksaan tulis satu divisi: ada, periode aktif, hak panitia/Admin/Bendum, RAB terbuka. */
async function bolehTulis(k: Klien, konteks: Konteks, divisiId: string): Promise<Hasil<{ kepanitiaanId: string }>> {
  const d = await k.divisi.findUnique({
    where: { id: divisiId },
    select: {
      kepanitiaan_id: true,
      koordinator_id: true,
      divisi_member: { select: { user_id: true } },
      kepanitiaan: { select: { ketua_pelaksana: true, proker: { select: { periode_id: true } } } },
    },
  });
  if (!d) return gagal('TIDAK_DITEMUKAN', 'Divisi tidak ditemukan.');
  const boleh = putusanTulisDivisi(
    { userId: konteks.sesi.userId, roles: konteks.roles, periodeId: konteks.periodeId },
    {
      periodeId: d.kepanitiaan.proker.periode_id,
      ketuaPelaksanaId: d.kepanitiaan.ketua_pelaksana,
      koordinatorId: d.koordinator_id,
      anggotaIds: d.divisi_member.map((m) => m.user_id),
    },
  );
  if (!boleh) return gagal('TIDAK_BERWENANG', 'RAB divisi ini hanya dapat diubah panitia divisinya, Ketua Pelaksana, atau Bendahara.');
  const { status } = await statusRab(k, d.kepanitiaan_id);
  if (!STATUS_TERBUKA.includes(status)) return gagal('RAB_TERKUNCI', `RAB berstatus ${status} dan terkunci. Minta Bendahara membuka kuncinya.`);
  return { ok: true, nilai: { kepanitiaanId: d.kepanitiaan_id } };
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

const PILIH_ITEM = {
  id: true,
  section_id: true,
  no_urut: true,
  jenis_barang: true,
  jumlah_teks: true,
  jumlah_numerik: true,
  harga_satuan: true,
  total: true,
  total_manual: true,
  keterangan: true,
} as const;

function keItem(i: {
  id: string;
  section_id: string;
  no_urut: number;
  jenis_barang: string;
  jumlah_teks: string;
  jumlah_numerik: Prisma.Decimal | null;
  harga_satuan: Prisma.Decimal;
  total: Prisma.Decimal;
  total_manual: boolean;
  keterangan: string | null;
}): ItemRab {
  return { ...i, jumlah_numerik: angka(i.jumlah_numerik), harga_satuan: Number(i.harga_satuan), total: Number(i.total) };
}

/**
 * Pohon RAB satu acara. `null` = acara tidak ada/tidak terlihat (404);
 * `'TERBATAS'` = acara terlihat tetapi angka RAB-nya bukan haknya.
 */
export async function muatRab(konteks: Konteks, kepanitiaanId: string, klien: Klien = db): Promise<DataRab | 'TERBATAS' | null> {
  const acara = await muatAcara(konteks, kepanitiaanId);
  if (!acara) return null;
  if (!acara.boleh_rab) return 'TERBATAS';

  const [divisi, { status, dana, meta }, hak] = await Promise.all([
    klien.divisi.findMany({
      where: { kepanitiaan_id: kepanitiaanId },
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
      select: {
        id: true,
        nama: true,
        warna: true,
        koordinator_id: true,
        divisi_member: { select: { user_id: true } },
        rab_section: {
          orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
          select: { id: true, nama: true, urutan: true, rab_item: { orderBy: { no_urut: 'asc' }, select: PILIH_ITEM } },
        },
      },
    }),
    statusRab(klien, kepanitiaanId),
    hakDivisiAcara(klien, konteks, kepanitiaanId),
  ]);
  const kp = await klien.kepanitiaan.findUniqueOrThrow({
    where: { id: kepanitiaanId },
    select: { ketua_pelaksana: true, proker: { select: { periode_id: true } } },
  });
  const terbuka = STATUS_TERBUKA.includes(status);
  const pelaku = { userId: konteks.sesi.userId, roles: konteks.roles, periodeId: konteks.periodeId };
  const izin_status = await hitungIzinStatus(klien, konteks, kepanitiaanId, status);

  return {
    kepanitiaan_id: kepanitiaanId,
    nama_acara: acara.nama_acara,
    status,
    terbuka,
    dana_tak_terduga: dana,
    boleh_tambah_divisi: terbuka && hak.tambah,
    boleh_hapus_divisi: terbuka && hak.hapus,
    meta,
    izin_status,
    divisi: divisi.map((d) => ({
      id: d.id,
      nama: d.nama,
      warna: d.warna,
      boleh_tulis:
        terbuka &&
        putusanTulisDivisi(pelaku, {
          periodeId: kp.proker.periode_id,
          ketuaPelaksanaId: kp.ketua_pelaksana,
          koordinatorId: d.koordinator_id,
          anggotaIds: d.divisi_member.map((m) => m.user_id),
        }),
      sections: d.rab_section.map((s) => ({ id: s.id, nama: s.nama, urutan: s.urutan, items: s.rab_item.map(keItem) })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Struktur: divisi, sub-section, item baru
// ---------------------------------------------------------------------------

const nama = (label: string) => z.string({ error: `${label} wajib diisi.` }).trim().min(1, `${label} wajib diisi.`).max(100, `${label} maksimal 100 karakter.`);

export const SkemaAksiRab = z.discriminatedUnion('aksi', [
  z.object({ aksi: z.literal('TAMBAH_DIVISI'), nama: nama('Nama divisi') }),
  z.object({ aksi: z.literal('HAPUS_DIVISI'), divisi_id: z.uuid() }),
  z.object({ aksi: z.literal('TAMBAH_SECTION'), divisi_id: z.uuid(), nama: nama('Nama sub-section') }),
  z.object({ aksi: z.literal('UBAH_SECTION'), section_id: z.uuid(), nama: nama('Nama sub-section') }),
  z.object({ aksi: z.literal('HAPUS_SECTION'), section_id: z.uuid() }),
  z.object({ aksi: z.literal('TAMBAH_ITEM'), section_id: z.uuid() }),
]);

const unik = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

async function divisiSection(tx: TxKlien, sectionId: string, kepanitiaanId: string): Promise<string | null> {
  const s = await tx.rab_section.findUnique({ where: { id: sectionId }, select: { divisi_id: true, divisi: { select: { kepanitiaan_id: true } } } });
  return s && s.divisi.kepanitiaan_id === kepanitiaanId ? s.divisi_id : null;
}

/** Menjalankan satu aksi struktur. Mengembalikan id baris baru bila ada (untuk fokus di grid). */
export async function aksiRab(tx: TxKlien, konteks: Konteks, kepanitiaanId: string, body: unknown): Promise<Hasil<{ id: string | null }>> {
  const p = SkemaAksiRab.safeParse(body);
  if (!p.success) return gagal('VALIDASI_GAGAL', p.error.issues[0]?.message ?? 'Isian tidak valid.');
  const a = p.data;

  if (a.aksi === 'TAMBAH_DIVISI' || a.aksi === 'HAPUS_DIVISI') {
    const hak = await hakDivisiAcara(tx, konteks, kepanitiaanId);
    const { status } = await statusRab(tx, kepanitiaanId);
    if (!STATUS_TERBUKA.includes(status)) return gagal('RAB_TERKUNCI', `RAB berstatus ${status} dan terkunci.`);

    if (a.aksi === 'TAMBAH_DIVISI') {
      if (!hak.tambah) return gagal('TIDAK_BERWENANG', 'Divisi ditambah Ketua Pelaksana, Kadept penanggung jawab, atau pimpinan.');
      const urutan = await tx.divisi.count({ where: { kepanitiaan_id: kepanitiaanId } });
      try {
        const d = await tx.divisi.create({ data: { kepanitiaan_id: kepanitiaanId, nama: a.nama, urutan }, select: { id: true } });
        return { ok: true, nilai: { id: d.id } };
      } catch (e) {
        if (unik(e)) return gagal('NAMA_TERPAKAI', `Divisi "${a.nama}" sudah ada di acara ini.`);
        throw e;
      }
    }

    if (!hak.hapus) return gagal('TIDAK_BERWENANG', 'Divisi dihapus Kadept penanggung jawab atau pimpinan.');
    const d = await tx.divisi.findFirst({ where: { id: a.divisi_id, kepanitiaan_id: kepanitiaanId }, select: { id: true, nama: true, _count: { select: { nota: true } } } });
    if (!d) return gagal('TIDAK_DITEMUKAN', 'Divisi tidak ditemukan.');
    if (d._count.nota > 0) return gagal('MASIH_DIPAKAI', `Divisi ${d.nama} sudah punya ${d._count.nota} nota dan tidak dapat dihapus.`);
    await tx.divisi.delete({ where: { id: d.id } });
    return { ok: true, nilai: { id: null } };
  }

  const divisiId = a.aksi === 'TAMBAH_SECTION' ? a.divisi_id : await divisiSection(tx, a.section_id, kepanitiaanId);
  if (!divisiId) return gagal('TIDAK_DITEMUKAN', 'Sub-section tidak ditemukan.');
  if (a.aksi === 'TAMBAH_SECTION') {
    const ada = await tx.divisi.findFirst({ where: { id: divisiId, kepanitiaan_id: kepanitiaanId }, select: { id: true } });
    if (!ada) return gagal('TIDAK_DITEMUKAN', 'Divisi tidak ditemukan.');
  }
  const izin = await bolehTulis(tx, konteks, divisiId);
  if (!izin.ok) return izin;

  try {
    switch (a.aksi) {
      case 'TAMBAH_SECTION': {
        const urutan = await tx.rab_section.count({ where: { divisi_id: divisiId } });
        const s = await tx.rab_section.create({ data: { divisi_id: divisiId, nama: a.nama.toUpperCase(), urutan }, select: { id: true } });
        return { ok: true, nilai: { id: s.id } };
      }
      case 'UBAH_SECTION':
        await tx.rab_section.update({ where: { id: a.section_id }, data: { nama: a.nama.toUpperCase() } });
        return { ok: true, nilai: { id: a.section_id } };
      case 'HAPUS_SECTION':
        await tx.rab_section.delete({ where: { id: a.section_id } });
        return { ok: true, nilai: { id: null } };
      case 'TAMBAH_ITEM': {
        const terakhir = await tx.rab_item.aggregate({ where: { section_id: a.section_id }, _max: { no_urut: true } });
        const i = await tx.rab_item.create({
          data: { section_id: a.section_id, no_urut: (terakhir._max.no_urut ?? 0) + 1, jenis_barang: '', jumlah_teks: '', harga_satuan: 0, total: 0 },
          select: { id: true },
        });
        return { ok: true, nilai: { id: i.id } };
      }
    }
  } catch (e) {
    if (unik(e)) return gagal('NAMA_TERPAKAI', 'Nama sub-section sudah dipakai di divisi ini.');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

async function itemDenganDivisi(tx: TxKlien, id: string) {
  return tx.rab_item.findUnique({ where: { id }, select: { ...PILIH_ITEM, rab_section: { select: { divisi_id: true } } } });
}

/** Mengubah satu item. Nilai yang dikembalikan adalah kebenaran server (INV-27). */
/** Item hasil simpan + laporan verifikasi ulang total klien (INV-27, T-088). */
export type ItemTerverifikasi = ItemRab & {
  diverifikasi: { total_klien: number | null; total_server: number; selisih: boolean };
};

export async function ubahItem(tx: TxKlien, konteks: Konteks, id: string, body: unknown): Promise<Hasil<ItemTerverifikasi>> {
  const p = SkemaUbahItem.safeParse(body);
  if (!p.success) return gagal('VALIDASI_GAGAL', p.error.issues[0]?.message ?? 'Isian tidak valid.');
  const lama = await itemDenganDivisi(tx, id);
  if (!lama) return gagal('TIDAK_DITEMUKAN', 'Item RAB tidak ditemukan.');
  const izin = await bolehTulis(tx, konteks, lama.rab_section.divisi_id);
  if (!izin.ok) return izin;

  const baru = terapkanUbah(keItem(lama), p.data);
  const r = await tx.rab_item.update({
    where: { id },
    data: {
      jenis_barang: baru.jenis_barang,
      jumlah_teks: baru.jumlah_teks,
      jumlah_numerik: baru.jumlah_numerik,
      harga_satuan: baru.harga_satuan,
      total: baru.total,
      total_manual: baru.total_manual,
      keterangan: baru.keterangan,
      updated_at: new Date(),
    },
    select: PILIH_ITEM,
  });
  const tersimpan = keItem(r);
  const klien = p.data.total_klien ?? null;
  return {
    ok: true,
    nilai: {
      ...tersimpan,
      diverifikasi: { total_klien: klien, total_server: tersimpan.total, selisih: klien !== null && Math.round(klien) !== tersimpan.total },
    },
  };
}

/** Menghapus item lalu merapatkan nomor urut (UNIQUE section_id, no_urut). */
export async function hapusItem(tx: TxKlien, konteks: Konteks, id: string): Promise<Hasil<{ id: string }>> {
  const lama = await itemDenganDivisi(tx, id);
  if (!lama) return gagal('TIDAK_DITEMUKAN', 'Item RAB tidak ditemukan.');
  const izin = await bolehTulis(tx, konteks, lama.rab_section.divisi_id);
  if (!izin.ok) return izin;

  await tx.rab_item.delete({ where: { id } });
  // Dua langkah supaya UNIQUE tidak bertabrakan saat menggeser: negatif dulu, lalu urut ulang.
  await tx.$executeRaw`UPDATE rab_item SET no_urut = -no_urut WHERE section_id = ${lama.section_id}::uuid AND no_urut > ${lama.no_urut}`;
  await tx.$executeRaw`UPDATE rab_item SET no_urut = -no_urut - 1 WHERE section_id = ${lama.section_id}::uuid AND no_urut < 0`;
  return { ok: true, nilai: { id } };
}

// ---------------------------------------------------------------------------
// Status & penguncian (T-089, PRD F-9.5, USER_FLOW §11.3)
// ---------------------------------------------------------------------------

export const SkemaAlasan = z.object({
  alasan: z
    .string({ error: 'Alasan wajib diisi.' })
    .trim()
    .min(10, 'Alasan minimal 10 karakter — tuliskan apa yang perlu diubah.')
    .max(500, 'Alasan maksimal 500 karakter.'),
});

export type AksiStatus = 'ajukan' | 'kunci' | 'kembalikan' | 'buka';

const TUJUAN: Record<AksiStatus, { dari: string; ke: 'DIAJUKAN' | 'DISETUJUI' | 'DRAFT' }> = {
  ajukan: { dari: 'DRAFT', ke: 'DIAJUKAN' },
  kunci: { dari: 'DIAJUKAN', ke: 'DISETUJUI' },
  kembalikan: { dari: 'DIAJUKAN', ke: 'DRAFT' },
  buka: { dari: 'DISETUJUI', ke: 'DRAFT' },
};

/**
 * Menjalankan satu transisi status. Hak dihitung ulang di sini (bukan dari
 * UI); trigger 041 menegakkan ulang mesin status dan kewajiban alasan di
 * database, jadi tidak ada jalur "paksa" — termasuk untuk Admin.
 */
export async function ubahStatusRab(
  tx: TxKlien,
  konteks: Konteks,
  kepanitiaanId: string,
  aksiDiminta: AksiStatus,
  body: unknown,
): Promise<Hasil<{ status: string }>> {
  const kp = await tx.kepanitiaan.findUnique({ where: { id: kepanitiaanId }, select: { id: true } });
  if (!kp) return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan.');

  let alasan: string | null = null;
  if (TUJUAN[aksiDiminta].ke === 'DRAFT') {
    const p = SkemaAlasan.safeParse(body);
    if (!p.success) return gagal('VALIDASI_GAGAL', p.error.issues[0]?.message ?? 'Alasan wajib diisi.');
    alasan = p.data.alasan;
  }

  // Kunci baris supaya dua penyetuju yang menekan tombol bersamaan tidak
  // sama-sama membaca DIAJUKAN.
  await tx.$executeRaw`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${kepanitiaanId}::uuid) ON CONFLICT (kepanitiaan_id) DO NOTHING`;
  await tx.$queryRaw`SELECT 1 FROM rab_meta WHERE kepanitiaan_id = ${kepanitiaanId}::uuid FOR UPDATE`;
  const { status, meta } = await statusRab(tx, kepanitiaanId);
  // "Kembali ke DRAFT" dari DIAJUKAN adalah pengembalian, bukan buka kunci.
  const aksi: AksiStatus = aksiDiminta === 'buka' && status === 'DIAJUKAN' ? 'kembalikan' : aksiDiminta;
  const t = TUJUAN[aksi];
  if (status !== t.dari) return gagal('RAB_TERKUNCI', `RAB berstatus ${status}; aksi ini hanya untuk RAB berstatus ${t.dari}.`);
  // Diperiksa sebelum UPDATE: penolakan trigger 041 di tengah transaksi
  // membatalkan seluruh transaksi dan hanya terbaca sebagai galat 500.
  if (alasan && alasan === meta.alasan_buka_kunci) {
    return gagal('VALIDASI_GAGAL', 'Tuliskan alasan baru — alasan ini sama persis dengan pembukaan kunci sebelumnya.');
  }

  const izin = await hitungIzinStatus(tx, konteks, kepanitiaanId, status);
  if (!izin[aksi]) {
    const siapa: Record<AksiStatus, string> = {
      ajukan: 'panitia acara ini',
      kunci: 'Bendahara, Ketua, Wakil, atau Admin',
      kembalikan: 'Ketua Pelaksana, Bendahara, Ketua, Wakil, atau Admin',
      buka: 'Bendahara, Ketua, Wakil, atau Admin',
    };
    return gagal('TIDAK_BERWENANG', `Aksi ini hanya untuk ${siapa[aksi]}.`);
  }

  await tx.rab_meta.update({
    where: { kepanitiaan_id: kepanitiaanId },
    data: {
      status: t.ke,
      ...(t.ke === 'DISETUJUI' ? { disetujui_oleh: konteks.sesi.userId, disetujui_at: new Date() } : {}),
      ...(alasan ? { alasan_buka_kunci: alasan } : {}),
    },
  });
  return { ok: true, nilai: { status: t.ke } };
}

/**
 * Transisi otomatis sistem: DISETUJUI → REALISASI saat nota pertama
 * terverifikasi (T-102), REALISASI → SELESAI saat LPJ di-generate (T-105).
 * Diam bila status sudah di depan; trigger 041 menolak lompatan lain.
 */
export async function majukanStatusRab(tx: TxKlien, kepanitiaanId: string, ke: 'REALISASI' | 'SELESAI'): Promise<boolean> {
  const dari = ke === 'REALISASI' ? 'DISETUJUI' : 'REALISASI';
  const r = await tx.rab_meta.updateMany({ where: { kepanitiaan_id: kepanitiaanId, status: dari }, data: { status: ke } });
  return r.count > 0;
}

// ---------------------------------------------------------------------------
// Data ekspor Excel (T-090)
// ---------------------------------------------------------------------------

/**
 * Data 4 sheet untuk `eksporRabXlsx`. Hak baca = `muatRab` (null → 404,
 * 'TERBATAS' → 403).
 *
 *   RAB          pohon RAB apa adanya (jumlah_teks asli, INV-26)
 *   RAB AKTUAL   item yang sama; total = realisasi = Σ nota_alokasi.nominal
 *                dari nota TERVERIFIKASI (T-103 memperkaya alokasinya)
 *   PEMASUKAN    "Total Pembayaran {acara}" dari peserta yang sudah bayar
 *                (bila ada peserta) + baris `pemasukan` manual; data peserta
 *   PENGELUARAN  pemasukan sebagai saldo awal, lalu nota TERVERIFIKASI
 *                berurutan tanggal belanja
 */
export async function dataEksporRab(konteks: Konteks, kepanitiaanId: string): Promise<DataEksporRab | 'TERBATAS' | null> {
  const rab = await muatRab(konteks, kepanitiaanId);
  if (rab === null || rab === 'TERBATAS') return rab;
  const divisiIds = rab.divisi.map((d) => d.id);

  const [alokasi, pemasukan, peserta, nota] = await Promise.all([
    divisiIds.length
      ? db.$queryRaw<{ rab_item_id: string; jumlah: Prisma.Decimal }[]>`
          SELECT a.rab_item_id::text, SUM(a.nominal) AS jumlah
          FROM nota_alokasi a JOIN nota n ON n.id = a.nota_id
          WHERE n.status = 'TERVERIFIKASI' AND n.divisi_id = ANY(${divisiIds}::uuid[]) AND a.rab_item_id IS NOT NULL
          GROUP BY a.rab_item_id`
      : Promise.resolve([]),
    db.pemasukan.findMany({ where: { kepanitiaan_id: kepanitiaanId }, orderBy: { no_urut: 'asc' }, select: { keterangan: true, saldo: true } }),
    db.peserta.findMany({
      where: { kepanitiaan_id: kepanitiaanId },
      orderBy: { no_urut: 'asc' },
      select: { nama_lengkap: true, sudah_bayar: true, tanggal_bayar: true, jumlah: true },
    }),
    divisiIds.length
      ? db.nota.findMany({
          where: { divisi_id: { in: divisiIds }, status: 'TERVERIFIKASI' },
          orderBy: [{ tanggal_belanja: 'asc' }, { created_at: 'asc' }],
          select: {
            tanggal_belanja: true,
            total_nota: true,
            keterangan: true,
            divisi: { select: { nama: true } },
            nota_alokasi: { select: { uraian_luar_rab: true, rab_item: { select: { jenis_barang: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  const realisasi = new Map(alokasi.map((a) => [a.rab_item_id, Number(a.jumlah)]));
  const terbayar = peserta.filter((p) => p.sudah_bayar).reduce((x, p) => x + Number(p.jumlah), 0);
  const sumber = [
    ...(peserta.length ? [{ keterangan: `Total Pembayaran ${rab.nama_acara}`, saldo: terbayar }] : []),
    ...pemasukan.map((p) => ({ keterangan: p.keterangan, saldo: Number(p.saldo) })),
  ];

  const tanpaId = (i: ItemRab) => ({
    jenis_barang: i.jenis_barang,
    jumlah_teks: i.jumlah_teks,
    jumlah_numerik: i.jumlah_numerik,
    harga_satuan: i.harga_satuan,
    total: i.total,
    total_manual: i.total_manual,
  });

  return {
    namaAcara: rab.nama_acara,
    rab: {
      divisi: rab.divisi.map((d) => ({ nama: d.nama, sections: d.sections.map((s) => ({ nama: s.nama, items: s.items.map(tanpaId) })) })),
      danaTakTerduga: rab.dana_tak_terduga,
    },
    aktual: {
      divisi: rab.divisi.map((d) => ({
        nama: d.nama,
        sections: d.sections.map((s) => ({ nama: s.nama, items: s.items.map((i) => ({ ...tanpaId(i), realisasi: realisasi.get(i.id) ?? 0 })) })),
      })),
      danaTakTerduga: rab.dana_tak_terduga,
    },
    pemasukan: sumber,
    peserta: peserta.map((p) => ({
      nama: p.nama_lengkap,
      bayar: p.sudah_bayar,
      tanggal: p.tanggal_bayar ? p.tanggal_bayar.toISOString().slice(0, 10) : null,
      jumlah: Number(p.jumlah),
    })),
    pengeluaran: nota.map((n) => ({
      tanggal: n.tanggal_belanja.toISOString().slice(0, 10),
      uraian:
        n.keterangan?.trim() ||
        n.nota_alokasi
          .map((a) => a.rab_item?.jenis_barang ?? a.uraian_luar_rab ?? '')
          .filter(Boolean)
          .join(', ') ||
        'Belanja',
      divisi: n.divisi.nama,
      nominal: Number(n.total_nota),
    })),
  };
}
