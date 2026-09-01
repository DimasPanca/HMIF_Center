# ADR-009 — Strategi cron

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-079, T-111 |

## Konteks

SYSTEM_DESIGN §15.2 mendefinisikan tiga cron job pada `vercel.json`: backup bulanan, pelepasan kunci harian, dan pengecekan deadline harian.

Vercel tier Hobby membatasi jumlah cron job dan hanya mendukung pemicu harian. Konfigurasi tiga cron tersebut **tidak akan berjalan** pada tier yang dipakai MVP — khususnya backup bulanan, yang justru paling kritis (mitigasi risiko R11 kehilangan data).

## Keputusan

Gunakan **satu endpoint** `/api/cron/harian` dengan **satu jadwal cron harian**, yang bercabang di dalam kode:

| Kapan | Yang dijalankan |
|---|---|
| Setiap hari | Lifecycle proker (`lepas_kunci_selesai`) + pengecekan deadline |
| Tanggal 1 | Ditambah backup bulanan |

## Konsekuensi implementasi

- `vercel.json` memuat **satu** entri cron (T-079).
- Endpoint memverifikasi header `Authorization: Bearer ${CRON_SECRET}` dan menolak 401 bila tidak cocok.
- Endpoint bersifat idempoten: dijalankan dua kali dalam sehari tidak menimbulkan efek ganda.
- Setiap eksekusi mencatat ringkasan ke `audit_log` dengan aksi `CRON`.
- Agent **dilarang** membuat tiga cron terpisah walau melihatnya di SYSTEM_DESIGN §15.2.
