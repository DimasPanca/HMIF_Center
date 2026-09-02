# AGENTS.md — Instruksi untuk Codex

## Kamu adalah agent lane `ui`

Project ini dikerjakan **dua agent sekaligus**. Kamu memegang **lane `ui`**; Claude Code memegang lane `data` di direktori terpisah. Kalian tidak boleh saling menimpa.

| | |
|---|---|
| **Lane** | `ui` — ANTARMUKA & DESIGN SYSTEM |
| **Branch** | `lane/ui` |
| **Direktori** | `J:\Software\Web_Project\HMIF_Center_UI` |
| **Rentang ADR** | ADR-040 … ADR-059 |

**Periksa dulu sebelum bekerja:**

```bash
git branch --show-current      # harus: lane/ui
```

Kalau yang muncul `lane/data` atau `main`, kamu berada di direktori yang salah. **Berhenti dan lapor.**

---

## Baca ini dulu, urut

1. **`docs/ai/PARALLEL_PROTOCOL.md`** — kenapa ada dua lane, apa yang boleh disentuh
2. **`docs/ai/lanes/LANE-UI.md`** — daftar task dan aturan lane kamu
3. **`docs/ai/AGENT_RULES.md`** — 12 aturan proses, 30 invariant, 15 konvensi kode
4. Kontrak task di `docs/ai/tasks/P{fase}-*.md` — **hanya task yang sedang dikerjakan**

Untuk lane ini, dokumen produk yang paling sering dirujuk adalah **`docs/DESIGN_SYSTEM.md`**. Baca hanya bagian yang disebut di field **Baca** milik task, bukan seluruh dokumen.

---

## Loop kerja

```bash
npx tsx scripts/lane.ts status ui           # 1. task berikutnya
npx tsx scripts/lane.ts claim  ui T-0XX     # 2. ambil satu task
                                            # 3. baca kontrak, kerjakan
npx tsc --noEmit && npx eslint .            # 4. verifikasi
npx tsx scripts/lane.ts guard  ui           # 5. WAJIB — exit 1 = jangan commit
npx tsx scripts/lane.ts done   ui T-0XX     # 6. tutup
git add -A && git commit -m "T-0XX: <judul>" # 7. satu task satu commit
```

**Langkah 5 tidak boleh dilewati.** `guard` membaca `git status` dan menolak bila kamu menyentuh file milik lane `data`. Itu satu-satunya hal yang mencegah dua agent saling merusak.

> Setelah sync **S1**, ganti langkah 4 menjadi `npm run verify`. Sebelum itu perintah tersebut belum ada — lane `data` sedang membuatnya di T-010.

---

## Batas keras

**Boleh kamu ubah:**
```
app/**  components/**  lib/utils/**  lib/theme.ts  lib/gantt/**  lib/shortcuts.ts
tailwind.config.ts  postcss.config.mjs  components.json
docs/ai/lanes/state-ui.json
```

**Tidak boleh kamu sentuh** — milik lane `data`:
```
supabase/**  prisma/**  lib/db/**  lib/storage/**  lib/images/**
scripts/**  package.json  package-lock.json  next.config.ts
eslint.config.mjs  vitest.config.ts  playwright.config.ts
```

**Beku untuk semua agent:**
```
docs/PRD.md  docs/SYSTEM_DESIGN.md  docs/USER_FLOW.md  docs/DESIGN_SYSTEM.md
docs/AI_EXECUTION_PLAN.md  docs/ai/AGENT_RULES.md  docs/ai/PARALLEL_PROTOCOL.md
docs/ai/tasks.json  docs/ai/tasks/**  docs/adr/README.md
CLAUDE.md  AGENTS.md  README.md  Design/**  Template/**
```

Skrip di `scripts/` **boleh kamu jalankan**, tetapi **tidak boleh kamu ubah**.

Butuh mengubah sesuatu di luar lane kamu? **Berhenti, lapor ke manusia sebagai sync point.** Jangan pernah mengedit lintas lane, sekecil apa pun.

---

## Yang khusus untuk lane ini

- **Jangan pernah** menjalankan `npm install`, `npm run db:*`, atau menyentuh database.
- Butuh dependency baru? **Berhenti dan lapor.** Lane `data` yang memasangnya di sync point.
- Jangan buat berkas `.gitkeep` — lane `data` yang menyusun kerangka folder di T-011.
- Jangan commit ke `main`. `main` hanya diperbarui manusia di sync point.

## Aturan kode yang paling sering dilanggar di lane ini

| Aturan | Isi |
|---|---|
| **K-05** | Tidak ada nilai hex mentah di komponen. Semua warna lewat token CSS |
| **K-14** | Tinggi tombol dan input **34 px**, baris tabel **36 px**, radius **6 px** |
| **K-13** | Animasi hanya 120 ms dan 180 ms. Dilarang transisi > 250 ms, parallax, spinner terus-menerus |
| **K-15** | Status tidak pernah hanya lewat warna — selalu ada teks atau ikon pendamping |
| **K-06** | Default React Server Component. `"use client"` hanya bila butuh state/efek/event |
| **K-01, K-12** | Antarmuka berbahasa Indonesia. Format tanggal/rupiah lewat `lib/utils/*`, tidak pernah inline |

## Keputusan yang menunggumu di T-012

`shadcn init` menulis `@custom-variant dark (&:is(.dark *))` di `app/globals.css`, sedangkan **DESIGN_SYSTEM §2.3** memakai `[data-theme="dark"]`. **DESIGN_SYSTEM yang menang.** Sesuaikan menjadi:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

Catat sebagai **ADR-040**.

## Berhenti dan lapor bila

1. `guard` melaporkan pelanggaran yang tidak kamu mengerti
2. Butuh dependency baru, atau butuh mengubah `package.json`
3. Verifikasi gagal 2× dengan penyebab sama (AGENT_RULES P-04)
4. Menemukan pertentangan antar-dokumen → tulis ADR di rentang **ADR-040 … ADR-059** berstatus *Usulan*, lalu lapor
5. Mencapai sync point **S1** (setelah T-015), **S2** (T-018), atau **S3** (T-078)

## Format laporan setiap task

```
Task      : T-0XX <judul>
File      : daftar file yang dibuat/diubah
Verifikasi: perintah yang dijalankan + output NYATA
guard     : hasil npx tsx scripts/lane.ts guard ui
Catatan   : penyimpangan, ADR baru, atau blocker
```

Jangan melaporkan sukses tanpa output verifikasi nyata.
