# ADR-002 — Kode Surat Aspirasi

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-006, T-054, T-055 |

## Konteks

PRD §12 Q2. Arsip menunjukkan Surat Aspirasi terbit dengan nomor `03/018/UN43.3.7/HMIF/VIII/2026`, yang berarti kode `03` (Surat Pemberitahuan). Namun daftar kode surat PRD F-4.1 tidak menyebut Aspirasi secara eksplisit, sehingga bisa ditafsirkan butuh kode tersendiri.

Menambah kode baru berarti mengubah daftar kode yang sudah dipakai organisasi — perubahan yang tidak boleh diambil sepihak oleh sistem.

## Keputusan

Surat Aspirasi memakai **kode `03`**, terdaftar sebagai **varian `ASPIRASI`** dari Surat Pemberitahuan.

Daftar sembilan kode surat PRD F-4.1 tetap utuh; tidak ada kode kesepuluh.

## Konsekuensi implementasi

- Satu baris `surat_template` dengan `kode_surat = '03'` dan `varian = 'ASPIRASI'` (T-055).
- Template `templates/surat-03-aspirasi.docx` diturunkan dari `Template/018_Surat Aspirasi Keorganisasian Mahasiswa Fakultas Teknik.docx` (T-006).
- Skema field khusus memuat **Lampiran Poin Aspirasi** yang repeatable: judul poin + uraian multi-paragraf, dirender lewat loop `{#poin}…{/poin}` (T-054).
- Satu kode surat dapat memiliki lebih dari satu varian template — pola yang sama dipakai kode `04` dan `05`.
