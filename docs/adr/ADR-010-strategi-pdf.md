# ADR-010 — Strategi PDF

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-003, T-054, T-062 |

## Konteks

PRD F-4.2 menyediakan pilihan format output DOCX, PDF, atau keduanya. Konversi DOCX→PDF berfidelitas tinggi membutuhkan LibreOffice headless atau Gotenberg (SYSTEM_DESIGN §8.4).

Keduanya **tidak dapat berjalan di Vercel serverless**. Jalur fallback HTML→PDF menghasilkan dokumen yang tata letaknya menyimpang dari kop surat resmi — yang untuk surat resmi himpunan berarti dokumen tidak layak kirim.

Menunggu Gotenberg siap akan memblokir seluruh modul persuratan.

## Keputusan

**DOCX selalu tersedia.** PDF berada di balik feature flag `PDF_ENABLED`, dengan nilai awal `false`.

PDF baru diaktifkan setelah Gotenberg atau LibreOffice terpasang **dan lolos verifikasi** bahwa teks pada PDF hasil dapat diseleksi (bukan rasterisasi).

## Konsekuensi implementasi

- `.env.example` memuat `PDF_ENABLED=false` (T-003).
- Saat `false`: opsi PDF **tidak dirender** di form surat, dan server menolak permintaan format PDF dengan pesan yang jelas (T-054, T-062).
- **Tidak ada fallback diam-diam** ke konversi berkualitas rendah. Lebih baik menolak terang-terangan daripada mengirim surat resmi dengan kop yang rusak.
- Modul persuratan dapat dirilis penuh tanpa menunggu PDF — PDF menyusul sebagai peningkatan, bukan blocker.

## Status nyata (diperbarui 2026-10-15, T-062)

**Rilis DOCX-only. `PDF_ENABLED=false` di seluruh lingkungan.** Gotenberg dan
LibreOffice belum terpasang di mana pun; Vercel (produksi) tidak dapat
menjalankan keduanya. T-062 sengaja **tidak** ditandai DONE: kodenya siap,
verifikasi akhirnya menunggu infrastruktur (keputusan pemilik produk
2026-10-15).

Yang sudah ada (`lib/documents/pdf-converter.ts`):

- `docxToPdf()` mencoba `GOTENBERG_URL` → `SOFFICE_PATH` → fallback HTML
  (hanya bila `PDF_FALLBACK_HTML=true`). Jalur yang terpasang tetapi gagal
  menghasilkan galat — **tidak** pindah diam-diam ke jalur berikutnya.
- Fallback HTML **belum dipasang**: butuh pustaka di luar SYSTEM_DESIGN §2
  (konversi DOCX→HTML + Chromium headless). Mengaktifkannya menghasilkan
  penolakan dengan pesan jelas. Menambahkannya kelak wajib ADR baru, dan
  hasilnya wajib ditandai "fidelitas rendah" di UI (`HasilPdf.fidelitasRendah`).
- Setiap PDF hasil diperiksa `periksaPdfBerteks()`: PDF tanpa lapisan teks
  (rasterisasi) ditolak. Diuji dengan PDF buatan tangan dan dicocokkan dengan
  PDF ekspor Word sungguhan.
- Generator surat: PDF hanya dibuat bila `format_output` PDF/BOTH. Gagal atau
  dimatikan → surat tetap TERBIT sebagai DOCX dengan peringatan "PDF belum
  tersedia" untuk approver.
- `GET /api/surat/[id]/download?format=pdf` → 409 `PDF_NONAKTIF` saat flag
  mati, bukan DOCX pengganti.
- Form surat tidak merender opsi PDF/Keduanya saat flag mati (T-054, gate
  `surat-form`).

**Untuk mengaktifkan PDF** (langkah manusia, HANDOFF):

1. Jalankan Gotenberg (mis. `gotenberg/gotenberg:8` di Railway/Fly.io), isi
   `GOTENBERG_URL`. Atau di VPS: pasang LibreOffice, isi `SOFFICE_PATH`.
2. Set `PDF_ENABLED=true` di lingkungan uji, terbitkan satu surat berformat
   BOTH, unduh PDF-nya, dan **pastikan teksnya dapat diseleksi serta kop
   utuh** dibandingkan DOCX.
3. Baru set `PDF_ENABLED=true` di produksi, lalu tandai T-062 DONE.

## Keputusan pemilik (2026-10-15, lanjutan T-062)

Pemilik hanya membutuhkan **surat dapat diunduh sebagai PDF**, bukan fitur
konversi berkas umum. Jalur yang dipilih: **Gotenberg di Render (Free)**,
disiapkan pemilik mengikuti `docs/ai/GOTENBERG_SETUP.md`.

- Klien Gotenberg mengirim basic auth (`GOTENBERG_USERNAME`/`GOTENBERG_PASSWORD`;
  layanan dijalankan dengan `--api-enable-basic-auth`). Layanan publik tanpa
  sandi dapat dipakai siapa pun.
- **Buat PDF** untuk surat TERBIT yang belum punya PDF (`POST
  /api/surat/[id]/pdf`): paket Free tidur dan butuh ±1 menit bangun, sehingga
  PDF saat terbit dapat gagal. PDF dibuat dari DOCX tersimpan — identik dengan
  dokumen terbit. Berlaku untuk surat TERBIT apa pun format pilihannya.
- `scripts/cek-pdf.ts`: uji konverter sungguhan + lapisan teks sebelum
  `PDF_ENABLED=true` dinyalakan di produksi.
- T-062 tetap BLOCKED sampai langkah 5 panduan berhasil di produksi.
