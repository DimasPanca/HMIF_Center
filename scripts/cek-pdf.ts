/**
 * Uji konverter PDF sungguhan (T-062) — dijalankan pemilik SETELAH layanan
 * Gotenberg (atau LibreOffice) terpasang. Tidak menyentuh database.
 *
 *     npx tsx scripts/cek-pdf.ts                 pakai GOTENBERG_URL/SOFFICE_PATH dari .env.local
 *     npx tsx scripts/cek-pdf.ts --keluaran x.pdf simpan PDF ke berkas lain
 *
 * Yang diperiksa:
 *   1. konverter dapat dihubungi dan menerima kredensialnya;
 *   2. PDF hasil punya lapisan teks (bukan rasterisasi — ADR-010);
 *   3. waktu konversi (layanan gratis yang "tidur" bisa butuh puluhan detik
 *      untuk bangun pada permintaan pertama).
 *
 * Kop, tanda tangan, dan tata letak tetap harus DILIHAT manusia: buka PDF yang
 * disimpan dan bandingkan dengan DOCX-nya (langkah 5 docs/ai/GOTENBERG_SETUP.md).
 *
 * Keluar 0 bila lulus, 1 bila tidak.
 */

import fs from 'node:fs';
import path from 'node:path';

const AKAR = path.resolve(import.meta.dirname, '..');
const NL = '\n';
const tulis = (s: string): void => {
  process.stdout.write(s + NL);
};

function muatEnv(): void {
  const f = path.join(AKAR, '.env.local');
  if (!fs.existsSync(f)) return;
  for (const baris of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

async function main(): Promise<number> {
  muatEnv();
  const argKeluaran = process.argv.indexOf('--keluaran');
  const keluaran = path.resolve(argKeluaran > -1 ? process.argv[argKeluaran + 1]! : 'cek-pdf-contoh.pdf');

  const { bacaKonfigPdf, docxToPdf, periksaPdfBerteks, pilihJalur } = await import('@/lib/documents/pdf-converter');
  const { renderDocx } = await import('@/lib/documents/docx-engine');
  const { petakanSurat } = await import('@/lib/documents/data-mapper');
  const { gabungTtdStempel } = await import('@/lib/documents/image-module');
  const { buatSkemaSurat, nilaiAwalSurat } = await import('@/lib/surat/field-schemas');

  // Uji konverter tanpa bergantung pada flag: PDF_ENABLED baru dinyalakan
  // SESUDAH skrip ini lulus.
  const konfig = { ...bacaKonfigPdf(), aktif: true };
  const jalur = pilihJalur(konfig);
  tulis('');
  tulis(`  cek-pdf — jalur: ${jalur ?? 'TIDAK ADA'}${konfig.gotenbergUrl ? ` (${konfig.gotenbergUrl})` : ''}`);
  tulis(`  basic auth: ${konfig.gotenbergAuth ? 'ya' : 'TIDAK — layanan publik tanpa sandi dapat dipakai siapa pun'}`);
  if (!jalur || jalur === 'HTML') {
    tulis('  GAGAL — isi GOTENBERG_URL (atau SOFFICE_PATH) di .env.local. Lihat docs/ai/GOTENBERG_SETUP.md.');
    return 1;
  }

  const K = { kodeKegiatanDefault: 'HMIF', kotaDefault: 'Cilegon', kodeAdministrasi: 'UN43.3.7', pdfAktif: true };
  const awal = nilaiAwalSurat(K, 'PENGAJUAN') as Record<string, unknown>;
  const nilai = buatSkemaSurat(K).parse({
    ...awal,
    tanggal_surat: '2026-10-15',
    perihal: 'Uji Konversi PDF',
    tujuan_preset: 'Lainnya (isi manual)',
    tujuan_nama: 'Kepala Bagian Sekretariat',
    tujuan_alamat: 'di Tempat',
    isi_surat: '<p>Surat ini dibuat oleh scripts/cek-pdf.ts untuk memastikan PDF hasil konversi memuat teks yang dapat diseleksi.</p>',
  });
  const coretan = await (await import('sharp'))
    .default({ create: { width: 600, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="600" height="300"><path d="M20 250 C 150 20, 300 280, 580 40" stroke="black" stroke-width="12" fill="none"/></svg>') }])
    .png()
    .toBuffer();
  const ttd = await gabungTtdStempel(coretan, fs.readFileSync(path.join(AKAR, 'public', 'stempel-hmif.png')));
  const docx = renderDocx(
    fs.readFileSync(path.join(AKAR, 'templates', 'surat-umum.docx')),
    petakanSurat({ nilai: nilai as never, nomorLengkap: '01/000/UN43.3.7/HMIF/X/2026', ketua: { nama: 'Ketua Uji', nim: '3337220000' }, ttdKetua: ttd }),
  );

  const mulai = Date.now();
  try {
    const hasil = await docxToPdf(docx, konfig);
    const detik = ((Date.now() - mulai) / 1000).toFixed(1);
    fs.writeFileSync(keluaran, hasil.pdf);
    fs.writeFileSync(keluaran.replace(/\.pdf$/i, '.docx'), docx);
    const p = periksaPdfBerteks(hasil.pdf);
    tulis(`  PDF ${hasil.pdf.length} byte dalam ${detik} dtk · operator teks ${p.operatorTeks} · gambar ${p.gambar}`);
    tulis(`  disimpan: ${keluaran} (+ .docx pembanding)`);
    tulis('');
    tulis('  LULUS — buka kedua berkas dan bandingkan kop, tanda tangan, dan tata letaknya.');
    tulis('  Bila sama, set PDF_ENABLED=true di Vercel (langkah 6 panduan).');
    tulis('');
    return 0;
  } catch (e) {
    tulis(`  GAGAL setelah ${((Date.now() - mulai) / 1000).toFixed(1)} dtk: ${e instanceof Error ? e.message : String(e)}`);
    tulis('  Layanan gratis yang sedang tidur bisa butuh ±1 menit untuk bangun — jalankan sekali lagi.');
    tulis('');
    return 1;
  }
}

main().then(
  (k) => process.exit(k),
  (e) => {
    process.stderr.write(`GALAT: ${e instanceof Error ? e.message : String(e)}${NL}`);
    process.exit(1);
  },
);
