# ADR-012 — Pengurus tanpa akun

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-030, T-064, T-107 |

## Konteks

PRD §12 Q6 menanyakan apakah anggota panitia yang bukan pengurus HMIF perlu akun aplikasi.

Modul Data Pengurus (PRD F-14.1) dipakai sebagai sumber auto-fill Surat Keterangan Aktif Organisasi, yang bisa diterbitkan untuk banyak mahasiswa sekaligus. Mewajibkan akun untuk setiap orang yang namanya muncul di surat berarti membuat puluhan akun yang tidak pernah dipakai.

## Keputusan

Record `pengurus` boleh memiliki `user_id` **NULL**.

Akun aplikasi hanya dibuat lewat undangan oleh Admin — tidak pernah otomatis dari data pengurus yang diimpor.

## Konsekuensi implementasi

- Kolom `pengurus.user_id UUID REFERENCES app_user(id)` bersifat nullable (T-030).
- Import massal data pengurus **tidak** membuat akun (T-107).
- Data pengurus tanpa akun tetap dapat dipakai untuk generate Surat Keterangan Aktif Organisasi (T-064).
- Baris yang memang punya akun ditautkan, sehingga keaktifan dan surat tetap terhubung ke user yang benar.
