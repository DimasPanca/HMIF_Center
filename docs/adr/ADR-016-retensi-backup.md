# ADR-016 — Retensi backup

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-110, T-111 |

## Konteks

PRD §12 Q10 menanyakan berapa lama backup disimpan.

Backup otomatis bulanan akan menumpuk dan menghabiskan kuota storage tier gratis (risiko R7). Namun menghapus tanpa aturan berisiko menghilangkan backup manual yang sengaja dibuat sebelum operasi berbahaya — justru backup yang paling dibutuhkan saat pemulihan.

## Keputusan

Simpan **12 backup otomatis terbaru**.

Backup berjenis **`MANUAL`** dan **`PRA_RESTORE`** tidak pernah dihapus otomatis.

## Konsekuensi implementasi

- Job retensi hanya menyeleksi baris dengan `jenis = 'OTOMATIS'` (T-111).
- Penghapusan mencakup objek storage **dan** baris `backup`, serta dicatat di `audit_log`.
- Backup pra-restore aman dari pembersihan otomatis — inilah jaring pengaman terakhir bila restore berujung salah.
- Retensi 12 bulan memberi kemampuan menelusuri kondisi data satu periode kepengurusan penuh ke belakang.
