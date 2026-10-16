/**
 * Service upload nota (T-101, PRD F-11.1, USER_FLOW §7.1). Server-only.
 *
 *   unggah    Admin, atau panitia divisi itu (koordinator/anggota/Ketua
 *             Pelaksana, non-BPH, periode berjalan) — cermin RLS nota_insert
 *             (039 `panitia_tulis_divisi`). Bendum memverifikasi, tidak mengunggah.
 *   item RAB  hanya dari divisi yang boleh diunggahi pengguna (kontrak 2).
 *   alokasi   setiap baris ke item RAB divisi itu ATAU uraian luar RAB
 *             (ADR-006); total alokasi = total nota (INV-28, ADR-007) —
 *             selain itu ALOKASI_TIDAK_SEIMBANG beserta selisihnya.
 *   perbaiki  pengunggah, selama MENUNGGU_VERIFIKASI / DITOLAK /
 *             PERLU_PERBAIKAN → kembali MENUNGGU_VERIFIKASI (kontrak 7, migrasi 045).
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-101 · ADR-006 · ADR-007
 */

import { Prisma } from '@prisma/client';

import type { Konteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { bisaTulisPanitiaDivisi } from '@/lib/kepanitiaan/akses';
import { SkemaNota, selisihAlokasi, tanggalMasaDepan, type IsianNota } from '@/lib/nota/skema';
import { hitungTotalItem } from '@/lib/rab/calculate';
import { tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

if (typeof window !== 'undefined') {
  throw new Error('lib/nota/service.ts adalah modul server-only.');
}

type Klien = TxKlien | typeof db;

export type KodeGagalNota =
  'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'ALOKASI_TIDAK_SEIMBANG' | 'KONFLIK';
export const STATUS_GAGAL_NOTA: Record<KodeGagalNota, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  ALOKASI_TIDAK_SEIMBANG: 422,
  KONFLIK: 409,
};
export type Hasil<T> =
  | { ok: true; nilai: T }
  | { ok: false; kode: KodeGagalNota; pesan: string; details?: Record<string, unknown> };

export const STATUS_DAPAT_DIPERBAIKI = [
  'MENUNGGU_VERIFIKASI',
  'DITOLAK',
  'PERLU_PERBAIKAN',
] as const;

// ---------------------------------------------------------------------------
// Pilihan divisi & item RAB
// ---------------------------------------------------------------------------

export interface ItemPilihan {
  id: string;
  jenis_barang: string;
  section: string;
  jumlah_teks: string;
  harga_satuan: number;
  total: number;
}

export interface DivisiUpload {
  id: string;
  nama: string;
  acara: { id: string; nama: string };
  items: ItemPilihan[];
}

/**
 * Divisi yang boleh diunggahi nota oleh pengguna, beserta item RAB-nya.
 * Panitia: hanya divisi tempat ia terdaftar (atau seluruh divisi acara yang
 * ia ketuai). Admin: seluruh divisi periode berjalan.
 */
export async function divisiUntukUpload(
  konteks: Konteks,
  klien: Klien = db,
): Promise<DivisiUpload[]> {
  if (!can(konteks.roles, 'nota.create') || !konteks.periodeId) return [];
  const saya = konteks.sesi.userId;
  const admin = konteks.roles.includes('ADMIN');
  if (!admin && !konteks.roles.some((r) => r !== 'BPH')) return [];
  const baris = await klien.divisi.findMany({
    where: {
      kepanitiaan: { proker: { periode_id: konteks.periodeId } },
      ...(admin
        ? {}
        : {
            OR: [
              { koordinator_id: saya },
              { divisi_member: { some: { user_id: saya } } },
              { kepanitiaan: { ketua_pelaksana: saya } },
            ],
          }),
    },
    orderBy: [{ kepanitiaan: { nama_acara: 'asc' } }, { urutan: 'asc' }, { nama: 'asc' }],
    select: {
      id: true,
      nama: true,
      kepanitiaan: { select: { id: true, nama_acara: true } },
      rab_section: {
        orderBy: { urutan: 'asc' },
        select: {
          nama: true,
          rab_item: {
            orderBy: { no_urut: 'asc' },
            select: {
              id: true,
              jenis_barang: true,
              jumlah_teks: true,
              jumlah_numerik: true,
              harga_satuan: true,
              total: true,
              total_manual: true,
            },
          },
        },
      },
    },
    take: 300,
  });
  return baris.map((d) => ({
    id: d.id,
    nama: d.nama,
    acara: { id: d.kepanitiaan.id, nama: d.kepanitiaan.nama_acara },
    items: d.rab_section.flatMap((s) =>
      s.rab_item.map((i) => ({
        id: i.id,
        jenis_barang: i.jenis_barang,
        section: s.nama,
        jumlah_teks: i.jumlah_teks ?? '',
        harga_satuan: Number(i.harga_satuan),
        total: hitungTotalItem({
          jumlah_numerik: i.jumlah_numerik === null ? null : Number(i.jumlah_numerik),
          harga_satuan: Number(i.harga_satuan),
          total: Number(i.total),
          total_manual: i.total_manual,
        }),
      })),
    ),
  }));
}

async function bolehUnggah(konteks: Konteks, divisiId: string, k: Klien): Promise<boolean> {
  if (!can(konteks.roles, 'nota.create')) return false;
  if (konteks.roles.includes('ADMIN')) {
    const d = await k.divisi.findUnique({
      where: { id: divisiId },
      select: { kepanitiaan: { select: { proker: { select: { periode_id: true } } } } },
    });
    return d?.kepanitiaan.proker.periode_id === konteks.periodeId;
  }
  return bisaTulisPanitiaDivisi(konteks, divisiId, k);
}

// ---------------------------------------------------------------------------
// Validasi bersama buat & perbaiki
// ---------------------------------------------------------------------------

async function periksaIsian(
  tx: TxKlien,
  konteks: Konteks,
  body: unknown,
  notaLama: string | null,
): Promise<Hasil<IsianNota>> {
  const p = SkemaNota.safeParse(body);
  if (!p.success) {
    const i = p.error.issues[0];
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: i?.message ?? 'Isian nota tidak valid.' };
  }
  const n = p.data;
  if (tanggalMasaDepan(n.tanggal_belanja, tanggalHariIniJakarta())) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Tanggal belanja tidak boleh di masa depan.',
    };
  }
  if (!(await bolehUnggah(konteks, n.divisi_id, tx))) {
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Nota hanya dapat diunggah panitia divisi ini.',
    };
  }

  // Gambar: milik pengunggah, belum dipakai nota lain.
  const img = await tx.image.findUnique({
    where: { id: n.image_id },
    select: { uploader_id: true },
  });
  if (!img || img.uploader_id !== konteks.sesi.userId)
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Gambar nota tidak ditemukan. Unggah ulang fotonya.',
    };
  const dipakai = await tx.nota.findFirst({
    where: { image_id: n.image_id, ...(notaLama ? { NOT: { id: notaLama } } : {}) },
    select: { id: true },
  });
  if (dipakai) return { ok: false, kode: 'KONFLIK', pesan: 'Gambar ini sudah dipakai nota lain.' };

  // Item RAB: semuanya milik divisi itu (kontrak 2 — bukan hanya disaring di UI).
  const idItem = n.alokasi.flatMap((a) => (a.rab_item_id ? [a.rab_item_id] : []));
  if (idItem.length) {
    const sah = await tx.rab_item.count({
      where: { id: { in: idItem }, rab_section: { divisi_id: n.divisi_id } },
    });
    if (sah !== idItem.length)
      return {
        ok: false,
        kode: 'VALIDASI_GAGAL',
        pesan: 'Item RAB yang dipilih bukan milik divisi ini.',
      };
  }

  // INV-28 / ADR-007: persis sama, beserta selisihnya.
  const selisih = selisihAlokasi(n.total_nota, n.alokasi);
  if (selisih !== 0) {
    const totalAlokasi = n.total_nota + selisih;
    return {
      ok: false,
      kode: 'ALOKASI_TIDAK_SEIMBANG',
      pesan: `Total alokasi ${rp(totalAlokasi)} tidak sama dengan total nota ${rp(n.total_nota)} — selisih ${rp(Math.abs(selisih))}.`,
      details: { total_nota: n.total_nota, total_alokasi: totalAlokasi, selisih },
    };
  }
  return { ok: true, nilai: n };
}

const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

function dataAlokasi(notaId: string, n: IsianNota): Prisma.nota_alokasiCreateManyInput[] {
  return n.alokasi.map((a) => ({
    nota_id: notaId,
    rab_item_id: a.rab_item_id,
    uraian_luar_rab: a.rab_item_id ? null : a.uraian_luar_rab,
    jumlah_aktual: a.jumlah_aktual,
    harga_aktual: a.harga_aktual,
    nominal: a.nominal,
  }));
}

// ---------------------------------------------------------------------------
// Buat & perbaiki
// ---------------------------------------------------------------------------

export async function buatNota(
  tx: TxKlien,
  konteks: Konteks,
  body: unknown,
): Promise<Hasil<{ id: string; status: string }>> {
  const h = await periksaIsian(tx, konteks, body, null);
  if (!h.ok) return h;
  const n = h.nilai;
  const nota = await tx.nota.create({
    data: {
      divisi_id: n.divisi_id,
      image_id: n.image_id,
      uploader_id: konteks.sesi.userId,
      tanggal_belanja: new Date(`${n.tanggal_belanja}T00:00:00Z`),
      total_nota: n.total_nota,
      keterangan: n.keterangan || null,
      status: 'MENUNGGU_VERIFIKASI',
    },
    select: { id: true, status: true },
  });
  await tx.nota_alokasi.createMany({ data: dataAlokasi(nota.id, n) });
  return { ok: true, nilai: nota };
}

/** Pengunggah memperbaiki nota yang belum diverifikasi atau dikembalikan Bendahara (kontrak 7). */
export async function perbaikiNota(
  tx: TxKlien,
  konteks: Konteks,
  notaId: string,
  body: unknown,
): Promise<Hasil<{ id: string; status: string }>> {
  const lama = await tx.nota.findUnique({
    where: { id: notaId },
    select: { uploader_id: true, status: true, divisi_id: true },
  });
  if (!lama) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Nota tidak ditemukan.' };
  if (lama.uploader_id !== konteks.sesi.userId)
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Nota tidak ditemukan.' };
  if (!(STATUS_DAPAT_DIPERBAIKI as readonly string[]).includes(lama.status)) {
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: 'Nota yang sudah diverifikasi tidak dapat diubah.',
    };
  }
  const h = await periksaIsian(tx, konteks, body, notaId);
  if (!h.ok) return h;
  const n = h.nilai;
  if (n.divisi_id !== lama.divisi_id)
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Divisi nota tidak dapat dipindah. Unggah nota baru untuk divisi lain.',
    };
  // Hapus alokasi dulu: trigger batas atas (deferred) menilai keadaan akhir transaksi.
  await tx.nota_alokasi.deleteMany({ where: { nota_id: notaId } });
  const nota = await tx.nota.update({
    where: { id: notaId },
    data: {
      image_id: n.image_id,
      tanggal_belanja: new Date(`${n.tanggal_belanja}T00:00:00Z`),
      total_nota: n.total_nota,
      keterangan: n.keterangan || null,
      status: 'MENUNGGU_VERIFIKASI',
      alasan_penolakan: null,
      updated_at: new Date(),
    },
    select: { id: true, status: true },
  });
  await tx.nota_alokasi.createMany({ data: dataAlokasi(notaId, n) });
  return { ok: true, nilai: nota };
}

// ---------------------------------------------------------------------------
// Nota saya
// ---------------------------------------------------------------------------

export interface NotaSaya {
  id: string;
  divisi: string;
  acara: string;
  tanggal_belanja: string;
  total_nota: number;
  status: string;
  alasan_penolakan: string | null;
  dapat_diperbaiki: boolean;
}

export async function notaSaya(konteks: Konteks): Promise<NotaSaya[]> {
  const rows = await db.nota.findMany({
    where: {
      uploader_id: konteks.sesi.userId,
      divisi: { kepanitiaan: { proker: { periode_id: konteks.periodeId } } },
    },
    orderBy: { created_at: 'desc' },
    take: 50,
    select: {
      id: true,
      tanggal_belanja: true,
      total_nota: true,
      status: true,
      alasan_penolakan: true,
      divisi: { select: { nama: true, kepanitiaan: { select: { nama_acara: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    divisi: r.divisi.nama,
    acara: r.divisi.kepanitiaan.nama_acara,
    tanggal_belanja: r.tanggal_belanja.toISOString().slice(0, 10),
    total_nota: Number(r.total_nota),
    status: r.status,
    alasan_penolakan: r.alasan_penolakan,
    dapat_diperbaiki: (STATUS_DAPAT_DIPERBAIKI as readonly string[]).includes(r.status),
  }));
}

/** Isian nota milik pengunggah untuk form perbaikan; null bila bukan miliknya / tak dapat diperbaiki. */
export async function notaUntukPerbaikan(konteks: Konteks, notaId: string) {
  const n = await db.nota.findUnique({
    where: { id: notaId },
    select: {
      id: true,
      uploader_id: true,
      status: true,
      alasan_penolakan: true,
      divisi_id: true,
      image_id: true,
      tanggal_belanja: true,
      total_nota: true,
      keterangan: true,
      image: {
        select: { id: true, thumbnail_path: true, preview_path: true, original_filename: true },
      },
      nota_alokasi: {
        select: {
          rab_item_id: true,
          uraian_luar_rab: true,
          jumlah_aktual: true,
          harga_aktual: true,
          nominal: true,
        },
      },
    },
  });
  if (
    !n ||
    n.uploader_id !== konteks.sesi.userId ||
    !(STATUS_DAPAT_DIPERBAIKI as readonly string[]).includes(n.status)
  )
    return null;
  return {
    id: n.id,
    status: n.status,
    alasan_penolakan: n.alasan_penolakan,
    gambar: n.image,
    isian: {
      divisi_id: n.divisi_id,
      image_id: n.image_id,
      tanggal_belanja: n.tanggal_belanja.toISOString().slice(0, 10),
      total_nota: Number(n.total_nota),
      keterangan: n.keterangan,
      alokasi: n.nota_alokasi.map((a) => ({
        rab_item_id: a.rab_item_id,
        uraian_luar_rab: a.uraian_luar_rab,
        jumlah_aktual: a.jumlah_aktual === null ? null : Number(a.jumlah_aktual),
        harga_aktual: a.harga_aktual === null ? null : Number(a.harga_aktual),
        nominal: Number(a.nominal),
      })),
    } satisfies IsianNota,
  };
}
