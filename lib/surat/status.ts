/**
 * status — alur approval surat (T-060). Server-only.
 *
 *   DRAFT ──ajukan──▶ MENUNGGU_APPROVAL ──setujui──▶ DISETUJUI ──terbitkan──▶ TERBIT ──batalkan──▶ DIBATALKAN
 *     ▲                     │
 *     └──── perbaiki ◀── DITOLAK ◀──tolak (wajib alasan)
 *
 * Persis USER_FLOW §11.2. Setiap fungsi di sini memeriksa transisinya terhadap
 * `TRANSISI` di dalam transaksi, dengan baris surat dikunci `FOR UPDATE`, jadi
 * dua approver yang menekan "Setujui" bersamaan tidak dapat sama-sama lolos:
 * yang kedua menerima STATUS_TIDAK_SESUAI beserta nama yang sudah menyetujui.
 *
 * Approve dan terbit sengaja dua transaksi. Nomor dialokasikan dan di-commit
 * lebih dulu; baru sesudahnya dokumen di-generate. Bila generate gagal, nomor
 * TETAP terpakai dan surat berhenti di DISETUJUI (kontrak butir 5, INV-16) —
 * menggabungkan keduanya dalam satu transaksi justru akan melepas nomornya
 * saat rollback, dan nomor itu kelak dipakai surat lain.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-060 · PRD F-4.3 · USER_FLOW §5.2,
 *         §11.2 · INV-04, INV-05, INV-14, INV-16
 */

import { z } from 'zod';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { withAuditContext, type TxKlien } from '@/lib/db/with-audit-context';
import { storage } from '@/lib/storage';
import type { HasilSurat, KodeGagalSurat } from '@/lib/surat/draft';
import { muatSurat } from '@/lib/surat/draft';
import { generateDokumenSurat } from '@/lib/surat/generator';
import { alokasiNomor } from '@/lib/surat/nomor';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/status.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type StatusSurat = 'DRAFT' | 'MENUNGGU_APPROVAL' | 'DISETUJUI' | 'TERBIT' | 'DITOLAK' | 'DIBATALKAN';

/** Transisi yang sah — satu-satunya sumber kebenaran state machine surat. */
export const TRANSISI: Record<StatusSurat, readonly StatusSurat[]> = {
  DRAFT: ['MENUNGGU_APPROVAL'],
  MENUNGGU_APPROVAL: ['DISETUJUI', 'DITOLAK'],
  DITOLAK: ['DRAFT'],
  DISETUJUI: ['TERBIT'],
  TERBIT: ['DIBATALKAN'],
  DIBATALKAN: [],
};

export function bolehTransisi(dari: string, ke: StatusSurat): boolean {
  return (TRANSISI[dari as StatusSurat] ?? []).includes(ke);
}

/** Alasan penolakan dan pembatalan: kalimat sungguhan, bukan "." untuk melewati pemeriksaan. */
export const SkemaAlasan = z.object({
  alasan: z
    .string({ error: 'Alasan wajib diisi.' })
    .trim()
    .min(5, 'Alasan wajib diisi, minimal 5 karakter.')
    .max(1000, 'Alasan maksimal 1000 karakter.'),
});

export const SkemaSetujui = z.object({
  /** Ulangi generate untuk surat yang sudah DISETUJUI tetapi gagal terbit. */
  terbitkanUlang: z.boolean().optional(),
});

interface BarisTerkunci {
  id: string;
  periode_id: string;
  status: string;
  dibuat_oleh: string;
  nomor_lengkap: string | null;
  nama_penyetuju: string | null;
  batch_id: string | null;
}

/** Baris surat dikunci untuk sisa transaksi; periode lain = tidak ada (INV-08). */
async function kunci(tx: TxKlien, konteks: Konteks, id: string): Promise<BarisTerkunci | null> {
  const [s] = await tx.$queryRaw<BarisTerkunci[]>`
    SELECT s.id::text, s.periode_id::text, s.status::text, s.dibuat_oleh::text, s.nomor_lengkap, s.batch_id::text,
           u.nama_lengkap AS nama_penyetuju
    FROM surat s LEFT JOIN app_user u ON u.id = s.disetujui_oleh
    WHERE s.id = ${id}::uuid
    FOR UPDATE OF s
  `;
  return s && s.periode_id === konteks.periodeId ? s : null;
}

const tidakAda = (): { ok: false; kode: KodeGagalSurat; pesan: string } => ({
  ok: false,
  kode: 'TIDAK_DITEMUKAN',
  pesan: 'Surat tidak ditemukan.',
});

function salahStatus(s: BarisTerkunci, aksi: string): { ok: false; kode: KodeGagalSurat; pesan: string } {
  const sudah =
    s.status === 'DISETUJUI' || s.status === 'TERBIT'
      ? ` Surat sudah disetujui${s.nama_penyetuju ? ` oleh ${s.nama_penyetuju}` : ''}${s.nomor_lengkap ? ` dengan nomor ${s.nomor_lengkap}` : ''}.`
      : '';
  return { ok: false, kode: 'STATUS_TIDAK_SESUAI', pesan: `Surat berstatus ${s.status} tidak dapat ${aksi}.${sudah}` };
}

// ---------------------------------------------------------------------------
// DRAFT → MENUNGGU_APPROVAL
// ---------------------------------------------------------------------------

/**
 * Hanya pembuat, dan hanya bila isian lolos skema lengkap — skema yang sama
 * dengan daftar "field yang kurang" di form (K-04, ADR-028). Draft disimpan
 * longgar; di titik inilah kelengkapan benar-benar ditegakkan.
 */
export async function ajukanSurat(tx: TxKlien, konteks: Konteks, id: string): Promise<HasilSurat<{ status: StatusSurat }>> {
  const s = await kunci(tx, konteks, id);
  if (!s || s.dibuat_oleh !== konteks.sesi.userId) return tidakAda();
  if (!bolehTransisi(s.status, 'MENUNGGU_APPROVAL')) return salahStatus(s, 'diajukan');

  const detail = await muatSurat(konteks, id);
  if (!detail) return tidakAda();
  if (detail.masalah.length > 0) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: `${detail.masalah.length} field masih perlu diisi sebelum surat dapat diajukan.`,
      details: detail.masalah,
    };
  }

  await tx.surat.update({
    where: { id },
    data: { status: 'MENUNGGU_APPROVAL', diajukan_at: new Date(), updated_at: new Date() },
  });
  return { ok: true, nilai: { status: 'MENUNGGU_APPROVAL' } };
}

// ---------------------------------------------------------------------------
// MENUNGGU_APPROVAL → DISETUJUI (nomor dialokasikan)
// ---------------------------------------------------------------------------

/**
 * Ketua, Wakil, atau Sekum — satu cukup (INV-05). Hak `surat.approve`
 * diperiksa guard route; BPH tidak memilikinya (INV-04).
 */
export async function setujuiSurat(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
  opsi: { terbitkanUlang?: boolean } = {},
): Promise<HasilSurat<{ status: StatusSurat; nomor: string }>> {
  const s = await kunci(tx, konteks, id);
  if (!s) return tidakAda();

  // Surat yang sudah bernomor tetapi gagal terbit boleh dicoba terbit ulang —
  // hanya bila diminta eksplisit, supaya approver kedua yang terlambat menekan
  // "Setujui" mendapat pesan "sudah disetujui", bukan diam-diam ikut men-generate.
  if (s.status === 'DISETUJUI' && opsi.terbitkanUlang && s.nomor_lengkap) {
    await pasangTemplateAktif(tx, id);
    return { ok: true, nilai: { status: 'DISETUJUI', nomor: s.nomor_lengkap } };
  }
  if (!bolehTransisi(s.status, 'DISETUJUI')) return salahStatus(s, 'disetujui');
  if (s.batch_id) {
    return {
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: 'Surat ini bagian dari batch generate massal. Setujui seluruh batch di halaman Surat Massal supaya nomornya berurutan.',
    };
  }

  const r = await alokasiNomor(tx, konteks, id);
  if (!r.ok) return { ok: false, kode: r.kode, pesan: r.pesan };
  await pasangTemplateAktif(tx, id);
  return { ok: true, nilai: { status: 'DISETUJUI', nomor: r.nomor } };
}

/**
 * Versi template surat DITETAPKAN saat disetujui, bukan saat draft dibuat.
 *
 * Draft mencatat versi yang aktif ketika ia dibuat — cukup untuk skema field,
 * tetapi berkas DOCX versi itu bisa sudah diganti sebelum surat terbit (T-061
 * mengganti seluruh versi lama yang memuat tanda tangan contoh). Surat yang
 * belum pernah di-generate karena itu dipindah ke versi aktif untuk kode dan
 * varian yang sama; sesudah terbit, versinya tidak pernah berubah lagi dan
 * generate ulang memakai template aslinya (ADR-027, ADR-029). Surat generik
 * (template_id NULL) tidak tersentuh.
 */
export async function pasangTemplateAktif(tx: TxKlien, id: string | string[]): Promise<void> {
  const ids = Array.isArray(id) ? id : [id];
  await tx.$executeRaw`
    UPDATE surat s SET template_id = baru.id
    FROM surat_template lama, surat_template baru
    WHERE s.id = ANY(${ids}::uuid[])
      AND lama.id = s.template_id
      AND baru.kode_surat = lama.kode_surat AND baru.varian = lama.varian
      AND baru.is_active AND baru.id <> lama.id
      AND NOT EXISTS (SELECT 1 FROM dokumen d WHERE d.surat_id = s.id)
  `;
}

// ---------------------------------------------------------------------------
// DISETUJUI → TERBIT (dokumen di-generate)
// ---------------------------------------------------------------------------

export type HasilTerbit =
  /** `pdf`: PDF ikut terbit; `peringatan`: PDF diminta tetapi tidak dibuat (T-062). */
  | { ok: true; status: 'TERBIT'; pdf: boolean; peringatan: string | null }
  | { ok: false; status: 'DISETUJUI'; pesan: string };

/**
 * Dipanggil SETELAH transaksi approval commit. Gagal di sini tidak menyentuh
 * nomor: surat tetap DISETUJUI dan dapat diterbitkan ulang (kontrak butir 5).
 *
 * Berkas diunggah lebih dulu (generator), baru baris `dokumen` dan status TERBIT
 * ditulis dalam SATU transaksi beraudit. Transaksi itu gagal → berkasnya
 * dihapus lagi, sehingga tidak ada berkas yatim maupun baris tanpa berkas
 * (kontrak T-061).
 */
/**
 * Transaksi pencatatan dokumen kecil (3 kueri), tetapi dijalankan berulang
 * selama generate massal di bawah beban; batas bawaan 5 detik pernah terlewati.
 * Bila tetap terlewati, berkasnya dihapus dan surat dilaporkan gagal terbit.
 */
const BATAS_TRANSAKSI_TERBIT_MS = 20_000;

export async function terbitkanSurat(request: Request, konteks: Konteks, id: string): Promise<HasilTerbit> {
  const hasil = await generateDokumenSurat(konteks, id);
  if (!hasil.ok) return { ok: false, status: 'DISETUJUI', pesan: hasil.pesan };

  try {
    await withAuditContext(request, konteks, async (tx) => {
      // WHERE status = 'DISETUJUI': dua percobaan terbit bersamaan tidak saling
      // menimpa. Yang kalah tidak menulis baris dokumen kedua.
      const naik = await tx.surat.updateMany({
        where: { id, status: 'DISETUJUI' },
        data: { status: 'TERBIT', updated_at: new Date() },
      });
      if (naik.count === 0) return;
      const berkas = [{ format: 'DOCX', ...hasil }, ...(hasil.pdf ? [{ format: 'PDF', ...hasil.pdf }] : [])];
      await tx.dokumen.deleteMany({ where: { surat_id: id, jenis: 'SURAT' } });
      await tx.dokumen.createMany({
        data: berkas.map((b) => ({
          surat_id: id,
          jenis: 'SURAT',
          format: b.format,
          storage_key: b.key,
          file_size: BigInt(b.ukuran),
          generated_by: konteks.sesi.userId,
        })),
      });
    }, { timeout: BATAS_TRANSAKSI_TERBIT_MS });
  } catch (e) {
    console.error(`[terbit] surat ${id}: gagal mencatat dokumen`, e);
    // Hanya dihapus bila tidak ada baris yang merujuknya — percobaan terbit lain
    // yang menang mungkin sudah mencatat key yang sama.
    for (const key of [hasil.key, hasil.pdf?.key]) {
      if (!key) continue;
      const dirujuk = await db.dokumen.count({ where: { storage_key: key } }).catch(() => 1);
      if (dirujuk === 0) await storage.delete(key).catch(() => undefined);
    }
    return {
      ok: false,
      status: 'DISETUJUI',
      pesan: 'Dokumen gagal dicatat. Nomor surat sudah ditetapkan; dokumen dapat diterbitkan ulang.',
    };
  }
  return { ok: true, status: 'TERBIT', pdf: Boolean(hasil.pdf), peringatan: hasil.peringatan ?? null };
}

// ---------------------------------------------------------------------------
// MENUNGGU_APPROVAL → DITOLAK
// ---------------------------------------------------------------------------

export async function tolakSurat(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
  body: unknown,
): Promise<HasilSurat<{ status: StatusSurat }>> {
  const p = SkemaAlasan.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Alasan wajib diisi.' };

  const s = await kunci(tx, konteks, id);
  if (!s) return tidakAda();
  if (!bolehTransisi(s.status, 'DITOLAK')) return salahStatus(s, 'ditolak');

  await tx.surat.update({
    where: { id },
    data: { status: 'DITOLAK', alasan_penolakan: p.data.alasan, updated_at: new Date() },
  });
  return { ok: true, nilai: { status: 'DITOLAK' } };
}

// ---------------------------------------------------------------------------
// TERBIT → DIBATALKAN
// ---------------------------------------------------------------------------

/**
 * Nomor TIDAK dikembalikan (INV-16): kolom nomor tidak disentuh dan counter
 * tidak pernah mundur. Surat dan dokumennya tetap tersimpan untuk arsip.
 */
export async function batalkanSurat(
  tx: TxKlien,
  konteks: Konteks,
  id: string,
  body: unknown,
): Promise<HasilSurat<{ status: StatusSurat }>> {
  const p = SkemaAlasan.safeParse(body);
  if (!p.success) return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Alasan wajib diisi.' };

  const s = await kunci(tx, konteks, id);
  if (!s) return tidakAda();
  if (!bolehTransisi(s.status, 'DIBATALKAN')) return salahStatus(s, 'dibatalkan');

  await tx.surat.update({
    where: { id },
    data: {
      status: 'DIBATALKAN',
      alasan_pembatalan: p.data.alasan,
      dibatalkan_oleh: konteks.sesi.userId,
      dibatalkan_at: new Date(),
      updated_at: new Date(),
    },
  });
  return { ok: true, nilai: { status: 'DIBATALKAN' } };
}

// ---------------------------------------------------------------------------
// Antrian
// ---------------------------------------------------------------------------

export interface ItemAntrianSurat {
  id: string;
  kode_surat: string;
  perihal: string;
  tujuan_nama: string;
  nama_pembuat: string;
  nama_departemen: string | null;
  diajukan_at: string;
}

/**
 * Surat MENUNGGU_APPROVAL periode aktif — antrian yang SAMA untuk Ketua,
 * Wakil, dan Sekum. Begitu satu menyetujui atau menolak, statusnya berubah
 * dan surat itu tidak lagi muncul di antrian dua lainnya.
 */
export async function daftarAntrianSurat(konteks: Konteks): Promise<{ menunggu: ItemAntrianSurat[]; gagalTerbit: ItemAntrianSurat[] }> {
  const baris = await db.surat.findMany({
    // Surat batch massal yang masih menunggu disetujui lewat halaman massal
    // (T-064), bukan satu per satu — kalau tidak, nomornya dapat disela.
    // Yang sudah bernomor tetapi gagal terbit tetap muncul untuk terbit ulang.
    where: {
      periode_id: konteks.periodeId,
      OR: [{ status: 'DISETUJUI' }, { status: 'MENUNGGU_APPROVAL', batch_id: null }],
    },
    orderBy: [{ diajukan_at: 'asc' }, { created_at: 'asc' }],
    select: {
      id: true,
      status: true,
      kode_surat: true,
      perihal: true,
      tujuan_nama: true,
      diajukan_at: true,
      updated_at: true,
      app_user_surat_dibuat_olehToapp_user: { select: { nama_lengkap: true } },
      departemen: { select: { nama: true } },
    },
  });
  const ke = (b: (typeof baris)[number]): ItemAntrianSurat => ({
    id: b.id,
    kode_surat: b.kode_surat,
    perihal: b.perihal,
    tujuan_nama: b.tujuan_nama,
    nama_pembuat: b.app_user_surat_dibuat_olehToapp_user.nama_lengkap,
    nama_departemen: b.departemen?.nama ?? null,
    diajukan_at: (b.diajukan_at ?? b.updated_at).toISOString(),
  });
  return {
    menunggu: baris.filter((b) => b.status === 'MENUNGGU_APPROVAL').map(ke),
    gagalTerbit: baris.filter((b) => b.status === 'DISETUJUI').map(ke),
  };
}
