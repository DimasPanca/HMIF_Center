# LANE `data` — DATA & PLATFORM

**Agent: Claude Code** · Branch `lane/data` · Direktori `J:\Software\Web_Project\HMIF_Center`

> Baca [PARALLEL_PROTOCOL.md](../PARALLEL_PROTOCOL.md) sekali di awal sesi, lalu [AGENT_RULES.md](../AGENT_RULES.md).
> Berkas ini hanya menambahkan hal yang khusus untuk lane `data`.

---

## Perintah harian

```bash
npx tsx scripts/lane.ts status data          # task berikutnya
npx tsx scripts/lane.ts claim  data T-0XX    # ambil
npx tsx scripts/lane.ts guard  data          # WAJIB sebelum commit
npx tsx scripts/lane.ts done   data T-0XX    # tutup
```

---

## Yang lane ini kuasai

```
supabase/**              migrasi, fungsi, RLS, test SQL, seed
prisma/**                schema, client, seed pengembangan
lib/db/**                koneksi, audit context
lib/storage/**           StorageAdapter
lib/images/**            pipeline gambar
lib/auth/**              permission (setelah S3)
scripts/**               seluruh skrip, termasuk lane.ts sendiri
package.json             SATU-SATUNYA lane yang boleh mengubah dependency
eslint.config.mjs · .prettierrc · vitest.config.ts · playwright.config.ts
next.config.ts
```

## Yang lane ini TIDAK BOLEH sentuh

```
app/**            components/**       tailwind.config.ts
lib/utils/**      lib/theme.ts        lib/gantt/**        components.json
```

Butuh salah satunya? **Berhenti dan angkat ke sync point.** Jangan edit.

---

## Urutan task

### Sekarang — tanpa menunggu apa pun

| Task | Judul | Catatan |
|---|---|---|
| **T-010** | Tooling, script, gerbang kualitas | Mendefinisikan 11 script. **Sync point implisit**: lane `ui` memakai `npm run verify` setelah ini |
| **T-011** | Kerangka folder project | Jangan buat `.gitkeep` di `components/` dan `lib/utils/` — lane `ui` mengisinya dengan berkas nyata |
| **T-097** | Pipeline gambar sisi klien | `lib/images/**`, murni klien, tidak menyentuh database |

### Setelah database password tersedia

Password mengisi `DATABASE_URL` dan `DIRECT_URL` di `.env.local`, lalu:

```bash
npx tsx scripts/db-ping.ts    # "Koneksi Postgres" harus LULUS, bukan DILEWATI
```

Baru kemudian T-019 dan seterusnya:

| Rentang | Isi |
|---|---|
| T-019 | Koneksi database & harness migrasi |
| T-020 … T-032 | 13 berkas migrasi, **urutan mengikat** (ADR-005: `005_kepanitiaan` sebelum `006_gantt`) |
| T-033 … T-035 | Fungsi database: anti-bentrok, penomoran surat, audit |
| T-036 | Suite test SQL menyeluruh |
| T-037 … T-039 | Helper RLS, policy seluruh tabel, uji negatif |
| T-040 … T-042 | View agregat, trigger audit, seed |
| T-043 … T-044 | Prisma client + audit context, Storage Adapter |

---

## Aturan khusus lane `data`

| # | Aturan |
|:-:|---|
| 1 | **Hanya lane ini yang menyentuh database.** Migrasi ganda dari dua agent merusak state migrasi permanen. |
| 2 | Setiap migrasi wajib bisa dijalankan **dari database kosong**. Jalankan `npm run db:reset` setelah setiap task migrasi. |
| 3 | Dependency baru → ubah `package.json`, lalu **beri tahu di laporan** supaya lane `ui` menjalankan `npm install` setelah sync. |
| 4 | ADR baru memakai rentang **ADR-020 … ADR-039**. |
| 5 | `npm run db:reset` menolak jalan bila `NODE_ENV=production`. Jangan pernah melonggarkan ini. |

## Invariant yang paling sering dilanggar di lane ini

| ID | Ringkas |
|---|---|
| **INV-09** | Anti-bentrok ditegakkan `EXCLUDE USING gist`, **bukan** logika aplikasi |
| **INV-11** | Rentang terkunci inklusif: `daterange(mulai, selesai + 1, '[)')` |
| **INV-12** | Durasi persiapan 15–45 hari = CHECK constraint, **bukan** `app_config` (ADR-008) |
| **INV-15** | Nomor surat hanya lewat fungsi DB dengan advisory lock. Dilarang menghitung di TypeScript |
| **INV-06** | `audit_log` append-only. `REVOKE UPDATE, DELETE` + trigger penolak |
| **INV-01** | Setiap tabel wajib punya policy RLS. Tabel tanpa policy = tidak dapat diakses, dan itu benar |

## Sync point lane ini

| Sync | Berhenti setelah | Lapor ke manusia |
|:---:|---|---|
| **S1** | T-011 | Tooling siap; lane `ui` boleh pakai `npm run verify` |
| **S2** | T-043 | Database + RLS + audit siap |
| **S3** | T-044 | Storage siap; evaluasi gerbang **G1** bersama lane `ui` |
