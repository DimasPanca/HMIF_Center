/**
 * Pengajuan Surat Keterangan Aktif mandiri (ADR-036).
 *
 * Pengurus selain Sekum tidak menyusun surat; mereka hanya mengajukan Surat
 * Keterangan Aktif atas nama DIRINYA. Identitas (nama, NIM, jabatan) diambil
 * server dari Data Pengurus periode aktif — pemohon hanya mengisi keperluan.
 * Draft dibuat lalu langsung diajukan, sehingga masuk antrean approval
 * Ketua/Wakil/Sekum seperti surat lain.
 */


import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { simpanDraft, type HasilSurat } from '@/lib/surat/draft';
import { SkemaAjukanSkAktif } from '@/lib/surat/keterangan-aktif-skema';
import type { StatusSurat } from '@/lib/surat/status';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/keterangan-aktif.ts adalah modul server-only.');
}

/** Batas pengajuan yang masih menunggu — mencegah antrean Ketua dibanjiri satu orang. */
export const MAKS_MENUNGGU = 10;

export interface IdentitasPemohon {
  nama: string;
  nim: string;
  jabatan: string;
  /** false = belum tercatat di Data Pengurus periode aktif; pengajuan ditolak. */
  tercatat: boolean;
}

export interface PengajuanSkAktif {
  id: string;
  status: StatusSurat;
  keperluan: string;
  nomor: string | null;
  tanggal_surat: string;
  diajukan_at: string | null;
  alasan_penolakan: string | null;
  dapat_diunduh: boolean;
}

export async function identitasPemohon(konteks: Konteks): Promise<IdentitasPemohon> {
  const p = konteks.periodeId
    ? await db.pengurus.findFirst({
        where: { periode_id: konteks.periodeId, user_id: konteks.sesi.userId, is_aktif: true },
        select: { nama_lengkap: true, nim: true, jabatan: true },
      })
    : null;
  if (p) return { nama: p.nama_lengkap, nim: p.nim, jabatan: p.jabatan, tercatat: true };
  const u = await db.app_user.findUnique({ where: { id: konteks.sesi.userId }, select: { nama_lengkap: true, nim: true } });
  return { nama: u?.nama_lengkap ?? '', nim: u?.nim ?? '', jabatan: '', tercatat: false };
}

export async function daftarPengajuanSaya(konteks: Konteks): Promise<PengajuanSkAktif[]> {
  if (!konteks.periodeId) return [];
  const baris = await db.surat.findMany({
    where: { periode_id: konteks.periodeId, dibuat_oleh: konteks.sesi.userId, kode_surat: '02' },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      status: true,
      nomor_lengkap: true,
      tanggal_surat: true,
      diajukan_at: true,
      alasan_penolakan: true,
      data_dinamis: true,
    },
  });
  return baris.map((s) => ({
    id: s.id,
    status: s.status as StatusSurat,
    keperluan: String((s.data_dinamis as Record<string, unknown> | null)?.keperluan ?? ''),
    nomor: s.nomor_lengkap,
    tanggal_surat: s.tanggal_surat.toISOString().slice(0, 10),
    diajukan_at: s.diajukan_at?.toISOString() ?? null,
    alasan_penolakan: s.alasan_penolakan,
    dapat_diunduh: s.status === 'TERBIT' && !!s.nomor_lengkap,
  }));
}

/**
 * Langkah 1 (dalam satu transaksi audit): membuat draft SK Aktif dari identitas
 * server. Langkah 2 — mengajukan — dijalankan pemanggil dalam transaksi
 * berikutnya, karena `muatSurat` membaca lewat koneksi lain dan baru melihat
 * draft setelah commit.
 */
export async function buatDraftSkAktif(tx: TxKlien, konteks: Konteks, body: unknown): Promise<HasilSurat<{ id: string }>> {
  const p = SkemaAjukanSkAktif.safeParse(body);
  if (!p.success) {
    return { ok: false, kode: 'VALIDASI_GAGAL', pesan: p.error.issues[0]?.message ?? 'Isian tidak valid.' };
  }
  const id = await identitasPemohon(konteks);
  if (!id.tercatat) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: 'Nama Anda belum tercatat di Data Pengurus periode ini. Hubungi Sekretaris Umum untuk menambahkannya.',
    };
  }
  const menunggu = await tx.surat.findMany({
    where: { periode_id: konteks.periodeId, dibuat_oleh: konteks.sesi.userId, kode_surat: '02', status: 'MENUNGGU_APPROVAL' },
    select: { data_dinamis: true },
  });
  const sama = (v: unknown) => String(v ?? '').trim().toLowerCase() === p.data.keperluan.toLowerCase();
  // Tombol yang tertekan dua kali tidak boleh menghasilkan dua surat bernomor.
  if (menunggu.some((m) => sama((m.data_dinamis as Record<string, unknown> | null)?.keperluan))) {
    return {
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: 'Pengajuan dengan keperluan yang sama masih menunggu persetujuan. Tunggu diproses atau tulis keperluan lain.',
    };
  }
  if (menunggu.length >= MAKS_MENUNGGU) {
    return {
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      pesan: `Anda masih punya ${menunggu.length} pengajuan yang menunggu persetujuan. Tunggu sebagian diproses dulu.`,
    };
  }
  const tanggal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const draft = await simpanDraft(
    tx,
    konteks,
    {
      jenis: 'KETERANGAN_AKTIF',
      tanggal_surat: tanggal,
      format_output: 'DOCX',
      data_dinamis: { nama_pemohon: id.nama, nim_pemohon: id.nim, jabatan_pemohon: id.jabatan, keperluan: p.data.keperluan },
    },
    null,
  );
  return draft.ok ? { ok: true, nilai: { id: draft.nilai.id } } : draft;
}
