# `lib/` — Peran Tiap Subfolder

Supaya berkas selalu mendarat di tempat yang benar. Struktur mengikuti SYSTEM_DESIGN §17.

Kolom **Lane** menunjukkan agent mana yang boleh menulis di sana selama kerja paralel — lihat [PARALLEL_PROTOCOL.md](../docs/ai/PARALLEL_PROTOCOL.md).

| Folder | Lane | Isi | Task |
|---|:---:|---|---|
| `auth/` | data | Sesi, `PERMISSIONS`, `can()`, guard Route Handler & Server Action, rate limit, undangan | T-045, T-046, T-047 |
| `db/` | data | Prisma client singleton, `withAuditContext()`, koneksi | T-043 |
| `storage/` | data | `StorageAdapter` dan implementasinya, helper `keys.ts` | T-044 |
| `images/` | data | Pipeline klien 3 turunan, deteksi tipe konten, validasi server | T-097, T-098 |
| `proker/` | data | Skema Zod 3 kategori, transisi status, service & anti-bentrok | T-065, T-071 |
| `rab/` | data | `parse-jumlah`, kalkulasi, export & import Excel, realisasi | T-086 … T-091 |
| `surat/` | data | Skema field, penomoran, registry template, batch | T-054 … T-056 |
| `documents/` | data | DocumentEngine DOCX, data mapper, image module, konversi PDF | T-061, T-062 |
| `lpj/` | data | Analisis selisih, generator | T-104, T-105 |
| `backup/` | data | Orkestrasi backup 3 lapis, restore, import per modul | T-110 … T-112 |
| `realtime/` | data | Definisi kanal, hook langganan Supabase Realtime | T-076 |
| **`utils/`** | **ui** | Format tanggal, rupiah, bulan romawi, slug | T-015 |
| **`gantt/`** | **ui** | Tipe, geometri, transform, virtualisasi baris | T-072, T-074 |
| **`theme.ts`** | **ui** | `getTheme`, `setTheme`, `toggleTheme` | T-014 |
| **`shortcuts.ts`** | **ui** | Pintasan keyboard global | T-052 |

## Aturan penempatan

**Fungsi murni yang dipakai klien dan server** → `utils/` atau folder domainnya.
Contoh: `parseJumlah` ada di `rab/` walau dipakai di kedua sisi, karena ia milik domain RAB.

**Apa pun yang menyentuh rahasia server** — `SUPABASE_SECRET_KEY`, connection string, `CRON_SECRET` — **tidak boleh** diimpor berkas ber-`"use client"`. Ditegakkan `npm run check:secrets`.

**Query kritis memakai raw SQL atau fungsi database**, bukan rantai ORM (AGENT_RULES K-07). Berlaku untuk anti-bentrok, penomoran surat, dan agregasi Master Gantt — ketiganya punya aturan yang hidup di database.

**Satu skema Zod dipakai bersama form klien dan validasi server** (K-04). Dilarang menulis dua skema untuk entitas yang sama.

## Yang tidak ada di sini

`components/` berisi komponen React, bukan `lib/`. `hooks/` berisi React hook milik lane `ui`. Skrip CLI ada di `scripts/`, bukan `lib/`.
