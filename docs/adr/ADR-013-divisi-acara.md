# ADR-013 — Divisi acara

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-008, T-042, T-069 |

## Konteks

PRD §12 Q7 menanyakan apakah daftar divisi kepanitiaan tetap sama untuk semua acara atau dapat dikustom per acara.

Acara berbeda memang butuh divisi berbeda — seminar tidak butuh P3K, sementara acara lapangan wajib punya. Namun tanpa preset, tiap kepanitiaan akan menamai divisi dengan gaya masing-masing dan rekap lintas acara jadi tidak mungkin.

## Keputusan

Gunakan **sembilan divisi preset**: Acara · Konsumsi · Humas · Peralatan · PDD · P3K · Sekretaris · Bendahara · Komdis.

Preset dapat **ditambah atau dikurangi per acara** saat pembentukan kepanitiaan.

## Konsekuensi implementasi

- Sembilan preset tercatat di `docs/ai/SEED_DATA.md` dan masuk seed (T-008, T-042).
- Langkah 4 wizard proker menampilkan preset sebagai pilihan awal, dengan opsi tambah manual (T-069).
- Koordinator dan anggota divisi disimpan sebagai **data kontekstual** pada `divisi` dan `divisi_member` — bukan sebagai role global di `user_role`.
- Peran Koordinator Divisi berakhir saat acara ditutup, sesuai sifat role kontekstual PRD §4.3 P9.
