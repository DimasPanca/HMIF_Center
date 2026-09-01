# ADR-014 — Batas upload nota

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-003, T-097, T-098 |

## Konteks

PRD §12 Q8 menanyakan batas maksimal ukuran berkas upload nota.

Foto nota dari ponsel modern berukuran 3–8 MB. Batas terlalu kecil membuat panitia gagal upload di lapangan; terlalu besar membuka celah penyalahgunaan storage dan memperlambat pemrosesan.

## Keputusan

Batas **15 MB per berkas**.

Format yang diterima hanya **JPEG, PNG, dan WebP**, divalidasi lewat **magic bytes** — bukan ekstensi berkas atau `Content-Type` dari klien.

## Konsekuensi implementasi

- Konstanta `MAX_UPLOAD_BYTES=15728640` di `.env.example` dan `lib/images/constants.ts` (T-003, T-097).
- Berkas melebihi batas ditolak dengan kode error `FILE_TIDAK_VALID` beserta pesan yang menyebut batasnya (T-098).
- Berkas bernama `foto.jpg` yang sebenarnya PDF ditolak, karena validasi membaca isi berkas (INV-21).
- Pipeline klien memperkecil gambar sebelum upload, sehingga master yang terkirim biasanya 800 KB – 2 MB — jauh di bawah batas.
