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
  divisi: DivisiRab[];
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
async function statusRab(k: Klien, kepanitiaanId: string): Promise<{ status: string; dana: number }> {
  const m = await k.rab_meta.findUnique({ where: { kepanitiaan_id: kepanitiaanId }, select: { status: true, dana_tak_terduga: true } });
  return { status: m?.status ?? 'DRAFT', dana: angka(m?.dana_tak_terduga ?? null) ?? 0 };
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

  const [divisi, { status, dana }, hak] = await Promise.all([
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

  return {
    kepanitiaan_id: kepanitiaanId,
    nama_acara: acara.nama_acara,
    status,
    terbuka,
    dana_tak_terduga: dana,
    boleh_tambah_divisi: terbuka && hak.tambah,
    boleh_hapus_divisi: terbuka && hak.hapus,
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
export async function ubahItem(tx: TxKlien, konteks: Konteks, id: string, body: unknown): Promise<Hasil<ItemRab>> {
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
  return { ok: true, nilai: keItem(r) };
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
