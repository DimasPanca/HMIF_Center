# ADR-017 — Haluan Kerja pasca-MVP

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-051, T-109 |

## Konteks

Menu **Haluan Kerja** muncul pada struktur sidebar USER_FLOW §1.1, dan dua template terkait tersedia di repositori: `Template Haluan Kerja Dasar Departemen.docx` dan `Template LPJ_Departemen.docx`.

Namun **tidak ada modul M1–M16 pada PRD** yang mencakupnya. Tidak ada spesifikasi fungsional, tidak ada acceptance criteria, tidak ada skema data. Membiarkan menu ini di sidebar berarti mengarahkan pengguna ke halaman yang tidak pernah dibangun.

## Keputusan

Haluan Kerja Departemen dan LPJ Departemen **keluar dari cakupan MVP**.

Menu dihapus dari sidebar dan command palette. Kebutuhan dicatat sebagai **M17** untuk pengembangan pasca-MVP.

## Konsekuensi implementasi

- Sidebar dibangun tanpa entri Haluan Kerja sejak awal (T-051).
- `docs/ai/BACKLOG.md` memuat M17 lengkap dengan template yang sudah tersedia, perkiraan cakupan, dan alasan penundaan (T-109).
- **Berkas template sumber tetap disimpan** di `Template/` — jangan dihapus, karena akan dipakai saat M17 dibangun.
- Tidak boleh ada rute, tautan, atau entri pencarian yang mengarah ke Haluan Kerja di MVP.
