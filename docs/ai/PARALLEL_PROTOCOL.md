# PARALLEL PROTOCOL — Dua Agent, Satu Repositori

Protokol kerja untuk **dua AI agent yang berjalan bersamaan** di project ini tanpa bentrok.

| | |
|---|---|
| **Berlaku sejak** | 2 September 2026, setelah T-009 selesai (7/116 task DONE) |
| **Agent 1** | **Claude Code** → lane `data` |
| **Agent 2** | **Codex** → lane `ui` |
| **Penegak** | `scripts/lane.ts` — bukan dokumen ini |
| **Sifat** | Mengikat. Melanggar = pekerjaan ditolak di sync point. |

---

## 1. Kenapa protokol ini ada

Dua agent di satu repositori akan bentrok di **tiga titik**, dan ketiganya merusak dengan cara yang sulit dilacak:

| # | Titik bentrok | Akibat bila dibiarkan |
|:-:|---|---|
| 1 | **`docs/ai/tasks.json`** | Dua agent menulis file yang sama → satu update hilang diam-diam, progres jadi bohong |
| 2 | **`package.json` / `package-lock.json`** | Dua `npm install` bersamaan → lockfile rusak, dependency hilang |
| 3 | **Git index & branch** | Dua commit bersamaan di satu working tree → `index.lock`, commit saling menimpa |

Ditambah satu risiko yang lebih berat:

> **Database.** Dua agent menjalankan migrasi pada database yang sama akan merusak state migrasi secara permanen. **Hanya lane `data` yang boleh menyentuh database.**

Dokumentasi saja tidak cukup untuk mencegah ini, karena agent bekerja cepat dan tidak selalu membaca ulang. Karena itu penegakannya **mekanis**: `npx tsx scripts/lane.ts guard <lane>` membaca `git status` dan **menolak** bila ada file di luar lane yang tersentuh.

---

## 2. Pembagian lane

Pembagian ini bukan dibuat-buat — ia mengikuti graf dependensi yang sudah ada. Dari 116 task, **35 task membutuhkan database** dan **15 task tidak menyentuhnya sama sekali**, dan keduanya menempati pohon file yang berbeda total.

### Lane `data` — DATA & PLATFORM · Claude Code

**Menguasai:** database, migrasi, RLS, seed, Prisma, storage, pipeline gambar, tooling, dependency.

```
T-010  Tooling, script, gerbang kualitas
T-011  Kerangka folder project
T-097  Pipeline gambar sisi klien
──── setelah database password tersedia ────
T-019  Koneksi database & harness migrasi
T-020 … T-032   13 berkas migrasi
T-033 … T-035   fungsi database
T-036           suite test SQL
T-037 … T-039   RLS + uji negatif
T-040 … T-042   view, trigger, seed
T-043 … T-044   Prisma client, Storage Adapter
```
**29 task.**

### Lane `ui` — ANTARMUKA & DESIGN SYSTEM · Codex

**Menguasai:** token warna, tipografi, tema, komponen, utilitas format, mesin Gantt.

```
T-012  Token warna
T-013  Konfigurasi Tailwind & tipografi
T-014  Tema light/dark tanpa flash
T-015  Utilitas format lokal Indonesia
T-016  Komponen dasar A — kontrol form
T-017  Komponen dasar B — penyajian data
T-018  Komponen dasar C — umpan balik
T-072  Mesin geometri Gantt
T-073  Komponen Gantt SVG
T-074  Virtualisasi & performa Gantt
T-078  Editor Gantt & 4 level lainnya
```
**11 task. Nol ketergantungan pada database** — lane ini tidak pernah terblokir menunggu password.

### Kenapa Gantt masuk lane `ui`

`T-072` hanya bergantung pada `T-015` (utilitas format), dan seluruhnya fungsi murni di `lib/gantt/`. Menaruhnya di lane `ui` memberi Codex runway panjang tanpa pernah menyentuh database.

### Di luar kedua lane

`T-004` (provisioning) dan `T-006` (bedah template DOCX) **butuh manusia**, bukan agent. Keduanya tidak masuk lane mana pun.

---

## 3. Kepemilikan file

Sumber kebenaran ada di konstanta `MILIK` dalam `scripts/lane.ts`. Tabel ini hanya menjelaskannya.

| Pola | Pemilik |
|---|---|
| `supabase/**` · `prisma/**` | **data** |
| `lib/db/**` · `lib/storage/**` · `lib/images/**` · `lib/auth/**` | **data** |
| `scripts/**` | **data** |
| `package.json` · `package-lock.json` | **data** |
| `eslint.config.mjs` · `.prettierrc` · `vitest.config.ts` · `playwright.config.ts` | **data** |
| `next.config.ts` | **data** |
| `app/**` | **ui** |
| `components/**` | **ui** |
| `lib/utils/**` · `lib/theme.ts` · `lib/gantt/**` · `lib/shortcuts.ts` | **ui** |
| `tailwind.config.ts` · `postcss.config.mjs` · `components.json` | **ui** |
| `docs/ai/lanes/state-data.json` | **data** |
| `docs/ai/lanes/state-ui.json` | **ui** |

### Beku — tidak boleh diubah lane mana pun

```
docs/PRD.md   docs/SYSTEM_DESIGN.md   docs/USER_FLOW.md   docs/DESIGN_SYSTEM.md
docs/AI_EXECUTION_PLAN.md   docs/ai/AGENT_RULES.md   docs/ai/PARALLEL_PROTOCOL.md
docs/ai/tasks.json   docs/ai/tasks/**   docs/adr/README.md
docs/ai/lanes/LANE-DATA.md   docs/ai/lanes/LANE-UI.md
CLAUDE.md   AGENTS.md   README.md   .gitignore   Design/**   Template/**
```

`docs/ai/tasks.json` **dibekukan selama kerja paralel.** Agent menulis state lane-nya sendiri; penyatuan hanya lewat `lane.ts sync` di branch integrasi.

### Nomor ADR

Bila menemukan pertentangan baru, tulis ADR memakai rentang lane sendiri agar tidak pernah tabrakan nomor:

| Lane | Rentang |
|---|---|
| `data` | **ADR-020 … ADR-039** |
| `ui` | **ADR-040 … ADR-059** |

Jangan menyentuh `docs/adr/README.md` — indeksnya disusun ulang saat sync.

### File tidak terdaftar

Bila `guard` melaporkan **"TIDAK TERDAFTAR"**, itu bukan izin untuk melanjutkan. Berhenti, laporkan ke manusia, dan tunggu kepemilikannya ditetapkan.

---

## 4. Git: dua worktree, dua branch

Dua agent **tidak bisa** berbagi satu working tree — git hanya punya satu index per tree. Solusinya git worktree: dua direktori, dua branch, satu repositori.

```
J:\Software\Web_Project\HMIF_Center       branch lane/data   <- Claude Code
J:\Software\Web_Project\HMIF_Center_UI    branch lane/ui     <- Codex
                    \___ keduanya berbagi satu riwayat git ___/
```

`main` adalah **branch integrasi**. Tidak ada agent yang commit langsung ke `main`; ia hanya diperbarui manusia di sync point.

---

## 5. Loop kerja satu task

Sama untuk kedua agent. Perbedaannya hanya nilai `<lane>`.

```
1.  npx tsx scripts/lane.ts status <lane>
       -> menampilkan task READY berikutnya

2.  npx tsx scripts/lane.ts claim <lane> <T-0XX>
       -> menolak bila dependency belum DONE
       -> menolak bila masih ada task berjalan

3.  Baca kontrak task di docs/ai/tasks/P{fase}-*.md
    Baca HANYA bagian dokumen yang tertulis di field "Baca"

4.  Kerjakan. Sentuh HANYA file milik lane sendiri.

5.  Jalankan verifikasi yang tertulis di kontrak task

6.  npx tsx scripts/lane.ts guard <lane>          <-- WAJIB
       -> exit 1 = ADA PELANGGARAN, jangan commit

7.  npx tsx scripts/lane.ts done <lane> <T-0XX>

8.  git add -A && git commit -m "T-0XX: <judul task>"

9.  Kembali ke langkah 1
```

**Langkah 6 tidak boleh dilewati.** Itu satu-satunya hal yang mencegah dua agent saling menimpa.

---

## 6. Sync point

Sync dilakukan **manusia**, bukan agent. Agent berhenti dan melapor saat mencapai sync point.

| Sync | Lane `data` sampai | Lane `ui` sampai | Yang tersedia setelahnya |
|:---:|---|---|---|
| **S1** | T-011 selesai | T-015 selesai | Tooling, folder, token, tema, utilitas format |
| **S2** | T-043 selesai | T-018 selesai | Database + RLS + audit siap; komponen dasar siap |
| **S3** | T-044 selesai | T-078 selesai | Storage siap; Gantt siap. Gerbang **G1** dievaluasi |

Setelah S3, kedua lane bertemu di T-045 (auth) yang membutuhkan hasil keduanya. **Rencana lane disusun ulang di titik itu**, tidak diteruskan buta.

### Prosedur sync

```bash
# 1. Pastikan kedua agent berhenti dan tidak ada task IN_PROGRESS

# 2. Dari direktori utama
git checkout main
git merge lane/data --no-ff -m "sync S1: gabung lane data"
git merge lane/ui   --no-ff -m "sync S1: gabung lane ui"

# 3. Satukan state ke tasks.json
npx tsx scripts/lane.ts sync

# 4. Commit hasil sync
git add -A && git commit -m "sync S1: satukan state lane ke tasks.json"

# 5. Kembalikan kedua lane ke titik yang sama
git checkout lane/data && git rebase main
cd ../HMIF_Center_UI && git checkout lane/ui && git rebase main
```

Bila merge menghasilkan konflik, **kepemilikan file dilanggar di suatu tempat.** Jangan diselesaikan diam-diam — telusuri commit mana yang menyentuh file lane lain.

---

## 7. Aturan yang tidak boleh dilanggar

| # | Aturan | Kenapa |
|:-:|---|---|
| 1 | Lane `ui` **tidak pernah** menjalankan `db:*` atau menyentuh database | Migrasi ganda merusak state migrasi permanen |
| 2 | Lane `ui` **tidak pernah** mengubah `package.json` | Lockfile rusak bila dua agent install bersamaan |
| 3 | Butuh dependency baru? **Berhenti**, angkat ke sync point | Sama seperti no. 2 |
| 4 | Tidak ada agent yang commit ke `main` | `main` hanya diperbarui manusia saat sync |
| 5 | `guard` wajib lulus sebelum setiap commit | Satu-satunya penegakan mekanis |
| 6 | Satu task per lane pada satu waktu | AGENT_RULES P-01 |
| 7 | `docs/ai/tasks.json` tidak disentuh selama paralel | Sumber konflik nomor satu |
| 8 | ADR memakai rentang nomor lane sendiri | Mencegah dua ADR bernomor sama |

---

## 8. Bila terjadi masalah

| Gejala | Tindakan |
|---|---|
| `guard` melaporkan pelanggaran | `git checkout -- <file>` untuk file yang bukan milik lane. Jangan commit. |
| Task yang dibutuhkan ada di lane lain | **Berhenti.** Lapor ke manusia. Jangan kerjakan task lane lain. |
| Butuh file milik lane lain | Angkat sebagai sync point. Jangan mengedit lintas lane. |
| Merge konflik saat sync | Kepemilikan dilanggar. Telusuri commit penyebabnya sebelum menyelesaikan konflik. |
| `claim` ditolak karena dependency | Benar, jangan dipaksa. Ambil task READY lain atau tunggu sync. |
| Lane `data` terblokir password database | Kerjakan T-097. Bila habis juga, berhenti dan lapor. Lane `ui` tetap jalan. |

---

## 9. Hubungan dengan dokumen lain

Protokol ini **menambah**, tidak mengganti:

- **`docs/ai/AGENT_RULES.md`** tetap berlaku penuh — 12 aturan proses, 30 invariant, 15 konvensi kode.
- **`docs/ai/tasks/P*.md`** tetap sumber kontrak tiap task.
- **`docs/AI_EXECUTION_PLAN.md` §2** tetap sumber keputusan terkunci.

Bila protokol ini bertentangan dengan AGENT_RULES soal **cara kerja**, protokol ini yang menang (karena AGENT_RULES ditulis untuk satu agent). Bila bertentangan soal **isi produk**, AGENT_RULES dan dokumen produk yang menang.
