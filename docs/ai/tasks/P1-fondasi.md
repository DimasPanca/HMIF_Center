# FASE 1 — Fondasi (T-009 … T-053)

**Deliverable fase:** sistem bisa login; Admin mengelola user, role, dan periode; seluruh mutasi tercatat audit; design system terpasang; RLS aktif di semua tabel.
**Kenapa fase ini tidak boleh diburu:** audit log, scoping periode, dan RLS ditanam bersamaan dengan tabelnya. Menambahkannya belakangan berarti migrasi data yang menyakitkan.
**Gerbang keluar:** lihat AI_EXECUTION_PLAN §6 (P1 → P2/P3).

Urutan blok: **Scaffold (T-009…T-011)** → **Design system (T-012…T-018)** → **Database (T-019…T-043)** → **Storage (T-044)** → **Auth & otorisasi (T-045…T-050)** → **Shell aplikasi (T-051…T-053)**.

---

## Blok A — Scaffold

### T-009 · Scaffold Next.js 15
**Fase** 1 · **Butuh** T-001 · **Baca** SYSTEM_DESIGN §2, §17

**Buat:** project Next.js di root (`app/`, `package.json`, `tsconfig.json`, `next.config.ts`)
**Ubah:** `README.md`

**Kontrak:**
1. Next.js 15 App Router + TypeScript 5 + Tailwind CSS 4, tanpa `src/` directory, alias import `@/*` menunjuk root.
2. `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noEmit: true`.
3. Inisialisasi shadcn/ui (komponen disalin ke `components/ui/`, bukan dipasang sebagai dependency).
4. Pasang dependency inti sesuai SYSTEM_DESIGN §2 **saja**: `@supabase/supabase-js`, `@supabase/ssr`, `prisma`, `@prisma/client`, `@tanstack/react-query`, `@tanstack/react-table`, `zustand`, `react-hook-form`, `zod`, `@hookform/resolvers`, `dnd-kit`, `@tiptap/react`, `docxtemplater`, `pizzip`, `exceljs`, `sharp`, `exifr`, `file-type`, `lucide-react`.
5. `next.config.ts` menambahkan security headers SYSTEM_DESIGN §18.2 (termasuk `Permissions-Policy: camera=(self)`).
6. Halaman default bawaan Next dihapus; `app/page.tsx` sementara merender teks placeholder.

**Verifikasi:**
```bash
npm run build
```

**Selesai bila:**
- [ ] `npm run build` sukses tanpa warning TypeScript
- [ ] Header keamanan muncul pada response (cek `curl -I` ke server dev)
- [ ] Tidak ada dependency di luar daftar SYSTEM_DESIGN §2

**Jangan:** jangan memasang library Gantt, chart, date-picker, atau UI kit tambahan. Gantt dibangun sendiri (T-072/T-073).

---

### T-010 · Tooling, script, dan gerbang kualitas
**Fase** 1 · **Butuh** T-009 · **Baca** AI_EXECUTION_PLAN §5

**Buat:** `.eslintrc.json` · `.prettierrc` · `vitest.config.ts` · `playwright.config.ts` · `scripts/db.ts` · `scripts/db-test.ts` · `scripts/db-ping.ts`
**Ubah:** `package.json`

**Kontrak:**
1. Definisikan **seluruh** script di AI_EXECUTION_PLAN §5 dengan nama persis: `verify`, `typecheck`, `lint`, `test`, `test:e2e`, `build`, `db:reset`, `db:migrate`, `db:test`, `seed`, `check:env`.
2. `npm run verify` = `typecheck && lint && test`, gagal bila salah satu gagal.
3. `scripts/db.ts` menjalankan berkas `supabase/migrations/*.sql` berurutan berdasarkan nama, mencatat yang sudah diterapkan di tabel `_migrasi` (kolom: nama, checksum, applied_at), dan menolak berkas yang checksum-nya berubah setelah diterapkan.
4. `scripts/db-test.ts` menjalankan setiap `supabase/tests/*.sql` di dalam transaksi yang **selalu ROLLBACK**, mencetak OK/GAGAL per berkas, exit 1 bila ada yang gagal.
5. ESLint: larang `console.log` (izinkan `console.error`), larang import relatif melewati satu level (`../../`), larang import `SUPABASE_SECRET_KEY` di berkas ber-`"use client"`.
6. Prettier: 2 spasi, single quote, trailing comma, lebar 100.

**Verifikasi:**
```bash
npm run verify && npm run db:test
```

**Selesai bila:**
- [ ] 11 script ada dan bisa dijalankan
- [ ] `db:reset` pada database kosong berjalan tanpa error (walau belum ada migrasi)
- [ ] Aturan ESLint custom benar-benar menolak contoh kode yang melanggar

**Jangan:** jangan memakai `--force` atau menonaktifkan aturan lint di kode fitur nanti.

---

### T-011 · Kerangka folder project
**Fase** 1 · **Butuh** T-009 · **Baca** SYSTEM_DESIGN §17

**Buat:** seluruh direktori SYSTEM_DESIGN §17 dengan `.gitkeep`
**Ubah:** —

**Kontrak:**
1. Buat persis struktur `app/(auth)`, `app/(dashboard)/…`, `app/api/…`, `components/{ui,gantt,rab,surat,nota,kanban,layout,shared}`, `lib/{auth,db,gantt,rab,surat,documents,images,lpj,backup,storage,realtime,utils}`, `prisma/`, `supabase/{migrations,tests}`, `templates/`, `public/`, `scripts/`.
2. Setiap folder kosong diberi `.gitkeep`.
3. Tambahkan `lib/README.md` satu paragraf: peran tiap subfolder, agar agent berikutnya menaruh berkas di tempat yang benar.

**Verifikasi:**
```bash
find app components lib prisma supabase -type d | sort
```

**Selesai bila:**
- [ ] Struktur folder identik dengan SYSTEM_DESIGN §17
- [ ] Tidak ada folder tambahan di luar daftar

**Jangan:** jangan membuat folder `src/`, `utils/` di root, atau `helpers/`.

---

## Blok B — Design System

### T-012 · Token warna
**Fase** 1 · **Butuh** T-009 · **Baca** DESIGN_SYSTEM §2.2, §2.3, §2.4, §2.5

**Buat:** `app/globals.css`
**Ubah:** `app/layout.tsx`

**Kontrak:**
1. Salin **persis** seluruh token light mode ke `:root` dan dark mode ke `[data-theme="dark"]` — nama variabel dan nilai hex tidak boleh diubah.
2. Tambahkan 12 variabel palet departemen (6 warna + 6 varian fill) DESIGN_SYSTEM §2.4.
3. Tambahkan 3 gradien §2.5 sebagai variabel, dengan komentar berisi larangan pemakaian (bukan untuk latar halaman/card/tabel/sidebar).
4. Tambahkan token khusus Gantt yang dipakai T-073 (`--gantt-grid`, `--gantt-hari-h`, `--gantt-today`, `--gantt-bar-bg`), nilainya diambil dari DESIGN_SYSTEM §10.3.
5. Sertakan blok `@media (prefers-reduced-motion: reduce)` yang mematikan seluruh transisi (DESIGN_SYSTEM §6.4).

**Verifikasi:**
```bash
grep -c -- "--" app/globals.css && npm run build
```

**Selesai bila:**
- [ ] Seluruh token light & dark ada, jumlahnya sama antara kedua mode
- [ ] Tidak ada nilai hex di berkas lain selain `globals.css`

**Jangan:** jangan "memperbaiki" warna yang terasa kurang kontras. Nilai berasal dari brand guideline.

---

### T-013 · Konfigurasi Tailwind & tipografi
**Fase** 1 · **Butuh** T-012 · **Baca** DESIGN_SYSTEM §3, §4, §5, §15.1

**Buat:** `tailwind.config.ts`
**Ubah:** `app/layout.tsx` · `app/globals.css`

**Kontrak:**
1. Petakan seluruh CSS variable T-012 menjadi token Tailwind (`bg-base`, `text-primary`, `border-default`, `dept-kaderisasi`, dst) sesuai DESIGN_SYSTEM §15.1.
2. Skala tipografi §3.2 dan skala spacing basis 4px §4.1 didefinisikan sebagai token, bukan nilai arbitrer.
3. Font: **Inter** (UI) dan **JetBrains Mono** (angka/nomor surat/nominal) via `next/font`, dengan `display: swap`.
4. Angka pada tabel keuangan memakai `font-variant-numeric: tabular-nums` (§3.3).
5. Radius default 6px, radius komponen sesuai §5.1; shadow sesuai §5.2.
6. Durasi transisi hanya 120 ms dan 180 ms tersedia sebagai token (§6.1).

**Verifikasi:**
```bash
npm run build && npm run lint
```

**Selesai bila:**
- [ ] Kelas seperti `bg-panel text-secondary border-subtle` bekerja
- [ ] Tidak ada nilai arbitrer `[#hex]` di komponen mana pun
- [ ] Angka nominal sejajar rata kanan dengan lebar digit sama

**Jangan:** jangan menambah warna di luar palet DESIGN_SYSTEM §2.

---

### T-014 · Tema light/dark tanpa flash
**Fase** 1 · **Butuh** T-013 · **Baca** DESIGN_SYSTEM §15.2

**Buat:** `lib/theme.ts` · `components/shared/ThemeToggle.tsx`
**Ubah:** `app/layout.tsx`

**Kontrak:**
1. Script inline di `<head>` membaca `localStorage.theme` (fallback `prefers-color-scheme`) dan menetapkan `data-theme` **sebelum** render pertama.
2. `lib/theme.ts` mengekspor `getTheme()`, `setTheme(t)`, `toggleTheme()`; nilai tersimpan di `localStorage` dan dibungkus `try/catch` (mode privat bisa melempar).
3. `ThemeToggle` memakai ikon lucide, ukuran 34 px, punya `aria-label` Indonesia, dan dapat dijangkau keyboard.
4. Perpindahan tema tidak memicu animasi apa pun (transisi dimatikan sementara saat toggle).

**Verifikasi:**
```bash
npm run test -- theme
```

**Selesai bila:**
- [ ] Reload halaman dalam mode gelap tidak menampilkan kedipan putih
- [ ] Preferensi bertahan setelah reload dan setelah pindah halaman

**Jangan:** jangan memakai library theme pihak ketiga.

---

### T-015 · Utilitas format lokal Indonesia
**Fase** 1 · **Butuh** T-009 · **Baca** DESIGN_SYSTEM §3.4 · PRD §8.7

**Buat:** `lib/utils/format-tanggal.ts` · `format-rupiah.ts` · `romawi.ts` · `slug.ts` · `lib/utils/__tests__/*.test.ts`
**Ubah:** —

**Kontrak:**
1. `formatTanggalPanjang(d)` → `Senin, 06 Oktober 2025`. `formatTanggalPendek(d)` → `06 Okt 2025`. `formatRentangTanggal(a,b)` → `19 – 21 Agustus 2025` (bulan tidak diulang bila sama).
2. `formatRupiah(n)` → `Rp1.740.000` (tanpa spasi setelah `Rp`, titik ribuan, tanpa desimal bila bulat). `parseRupiah("Rp1.740.000")` → `1740000`.
3. `bulanRomawi(n)` → `I`..`XII`; input di luar 1–12 melempar error.
4. `slug(s)` → huruf kecil, tanpa diakritik, pemisah `-`, aman untuk nama berkas.
5. Seluruh fungsi **murni**, tidak bergantung timezone lokal mesin: pakai zona `Asia/Jakarta` secara eksplisit.
6. Unit test wajib memuat kasus: 06 Oktober 2025, bulan 10 → `X`, `Rp1.740.000`, rentang lintas bulan, dan nol/negatif.

**Verifikasi:**
```bash
npm run test -- utils
```

**Selesai bila:**
- [ ] Seluruh test lulus
- [ ] Hasil sama saat `TZ=UTC` maupun `TZ=Asia/Jakarta`

**Jangan:** jangan memasang `date-fns`, `dayjs`, atau `moment`. Pakai `Intl`.

---

### T-016 · Komponen dasar A — kontrol form
**Fase** 1 · **Butuh** T-013 · **Baca** DESIGN_SYSTEM §8.1, §8.2, §15.3

**Buat:** `components/ui/{button,input,select,checkbox,textarea,label}.tsx`
**Ubah:** —

**Kontrak:**
1. Tinggi tombol dan input **34 px**, radius 6 px, padding sesuai §8.1/§8.2.
2. Varian tombol: `primary`, `secondary`, `ghost`, `danger`; state: default, hover (120 ms), active, focus-visible (ring `--border-focus`), disabled, loading (teks berubah "Memproses…", tombol non-aktif).
3. Input punya state error dengan pesan di bawah field, terhubung lewat `aria-describedby`.
4. Setiap komponen lolos 14 poin **Checklist Komponen** DESIGN_SYSTEM §15.3 — tuliskan hasilnya sebagai komentar checklist di atas komponen.
5. Semua teks default berbahasa Indonesia.

**Verifikasi:**
```bash
npm run verify
```

**Selesai bila:**
- [ ] Fokus keyboard terlihat jelas pada semua komponen
- [ ] Tidak ada transisi lebih dari 180 ms
- [ ] Tinggi terukur 34 px pada desktop

**Jangan:** jangan menambah varian di luar 4 yang disebut.

---

### T-017 · Komponen dasar B — penyajian data
**Fase** 1 · **Butuh** T-016 · **Baca** DESIGN_SYSTEM §8.3, §8.4, §8.5, §8.6

**Buat:** `components/ui/{badge,status-pill,avatar,card,table}.tsx`
**Ubah:** —

**Kontrak:**
1. `StatusPill` menerima status domain (`DRAFT`, `MENUNGGU_APPROVAL`, `DISETUJUI`, `TERBIT`, `DITOLAK`, `DIBATALKAN`, `TERBUKA`, `SELESAI`, dst) dan memetakannya ke warna **plus label Indonesia plus ikon** (INV: warna bukan satu-satunya pembeda).
2. Baris tabel tinggi **36 px**, header sticky, zebra opsional, dukungan kolom rata kanan untuk angka.
3. `Avatar` menampilkan inisial bila tidak ada foto; ukuran 20/24/32 px.
4. `Card` memakai `--bg-panel` + `--border-default`, tanpa gradien.
5. Tabel menerima prop `emptyState` dan tidak pernah merender tabel kosong tanpa penjelasan.

**Verifikasi:**
```bash
npm run verify
```

**Selesai bila:**
- [ ] Seluruh status domain punya pemetaan warna + label + ikon
- [ ] Tinggi baris tabel 36 px

**Jangan:** jangan memakai warna departemen sebagai latar penuh (DESIGN_SYSTEM §2.4).

---

### T-018 · Komponen dasar C — umpan balik
**Fase** 1 · **Butuh** T-017 · **Baca** DESIGN_SYSTEM §12 · USER_FLOW Lampiran

**Buat:** `components/ui/{toast,skeleton,empty-state,dialog,tooltip,confirm-dialog}.tsx`
**Ubah:** —

**Kontrak:**
1. Toast: sukses hijau **3 detik**, gagal merah **6 detik** dengan penjelasan + saran tindakan; masuk/keluar 150 ms; posisi kanan atas.
2. Skeleton mengikuti bentuk konten (tabel, kartu, chart), bukan kotak generik.
3. `EmptyState`: ikon + judul + satu kalimat + satu aksi utama.
4. `ConfirmDialog` mendukung 3 tingkat risiko USER_FLOW Lampiran: sederhana, wajib isi alasan, wajib mengetik teks konfirmasi.
5. Panel konflik dirender **inline**, bukan modal (DESIGN_SYSTEM §12.4) — sediakan komponen `InlineAlert` varian `konflik`.

**Verifikasi:**
```bash
npm run verify
```

**Selesai bila:**
- [ ] Tiga tingkat konfirmasi tersedia dan diuji
- [ ] Toast gagal selalu memuat saran tindakan, bukan hanya pesan error mentah

**Jangan:** jangan memakai spinner berputar terus-menerus (DESIGN_SYSTEM §6.3).

---

## Blok C — Database

> Aturan blok ini: **setiap migrasi harus bisa dijalankan dari database kosong**. Setelah tiap task, jalankan `npm run db:reset`.

### T-019 · Koneksi database & harness migrasi
**Fase** 1 · **Butuh** T-010, T-004 · **Baca** SYSTEM_DESIGN §20.1

**Buat:** `lib/db/connection.ts` · `supabase/tests/000_smoke.sql`
**Ubah:** `scripts/db.ts`

**Kontrak:**
1. Koneksi memakai `DIRECT_URL` untuk migrasi dan `DATABASE_URL` untuk runtime.
2. `db:reset` = `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` lalu jalankan seluruh migrasi lalu seed. Wajib menolak berjalan bila `NODE_ENV=production`.
3. `000_smoke.sql` memverifikasi koneksi dan versi Postgres ≥ 15.
4. Script mencetak durasi tiap migrasi agar migrasi lambat terdeteksi dini.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test
```

**Selesai bila:**
- [ ] `db:reset` idempoten (dua kali berturut-turut hasilnya sama)
- [ ] `db:reset` menolak jalan bila `NODE_ENV=production`

**Jangan:** jangan pernah menjalankan `db:reset` terhadap database yang berisi data nyata.

---

### T-020 · Migrasi 001 — extensions
**Fase** 1 · **Butuh** T-019 · **Baca** SYSTEM_DESIGN §4.1

**Buat:** `supabase/migrations/001_extensions.sql` · `supabase/tests/001_extensions.sql`
**Ubah:** —

**Kontrak:**
1. `CREATE EXTENSION IF NOT EXISTS` untuk `uuid-ossp`, **`btree_gist`**, `pg_trgm`.
2. Test meng-assert ketiganya ada di `pg_extension`.
3. Beri komentar: `btree_gist` wajib untuk `EXCLUDE` constraint anti-bentrok (INV-09) — tanpa ini T-023 gagal.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 001_extensions
```

**Selesai bila:**
- [ ] Ketiga extension terpasang
- [ ] Test lulus

**Jangan:** jangan menambah extension lain.

---

### T-021 · Migrasi 002 — enums
**Fase** 1 · **Butuh** T-020 · **Baca** SYSTEM_DESIGN §4.1

**Buat:** `supabase/migrations/002_enums.sql` · `supabase/tests/002_enums.sql`
**Ubah:** —

**Kontrak:**
1. Buat 14 enum persis SYSTEM_DESIGN §4.1: `role_code`, `proker_kategori`, `proker_status`, `surat_status`, `rab_status`, `nota_status`, `kendala_status`, `prioritas`, `kanban_kolom`, `periode_status`, `kehadiran`, `image_kind`.
2. Tambahkan enum `lpj_status` dengan nilai `DRAFT`, `DIAJUKAN`, `DISETUJUI_BENDUM`, `FINAL` (ADR-015) — mengganti kolom TEXT bebas di SYSTEM_DESIGN §4.10.
3. Tambahkan enum `backup_jenis` (`OTOMATIS`, `MANUAL`, `PRA_RESTORE`) dan `backup_status` (`BERJALAN`, `SUKSES`, `GAGAL`).
4. Test meng-assert setiap enum ada dan jumlah labelnya benar.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 002_enums
```

**Selesai bila:**
- [ ] Seluruh enum ada dengan label persis
- [ ] `proker_status` memuat 9 nilai termasuk `MENUNGGU_APPROVAL_REVISI`

**Jangan:** jangan menambah nilai enum "buat jaga-jaga".

---

### T-022 · Migrasi 003 — inti (periode, user, role)
**Fase** 1 · **Butuh** T-021 · **Baca** SYSTEM_DESIGN §4.2

**Buat:** `supabase/migrations/003_core.sql` · `supabase/tests/003_core.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `periode`, `app_user`, `departemen`, `user_role`, `invitation`, `signature` persis SYSTEM_DESIGN §4.2.
2. Index unik `periode_hanya_satu_aktif` menegakkan **tepat satu** periode `AKTIF`.
3. `user_role` mendukung multi-role (UNIQUE gabungan) dan CHECK `role_dept_wajib`.
4. `app_user.id` menggunakan UUID yang sama dengan `auth.users.id` Supabase — beri komentar tentang ini.
5. Test wajib memuat: (a) insert periode aktif kedua **gagal**, (b) satu user bisa punya 2 role sekaligus, (c) role `KADEPT` tanpa `departemen_id` **gagal**.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 003_core
```

**Selesai bila:**
- [ ] Ketiga skenario test lulus
- [ ] `db:reset` bersih dari nol

**Jangan:** jangan menambah kolom di luar SYSTEM_DESIGN §4.2.

---

### T-023 · Migrasi 004 — proker & proker_lock (jantung anti-bentrok)
**Fase** 1 · **Butuh** T-022 · **Baca** SYSTEM_DESIGN §4.3 · PRD F-5.2

**Buat:** `supabase/migrations/004_proker.sql` · `supabase/tests/004_proker_lock.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `proker` lengkap dengan 3 CHECK constraint: `terjadwal_wajib_tanggal`, `urutan_tanggal`, `durasi_persiapan_15_45` (INV-12, ADR-008).
2. Tabel `proker_lock` dengan `EXCLUDE USING gist (periode_id WITH =, rentang WITH &&)` (INV-09) dan index GiST pada `rentang`.
3. `proker_lock.proker_id` UNIQUE dan `ON DELETE CASCADE`.
4. Test wajib memuat: (a) dua lock beririsan dalam periode sama → **exception `23P01`**, (b) dua lock beririsan di **periode berbeda** → **boleh**, (c) lock bersinggungan tepat di batas (`selesai` A = `mulai` B) → **ditolak**, karena rentang inklusif (INV-11), (d) persiapan 14 hari → CHECK gagal, (e) persiapan 46 hari → CHECK gagal, (f) persiapan 15 dan 45 hari → lolos.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 004_proker_lock
```

**Selesai bila:**
- [ ] Keenam skenario lulus
- [ ] Pesan exception yang keluar adalah `exclusion_violation`, bukan error CHECK

**Jangan:** jangan menegakkan anti-bentrok lewat trigger atau kode aplikasi. Constraint saja.

---

### T-024 · Migrasi 005 — kepanitiaan & divisi
**Fase** 1 · **Butuh** T-023 · **Baca** SYSTEM_DESIGN §4.5 · ADR-005

**Buat:** `supabase/migrations/005_kepanitiaan.sql` · `supabase/tests/005_kepanitiaan.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `kepanitiaan`, `divisi`, `divisi_member`, `job_desk` persis SYSTEM_DESIGN §4.5.
2. **Urutan ini sengaja mendahului gantt** (ADR-005) karena `gantt_chart` punya FK ke `divisi` dan `kepanitiaan`.
3. `kepanitiaan.ketua_pelaksana` boleh siapa pun (`app_user`), tidak dibatasi departemen PIC (PRD F-8.1).
4. `divisi` UNIQUE per `(kepanitiaan_id, nama)`.
5. Test: insert `gantt_chart` **belum** mungkin di sini; cukup assert keempat tabel ada beserta FK-nya.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 005_kepanitiaan
```

**Selesai bila:**
- [ ] `db:reset` dari nol lolos tanpa error FK
- [ ] Ketua pelaksana lintas departemen dapat disimpan

**Jangan:** jangan mengembalikan urutan ke versi SYSTEM_DESIGN (gantt dulu). ADR-005 mengikat.

---

### T-025 · Migrasi 006 — gantt
**Fase** 1 · **Butuh** T-024 · **Baca** SYSTEM_DESIGN §4.4

**Buat:** `supabase/migrations/006_gantt.sql` · `supabase/tests/006_gantt.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `gantt_chart`, `gantt_group`, `gantt_task`, `gantt_dependency`.
2. CHECK `gantt_scope_tepat_satu`: tepat satu dari `proker_id`/`divisi_id`/`departemen_id`/`kepanitiaan_id` terisi.
3. `gantt_task` CHECK `tanggal_selesai >= tanggal_mulai`, progres 0–100.
4. Test: (a) chart dengan dua scope terisi → gagal, (b) chart tanpa scope → gagal, (c) task dengan selesai < mulai → gagal.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 006_gantt
```

**Selesai bila:**
- [ ] Ketiga skenario lulus

**Jangan:** jangan menambah kolom warna per task (warna berasal dari grup/departemen).

---

### T-026 · Migrasi 007 — RAB
**Fase** 1 · **Butuh** T-025 · **Baca** SYSTEM_DESIGN §4.6 · PRD F-9.1

**Buat:** `supabase/migrations/007_rab.sql` · `supabase/tests/007_rab.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `rab_section`, `rab_item`, `rab_meta`, `pemasukan`, `peserta`.
2. `rab_item` memuat **dua kolom jumlah** (INV-26): `jumlah_teks TEXT NOT NULL` dan `jumlah_numerik NUMERIC(12,2) NULL`.
3. `total_manual BOOLEAN` menandai nilai yang di-override user.
4. `rab_meta.status` memakai enum `rab_status`; kolom `alasan_buka_kunci`.
5. Test: (a) `jumlah_numerik` boleh NULL, (b) UNIQUE `(section_id, no_urut)` ditegakkan.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 007_rab
```

**Selesai bila:**
- [ ] Item dengan `jumlah_teks='2 Hari 1 Malam'` dan `jumlah_numerik=NULL` bisa disimpan

**Jangan:** jangan membuat `jumlah_numerik` NOT NULL.

---

### T-027 · Migrasi 008 — image, nota, alokasi
**Fase** 1 · **Butuh** T-026 · **Baca** SYSTEM_DESIGN §4.7 · ADR-006 · ADR-007

**Buat:** `supabase/migrations/008_nota.sql` · `supabase/tests/008_nota.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `image` dengan CHECK `master_valid` (lebar/tinggi/ukuran > 0).
2. Tabel `nota` dengan enum `nota_status`.
3. Tabel `nota_alokasi` **dengan perubahan ADR-006**: `rab_item_id` **NULLABLE**, tambah kolom `uraian_luar_rab TEXT`, dan CHECK `(rab_item_id IS NOT NULL) OR (uraian_luar_rab IS NOT NULL)`.
4. Ganti UNIQUE `(nota_id, rab_item_id)` menjadi unique partial: `CREATE UNIQUE INDEX ... ON nota_alokasi (nota_id, rab_item_id) WHERE rab_item_id IS NOT NULL`.
5. Trigger `cek_total_alokasi` (constraint trigger, DEFERRABLE INITIALLY DEFERRED) menolak total alokasi **melebihi** total nota. Kesamaan divalidasi di service (ADR-007) — tulis komentar ini di atas trigger.
6. Test: (a) alokasi melebihi total → exception, (b) alokasi kurang dari total → **lolos di level DB** (memang disengaja), (c) alokasi tanpa `rab_item_id` tapi ada `uraian_luar_rab` → lolos, (d) tanpa keduanya → gagal.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 008_nota
```

**Selesai bila:**
- [ ] Keempat skenario lulus
- [ ] Komentar ADR-006 dan ADR-007 ada di berkas migrasi

**Jangan:** jangan memindahkan validasi kesamaan alokasi ke trigger. Insert bertahap akan selalu gagal.

---

### T-028 · Migrasi 009 — persuratan
**Fase** 1 · **Butuh** T-027 · **Baca** SYSTEM_DESIGN §4.8 · PRD F-4.1

**Buat:** `supabase/migrations/009_surat.sql` · `supabase/tests/009_surat.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `surat_template`, `surat_counter`, `surat`, `surat_signer`, `dokumen`.
2. `surat.nomor_urut` NULL sampai disetujui (INV-14).
3. Unique index parsial `surat_nomor_unik_per_periode` pada `(periode_id, nomor_urut) WHERE nomor_urut IS NOT NULL` (INV-15, jaring pengaman).
4. Index full-text `to_tsvector('indonesian', perihal || tujuan_nama)`. Bila konfigurasi `indonesian` tidak tersedia di instance, gunakan `simple` **dan catat sebagai temuan ADR** — jangan diam-diam mengganti.
5. Test: (a) dua surat dengan `nomor_urut` NULL di periode sama → lolos, (b) dua surat dengan nomor 5 di periode sama → gagal, (c) nomor 5 di dua periode berbeda → lolos.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 009_surat
```

**Selesai bila:**
- [ ] Ketiga skenario lulus
- [ ] Konfigurasi FTS yang dipakai tercatat

**Jangan:** jangan menambahkan default pada `nomor_urut`.

---

### T-029 · Migrasi 010 — kanban & kendala
**Fase** 1 · **Butuh** T-028 · **Baca** SYSTEM_DESIGN §4.9

**Buat:** `supabase/migrations/010_kanban_kendala.sql` · `supabase/tests/010_kanban.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `kanban_card`, `checklist_item`, `kendala`, `kendala_reply`.
2. `kanban_card` boleh terhubung ke `proker`, `divisi`, atau `departemen` — minimal satu wajib terisi (tambahkan CHECK, tidak ada di dokumen tetapi diperlukan agar kartu tidak menggantung; catat sebagai keputusan kecil di komentar).
3. `kendala_reply.parent_id` self-reference untuk balasan berulir.
4. Index parsial `kendala_prioritas` untuk kendala yang belum selesai.
5. Test: kartu tanpa satu pun relasi → gagal; balasan berulir 3 tingkat → lolos.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 010_kanban
```

**Selesai bila:**
- [ ] Kedua skenario lulus

**Jangan:** jangan membuat tabel "komentar" generik terpisah.

---

### T-030 · Migrasi 011 — kesekretariatan
**Fase** 1 · **Butuh** T-029 · **Baca** SYSTEM_DESIGN §4.9 (notulensi hingga booking)

**Buat:** `supabase/migrations/011_sekretariat.sql` · `supabase/tests/011_sekretariat.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `notulensi`, `notulensi_attendance`, `action_item`, `pengurus`, `ruangan`, `booking_ruangan`.
2. `pengurus` UNIQUE `(periode_id, nim)`; `user_id` boleh NULL (pengurus tanpa akun, ADR-012).
3. `booking_ruangan` **tidak** memakai constraint anti-bentrok — bentrok hanya peringatan (PRD F-14.2). Tulis komentar ini agar agent berikutnya tidak "memperbaiki".
4. Test: dua booking di ruangan & jam sama → **lolos** (memang disengaja).

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 011_sekretariat
```

**Selesai bila:**
- [ ] Booking bentrok tersimpan tanpa error

**Jangan:** jangan menambahkan EXCLUDE constraint pada booking ruangan.

---

### T-031 · Migrasi 012 — dokumen acara
**Fase** 1 · **Butuh** T-030 · **Baca** SYSTEM_DESIGN §4.10 · ADR-015

**Buat:** `supabase/migrations/012_dokumen_acara.sql` · `supabase/tests/012_dokumen_acara.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `tor`, `proposal`, `lpj`, `rundown`.
2. `lpj.status` memakai enum `lpj_status` (ADR-015), bukan TEXT; tambah kolom `disetujui_bendum_oleh`, `disetujui_bendum_at`, `disetujui_ketua_oleh`, `disetujui_ketua_at`.
3. `tor.data`, `proposal.data`, `lpj.data_manual`, `lpj.analisis` bertipe JSONB dengan default `'{}'`.
4. Satu TOR/Proposal/LPJ per kepanitiaan (UNIQUE).

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 012_dokumen_acara
```

**Selesai bila:**
- [ ] Alur status LPJ dua tahap dapat disimpan

**Jangan:** jangan menyimpan hasil analisis LPJ hanya sebagai perhitungan runtime — `analisis` adalah snapshot saat generate.

---

### T-032 · Migrasi 013 — audit, backup, config
**Fase** 1 · **Butuh** T-031 · **Baca** SYSTEM_DESIGN §4.11 · PRD M15 · ADR-008

**Buat:** `supabase/migrations/013_audit_backup.sql` · `supabase/tests/013_audit.sql`
**Ubah:** —

**Kontrak:**
1. Tabel `audit_log` (BIGSERIAL, JSONB nilai lama/baru, INET, user agent) + 3 index.
2. `REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;` (INV-06). Tambahkan juga rule/trigger yang melempar exception pada UPDATE/DELETE agar tidak bisa ditembus oleh role dengan privilege lebih tinggi.
3. Tabel `backup` memakai enum `backup_jenis` dan `backup_status`.
4. Tabel `app_config` diisi **5 key** saja (lihat SEED_DATA T-008). **Jangan** membuat `durasi_persiapan_min/max` (ADR-008).
5. Test: (a) UPDATE audit_log → exception, (b) DELETE audit_log → exception, (c) `app_config` tidak memuat key durasi persiapan.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 013_audit
```

**Selesai bila:**
- [ ] Ketiga skenario lulus, termasuk saat dijalankan sebagai superuser aplikasi

**Jangan:** jangan memberi jalan keluar "hapus audit lama". Retensi seumur hidup sistem.

---

### T-033 · Fungsi DB A — anti-bentrok
**Fase** 1 · **Butuh** T-032 · **Baca** SYSTEM_DESIGN §6.3, §6.4, §6.5

**Buat:** `supabase/migrations/014a_functions_proker.sql` · `supabase/tests/014a_proker_fn.sql`
**Ubah:** —

**Kontrak:**
1. `cek_konflik_proker(periode, mulai, selesai, exclude_id)` mengembalikan tabel proker bentrok beserta nama departemen dan rentangnya.
2. `setujui_proker(proker_id, approver_id)` sesuai SYSTEM_DESIGN §6.4: `FOR UPDATE`, tolak status salah, `BERKALA`/`RESPONSIF` disetujui tanpa mengunci, `TERJADWAL` menghapus lock lama lalu INSERT baru, menangkap `exclusion_violation` dan mengembalikan JSON berisi daftar konflik + set status `PERLU_REVISI`.
3. `lepas_kunci_selesai()` menjalankan tiga langkah: `BERJALAN`→`SELESAI`, hapus lock proker selesai/dibatalkan, `DISETUJUI`→`BERJALAN`.
4. Rentang selalu `daterange(mulai, selesai + 1, '[)')` (INV-11).
5. Test: (a) approve TERJADWAL bentrok → `ok:false` + daftar konflik + status `PERLU_REVISI`, (b) approve BERKALA di rentang terkunci → `ok:true`, `locked:false`, (c) approve ulang proker yang sudah disetujui → exception, (d) `lepas_kunci_selesai` memindahkan status dengan benar.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 014a_proker_fn
```

**Selesai bila:**
- [ ] Keempat skenario lulus
- [ ] JSON konflik memuat nama proker, nama departemen, tanggal mulai, tanggal selesai

**Jangan:** jangan menambahkan pengecekan konflik di dalam fungsi sebagai pengganti constraint. Constraint tetap yang menegakkan.

---

### T-034 · Fungsi DB B — penomoran surat
**Fase** 1 · **Butuh** T-033 · **Baca** SYSTEM_DESIGN §7.2, §7.3, §7.4 · ADR-001, ADR-003

**Buat:** `supabase/migrations/014b_functions_surat.sql` · `supabase/tests/014b_surat_fn.sql`
**Ubah:** —

**Kontrak:**
1. `alokasi_nomor_surat(surat_id, approver)`: `FOR UPDATE`, idempoten (bila sudah bernomor, kembalikan nomor lama), advisory lock `pg_advisory_xact_lock(hashtextextended(periode_id::text, 0))`, naikkan counter, rakit nomor `KODE/NNN/ADM/KEGIATAN/ROMAWI/TAHUN`, set status `DISETUJUI`.
2. `alokasi_nomor_batch(surat_ids[], approver)` memanggil fungsi di atas dalam satu transaksi.
3. `aktifkan_periode(periode_id)`: arsipkan periode aktif lama, aktifkan yang baru, buat baris counter dengan `nomor_terakhir = nomor_surat_awal - 1` (ADR-003).
4. Kode administrasi dibaca dari `app_config`, fallback `UN43.3.7` (ADR-001).
5. Test: (a) surat pertama periode baru → `001`, (b) bulan 10 → `X`, (c) alokasi dua kali pada surat sama → nomor identik (idempoten), (d) batch 30 surat → 30 nomor berurutan unik, (e) surat berstatus DRAFT → exception.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 014b_surat_fn
```

**Selesai bila:**
- [ ] Kelima skenario lulus
- [ ] Nomor di-pad 3 digit (`001`, bukan `1`)

**Jangan:** jangan memakai `SELECT MAX(nomor_urut) + 1`. Hanya counter + advisory lock.

---

### T-035 · Fungsi DB C — audit & alokasi
**Fase** 1 · **Butuh** T-034 · **Baca** SYSTEM_DESIGN §14.1 · SYSTEM_DESIGN §4.7

**Buat:** `supabase/migrations/014c_functions_audit.sql` · `supabase/tests/014c_audit_fn.sql`
**Ubah:** —

**Kontrak:**
1. `fn_audit()` generik: menangkap INSERT/UPDATE/DELETE, mengisi `user_id` dari `auth.uid()`, `periode_id`/`ip`/`user_agent` dari `current_setting(..., true)` (tidak boleh error saat setting kosong).
2. `cek_total_alokasi()` sesuai SYSTEM_DESIGN §4.7 (batas atas saja).
3. `fn_audit` **tidak boleh** gagal karena konteks kosong — mutasi dari script/cron tetap harus tercatat dengan `user_id` NULL.
4. Test: (a) mutasi tanpa `set_config` tetap menghasilkan baris audit, (b) nilai lama/baru terisi benar pada UPDATE.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 014c_audit_fn
```

**Selesai bila:**
- [ ] Kedua skenario lulus

**Jangan:** jangan membuat audit gagal-diam. Bila insert audit gagal, mutasi harus ikut gagal.

---

### T-036 · Suite test SQL menyeluruh
**Fase** 1 · **Butuh** T-035 · **Baca** AI_EXECUTION_PLAN §5.1

**Buat:** `supabase/tests/900_integrasi.sql` · `docs/ai/DB_TEST_MATRIX.md`
**Ubah:** —

**Kontrak:**
1. Skenario integrasi ujung-ke-ujung dalam satu transaksi rollback: buat periode → user → departemen → proker → approve → cek lock → buat surat → approve → cek nomor → buat kepanitiaan/divisi/RAB → nota + alokasi.
2. `DB_TEST_MATRIX.md` memetakan setiap invariant AGENT_RULES §2 ke berkas test yang membuktikannya. Invariant tanpa test dicatat sebagai celah.
3. `npm run db:test` menjalankan seluruh berkas, mencetak ringkasan `X lulus / Y gagal`.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test
```

**Selesai bila:**
- [ ] Seluruh test hijau
- [ ] Setiap invariant INV-06, INV-09, INV-10, INV-11, INV-12, INV-14, INV-15, INV-16, INV-17 punya test yang menunjuknya

**Jangan:** jangan menandai invariant "terbukti" tanpa test nyata.

---

### T-037 · RLS — fungsi helper
**Fase** 1 · **Butuh** T-036 · **Baca** SYSTEM_DESIGN §5.2

**Buat:** `supabase/migrations/015a_rls_helpers.sql` · `supabase/tests/015a_rls_helpers.sql`
**Ubah:** —

**Kontrak:**
1. Enam fungsi `SECURITY DEFINER STABLE`: `auth_roles()`, `has_role(VARIADIC)`, `my_departemen()`, `my_divisi()`, `my_kepanitiaan()`, `is_pimpinan()`.
2. Semua mengembalikan array kosong (bukan NULL) bila tidak ada data — agar operator `= ANY()` aman.
3. `my_kepanitiaan()` menggabungkan keanggotaan divisi **dan** peran ketua pelaksana.
4. Set `search_path = public` eksplisit pada setiap fungsi `SECURITY DEFINER` (mencegah pembajakan search_path).
5. Test: user tanpa role → semua helper mengembalikan array kosong, `is_pimpinan()` false.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 015a_rls_helpers
```

**Selesai bila:**
- [ ] Helper aman terhadap user tanpa role
- [ ] `search_path` dikunci di semua fungsi

**Jangan:** jangan memakai `SECURITY DEFINER` tanpa mengunci `search_path`.

---

### T-038 · RLS — policy seluruh tabel
**Fase** 1 · **Butuh** T-037 · **Baca** SYSTEM_DESIGN §5.3 · PRD §5.1 (Permission Matrix)

**Buat:** `supabase/migrations/015b_rls_policies.sql`
**Ubah:** —

**Kontrak:**
1. `ENABLE ROW LEVEL SECURITY` pada **seluruh** tabel domain (tanpa kecuali). Tabel tanpa policy = tidak dapat diakses; itu perilaku yang benar, bukan bug.
2. Terjemahkan Permission Matrix PRD §5.1 menjadi policy per tabel. Untuk setiap tabel: SELECT, INSERT, UPDATE, DELETE terpisah.
3. Aturan yang wajib tampak eksplisit di policy:
   - Proker: baca semua; tulis Kadept hanya departemennya; approve hanya Ketua/Wakil (INV-05).
   - Surat: approve Ketua/Wakil/Sekum.
   - `rab_item`: baca seluruh panitia dalam kepanitiaan sama; tulis hanya divisi sendiri **dan** hanya bila `rab_meta.status IN ('DRAFT','DIAJUKAN')` (INV-29, INV-30).
   - `nota`: insert hanya divisi sendiri; UPDATE verifikasi hanya Bendum.
   - `audit_log`: SELECT untuk pimpinan & BPH; tanpa policy INSERT dari user (hanya trigger `SECURITY DEFINER`).
   - **BPH tidak muncul di policy tulis mana pun** (INV-03).
4. Setiap policy diberi komentar berisi rujukan baris Permission Matrix.

**Verifikasi:**
```bash
npm run db:reset && npx tsx scripts/rls-coverage.ts
```
(`rls-coverage.ts` mendaftar seluruh tabel dan menandai yang belum punya policy.)

**Selesai bila:**
- [ ] Nol tabel domain tanpa RLS aktif
- [ ] Nol policy yang menyertakan `BPH` pada operasi tulis

**Jangan:** jangan memakai `USING (true)` pada operasi tulis mana pun.

---

### T-039 · Uji negatif RLS
**Fase** 1 · **Butuh** T-038 · **Baca** PRD §5.1 · PRD F-8.3

**Buat:** `supabase/tests/015c_rls_negatif.sql` · `docs/ai/RLS_TEST_MATRIX.md`
**Ubah:** —

**Kontrak:**
1. Buat 8 user fiktif, satu per role, plus satu user multi-role (`ANGGOTA` + `BPH`).
2. Untuk setiap kombinasi role × tabel penting, assert hasil yang diharapkan menggunakan `SET LOCAL ROLE` / `set_config('request.jwt.claims', ...)`.
3. Skenario wajib:
   - Anggota Dept A membaca RAB divisi lain **dalam acara yang sama** → **boleh** (INV-30).
   - Anggota Dept A meng-UPDATE RAB divisi lain → **0 baris terpengaruh**, bukan error 500.
   - BPH mencoba INSERT/UPDATE apa pun → ditolak.
   - User multi-role (`ANGGOTA`+`BPH`) tetap bisa menulis sebagai Anggota (INV-03).
   - Kadept meng-approve proker → ditolak (INV-05).
   - Sekum meng-approve proker → ditolak; meng-approve surat → boleh.
   - Panitia menulis `rab_item` saat `rab_meta.status='DISETUJUI'` → ditolak (INV-29).
4. `RLS_TEST_MATRIX.md` menyajikan hasil sebagai tabel role × aksi × hasil.

**Verifikasi:**
```bash
npm run db:test -- 015c_rls_negatif
```

**Selesai bila:**
- [ ] Seluruh skenario lulus
- [ ] Percobaan tulis yang ditolak menghasilkan 0 baris, bukan crash

**Jangan:** jangan melonggarkan policy agar test lulus. Test yang benar, policy yang menyesuaikan.

---

### T-040 · View agregat
**Fase** 1 · **Butuh** T-039 · **Baca** SYSTEM_DESIGN §10.4

**Buat:** `supabase/migrations/016_views.sql` · `supabase/tests/016_views.sql`
**Ubah:** —

**Kontrak:**
1. `v_master_gantt` persis SYSTEM_DESIGN §10.4: join departemen, proker, PJ, progres kanban; filter status `DISETUJUI`/`BERJALAN` pada periode `AKTIF`.
2. View memakai `security_invoker = true` agar RLS pemanggil tetap berlaku.
3. Tambahkan view pendukung: `v_antrian_approval` (proker + surat menunggu, beserta role yang berhak) dan `v_ringkasan_rab` (total rencana vs aktual per divisi).
4. Test: view mengembalikan baris hanya untuk periode aktif; proker DRAFT tidak muncul.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 016_views
```

**Selesai bila:**
- [ ] `EXPLAIN ANALYZE` pada `v_master_gantt` dengan 60 proker < 50 ms
- [ ] Proker DRAFT tidak pernah muncul

**Jangan:** jangan membuat materialized view sekarang (belum perlu pada skala ini).

---

### T-041 · Trigger audit
**Fase** 1 · **Butuh** T-040 · **Baca** SYSTEM_DESIGN §14.1

**Buat:** `supabase/migrations/017_triggers.sql` · `supabase/tests/017_triggers.sql`
**Ubah:** —

**Kontrak:**
1. Pasang `fn_audit()` pada 12 tabel: `proker`, `proker_lock`, `surat`, `rab_item`, `rab_meta`, `nota`, `user_role`, `periode`, `kepanitiaan`, `divisi`, `lpj`, `app_user`.
2. Trigger `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`.
3. Test: satu INSERT ke tiap tabel menghasilkan tepat satu baris audit dengan `entitas` dan `entitas_id` benar.

**Verifikasi:**
```bash
npm run db:reset && npm run db:test -- 017_triggers
```

**Selesai bila:**
- [ ] 12 tabel menghasilkan jejak audit
- [ ] `nilai_lama` terisi pada UPDATE dan DELETE

**Jangan:** jangan memasang trigger audit pada `audit_log` sendiri.

---

### T-042 · Seed data referensi
**Fase** 1 · **Butuh** T-041, T-008 · **Baca** `docs/ai/SEED_DATA.md`

**Buat:** `supabase/migrations/018_seed.sql` · `prisma/seed.ts`
**Ubah:** `package.json` (script `seed`)

**Kontrak:**
1. Seed **idempoten** (`ON CONFLICT DO NOTHING` / upsert): 6 departemen dengan warna DESIGN_SYSTEM §2.4, 5 key `app_config`, metadata 11 `surat_template`, 9 divisi preset, 6 preset tujuan surat.
2. Seed **tidak** membuat user, periode, atau data personal apa pun.
3. `prisma/seed.ts` menyediakan seed pengembangan opsional (`--dev`): 1 periode aktif, 8 user contoh (satu per role), 3 proker contoh dengan tanggal tidak bentrok. Dijalankan hanya bila flag diberikan.
4. Warna departemen wajib sama persis dengan token CSS T-012.

**Verifikasi:**
```bash
npm run db:reset && npm run seed && npm run seed
```
(dijalankan dua kali untuk membuktikan idempotensi)

**Selesai bila:**
- [ ] `SELECT count(*) FROM departemen` = 6 setelah dua kali seed
- [ ] Warna 6 departemen cocok dengan `globals.css`
- [ ] `app_config` berisi tepat 5 key

**Jangan:** jangan menyeed data personal (nama, NIM, email asli).

---

### T-043 · Prisma client & audit context
**Fase** 1 · **Butuh** T-042 · **Baca** SYSTEM_DESIGN §14.2

**Buat:** `prisma/schema.prisma` · `lib/db/client.ts` · `lib/db/with-audit-context.ts`
**Ubah:** `package.json`

**Kontrak:**
1. `schema.prisma` **diturunkan dari SQL** lewat `prisma db pull`, bukan ditulis manual. SQL adalah sumber kebenaran (SYSTEM_DESIGN §4).
2. `lib/db/client.ts` singleton Prisma (aman terhadap hot reload), memakai `DATABASE_URL`.
3. `withAuditContext(req, fn)` membuka transaksi dan menetapkan `app.ip`, `app.user_agent`, `app.periode_id` sebelum menjalankan `fn` (K-09).
4. Sediakan `withServiceContext(fn)` untuk cron/script: menetapkan `app.user_agent='sistem'` dan `app.ip='0.0.0.0'`.
5. Test integrasi: mutasi lewat `withAuditContext` menghasilkan baris audit dengan IP dan user agent yang benar.

**Verifikasi:**
```bash
npx prisma validate && npm run test -- audit-context
```

**Selesai bila:**
- [ ] `prisma validate` lulus
- [ ] Baris audit memuat IP & user agent nyata dari request

**Jangan:** jangan mengedit `schema.prisma` lalu `db push`. Arah perubahan selalu SQL → Prisma.

---

## Blok D — Storage

### T-044 · Storage Adapter
**Fase** 1 · **Butuh** T-043 · **Baca** SYSTEM_DESIGN §12

**Buat:** `lib/storage/adapter.ts` · `supabase-adapter.ts` · `gdrive-adapter.ts` (stub) · `local-adapter.ts` (stub) · `s3-adapter.ts` (stub) · `index.ts` · `lib/storage/__tests__/adapter.test.ts`
**Ubah:** —

**Kontrak:**
1. Interface `StorageAdapter` persis SYSTEM_DESIGN §12 (put, get, getSignedUrl, getPublicUrl, delete, list, exists).
2. `SupabaseStorageAdapter` mengimplementasikan seluruh method; bucket `private` dan `public` dari env.
3. Tiga adapter lain berupa stub yang melempar `NotImplementedError` dengan pesan jelas.
4. `index.ts` memilih adapter berdasarkan `STORAGE_DRIVER`, default `supabase`.
5. Struktur key mengikuti SYSTEM_DESIGN §12.2 — sediakan helper `keys.ts` (mis. `keys.notaMaster(uuid)`), sehingga tidak ada string path yang ditulis manual di kode fitur.
6. Signed URL berumur **5 menit** (SYSTEM_DESIGN §18.1).

**Verifikasi:**
```bash
npm run test -- storage
```

**Selesai bila:**
- [ ] Berkas privat tidak dapat diakses tanpa signed URL (diuji nyata terhadap bucket dev)
- [ ] Mengganti `STORAGE_DRIVER` tidak menyentuh satu pun kode fitur

**Jangan:** jangan menulis path storage sebagai string literal di luar `keys.ts`.

---

## Blok E — Auth & Otorisasi

### T-045 · Autentikasi
**Fase** 1 · **Butuh** T-043 · **Baca** PRD F-1.1 · USER_FLOW §2.3 · SYSTEM_DESIGN §18.3

**Buat:** `app/(auth)/login/page.tsx` · `lib/auth/session.ts` · `middleware.ts` · `lib/auth/rate-limit.ts` · `app/api/auth/{login,logout}/route.ts`
**Ubah:** —

**Kontrak:**
1. Supabase Auth email+password; sesi 7 hari diperpanjang otomatis saat aktif.
2. Rate limit **5 percobaan / 15 menit per email+IP**; percobaan ke-6 ditolak dengan pesan waktu tunggu.
3. Pesan gagal **generik**: "Email atau password salah" — tidak membocorkan apakah email terdaftar.
4. User `is_active = false` ditolak meskipun password benar.
5. Login sukses **dan** gagal dicatat ke `audit_log` (aksi `LOGIN`, `LOGIN_GAGAL`).
6. `middleware.ts` melindungi seluruh rute `(dashboard)`; belum login diarahkan ke `/login?next=...`.
7. Halaman login memakai `--gradient-primary` sebagai hero (satu-satunya tempat gradien diizinkan).

**Verifikasi:**
```bash
npm run test:e2e -- login
```

**Selesai bila:**
- [ ] 5 Acceptance Criteria PRD F-1.1 terpenuhi seluruhnya
- [ ] Percobaan ke-6 ditolak dengan sisa waktu tunggu
- [ ] Login gagal tetap menghasilkan baris audit

**Jangan:** jangan menambahkan OAuth atau pendaftaran mandiri (di luar cakupan MVP).

---

### T-046 · Lapisan permission aplikasi
**Fase** 1 · **Butuh** T-045 · **Baca** SYSTEM_DESIGN §5.4 · PRD §4.4, §5.1

**Buat:** `lib/auth/permissions.ts` · `lib/auth/guard.ts` · `lib/auth/__tests__/permissions.test.ts`
**Ubah:** —

**Kontrak:**
1. Konstanta `PERMISSIONS` memuat **seluruh** aksi dari Permission Matrix PRD §5.1, bukan hanya 11 contoh SYSTEM_DESIGN §5.4.
2. `can(roles, permission)` menerapkan *union of permissions*; **BPH tidak pernah menambah hak tulis** (INV-03).
3. `requirePermission(perm)` untuk Route Handler dan `guardAction(perm)` untuk Server Action; keduanya membaca role **dari server**, tidak dari body request (INV-02).
4. Penolakan mengembalikan `{ ok:false, error:{ code:'TIDAK_BERWENANG' } }` dengan HTTP 403.
5. Test wajib memuat matriks 8 role × 12 aksi kunci, termasuk kasus multi-role dan kasus BPH.

**Verifikasi:**
```bash
npm run test -- permissions
```

**Selesai bila:**
- [ ] Matriks test cocok 100% dengan PRD §5.1
- [ ] `BPH`+`ANGGOTA` bisa menulis sebagai Anggota, tetapi tidak mendapat hak tambahan

**Jangan:** jangan menduplikasi logika permission di komponen. Komponen memanggil `can()`.

---

### T-047 · Undangan & manajemen user
**Fase** 1 · **Butuh** T-046 · **Baca** PRD F-1.2 · USER_FLOW §2.1, §2.2

**Buat:** `app/(dashboard)/admin/pengguna/page.tsx` · `app/(auth)/undangan/[token]/page.tsx` · `app/api/users/{route.ts,invite/route.ts,[id]/route.ts}` · `lib/auth/invitation.ts`
**Ubah:** —

**Kontrak:**
1. Form undang: Nama, NIM, Email, Angkatan, Role (multi-select), Departemen (wajib bila role KADEPT/ANGGOTA).
2. Token undangan **di-hash** sebelum disimpan (`invitation.token_hash`), sekali pakai, berlaku 7 hari.
3. Undangan ditolak bila email atau NIM sudah terdaftar pada periode aktif.
4. Token kedaluwarsa menampilkan halaman "Undangan kedaluwarsa, hubungi Admin".
5. Nonaktifkan user tidak menghapus data yang pernah dibuatnya.
6. Satu user dapat memiliki `ANGGOTA` + role kepanitiaan bersamaan.
7. Karena notifikasi email di luar cakupan MVP (PRD §6.2), tautan undangan **ditampilkan untuk disalin Admin**, bukan dikirim otomatis.

**Verifikasi:**
```bash
npm run test:e2e -- undangan
```

**Selesai bila:**
- [ ] 5 Acceptance Criteria PRD F-1.2 terpenuhi
- [ ] Token tersimpan hanya dalam bentuk hash

**Jangan:** jangan mengirim email. Belum ada layanan email di MVP.

---

### T-048 · Import massal user
**Fase** 1 · **Butuh** T-047 · **Baca** PRD F-1.2 · USER_FLOW §9.1

**Buat:** `app/api/users/bulk-import/route.ts` · `lib/import/parse-tabel.ts` · `components/shared/ImportPreview.tsx`
**Ubah:** `app/(dashboard)/admin/pengguna/page.tsx`

**Kontrak:**
1. Terima CSV dan XLSX; deteksi kolom otomatis dengan opsi pemetaan manual.
2. Pratinjau **wajib** sebelum simpan: baris valid / peringatan / error, masing-masing dengan alasan.
3. Baris bermasalah dapat dilewati satuan; sisanya tetap diimpor.
4. Laporan hasil: berapa berhasil, gagal, dilewati, plus unduhan berkas error.
5. `parse-tabel.ts` dipakai ulang oleh T-092 (peserta) dan T-107 (pengurus) — buat generik sejak awal.

**Verifikasi:**
```bash
npm run test -- import
```

**Selesai bila:**
- [ ] Import 100 baris menampilkan pratinjau sebelum menyimpan
- [ ] NIM duplikat ditandai dan bisa dilewati

**Jangan:** jangan menyimpan apa pun sebelum user menekan konfirmasi.

---

### T-049 · Profil & tanda tangan
**Fase** 1 · **Butuh** T-044, T-046 · **Baca** PRD F-1.3

**Buat:** `app/(dashboard)/profil/page.tsx` · `app/api/users/me/signature/route.ts`
**Ubah:** —

**Kontrak:**
1. Unggah TTD **PNG saja**, maksimum 2 MB, validasi lewat magic bytes (INV-21).
2. Disimpan ke bucket **privat** dengan key `ttd/{user_id}.png`.
3. Hanya pemilik akun yang boleh mengunggah TTD-nya. **Admin pun tidak boleh** mengunggahkan milik orang lain.
4. URL TTD **tidak pernah** muncul di response API mana pun — endpoint hanya mengembalikan `{ ok: true, hasSignature: boolean }`.
5. Pratinjau TTD di halaman profil memakai signed URL berumur 5 menit yang dibuat khusus untuk pemiliknya.

**Verifikasi:**
```bash
npm run test:e2e -- profil-ttd
```

**Selesai bila:**
- [ ] Berkas non-PNG ditolak
- [ ] Tidak ada path/URL TTD di response API mana pun (diuji dengan menggeledah body response)
- [ ] Admin gagal mengunggah TTD user lain

**Jangan:** jangan menaruh TTD di bucket publik "supaya gampang".

---

### T-050 · Periode kepengurusan
**Fase** 1 · **Butuh** T-046 · **Baca** PRD F-2.1 · SYSTEM_DESIGN §7.3

**Buat:** `app/(dashboard)/admin/periode/page.tsx` · `app/api/periode/{route.ts,[id]/activate/route.ts}`
**Ubah:** —

**Kontrak:**
1. CRUD periode: nama, tanggal mulai, tanggal selesai, status, `nomor_surat_awal` (ADR-003).
2. Tombol Aktifkan memanggil fungsi DB `aktifkan_periode` — bukan update manual dari aplikasi.
3. Aktivasi memakai konfirmasi tingkat **kritis** (ketik nama periode).
4. Data periode arsip **read-only** namun tetap dapat dibaca dan diunduh.
5. Selector periode di header (dipasang di T-051) mengubah scope tampilan ke mode arsip, dengan banner "Mode arsip — hanya baca".

**Verifikasi:**
```bash
npm run test:e2e -- periode
```

**Selesai bila:**
- [ ] 4 Acceptance Criteria PRD F-2.1 terpenuhi
- [ ] Membuat periode aktif kedua ditolak oleh database, bukan hanya UI
- [ ] Surat pertama pada periode baru bernomor `001`

**Jangan:** jangan mengizinkan penghapusan periode yang punya surat terbit.

---

## Blok F — Shell Aplikasi

### T-051 · Layout, sidebar dinamis, header
**Fase** 1 · **Butuh** T-046, T-018, T-050 · **Baca** USER_FLOW §1.1, §1.2 · DESIGN_SYSTEM §9.1, §11.1

**Buat:** `app/(dashboard)/layout.tsx` · `components/layout/{Sidebar,Header,PeriodeSelector,UserMenu}.tsx`
**Ubah:** —

**Kontrak:**
1. Menu dibangun dari struktur USER_FLOW §1.1 dan disaring dengan tabel visibilitas §1.2.
2. Menu yang tidak berhak diakses **tidak dirender sama sekali** (bukan disabled) — INV-30 pola yang sama.
3. Mode read-only (👁️) tetap menampilkan menu, tetapi halaman tujuan tidak menampilkan aksi tulis.
4. Header memuat: pencarian (⌘K), selector periode, indikator koneksi realtime (dipakai T-076), toggle tema, menu user.
5. Sidebar dapat dilipat; lebar sesuai DESIGN_SYSTEM §4.2.
6. Menu **Haluan Kerja dihapus** dari struktur (ADR-017).
7. Badge angka pada menu approval mengambil hitungan dari `v_antrian_approval`.

**Verifikasi:**
```bash
npm run test:e2e -- sidebar-role
```

**Selesai bila:**
- [ ] Login sebagai 8 role menghasilkan **8 susunan menu berbeda** (diuji otomatis)
- [ ] Tidak ada menu yang muncul disabled
- [ ] Menu Haluan Kerja tidak ada

**Jangan:** jangan menaruh logika permission di komponen menu. Panggil `can()` dari T-046.

---

### T-052 · Command palette & pintasan keyboard
**Fase** 1 · **Butuh** T-051 · **Baca** DESIGN_SYSTEM §9.2 · USER_FLOW Lampiran

**Buat:** `components/layout/CommandPalette.tsx` · `lib/shortcuts.ts`
**Ubah:** `components/layout/Header.tsx`

**Kontrak:**
1. `Ctrl/⌘ + K` membuka palette; pencarian menu, proker, surat, acara, pengurus.
2. Hasil pencarian disaring oleh permission — user tidak boleh melihat entitas yang tidak berhak dibacanya.
3. Pintasan: `G→H` beranda, `G→P` proker, `G→S` surat, `N` buat baru (kontekstual), `Esc` tutup, `?` daftar pintasan.
4. Pintasan nonaktif saat fokus berada di input/textarea/editor.
5. Palette dapat dinavigasi penuh dengan keyboard dan mengumumkan hasil ke screen reader.

**Verifikasi:**
```bash
npm run test:e2e -- command-palette
```

**Selesai bila:**
- [ ] Seluruh 7 pintasan bekerja
- [ ] Mengetik di form tidak memicu pintasan

**Jangan:** jangan menampilkan hasil pencarian lintas-departemen kepada Anggota jika tidak berhak.

---

### T-053 · Audit log viewer
**Fase** 1 · **Butuh** T-051 · **Baca** PRD M15 · SYSTEM_DESIGN §4.11

**Buat:** `app/(dashboard)/admin/audit/page.tsx` · `app/api/audit/route.ts`
**Ubah:** —

**Kontrak:**
1. Tabel audit dengan filter: user, jenis entitas, rentang tanggal, jenis aksi. Paginasi berbasis kursor (bukan offset) karena tabel akan besar.
2. Detail baris menampilkan perbandingan `nilai_lama` vs `nilai_baru` berdampingan, hanya field yang berubah yang disorot.
3. Export CSV mengikuti filter aktif.
4. Akses: Admin, Ketua, Wakil, BPH (PRD §5.1). Kadept hanya melihat entitas departemennya.
5. Halaman **tidak memiliki** aksi ubah atau hapus sama sekali (INV-06).

**Verifikasi:**
```bash
npm run test:e2e -- audit-viewer
```

**Selesai bila:**
- [ ] Filter dan export bekerja
- [ ] Tidak ada tombol edit/hapus di UI
- [ ] Percobaan `DELETE` langsung via SQL sebagai Admin tetap ditolak (uji ulang T-032)

**Jangan:** jangan menambahkan fitur "bersihkan log lama".
