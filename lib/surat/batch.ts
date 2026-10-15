/**
 * batch — generate massal Surat Keterangan Aktif Organisasi (T-064). Server-only.
 *
 *   Sekum memilih N pengurus + satu keperluan
 *     └─ buatBatch:     N surat dibuat & diajukan dalam SATU transaksi
 *   Ketua/Wakil/Sekum menekan "Setujui batch"
 *     └─ setujuiBatch:  `alokasi_nomor_batch` dalam SATU transaksi — nomor
 *                       berurutan tanpa disela surat lain (INV-15)
 *     └─ terbitkanBatch: dokumen di-generate satu per satu, progres per
 *                       dokumen; satu gagal tidak menghentikan sisanya
 *   └─ zipBatch:        DOCX yang terbit dibundel `{nomor}-{nama}.docx`
 *
 * Validasi tiap surat memakai jalur yang sama dengan surat satuan
 * (`simpanDraft` → skema lengkap, K-04). `ajukanSurat` tidak dipakai karena ia
 * membaca ulang surat lewat klien global, yang tidak melihat baris yang baru
 * dibuat di transaksi yang sama; `masalah` dari `simpanDraft` adalah hasil
 * pemeriksaan skema yang sama.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-064 · PRD F-4.2 · USER_FLOW §5.3 · INV-15
 */

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import PizZip from 'pizzip';
import { z } from 'zod';

import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { storage } from '@/lib/storage';
import { type HasilSurat, simpanDraft } from '@/lib/surat/draft';
import { MAKS_BATCH_NOMOR, alokasiNomorBatch } from '@/lib/surat/nomor';
import { SkemaAlasan, pasangTemplateAktif, terbitkanSurat, type HasilTerbit } from '@/lib/surat/status';
import { namaBerkasSurat } from '@/lib/surat/unduh';
import { slug } from '@/lib/utils/slug';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/batch.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export const MAKS_BATCH = MAKS_BATCH_NOMOR;

/** Unduhan storage serentak saat membundel ZIP. */
const UNDUH_PARALEL = 6;

/** Batas waktu transaksi pengajuan/persetujuan batch (lihat `withAuditContext`). */
export const BATAS_TRANSAKSI_BATCH_MS = 60_000;

export const SkemaBuatBatch = z.object({
  pengurus: z
    .array(z.uuid({ error: 'Pengurus tidak valid.' }), { error: 'Pilih pengurus.' })
    .min(1, 'Pilih minimal satu pengurus.')
    .max(MAKS_BATCH, `Paling banyak ${MAKS_BATCH} surat per batch — pecah menjadi beberapa batch.`),
  keperluan: z.string({ error: 'Keperluan wajib diisi.' }).trim().min(1, 'Keperluan wajib diisi.').max(300, 'Keperluan maksimal 300 karakter.'),
  tanggal_surat: z.string({ error: 'Tanggal surat wajib diisi.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal surat tidak valid.'),
});

// ---------------------------------------------------------------------------
// Data Pengurus
// ---------------------------------------------------------------------------

export interface PengurusPilihan {
  id: string;
  nama_lengkap: string;
  nim: string;
  jabatan: string;
  nama_departemen: string | null;
}

/** Data Pengurus aktif periode berjalan (T-107 yang mengisinya). */
export async function daftarPengurus(konteks: Konteks): Promise<PengurusPilihan[]> {
  const baris = await db.pengurus.findMany({
    where: { periode_id: konteks.periodeId, is_aktif: true },
    orderBy: [{ nama_lengkap: 'asc' }],
    select: { id: true, nama_lengkap: true, nim: true, jabatan: true, departemen: { select: { nama: true } } },
  });
  return baris.map((b) => ({ id: b.id, nama_lengkap: b.nama_lengkap, nim: b.nim, jabatan: b.jabatan, nama_departemen: b.departemen?.nama ?? null }));
}

// ---------------------------------------------------------------------------
// Buat + ajukan
// ---------------------------------------------------------------------------

export async function buatBatch(tx: TxKlien, konteks: Konteks, body: unknown): Promise<HasilSurat<{ batchId: string; jumlah: number }>> {
  const p = SkemaBuatBatch.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Isian tidak valid.' };

  const ids = [...new Set(p.data.pengurus)];
  const pengurus = await tx.pengurus.findMany({
    where: { id: { in: ids }, periode_id: konteks.periodeId, is_aktif: true },
    select: { id: true, nama_lengkap: true, nim: true, jabatan: true },
  });
  if (pengurus.length !== ids.length) {
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: 'Sebagian pengurus tidak ditemukan di Data Pengurus periode ini.' };
  }
  const batchId = randomUUID();
  for (const o of pengurus) {
    const r = await simpanDraft(
      tx,
      konteks,
      {
        jenis: 'KETERANGAN_AKTIF',
        tanggal_surat: p.data.tanggal_surat,
        data_dinamis: { nama_pemohon: o.nama_lengkap, nim_pemohon: o.nim, jabatan_pemohon: o.jabatan, keperluan: p.data.keperluan },
      },
      null,
    );
    if (!r.ok) return r;
    if (r.nilai.masalah.length > 0) {
      // Data pengurus yang tak lolos skema (mis. NIM bukan angka) menggagalkan
      // seluruh batch SEBELUM ada yang diajukan — transaksi di-rollback.
      return {
        ok: false,
        kode: 'VALIDASI_GAGAL',
        pesan: `Data ${o.nama_lengkap} (${o.nim}) tidak lolos validasi surat: ${r.nilai.masalah.map((m) => m.pesan).join(' ')}`,
      };
    }
    await tx.surat.update({
      where: { id: r.nilai.id },
      data: { status: 'MENUNGGU_APPROVAL', diajukan_at: new Date(), batch_id: batchId, updated_at: new Date() },
    });
  }
  return { ok: true, nilai: { batchId, jumlah: pengurus.length } };
}

// ---------------------------------------------------------------------------
// Daftar batch
// ---------------------------------------------------------------------------

export interface RingkasanBatch {
  batch_id: string;
  jumlah: number;
  menunggu: number;
  disetujui: number;
  terbit: number;
  ditolak: number;
  dibatalkan: number;
  keperluan: string;
  nama_pembuat: string;
  dibuat_at: string;
  nomor_awal: string | null;
  nomor_akhir: string | null;
}

export async function daftarBatch(konteks: Konteks): Promise<RingkasanBatch[]> {
  return db.$queryRaw<RingkasanBatch[]>`
    SELECT s.batch_id::text,
           count(*)::int AS jumlah,
           count(*) FILTER (WHERE s.status = 'MENUNGGU_APPROVAL')::int AS menunggu,
           count(*) FILTER (WHERE s.status = 'DISETUJUI')::int AS disetujui,
           count(*) FILTER (WHERE s.status = 'TERBIT')::int AS terbit,
           count(*) FILTER (WHERE s.status = 'DITOLAK')::int AS ditolak,
           count(*) FILTER (WHERE s.status = 'DIBATALKAN')::int AS dibatalkan,
           min(s.data_dinamis->>'keperluan') AS keperluan,
           min(u.nama_lengkap) AS nama_pembuat,
           min(s.created_at)::text AS dibuat_at,
           (array_agg(s.nomor_lengkap ORDER BY s.nomor_urut) FILTER (WHERE s.nomor_urut IS NOT NULL))[1] AS nomor_awal,
           (array_agg(s.nomor_lengkap ORDER BY s.nomor_urut DESC) FILTER (WHERE s.nomor_urut IS NOT NULL))[1] AS nomor_akhir
    FROM surat s JOIN app_user u ON u.id = s.dibuat_oleh
    WHERE s.periode_id = ${konteks.periodeId}::uuid AND s.batch_id IS NOT NULL
    GROUP BY s.batch_id
    ORDER BY min(s.created_at) DESC
    LIMIT 50`;
}

// ---------------------------------------------------------------------------
// Setujui (satu transaksi) → terbitkan (per dokumen)
// ---------------------------------------------------------------------------

export interface ItemBatch {
  id: string;
  nama: string;
  nomor: string;
}

/**
 * Urutan surat di batch = urutan nama pemohon, seperti daftar yang dilihat
 * Sekum. Bukan `created_at`: seluruh batch dibuat dalam satu transaksi, jadi
 * `now()`-nya sama dan urutannya tak tentu. `id` hanya pemutus nama kembar.
 */
const URUT_BATCH = Prisma.sql`lower(data_dinamis->>'nama_pemohon'), id`;

interface BarisBatch {
  id: string;
  status: string;
  nama: string;
  nomor_lengkap: string | null;
}

async function kunciBatch(tx: TxKlien, konteks: Konteks, batchId: string): Promise<BarisBatch[]> {
  return tx.$queryRaw<BarisBatch[]>`
    SELECT id::text, status::text, data_dinamis->>'nama_pemohon' AS nama, nomor_lengkap
    FROM surat
    WHERE batch_id = ${batchId}::uuid AND periode_id = ${konteks.periodeId}::uuid
    ORDER BY ${URUT_BATCH}
    FOR UPDATE`;
}

/**
 * Seluruh surat batch MENUNGGU_APPROVAL → DISETUJUI dengan nomor berurutan,
 * dalam transaksi pemanggil. Batch yang sebagian sudah diproses ditolak utuh:
 * menyetujui sisanya akan menyela urutan nomor batch itu.
 */
export async function setujuiBatch(tx: TxKlien, konteks: Konteks, batchId: string): Promise<HasilSurat<ItemBatch[]>> {
  const baris = await kunciBatch(tx, konteks, batchId);
  if (baris.length === 0) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Batch tidak ditemukan.' };
  const lain = baris.filter((b) => b.status !== 'MENUNGGU_APPROVAL');
  if (lain.length > 0) {
    return {
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: `${lain.length} dari ${baris.length} surat di batch ini sudah diproses. Batch hanya dapat disetujui utuh.`,
    };
  }
  await pasangTemplateAktif(
    tx,
    baris.map((b) => b.id),
  );
  const r = await alokasiNomorBatch(
    tx,
    konteks,
    baris.map((b) => b.id),
  );
  if (!r.ok) return { ok: false, kode: 'STATUS_TIDAK_SESUAI', pesan: r.pesan };
  const nomor = new Map(r.nomor.map((n) => [n.suratId, n.nomor]));
  return { ok: true, nilai: baris.map((b) => ({ id: b.id, nama: b.nama, nomor: nomor.get(b.id)! })) };
}

/** Surat batch yang sudah bernomor tetapi dokumennya belum terbit — untuk terbit ulang. */
export async function belumTerbit(konteks: Konteks, batchId: string): Promise<ItemBatch[]> {
  const baris = await db.$queryRaw<BarisBatch[]>`
    SELECT id::text, status::text, data_dinamis->>'nama_pemohon' AS nama, nomor_lengkap
    FROM surat
    WHERE batch_id = ${batchId}::uuid AND periode_id = ${konteks.periodeId}::uuid AND status = 'DISETUJUI'
    ORDER BY nomor_urut`;
  return baris.map((b) => ({ id: b.id, nama: b.nama, nomor: b.nomor_lengkap ?? '' }));
}

export type ProgresBatch =
  | { tipe: 'dokumen'; i: number; total: number; id: string; nama: string; nomor: string; ok: boolean; pesan?: string }
  | { tipe: 'selesai'; total: number; berhasil: number; gagal: number };

/**
 * Generate & terbitkan satu per satu. Kegagalan satu dokumen dicatat dan
 * dilaporkan; surat itu tetap DISETUJUI dengan nomornya dan dapat diterbitkan
 * ulang (T-060 butir 5). `terbit` disuntik supaya dapat diuji tanpa storage.
 */
export async function terbitkanBatch(
  items: ItemBatch[],
  laporkan: (p: ProgresBatch) => void | Promise<void>,
  terbit: (id: string) => Promise<HasilTerbit>,
): Promise<{ berhasil: number; gagal: number }> {
  let berhasil = 0;
  for (const [i, item] of items.entries()) {
    let h: HasilTerbit;
    try {
      h = await terbit(item.id);
    } catch (e) {
      console.error(`[batch] surat ${item.id}: terbit melempar`, e);
      h = { ok: false, status: 'DISETUJUI', pesan: 'Kesalahan tak terduga saat menerbitkan dokumen.' };
    }
    if (h.ok) berhasil++;
    await laporkan({
      tipe: 'dokumen',
      i: i + 1,
      total: items.length,
      id: item.id,
      nama: item.nama,
      nomor: item.nomor,
      ok: h.ok,
      ...(h.ok ? {} : { pesan: h.pesan }),
    });
  }
  const hasil = { berhasil, gagal: items.length - berhasil };
  await laporkan({ tipe: 'selesai', total: items.length, ...hasil });
  return hasil;
}

/** Terbit memakai jalur surat satuan (dokumen + audit + PDF bila diminta). */
export function penerbitSungguhan(request: Request, konteks: Konteks) {
  return (id: string) => terbitkanSurat(request, konteks, id);
}

// ---------------------------------------------------------------------------
// Tolak
// ---------------------------------------------------------------------------

export async function tolakBatch(tx: TxKlien, konteks: Konteks, batchId: string, body: unknown): Promise<HasilSurat<{ jumlah: number }>> {
  const p = SkemaAlasan.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Alasan wajib diisi.' };
  const baris = await kunciBatch(tx, konteks, batchId);
  if (baris.length === 0) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Batch tidak ditemukan.' };
  const menunggu = baris.filter((b) => b.status === 'MENUNGGU_APPROVAL');
  if (menunggu.length !== baris.length) {
    return { ok: false, kode: 'STATUS_TIDAK_SESUAI', pesan: 'Batch yang sebagian sudah diproses tidak dapat ditolak utuh.' };
  }
  await tx.surat.updateMany({
    where: { id: { in: menunggu.map((b) => b.id) } },
    data: { status: 'DITOLAK', alasan_penolakan: p.data.alasan, updated_at: new Date() },
  });
  return { ok: true, nilai: { jumlah: menunggu.length } };
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

/** `{nomor}-{nama}.docx`, nomor dengan "/" → "-" dan nama dirapikan. */
export function namaBerkasBatch(nomor: string, nama: string): string {
  const n = namaBerkasSurat(nomor, 'docx').replace(/\.docx$/, '');
  return `${n}-${slug(nama) || 'pemohon'}.docx`;
}

export async function zipBatch(konteks: Konteks, batchId: string): Promise<{ isi: Buffer; jumlah: number } | null> {
  // Kadept (lingkup departemen) hanya batch buatannya — surat massal dibuat
  // Sekum tanpa departemen, jadi aturan departemen arsip tak berlaku di sini.
  const lingkupDepartemen = lingkupKonteks(konteks, 'surat.read') === 'DEPARTEMEN';
  const baris = await db.$queryRaw<{ nomor: string; nama: string; key: string }[]>`
    SELECT s.nomor_lengkap AS nomor, s.data_dinamis->>'nama_pemohon' AS nama, d.storage_key AS key
    FROM surat s JOIN dokumen d ON d.surat_id = s.id AND d.jenis = 'SURAT' AND d.format = 'DOCX'
    WHERE s.batch_id = ${batchId}::uuid AND s.periode_id = ${konteks.periodeId}::uuid
      AND s.status IN ('TERBIT', 'DIBATALKAN')
      AND (${!lingkupDepartemen} OR s.dibuat_oleh = ${konteks.sesi.userId}::uuid)
    ORDER BY s.nomor_urut`;
  if (baris.length === 0) return null;
  // Unduh paralel terbatas: 30 unduhan berurutan dari storage memakan 15–30
  // detik (diukur di gate surat-massal); semuanya sekaligus membebani koneksi.
  const isi = new Array<Buffer>(baris.length);
  let berikut = 0;
  await Promise.all(
    Array.from({ length: Math.min(UNDUH_PARALEL, baris.length) }, async () => {
      for (let i = berikut++; i < baris.length; i = berikut++) isi[i] = await storage.get(baris[i]!.key);
    }),
  );

  const zip = new PizZip();
  const terpakai = new Set<string>();
  for (const [i, b] of baris.entries()) {
    let nama = namaBerkasBatch(b.nomor, b.nama);
    // Dua pengurus bernama sama tetap dua berkas.
    for (let k = 2; terpakai.has(nama); k++) nama = namaBerkasBatch(b.nomor, `${b.nama} ${k}`);
    terpakai.add(nama);
    zip.file(nama, isi[i]!);
  }
  return { isi: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer, jumlah: baris.length };
}
