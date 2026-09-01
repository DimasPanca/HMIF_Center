# ADR-007 — Total alokasi nota

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-027, T-101, T-102 |

## Konteks

PRD F-11.1 mewajibkan **"Jumlah alokasi wajib sama dengan total nota"**.

Trigger `cek_total_alokasi` pada SYSTEM_DESIGN §4.7 hanya menolak alokasi yang **melebihi** total nota. Nota dengan alokasi kurang akan lolos.

Namun memindahkan syarat kesamaan ke dalam trigger **membuat sistem tidak bisa dipakai**: alokasi dimasukkan bertahap satu per satu, dan baris pertama akan selalu melanggar syarat "harus sama dengan total".

## Keputusan

Pembagian tanggung jawab dua lapis:

| Lapis | Aturan yang dijaga |
|---|---|
| **Trigger database** (DEFERRABLE INITIALLY DEFERRED) | Total alokasi **tidak boleh melebihi** total nota — batas atas, berlaku setiap saat |
| **Service aplikasi** | Total alokasi **harus persis sama** dengan total nota — diperiksa saat submit nota dan saat verifikasi Bendahara |

## Konsekuensi implementasi

- Insert alokasi bertahap tetap mungkin; trigger tidak menghalangi proses input.
- Submit nota dengan total alokasi tidak seimbang ditolak dengan kode error `ALOKASI_TIDAK_SEIMBANG`, **beserta besaran selisihnya** (T-101).
- Verifikasi Bendahara memeriksa ulang kesamaan sebelum menyetujui — nota tidak bisa lolos lewat manipulasi API setelah submit (T-102).
- Trigger tetap `DEFERRABLE INITIALLY DEFERRED` agar pemeriksaan terjadi di akhir transaksi, bukan per baris.
