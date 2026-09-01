# ADR-015 — Approval LPJ

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-021, T-031, T-105 |

## Konteks

PRD §12 Q9 menanyakan apakah LPJ memerlukan persetujuan sebelum final.

SYSTEM_DESIGN §4.10 mendefinisikan `lpj.status` sebagai `TEXT NOT NULL DEFAULT 'DRAFT'` — teks bebas tanpa daftar nilai sah, sehingga alur persetujuan tidak dapat ditegakkan database.

## Keputusan

LPJ memerlukan persetujuan **dua tahap: Bendahara Umum lalu Ketua Himpunan**.

Alur status: `DRAFT → DIAJUKAN → DISETUJUI_BENDUM → FINAL`. Status `FINAL` **tidak dapat diubah**.

## Konsekuensi implementasi

- Enum `lpj_status` dengan empat nilai, bukan TEXT bebas (T-021).
- Tabel `lpj` memuat empat kolom approver: `disetujui_bendum_oleh`, `disetujui_bendum_at`, `disetujui_ketua_oleh`, `disetujui_ketua_at` (T-031).
- Hasil analisis keuangan disimpan sebagai **snapshot** di `lpj.analisis` saat generate, sehingga LPJ yang sudah final tidak berubah angkanya bila RAB diedit kemudian (T-105).
- Transisi status ilegal ditolak di server, bukan hanya disembunyikan di UI.
