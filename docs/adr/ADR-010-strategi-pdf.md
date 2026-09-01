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
