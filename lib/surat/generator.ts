/**
 * generator — menghasilkan DOCX sebuah surat dan menyimpannya. Server-only.
 *
 *   muatSurat ─▶ Ketua + tanda tangan ─▶ gabung stempel ─▶ template versi surat
 *     ─▶ petakanSurat ─▶ renderDocx ─▶ storage (bucket privat)
 *
 * Fungsi ini TIDAK menulis ke database. Baris `dokumen` dan perpindahan status
 * ke TERBIT dikerjakan `terbitkanSurat` dalam satu transaksi sesudah berkasnya
 * tersimpan, supaya tidak pernah ada baris yang menunjuk berkas yang tidak ada.
 *
 * Setiap kegagalan dikembalikan sebagai pesan untuk approver, bukan dilempar:
 * nomor surat sudah ditetapkan dan tetap terpakai (INV-16), dan surat berhenti
 * di DISETUJUI sampai diterbitkan ulang (T-060 butir 5).
 *
 * Gambar tanda tangan diambil dari bucket privat di sini, di server; URL-nya
 * tidak pernah keluar dari fungsi ini (ADR-004, PRD F-1.3).
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-061 · SYSTEM_DESIGN §8 · ADR-004, ADR-029
 */

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { petakanSurat } from '@/lib/documents/data-mapper';
import { GalatTemplate, renderDocx } from '@/lib/documents/docx-engine';
import { gabungTtdStempel } from '@/lib/documents/image-module';
import { muatBerkas, muatStempel, sumberTemplateSurat } from '@/lib/documents/template-loader';
import { keys, storage } from '@/lib/storage';
import { muatSurat } from '@/lib/surat/draft';
import { bacaPenandatanganKetua } from '@/lib/surat/konfig';
import { MIME_DOCX } from '@/lib/surat/template-registry';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/generator.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type HasilGenerate = { ok: true; key: string; ukuran: number } | { ok: false; pesan: string };

const SARAN_ULANG = 'Nomor surat sudah ditetapkan; dokumen dapat diterbitkan ulang setelah masalahnya dibereskan.';

function gagal(pesan: string): HasilGenerate {
  return { ok: false, pesan: `${pesan} ${SARAN_ULANG}` };
}

export async function generateDokumenSurat(konteks: Konteks, suratId: string): Promise<HasilGenerate> {
  const surat = await muatSurat(konteks, suratId);
  if (!surat) return gagal('Surat tidak ditemukan di periode ini.');
  if (!surat.nomor_lengkap) return gagal('Surat belum bernomor.');

  const ketua = await bacaPenandatanganKetua(konteks.periodeId);
  if (!ketua) return gagal('Ketua Himpunan periode ini belum terdaftar.');

  // TTD Ketua wajib pada setiap surat yang mengatasnamakan himpunan (PRD F-4.3,
  // ADR-004). Surat resmi tanpa tanda tangan lebih buruk daripada belum terbit.
  const ttd = await db.signature.findUnique({ where: { user_id: ketua.userId }, select: { storage_key: true } });
  if (!ttd) return gagal(`${ketua.nama} (Ketua Himpunan) belum mengunggah tanda tangan.`);

  const sumber = await sumberTemplateSurat(surat.template_id);
  if (!sumber) return gagal('Template surat ini tidak ditemukan.');

  let isi: Buffer;
  try {
    const [gambarTtd, stempel, template] = await Promise.all([
      storage.get(ttd.storage_key),
      muatStempel(),
      muatBerkas(sumber.key),
    ]);
    const ttdKetua = await gabungTtdStempel(gambarTtd, stempel);
    const data = petakanSurat({
      nilai: surat.nilai as unknown as Parameters<typeof petakanSurat>[0]['nilai'],
      nomorLengkap: surat.nomor_lengkap,
      ketua: { nama: ketua.nama, nim: ketua.nim },
      ttdKetua,
    });
    isi = renderDocx(template, data);
  } catch (e) {
    if (e instanceof GalatTemplate) {
      console.error(`[generator] surat ${suratId}, template ${sumber.label}: ${e.message}`);
      return gagal(`Template ${sumber.label} tidak dapat diisi: ${e.message}`);
    }
    console.error(`[generator] surat ${suratId}: gagal memuat berkas`, e);
    return gagal('Template, stempel, atau tanda tangan tidak dapat dimuat dari penyimpanan.');
  }

  const key = keys.suratDocx(suratId);
  try {
    await storage.put(key, isi, MIME_DOCX, { upsert: true });
  } catch (e) {
    console.error(`[generator] surat ${suratId}: gagal mengunggah`, e);
    // Unggahan setengah jalan tidak boleh tertinggal tanpa baris dokumen.
    await storage.delete(key).catch(() => undefined);
    return gagal('Dokumen gagal disimpan ke penyimpanan.');
  }
  return { ok: true, key, ukuran: isi.length };
}
