/**
 * Verifikasi nota oleh Bendahara (T-102, PRD F-11.4, USER_FLOW §7.2). Server-only.
 *
 *   hak       `nota.verify` = Admin & Bendum saja (matriks PRD §5.1; RLS
 *             nota_update 015b/045 `has_role('ADMIN','BENDUM')`).
 *   gambar    antrian = THUMBNAIL, detail = PREVIEW, unduh = MASTER lewat
 *             /api/images/[id]/download (SYSTEM_DESIGN §9.5, INV-24).
 *   setujui   hanya dari MENUNGGU_VERIFIKASI, baris dikunci FOR UPDATE;
 *             INV-28 diperiksa ULANG (ADR-007) — nota tak lolos lewat API.
 *             Nota pertama yang terverifikasi memajukan RAB DISETUJUI →
 *             REALISASI (T-089 `majukanStatusRab`).
 *   tolak     wajib alasan → DITOLAK; minta perbaikan wajib catatan →
 *             PERLU_PERBAIKAN. Keduanya kembali ke pengunggah (045).
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-102 · ADR-007 · SYSTEM_DESIGN §9.5
 */

import { z } from 'zod';

import type { Konteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { urlGambarNota, type UrlGambarNota } from '@/lib/images/url-gambar';
import { hitungTotalItem } from '@/lib/rab/calculate';
import { majukanStatusRab } from '@/lib/rab/service';

if (typeof window !== 'undefined') {
  throw new Error('lib/nota/verifikasi.ts adalah modul server-only.');
}

export type KodeGagalVerifikasi =
  'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'ALOKASI_TIDAK_SEIMBANG' | 'KONFLIK';
export const STATUS_GAGAL_VERIFIKASI: Record<KodeGagalVerifikasi, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  ALOKASI_TIDAK_SEIMBANG: 422,
  KONFLIK: 409,
};
export type Hasil<T> =
  | { ok: true; nilai: T }
  | { ok: false; kode: KodeGagalVerifikasi; pesan: string; details?: Record<string, unknown> };

export const SkemaAlasan = z.strictObject({
  alasan: z
    .string()
    .trim()
    .min(5, 'Tuliskan alasan minimal 5 karakter.')
    .max(500, 'Alasan maksimal 500 karakter.'),
});

export const bolehVerifikasi = (k: Konteks) => can(k.roles, 'nota.verify');

// ---------------------------------------------------------------------------
// Antrian (THUMBNAIL)
// ---------------------------------------------------------------------------

export interface KartuAntrian {
  id: string;
  tanggal_belanja: string;
  total_nota: number;
  pengunggah: string;
  diunggah_at: string;
  jumlah_alokasi: number;
  gambar: UrlGambarNota;
}

export interface GrupAntrian {
  acara: { id: string; nama: string };
  divisi: { id: string; nama: string };
  nota: KartuAntrian[];
}

/** Nota MENUNGGU_VERIFIKASI periode berjalan, dikelompokkan per acara lalu divisi (kontrak 1). */
export async function antrianNota(konteks: Konteks): Promise<GrupAntrian[]> {
  if (!bolehVerifikasi(konteks) || !konteks.periodeId) return [];
  // Satu query (bukan relasi Prisma bersarang yang berarti satu round-trip per
  // relasi ke DB) — galeri 30 nota wajib < 2 detik (kontrak 7, bench-galeri-nota).
  const baris = await db.$queryRaw<
    {
      id: string;
      tanggal_belanja: string;
      total_nota: string;
      created_at: Date;
      pengunggah: string;
      jumlah_alokasi: number;
      img_id: string;
      thumbnail_path: string;
      preview_path: string;
      original_filename: string;
      divisi_id: string;
      divisi_nama: string;
      divisi_urutan: number;
      acara_id: string;
      acara_nama: string;
    }[]
  >`
    SELECT n.id::text, to_char(n.tanggal_belanja, 'YYYY-MM-DD') AS tanggal_belanja, n.total_nota::text, n.created_at,
           u.nama_lengkap AS pengunggah,
           (SELECT count(*)::int FROM nota_alokasi a WHERE a.nota_id = n.id) AS jumlah_alokasi,
           i.id::text AS img_id, i.thumbnail_path, i.preview_path, i.original_filename,
           d.id::text AS divisi_id, d.nama AS divisi_nama, d.urutan AS divisi_urutan,
           k.id::text AS acara_id, k.nama_acara AS acara_nama
    FROM nota n
    JOIN app_user u ON u.id = n.uploader_id
    JOIN image i ON i.id = n.image_id
    JOIN divisi d ON d.id = n.divisi_id
    JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
    JOIN proker p ON p.id = k.proker_id
    WHERE n.status = 'MENUNGGU_VERIFIKASI' AND p.periode_id = ${konteks.periodeId}::uuid
    ORDER BY n.created_at
    LIMIT 500`;
  const rows = baris.map((r) => ({
    id: r.id,
    tanggal_belanja: r.tanggal_belanja,
    total_nota: r.total_nota,
    created_at: r.created_at,
    app_user_nota_uploader_idToapp_user: { nama_lengkap: r.pengunggah },
    image: {
      id: r.img_id,
      thumbnail_path: r.thumbnail_path,
      preview_path: r.preview_path,
      original_filename: r.original_filename,
    },
    _count: { nota_alokasi: r.jumlah_alokasi },
    divisi: {
      id: r.divisi_id,
      nama: r.divisi_nama,
      urutan: r.divisi_urutan,
      kepanitiaan: { id: r.acara_id, nama_acara: r.acara_nama },
    },
  }));
  const grup = new Map<string, GrupAntrian & { urutan: number }>();
  for (const r of rows) {
    const kunci = r.divisi.id;
    if (!grup.has(kunci)) {
      grup.set(kunci, {
        acara: { id: r.divisi.kepanitiaan.id, nama: r.divisi.kepanitiaan.nama_acara },
        divisi: { id: r.divisi.id, nama: r.divisi.nama },
        urutan: r.divisi.urutan,
        nota: [],
      });
    }
    grup.get(kunci)!.nota.push({
      id: r.id,
      tanggal_belanja: r.tanggal_belanja,
      total_nota: Number(r.total_nota),
      pengunggah: r.app_user_nota_uploader_idToapp_user.nama_lengkap,
      diunggah_at: r.created_at.toISOString(),
      jumlah_alokasi: r._count.nota_alokasi,
      gambar: urlGambarNota(r.image),
    });
  }
  return [...grup.values()]
    .sort((a, b) => a.acara.nama.localeCompare(b.acara.nama, 'id') || a.urutan - b.urutan)
    .map((g) => ({ acara: g.acara, divisi: g.divisi, nota: g.nota }));
}

// ---------------------------------------------------------------------------
// Detail (PREVIEW)
// ---------------------------------------------------------------------------

export interface DetailNota {
  id: string;
  status: string;
  acara: string;
  divisi: string;
  pengunggah: string;
  tanggal_belanja: string;
  total_nota: number;
  keterangan: string | null;
  alasan_penolakan: string | null;
  gambar: UrlGambarNota;
  alokasi: {
    id: string;
    item: {
      jenis_barang: string;
      section: string;
      jumlah_teks: string;
      harga_satuan: number;
      total_rab: number;
    } | null;
    uraian_luar_rab: string | null;
    jumlah_aktual: number | null;
    harga_aktual: number | null;
    nominal: number;
  }[];
  total_alokasi: number;
}

export async function detailNota(konteks: Konteks, id: string): Promise<DetailNota | null> {
  if (!bolehVerifikasi(konteks)) return null;
  // Dua query paralel (bukan relasi bersarang Prisma = satu round-trip per relasi).
  const [[n], baris] = await Promise.all([
    db.$queryRaw<
      {
        id: string;
        status: string;
        tanggal_belanja: string;
        total_nota: string;
        keterangan: string | null;
        alasan_penolakan: string | null;
        pengunggah: string;
        divisi: string;
        acara: string;
        periode_id: string;
        img_id: string;
        thumbnail_path: string;
        preview_path: string;
        original_filename: string;
      }[]
    >`
      SELECT n.id::text, n.status::text, to_char(n.tanggal_belanja, 'YYYY-MM-DD') AS tanggal_belanja, n.total_nota::text,
             n.keterangan, n.alasan_penolakan, u.nama_lengkap AS pengunggah, d.nama AS divisi, k.nama_acara AS acara,
             p.periode_id::text, i.id::text AS img_id, i.thumbnail_path, i.preview_path, i.original_filename
      FROM nota n
      JOIN app_user u ON u.id = n.uploader_id
      JOIN image i ON i.id = n.image_id
      JOIN divisi d ON d.id = n.divisi_id
      JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
      JOIN proker p ON p.id = k.proker_id
      WHERE n.id = ${id}::uuid`,
    db.$queryRaw<
      {
        id: string;
        uraian_luar_rab: string | null;
        jumlah_aktual: string | null;
        harga_aktual: string | null;
        nominal: string;
        jenis_barang: string | null;
        section: string | null;
        jumlah_teks: string | null;
        jumlah_numerik: string | null;
        harga_satuan: string | null;
        total: string | null;
        total_manual: boolean | null;
      }[]
    >`
      SELECT a.id::text, a.uraian_luar_rab, a.jumlah_aktual::text, a.harga_aktual::text, a.nominal::text,
             r.jenis_barang, s.nama AS section, r.jumlah_teks, r.jumlah_numerik::text, r.harga_satuan::text,
             r.total::text, r.total_manual
      FROM nota_alokasi a
      LEFT JOIN rab_item r ON r.id = a.rab_item_id
      LEFT JOIN rab_section s ON s.id = r.section_id
      WHERE a.nota_id = ${id}::uuid
      ORDER BY a.nominal DESC, a.id`,
  ]);
  if (!n || n.periode_id !== konteks.periodeId) return null;
  const angka = (v: string | null) => (v === null ? null : Number(v));
  const alokasi = baris.map((a) => ({
    id: a.id,
    item:
      a.jenis_barang !== null
        ? {
            jenis_barang: a.jenis_barang,
            section: a.section ?? '',
            jumlah_teks: a.jumlah_teks ?? '',
            harga_satuan: Number(a.harga_satuan),
            total_rab: hitungTotalItem({
              jumlah_numerik: angka(a.jumlah_numerik),
              harga_satuan: Number(a.harga_satuan),
              total: Number(a.total),
              total_manual: a.total_manual === true,
            }),
          }
        : null,
    uraian_luar_rab: a.uraian_luar_rab,
    jumlah_aktual: angka(a.jumlah_aktual),
    harga_aktual: angka(a.harga_aktual),
    nominal: Number(a.nominal),
  }));
  return {
    id: n.id,
    status: n.status,
    acara: n.acara,
    divisi: n.divisi,
    pengunggah: n.pengunggah,
    tanggal_belanja: n.tanggal_belanja,
    total_nota: Number(n.total_nota),
    keterangan: n.keterangan,
    alasan_penolakan: n.alasan_penolakan,
    gambar: urlGambarNota({
      id: n.img_id,
      thumbnail_path: n.thumbnail_path,
      preview_path: n.preview_path,
      original_filename: n.original_filename,
    }),
    alokasi,
    total_alokasi: alokasi.reduce((x, a) => x + a.nominal, 0),
  };
}

// ---------------------------------------------------------------------------
// Aksi
// ---------------------------------------------------------------------------

/** Mengunci baris nota (FOR UPDATE) dan memastikan masih MENUNGGU_VERIFIKASI. */
async function kunciMenunggu(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
): Promise<Hasil<{ divisi_id: string; total: number; kepanitiaan_id: string }>> {
  if (!bolehVerifikasi(konteks))
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Verifikasi nota hanya untuk Bendahara atau Admin.',
    };
  const [n] = await tx.$queryRaw<
    {
      status: string;
      divisi_id: string;
      total: string;
      kepanitiaan_id: string;
      periode_id: string;
    }[]
  >`
    SELECT n.status::text, n.divisi_id::text, n.total_nota::text AS total, d.kepanitiaan_id::text, p.periode_id::text
    FROM nota n JOIN divisi d ON d.id = n.divisi_id JOIN kepanitiaan k ON k.id = d.kepanitiaan_id JOIN proker p ON p.id = k.proker_id
    WHERE n.id = ${id}::uuid FOR UPDATE OF n`;
  if (!n || n.periode_id !== konteks.periodeId)
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Nota tidak ditemukan.' };
  if (n.status !== 'MENUNGGU_VERIFIKASI') {
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: 'Nota ini sudah diproses — muat ulang antrian.',
      details: { status: n.status },
    };
  }
  return {
    ok: true,
    nilai: { divisi_id: n.divisi_id, total: Number(n.total), kepanitiaan_id: n.kepanitiaan_id },
  };
}

export async function setujuiNota(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
): Promise<Hasil<{ status: 'TERVERIFIKASI'; rab_realisasi: boolean }>> {
  const k = await kunciMenunggu(tx, konteks, id);
  if (!k.ok) return k;
  // INV-28 / ADR-007 — diperiksa ulang di sini, bukan dipercaya dari submit.
  const [s] = await tx.$queryRaw<
    { jumlah: string | null }[]
  >`SELECT sum(nominal)::text AS jumlah FROM nota_alokasi WHERE nota_id = ${id}::uuid`;
  const totalAlokasi = Number(s?.jumlah ?? 0);
  if (totalAlokasi !== k.nilai.total) {
    const selisih = totalAlokasi - k.nilai.total;
    return {
      ok: false,
      kode: 'ALOKASI_TIDAK_SEIMBANG',
      pesan: `Total alokasi Rp${totalAlokasi.toLocaleString('id-ID')} tidak sama dengan total nota Rp${k.nilai.total.toLocaleString('id-ID')}. Minta perbaikan ke pengunggah.`,
      details: { total_nota: k.nilai.total, total_alokasi: totalAlokasi, selisih },
    };
  }
  await tx.nota.update({
    where: { id },
    data: {
      status: 'TERVERIFIKASI',
      verified_by: konteks.sesi.userId,
      verified_at: new Date(),
      alasan_penolakan: null,
      updated_at: new Date(),
    },
  });
  const realisasi = await majukanStatusRab(tx, k.nilai.kepanitiaan_id, 'REALISASI');
  return { ok: true, nilai: { status: 'TERVERIFIKASI', rab_realisasi: realisasi } };
}

async function kembalikan(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
  body: unknown,
  status: 'DITOLAK' | 'PERLU_PERBAIKAN',
): Promise<Hasil<{ status: string }>> {
  const p = SkemaAlasan.safeParse(body);
  if (!p.success) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan:
        status === 'DITOLAK'
          ? 'Penolakan wajib disertai alasan (minimal 5 karakter).'
          : 'Permintaan perbaikan wajib disertai catatan (minimal 5 karakter).',
    };
  }
  const k = await kunciMenunggu(tx, konteks, id);
  if (!k.ok) return k;
  await tx.nota.update({
    where: { id },
    data: {
      status,
      alasan_penolakan: p.data.alasan,
      verified_by: konteks.sesi.userId,
      verified_at: new Date(),
      updated_at: new Date(),
    },
  });
  return { ok: true, nilai: { status } };
}

export const tolakNota = (tx: TxKlien, konteks: Konteks, id: string, body: unknown) =>
  kembalikan(tx, konteks, id, body, 'DITOLAK');
export const mintaPerbaikanNota = (tx: TxKlien, konteks: Konteks, id: string, body: unknown) =>
  kembalikan(tx, konteks, id, body, 'PERLU_PERBAIKAN');

/**
 * Batalkan verifikasi (T-103 kontrak 3): TERVERIFIKASI → MENUNGGU_VERIFIKASI,
 * wajib alasan. Saldo PENGELUARAN & RAB AKTUAL tidak disimpan di mana pun —
 * keduanya dihitung ulang penuh dari nota TERVERIFIKASI (lib/rab/realisasi.ts),
 * jadi pembatalan nota tengah langsung menghitung ulang seluruh saldo.
 * Ditolak bila RAB acaranya sudah SELESAI (LPJ terbit — angkanya beku).
 */
export async function batalkanVerifikasi(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
  body: unknown,
): Promise<Hasil<{ status: 'MENUNGGU_VERIFIKASI' }>> {
  if (!bolehVerifikasi(konteks)) {
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Membatalkan verifikasi hanya untuk Bendahara atau Admin.',
    };
  }
  const p = SkemaAlasan.safeParse(body);
  if (!p.success) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Pembatalan verifikasi wajib disertai alasan (minimal 5 karakter).',
    };
  }
  const [n] = await tx.$queryRaw<{ status: string; periode_id: string; rab: string | null }[]>`
    SELECT n.status::text, p.periode_id::text, m.status::text AS rab
    FROM nota n JOIN divisi d ON d.id = n.divisi_id JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
    JOIN proker p ON p.id = k.proker_id LEFT JOIN rab_meta m ON m.kepanitiaan_id = k.id
    WHERE n.id = ${id}::uuid FOR UPDATE OF n`;
  if (!n || n.periode_id !== konteks.periodeId)
    return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Nota tidak ditemukan.' };
  if (n.status !== 'TERVERIFIKASI')
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: 'Hanya nota terverifikasi yang dapat dibatalkan verifikasinya.',
    };
  if (n.rab === 'SELESAI')
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: 'LPJ acara ini sudah terbit — verifikasi nota tidak dapat dibatalkan.',
    };
  await tx.nota.update({
    where: { id },
    // Alasan pembatalan tercatat di audit_log (trigger nota) lewat nilai baru baris ini.
    data: {
      status: 'MENUNGGU_VERIFIKASI',
      verified_by: null,
      verified_at: null,
      alasan_penolakan: `Verifikasi dibatalkan: ${p.data.alasan}`,
      updated_at: new Date(),
    },
  });
  return { ok: true, nilai: { status: 'MENUNGGU_VERIFIKASI' } };
}
