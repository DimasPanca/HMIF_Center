# ADR-004 — Penandatangan surat

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-006, T-055, T-061 |

## Konteks

PRD §12 Q4 menanyakan apakah tanda tangan Sekretaris Umum wajib pada semua surat atau hanya jenis tertentu.

Memaksa TTD Sekum pada seluruh surat akan menghasilkan dokumen yang tidak sesuai format asli untuk sebagian jenis, sementara menghilangkannya sama sekali membuat surat administratif tertentu tidak sah.

## Keputusan

**Ketua Himpunan** adalah penandatangan utama pada seluruh surat yang mengatasnamakan himpunan, dan **stempel HMIF melekat pada blok tanda tangannya**.

**Sekretaris Umum** hanya muncul pada template atau varian yang mendefinisikannya secara eksplisit di `field_schema.signers[]`.

## Konsekuensi implementasi

- Blok tanda tangan dirender dari `surat_template.field_schema.signers[]`, bukan dari aturan global di kode (T-055).
- Generator menyisipkan `{%ttd_ketua}` dan `{%stempel}` pada seluruh surat; `{%ttd_sekum}` hanya bila template mendeklarasikannya (T-061).
- Penandatangan tambahan (Ketua Pelaksana, Sekretaris Acara) tetap diisi user lewat field repeatable dan dirender lewat loop `{#signers}…{/signers}`.
- Gambar tanda tangan diambil dari bucket privat saat proses generate di server; URL-nya tidak pernah muncul di response API (PRD F-1.3).
