/**
 * generator — titik sambung generate dokumen surat. Server-only.
 *
 * T-060 membangun alur approve → alokasi nomor → TERBIT, tetapi Document Engine
 * (T-061) bergantung pada T-060. Sampai T-061 mengisi fungsi ini, setiap
 * surat yang disetujui berhenti di DISETUJUI dengan pesan di bawah — persis
 * perilaku "generate gagal" yang diminta kontrak T-060 butir 5, sehingga
 * jalur itu teruji sejak awal, bukan hanya saat generator kebetulan rusak.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-060 butir 5, T-061
 */

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/generator.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type HasilGenerate = { ok: true } | { ok: false; pesan: string };

export async function generateDokumenSurat(suratId: string): Promise<HasilGenerate> {
  void suratId;
  return {
    ok: false,
    pesan: 'Generator dokumen belum tersedia. Nomor surat sudah ditetapkan; dokumen dapat diterbitkan ulang setelah generator aktif.',
  };
}
