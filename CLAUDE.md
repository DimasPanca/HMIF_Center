# CLAUDE.md — Instruksi untuk Claude Code

## Kamu adalah agent lane `data`

Project ini dikerjakan **dua agent sekaligus**. Kamu memegang **lane `data`**; Codex memegang lane `ui` di direktori terpisah. Kalian tidak boleh saling menimpa.

| | |
|---|---|
| **Lane** | `data` — DATA & PLATFORM |
| **Branch** | `lane/data` |
| **Direktori** | `J:\Software\Web_Project\HMIF_Center` |
| **Rentang ADR** | ADR-020 … ADR-039 |

**Periksa dulu sebelum bekerja:**

```bash
git branch --show-current      # harus: lane/data
```

Kalau yang muncul `lane/ui`, kamu berada di direktori yang salah. **Berhenti dan lapor.**

---

## Baca ini dulu, urut

1. **`docs/ai/PARALLEL_PROTOCOL.md`** — kenapa ada dua lane, apa yang boleh disentuh
2. **`docs/ai/lanes/LANE-DATA.md`** — daftar task dan aturan lane kamu
3. **`docs/ai/AGENT_RULES.md`** — 12 aturan proses, 30 invariant, 15 konvensi kode
4. Kontrak task di `docs/ai/tasks/P{fase}-*.md` — **hanya task yang sedang dikerjakan**

Jangan membaca keempat dokumen produk (PRD, SYSTEM_DESIGN, USER_FLOW, DESIGN_SYSTEM) sekaligus. Setiap task menyebut bagian mana yang perlu dibaca di field **Baca**.

---

## Loop kerja

```bash
npx tsx scripts/lane.ts status data           # 1. task berikutnya
npx tsx scripts/lane.ts claim  data T-0XX     # 2. ambil satu task
                                              # 3. baca kontrak, kerjakan
                                              # 4. jalankan verifikasi kontrak
npx tsx scripts/lane.ts guard  data           # 5. WAJIB — exit 1 = jangan commit
npx tsx scripts/lane.ts done   data T-0XX     # 6. tutup
git add -A && git commit -m "T-0XX: <judul>"  # 7. satu task satu commit
```

**Langkah 5 tidak boleh dilewati.** `guard` membaca `git status` dan menolak bila kamu menyentuh file milik lane `ui`. Itu satu-satunya hal yang mencegah dua agent saling merusak.

---

## Batas keras

**Boleh kamu ubah:**
```
supabase/**  prisma/**  lib/db/**  lib/storage/**  lib/images/**  lib/auth/**
scripts/**  package.json  package-lock.json  next.config.ts
eslint.config.mjs  .prettierrc  vitest.config.ts  playwright.config.ts
docs/ai/lanes/state-data.json
```

**Tidak boleh kamu sentuh** — milik lane `ui`:
```
app/**  components/**  lib/utils/**  lib/theme.ts  lib/gantt/**
tailwind.config.ts  postcss.config.mjs  components.json
```

**Beku untuk semua agent:**
```
docs/PRD.md  docs/SYSTEM_DESIGN.md  docs/USER_FLOW.md  docs/DESIGN_SYSTEM.md
docs/AI_EXECUTION_PLAN.md  docs/ai/AGENT_RULES.md  docs/ai/PARALLEL_PROTOCOL.md
docs/ai/tasks.json  docs/ai/tasks/**  docs/adr/README.md
CLAUDE.md  AGENTS.md  README.md  Design/**  Template/**
```

Butuh mengubah sesuatu di luar lane kamu? **Berhenti, lapor ke manusia sebagai sync point.** Jangan pernah mengedit lintas lane, sekecil apa pun.

---

## Yang khusus untuk lane ini

- **Hanya kamu yang boleh menyentuh database.** Migrasi ganda dari dua agent merusak state migrasi permanen.
- **Hanya kamu yang boleh mengubah `package.json`.** Kalau menambah dependency, sebutkan di laporan supaya lane `ui` menjalankan `npm install` setelah sync.
- Setiap migrasi wajib jalan **dari database kosong**. Jalankan `npm run db:reset` setelah setiap task migrasi.
- Jangan commit ke `main`. `main` hanya diperbarui manusia di sync point.

## Berhenti dan lapor bila

1. `guard` melaporkan pelanggaran yang tidak kamu mengerti
2. Task yang kamu butuhkan ada di lane `ui`
3. Verifikasi gagal 2× dengan penyebab sama (AGENT_RULES P-04)
4. Butuh dependency di luar SYSTEM_DESIGN §2
5. Menemukan pertentangan antar-dokumen → tulis ADR di rentang **ADR-020 … ADR-039** berstatus *Usulan*, lalu lapor
6. Mencapai sync point **S1** (setelah T-011), **S2** (T-043), atau **S3** (T-044)

## Format laporan setiap task

```
Task      : T-0XX <judul>
File      : daftar file yang dibuat/diubah
Verifikasi: perintah yang dijalankan + output NYATA
guard     : hasil npx tsx scripts/lane.ts guard data
Catatan   : penyimpangan, ADR baru, atau blocker
```

Jangan melaporkan sukses tanpa output verifikasi nyata.
