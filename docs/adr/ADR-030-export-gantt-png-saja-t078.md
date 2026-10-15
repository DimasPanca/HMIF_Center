# ADR-030 — Export Gantt hanya PNG (tanpa PDF)

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-10-15 |
| **Task terkait** | T-078 |
| **Diputuskan oleh** | Pemilik produk (Ketua Himpunan), sesi 2026-10-15 |

## Konteks

Kontrak T-078 butir 4 meminta export **PNG** (untuk disisipkan ke Word) dan
**PDF**, keduanya dirender dari SVG ke kanvas pada skala 2x. Gate
`e2e/gantt-editor.spec.ts` semula memeriksa keberadaan tombol
`gantt-export-pdf`.

Membuat PDF di peramban butuh pustaka penyusun PDF (jsPDF atau sejenisnya)
yang tidak tercantum di SYSTEM_DESIGN §2. Kebutuhan nyatanya juga sempit:
Gantt dipakai sebagai **gambar di dalam dokumen** (proposal, TOR, LPJ) yang
PDF-nya sudah datang dari Word atau dari jalur Gotenberg surat (ADR-010).
Ketika ditanya, pemilik produk memilih "PNG saja".

## Keputusan

1. Editor Gantt hanya menyediakan **Export PNG** (`gantt-export-png`), pada
   skala 2x, digambar ulang dari view model (`lib/gantt/export-svg.ts`) —
   bukan salinan SVG di layar — supaya lengkap (semua baris, termasuk yang
   tervirtualisasi), berlabel, berlatar putih, dan berwarna tetap.
2. Tidak ada tombol PDF dan tidak ada dependency penyusun PDF.
3. Route `GET /api/gantt/[chartId]/export` merender PNG yang sama di server
   (sharp, density 144) untuk tautan langsung. Tombol editor tetap
   merasterisasi di peramban, karena font sistem pengguna selalu tersedia
   sedangkan server tanpa font hanya menjamin bar dan warna.
4. Gate `gantt-editor` memeriksa bahwa tombol PDF **tidak** ada, supaya
   penyimpangan ini tercatat di test dan tidak muncul kembali diam-diam.

## Akibat

- PDF Gantt, bila suatu saat diperlukan, dibuat dengan menyisipkan PNG ke
  dokumen lalu mengekspor dokumennya — bukan dari editor.
- "Tajam dan terbaca saat disisipkan ke Word" tetap uji manual (Selesai bila
  T-078 #1): PNG 2x pada lebar kertas A4 landscape memberi ±190 dpi.
