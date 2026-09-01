# ADR-003 — Counter surat periode baru

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-022, T-034, T-050 |

## Konteks

PRD §12 Q3. Belum jelas apakah periode kepengurusan baru melanjutkan nomor terakhir yang berjalan (mis. 502) atau benar-benar mulai dari 001.

Keputusan ini menentukan perilaku `aktifkan_periode` dan tidak bisa diubah setelah surat pertama terbit, karena counter tidak pernah mundur (INV-16).

## Keputusan

Nomor pertama periode baru adalah **`001`** secara default.

Admin dapat mengisi `periode.nomor_surat_awal` saat membuat periode bila organisasi memutuskan melanjutkan penomoran berjalan.

## Konsekuensi implementasi

- Kolom `periode.nomor_surat_awal INTEGER NOT NULL DEFAULT 1` (T-022).
- `aktifkan_periode` membuat baris `surat_counter` dengan `nomor_terakhir = nomor_surat_awal - 1`, sehingga alokasi pertama menghasilkan tepat `nomor_surat_awal` (T-034).
- Nomor selalu di-pad tiga digit: `001`, bukan `1`.
- Kebutuhan "lanjut dari 502" terpenuhi tanpa perubahan kode: Admin cukup mengisi `nomor_surat_awal = 503`.
