# HANDOFF.md — Apa yang perlu diketahui sesi berikutnya

**Baca ini di awal setiap sesi.** Berkas ini menyimpan hal-hal yang **tidak
dapat ditemukan di tempat lain**: keadaan riil project sekarang, keputusan yang
lahir di percakapan, jebakan lingkungan, dan langkah berikutnya yang sudah
disepakati.

Yang **tidak** ditulis di sini karena punya rumah lain:

| Pertanyaan | Jawabannya di |
|---|---|
| Aturan proses & konvensi kode | `docs/ai/AGENT_RULES.md` |
| Di mana kode apa | `docs/ai/ARCHITECTURE.md` |
| Kontrak sebuah task | `docs/ai/tasks/P{fase}-*.md` |
| Kontrak fitur (auth, notulensi, dsb.) | `docs/ai/*_CONTRACT.md` |
| Aturan bisnis / produk | `docs/PRD.md`, `docs/SYSTEM_DESIGN.md` |
| Alasan kode begitu | komentar di file + ADR terkait di `docs/adr/` |
| Riwayat pekerjaan | `git log --oneline` — badan commit berisi alasannya |

**Perbarui berkas ini setiap kali ada keputusan yang tidak punya rumah lain.**
Berkas kedaluwarsa lebih berbahaya daripada tidak ada — ia dipercaya.

---

## 1. Keadaan per 2026-09-27

Project berjalan **mode single-agent** (sebelumnya dua-lane data+ui). Konsolidasi
selesai hari ini: infrastruktur lane (`scripts/lane.ts`, `docs/ai/lanes/`,
`PARALLEL_PROTOCOL.md`, `HANDOFF-DATA.md`) dihapus. Semua file boleh disentuh
satu agent.

**~70 dari 116 task selesai.** Angka pasti: hitung sendiri dari `git log
--oneline | grep -c "^[0-9a-f]* T-"` — badan commit memuat status yang lebih
akurat daripada `tasks.json` (yang dibekukan selama fase paralel).

Aplikasi **sudah bisa login**, sudah punya kerangka navigasi
(`app/(dashboard)/layout.tsx`), dan sudah menjalankan alur inti: proker, kanban,
Gantt, dashboard, notulensi (lengkap sejak T-106 UI).

**Koreksi 2026-09-27:** versi sebelumnya berkas ini menyebut "surat" sudah
berjalan — **salah**. Seluruh rantai surat T-054…T-062 belum dikerjakan
(`lib/surat/`, `lib/documents/` masih kerangka T-011). Pemilik produk memutuskan
rantai ini dikerjakan **belakangan** (ADR-025). T-077 juga sudah punya commit
`1c3f8c8` (dengan destination-gate badge surat), bukan lagi blocked.

### Gate hijau saat konsolidasi

```
npm run verify           579 lulus  (typecheck + lint + secret-scan + unit)
npm run db:test          27/27 file lulus (SQL + RLS)
npm run test:e2e         beberapa gate skip-until-UI (dokumentasi eksplisit)
```

### Commit terakhir sebelum konsolidasi

```
afbb6ca Merge pull request #54 from DimasPanca/lane/data
b30f61d T-106 (fondasi data): notulensi rapat — service, sanitasi, DOCX, RLS, gate
0c9a20f Merge pull request #53 from DimasPanca/lane/ui
6283d6e T-106: catat blocker fondasi notulensi
9e06040 T-081: tutup checklist setelah gate integrasi
```

---

## 2. Yang paling baru selesai

### T-116 · Dokumentasi pengguna & UAT — BLOCKED menunggu UAT nyata (2026-10-19)

`docs/panduan/{admin,ketua,wakil,sekum,bendum,kadept,anggota,bph}.md` +
`docs/panduan/img/` (46 PNG terpalet, 1,7 MB), `docs/ai/UAT_SKENARIO.md`,
`docs/ai/UAT_HASIL.md`, `README.md` (cara menjalankan, deploy, tautan seluruh
dokumen), `scripts/tangkap-panduan.ts`.

- **Tangkapan layar dibuat ulang otomatis:** `tangkap-panduan.ts` menyemai data
  demo bernama wajar (penanda U+2063 tak terlihat di akhir deskripsi,
  `surat.data_dinamis.demo_panduan`, `image demo-panduan-*`), mengganti
  sementara nama tampilan akun uji & periode menjadi nama jabatan
  ("Ketua Umum HMIF", "Kepengurusan 2026/2027") lalu **memulihkannya** (gate
  e2e bergantung pada `Periode Uji E2E`), mencatat menu sidebar nyata per role
  (`--menu`), memotret, lalu membersihkan. Jalankan di build produksi supaya
  indikator dev Next tidak ikut terpotret.
- Tabel "Menu Anda" tiap panduan diambil dari sidebar sungguhan, bukan
  USER_FLOW §1.2 (keduanya cocok kecuali yang dicatat di panduan).
- **UAT_HASIL.md sengaja kosong** (templat) — sesi onboarding & UAT belum
  terjadwal. Lampirannya memuat gladi otomatis gate e2e yang memetakan
  skenario, ditandai jelas "bukan UAT".
- Kriteria selesai T-116 butuh manusia: Ketua, Sekum, Bendum, dan 2 Kadept
  menyelesaikan UAT-01…05 tanpa bantuan dan seluruh temuan diklasifikasi.

### T-114 · Verifikasi performa — BLOCKED menunggu ADR-035 (2026-10-19)

`scripts/bench-all.ts`, `docs/ai/PERFORMANCE_REPORT.md`, ADR-035 (Usulan),
`lib/gantt/geser.ts`, `lib/realtime/klien-browser.ts`.

- **10/10 metrik PRD §8.1 terukur dan lulus** pada build produksi, 4G
  tersimulasi + CPU 4×, data realistis (60 proker · 100 item RAB · 100 task ·
  50 nota bergambar · 500 surat; disemai & dibersihkan oleh skrip, penanda
  `BENCH114`). Angka sebelum/sesudah di laporan.
- **Diperbaiki:** bundle beranda 256 → 165 KB (supabase-js lewat `import()`
  di `muatKlienRealtime`; helper Gantt tanpa zod dipisah ke `geser.ts` —
  komponen chart JANGAN mengimpor `lib/gantt/skema.ts`); scroll vertikal Gantt
  12% → ≤ 4% frame tersendat (baris di-memo: `BarisTask`/`BarisGrup`/
  `LabelBaris` + objek `aksi` berumur tetap, `TimelineHeader` & garis kolom
  di-memo); login siap dipakai 1,1–1,3 s → 0,90–0,96 s (video logo 4,6 MB →
  0,35 MB di-encode ulang 256 px, dipasang setelah hidrasi, poster lewat
  optimizer Next).
- **Belum tercapai:** anggaran JS login 80 KB (terukur 119,1). Runtime
  Next 15 + React 19 sendiri 100,4 KB — di bawah lantai stack §2. ADR-035
  mengusulkan "runtime + ≤ 20 KB JS halaman"; LCP/TTI login sudah lulus.
  **Keputusan pemilik produk dibutuhkan**; setelah diterima, ubah anggaran
  login di `ukurBundle()` (bench-all) ke 120 KB dan tandai T-114 DONE.
- Margin tipis di CPU 4×: Gantt 100 task 402–460 ms (satu sampel 531),
  pratinjau surat 250–279 ms. Ukur ulang di Vercel staging (cold start tidak
  tercakup).
- **Kegagalan e2e yang ditemukan dan TERBUKTI sudah ada sebelum T-114**
  (dijalankan ulang pada `7a1d84b` lewat `git stash -u`): `gantt-editor`
  "mengganti skala…" (lebar SVG mentok di lebar kontainer pada kedua skala —
  data harness tetap Okt–Des 2026) dan `login` "keluar mengakhiri sesi" di
  stack lokal (logout manual berhasil; perlu diselidiki). `realtime-gantt`
  gagal hanya bila berjalan paralel dengan `master-gantt` (48 proker semaian
  menggeser bar baseline keluar jendela virtual); sendirian 4/4. `a11y` K-15
  dan `sidebar-tautan` menu TOR butuh data proker/acara/surat yang sudah ada.

### T-115 · Aksesibilitas & responsif (2026-10-19)

`docs/ai/A11Y_REPORT.md`, `lib/a11y/kontras.ts` + test `a11y-kontras` (ikut
`npm run verify`), gate `e2e/a11y.spec.ts` (`npm run test:e2e -- a11y`).

- **Kontras:** 117 pasangan token diaudit di kedua tema; 23 gagal → token
  diperbaiki (tertiary, danger, warning, success, info di terang; tertiary,
  primary-text, primary-active di gelap). Hero login kini `text-white` tetap.
  Warna berubah sedikit dari DESIGN_SYSTEM — dicatat di laporan.
- **Gate a11y (desktop, viewport diatur per test):** 375 px tanpa gulir
  horizontal di 10 halaman inti (Nota, Kanban, dll.), kontrol berlabel, tombol
  bernama, login tanpa mouse + indikator fokus + galat `aria-describedby`,
  reduced-motion, StatusPill ikon+teks (K-15). Lulus 4/4.
- **Temuan:** proyek Playwright "mobile" + `browser.newContext()` TIDAK
  mewarisi profil perangkat. `upload-nota.spec` kini membuka konteks 375 px
  bersentuh di proyek mobile — alur unggah nota lengkap lulus 4/4.

### Perbaikan tautan sidebar (2026-10-17, laporan pemilik)

Menu **TOR, Proposal, Ruang Kerja Divisi, RAB, LPJ** menautkan ke halaman
indeks yang tidak pernah ada (`/acara/tor`, `/keuangan/lpj`, …) → 404 di
produksi. Fiturnya milik satu acara, jadi menu kini membuka **Daftar Acara
sebagai pemilih** (`/acara?buka=divisi|tor|proposal|rab|lpj`): judul berubah,
tautan tiap acara langsung ke tabnya, dan bila hanya ada satu acara langsung
dialihkan. Grup Keuangan/Kesekretariatan/Administrasi menautkan ke halaman yang
ada dan tetap aktif lewat field `awalan`. **Arsip Dokumen** dan **Konfigurasi
Sistem** disembunyikan (tanpa kontrak — BACKLOG). Gate baru
`e2e/sidebar-tautan.spec.ts` mengunjungi setiap tautan sidebar (Admin & Ketua)
dan menolak 404.

### T-113 · Hardening keamanan (2026-10-17)

`lib/security/{rate-limit,sanitize}.ts`, `docs/ai/SECURITY_AUDIT.md` (hasil uji
penetrasi + temuan + mitigasi), `scripts/security-scan.ts` (butuh server
berjalan; seluruh 29 pemeriksaan lulus), migrasi `050_rate_limit.sql`,
`scripts/pindah-turunan-nota.ts`.

- **Temuan utama S-01 (diperbaiki):** preview & thumbnail nota ternyata di
  bucket PUBLIK sejak T-044 (`keys.ts` PREFIX_PUBLIK), melanggar ADR-011.
  Kini privat; tampilan memakai signed URL 5 menit secara batch
  (`urlBertanda` di `lib/storage`, `getSignedUrls` opsional di adapter,
  `urlGambarNotaBanyak`). `urlGambarNota` kini **async**. 64 berkas lama sudah
  dipindah (SHA-256 dicocokkan, salinan publik dihapus). Bila ada lingkungan
  lain (staging/produksi) dengan data lama: jalankan
  `npx tsx scripts/pindah-turunan-nota.ts` sekali.
- **Rate limit** (§18.3): approve surat 100/jam/user (route approve & batch
  setujui) dan umum 300/menit/IP (middleware, HANYA produksi) memakai
  `rate_limit_cek` (migrasi 050) lewat PostgREST — satu implementasi untuk
  edge & node, fail-open. Login/upload/backup tetap dihitung dari tabel
  domainnya. PostgREST perlu `NOTIFY pgrst, 'reload schema'` setelah fungsi
  baru (sudah dijalankan di dev). Cron harian membersihkan jendela lama.
- **CSRF:** middleware menolak `POST/PUT/PATCH/DELETE /api/*` ber-Origin asing
  (403 `ORIGIN_DITOLAK`); cookie Supabase `SameSite=Lax` eksplisit + `Secure`
  di produksi.
- **CSP** tanpa `script-src` (Next menyisipkan skrip inline) — lihat
  SECURITY_AUDIT M-02. Header lain sudah ada sejak awal.
- Sanitasi baca ditambahkan di `detailNotulensi`; tempat lain sudah dua sisi.
- `rate_limit` dikecualikan dari backup (ephemeral).

- `e2e/login.spec.ts` "keluar mengakhiri sesi" diperbaiki: tombol keluar ada
  di dalam menu pengguna `<details>` (T-051) — test kini membukanya dulu
  (gagal sejak T-051, bukan regresi). Gate e2e T-113: login 16/16 (desktop,
  1 worker), upload-nota & verifikasi-nota lulus, surat-approval lulus kecuali
  batas 120 dtk langkah unduh terakhir saat server lokal kelebihan beban (2
  worker, DB jarak jauh) — bukan regresi; jalankan `--workers=1` di laptop.
### T-112 · Restore & import per modul (2026-10-17)

`lib/backup/{restore,import-modul}.ts`, `app/api/backup/[id]/restore/route.ts`
(GET riwayat `backup.read`; POST `pratinjau` | `mulai` | `lanjut`
`backup.manage`), `components/backup/{RestoreDialog,ImportModulDialog,ProgresRestore}.tsx`
(di `BackupPanel`), migrasi `048_restore_job.sql` + `049_restore_job_updated_at.sql`
(model Prisma ditulis tangan — `db pull` menulis ulang 477 baris schema), `scripts/e2e-restore.ts`,
test `lib/backup/__tests__/backup-restore.test.ts`, `e2e/restore.spec.ts`.
Keputusan: **ADR-034**.

- **Bertahap** di `restore_job`: PRA_RESTORE (backup jenis PRA_RESTORE, wajib,
  tanpa opsi lewati) → VERIFIKASI (seluruh berkas SHA-256 + versi) → TERAPKAN.
  Berjalan di `after()`; job diam > 6 menit (dan pra-restore-nya tidak lagi
  BERJALAN) dapat **dilanjutkan** dari tahap tersimpan (tombol di UI).
- **Per modul** (TAMBAH lewati yang ada · TIMPA ganti seluruh kolom · GABUNG
  hanya kolom backup yang tidak kosong & berbeda), satu transaksi per modul,
  `session_replication_role = replica` (trigger domain/updated_at tidak
  mengubah data yang dipulihkan). Kolom = kolom sekarang ∩ kunci JSON (kolom
  baru → nilai bawaan). Pratinjau = hitungan baru/berubah/sama per tabel.
  `audit-log` hanya TAMBAH (INV-06). Laporan mencatat modul yang sudah
  terpakai bila gagal di tengah.
- **Penuh**: konfirmasi ketik `HMIF Center`; hanya dari dump `sql_per_tabel`
  dengan `migrasiTerakhir` = migrasi sekarang (selain itu ditolak dengan pesan
  kedua versi). Berkas storage di-upsert dulu, lalu database dalam SATU
  transaksi koneksi langsung (kosongkan tabel kecuali audit_log → jalankan dump
  per pernyataan).
- **Format dump diperbaiki (berlaku untuk backup baru)**: INSERT kini `ON
  CONFLICT DO NOTHING` (audit_log tidak dihapus saat restore) dan dipecah
  ≤ 1 MB per pernyataan (`pecahLarikJson`) — pooler Supabase memutus koneksi
  saat menerima satu kueri 17 MB (terbukti; 4 MB masih aman). Backup uji
  sebelum perubahan ini (`5932954e…`, `fbbbc235…`) gagal pada restore PENUH
  (transaksi di-rollback utuh); per modul tetap bisa. Backup acuan terbaru:
  `8a98756c…`.
- **Verifikasi nyata** (`npx tsx scripts/e2e-restore.ts`, seluruh langkah
  destruktif di-ROLLBACK karena DB dev dipakai bersama): 17 berkas cocok checksum (65 dtk)
  dan 132 berkas storage dapat dibuka; restore PENUH dari `.sql.gz`
  mengosongkan & memulihkan 55 tabel IDENTIK dengan modul JSON dalam 106 dtk
  (target < 1 jam); `prokers.json` ke tabel kosong → identik; TAMBAH/TIMPA/
  GABUNG berperilaku sesuai definisi; versi skema berbeda & audit-log TIMPA
  ditolak. Waktu penuh di produksi ≈ unduh+verifikasi bundel + upsert 132
  berkas + 106 dtk database — dari laptop jauh di bawah satu jam, tetapi
  melampaui 300 dtk satu fungsi, karena itu tahapnya dapat dilanjutkan.
- Kuota backup manual 17-10 habis lagi oleh backup uji T-112.
- `supabase/tests/013_audit.sql` dibuat hermetis (`created_at = now()`): sejak
  T-110 database dev berisi backup sungguhan.

### T-111 · Cron backup & retensi (2026-10-17)

`lib/backup/retensi.ts` (`pilihUntukDihapus` murni, `bersihkanBackupLama`,
`backupBulanan`), cabang tanggal 1 di `app/api/cron/harian/route.ts`,
`vercel.json` (`functions.maxDuration` 300 untuk cron & `/api/backup`), test
`lib/backup/__tests__/backup-retensi.test.ts`.

- **Tetap satu entri cron** (ADR-009): bila `ringkasan.tanggal_1`, route
  menjadwalkan `backupBulanan()` di `after()` — lifecycle harian tidak
  tertahan backup yang memakan menit. Respons memuat
  `backup_bulanan: 'DIJADWALKAN' | 'BUKAN_TANGGAL_1'`. `backupBulanan`
  idempoten per bulan WIB (dilewati bila OTOMATIS SUKSES/BERJALAN bulan ini
  sudah ada); retensi hanya jalan setelah backup baru SUKSES.
- **Retensi ADR-016**: 12 OTOMATIS SUKSES terbaru; MANUAL & PRA_RESTORE tak
  pernah terpilih; OTOMATIS GAGAL tidak dihitung/dihapus (berkasnya sudah
  bersih). Hapus berkas dulu, lalu baris + `audit_log` `BACKUP_HAPUS` dalam
  satu transaksi — bila hapus berkas gagal, baris dipertahankan untuk
  percobaan berikutnya. Diuji juga ke DB sungguhan (13 baris palsu → yang
  tertua terhapus + audit; baris palsu dibersihkan).
- **Batas manual 3/hari WIB** (`BATAS_MANUAL_PER_HARI` di service.ts) di
  `mulaiBackup`, dihitung SETELAH cek KONFLIK; setiap percobaan dihitung
  (yang GAGAL pun). POST → 429 `BATAS_HARIAN`. Catatan: hari ini (17-10) kuota
  manual dev sudah habis oleh percobaan T-110.
- **Google Drive**: hanya bila `GDRIVE_ENABLED=true`, setelah SUKSES di
  Supabase — seluruh berkas + manifest disalin dengan key yang sama lewat
  `buatAdapter('gdrive')`. Gagal → backup tetap SUKSES, hasil ditulis ke kolom
  `backup.manifest.sinkron.gdrive` (BUKAN ke manifest.json ber-checksum;
  `verify-backup.ts` mengabaikan key itu) + audit `BACKUP_SINKRON`, tampil
  sebagai peringatan di halaman Admin. `GoogleDriveAdapter` masih stub
  (NotImplemented) — mengaktifkan flag sekarang menghasilkan peringatan.

### T-110 · Backup tiga lapis (2026-10-17)

`lib/backup/{manifest,export-modul,zip-storage,service}.ts`,
`app/api/backup/route.ts` (GET daftar+progres `backup.read`; POST "Backup
Sekarang" `backup.manage` → 202, dikerjakan di `after()`),
`app/(dashboard)/admin/backup/page.tsx` + `components/backup/BackupPanel.tsx`,
`scripts/verify-backup.ts`, test `lib/backup/__tests__/backup-service.test.ts`,
`e2e/backup.spec.ts`. `dataEksporRabSistem` (tanpa konteks, satu perakit
dengan unduhan RAB biasa) di `lib/rab/service.ts`.

- Bundel di `backup/{id}/…` (`keys.backupBerkas`): `manifest.json` (ditulis
  PALING AKHIR), `database/full-dump.sql.gz`, `modules/*.json` (12 modul —
  pemetaan 56 tabel di `MODUL_BACKUP`; tabel baru yang lupa dipetakan tetap
  ikut dump dan tercatat di `keterbatasan`), `exports/rab-{slug}.xlsx` per
  acara + `exports/daftar-surat.xlsx`, `files/storage-archive.zip`.
- **Arsip storage dipecah per volume** (`storage-archive.zip`,
  `storage-archive-2.zip`, …; `BACKUP_BATAS_VOLUME_MB`, bawaan 45): Supabase
  menolak objek > 50 MB, dan storage dev sudah 79 MB (template LPJ 16 MB per
  versi, LPJ hasil 14 MB). Setiap volume punya `_indeks.json` (SHA-256 per
  berkas) untuk restore T-112. `manifest.volumeArsip` = jumlah volume.
- **Lapis 1**: `pg_dump` dicoba (PGPASSWORD, bukan argumen); di Vercel tidak
  ada → dump DATA per tabel (`jsonb_populate_recordset`,
  `session_replication_role = replica`, setval sequence), tanpa DDL —
  keterbatasan ditulis di manifest. `_migrasi` dan `backup` sengaja tidak ikut.
- `manifest.versiSkema` = env `SCHEMA_VERSION` (ENV_SETUP: dinaikkan manual
  saat tak kompatibel) — ini yang dibandingkan T-112;
  `manifest.migrasiTerakhir` = migrasi terakhir di `_migrasi` (titik migrasi
  yang dibutuhkan dump data).
- SUKSES hanya setelah semua berkas diunduh ulang & cocok checksum, lalu
  manifest terbaca ulang identik; gagal di mana pun → berkas terunggah
  dihapus, baris GAGAL + pesan. Baris BERJALAN > 20 menit ditandai GAGAL
  (`tandaiTerhenti`, dipanggil GET/POST dan `jalankanBackup`). Satu backup pada satu waktu
  (advisory lock + 409). Audit: `BACKUP_MULAI` (dengan IP) dan `BACKUP`
  (status akhir) di `audit_log`.
- **Perbaikan adapter Supabase**: `list('')` dulu hanya membaca bucket privat
  (bertentangan dengan kontrak adapter) dan tidak paging (>1000 berkas
  terlewat). Kini dua bucket + paging; objek yang tersimpan di bucket yang
  tidak sesuai bentuk key-nya tidak dilaporkan (tak terjangkau `get()`).
  Ada sisa uji lama `nota/master/uji-t044-*` di bucket PUBLIK — aman
  dihapus manual oleh pemilik.
- **Ukuran & waktu nyata (dev, dijalankan dari laptop)**: backup `5932954e…` (MANUAL, terverifikasi) ±80 MB, 17 berkas,
  ~4,5 menit — dominan arsip storage. Di Vercel (sin1, dekat Supabase) mestinya
  lebih cepat, tetapi `maxDuration = 300` bisa terlampaui bila storage tumbuh;
  `modules/audit-log.json` sudah 20 MB (data uji e2e) dan akan menabrak batas
  50 MB per objek kelak. Bila itu terjadi, backup GAGAL dengan pesan jelas —
  perlu pemecahan audit per tahun atau paket Supabase berbatas lebih besar.
- Sisa uji: dua baris GAGAL hasil percobaan pertama (batas ukuran & objek
  salah bucket) sengaja dibiarkan sebagai riwayat; berkasnya sudah bersih.
- Retensi, cron tanggal 1, rate limit 3/hari, Google Drive = T-111. Restore &
  import per modul = T-112.

### T-105 · Generator LPJ (2026-10-17)

`lib/lpj/{schema,generate}.ts`, `app/api/lpj/[kepanitiaanId]/{route,generate,approve}`,
`app/(dashboard)/acara/[id]/lpj/page.tsx`,
`components/lpj/{PrasyaratChecklist,LampiranNota,BagianManual,LpjAksi}.tsx`,
migrasi `046_lpj_alur_final.sql` + `047_lpj_hapus_kaskade.sql`, test
`lib/lpj/__tests__/lpj-generate.test.ts`, `e2e/lpj-generate.spec.ts`,
`supabase/tests/012_dokumen_acara.sql` (alur LPJ).

- **Alur status ditegakkan trigger `fn_lpj_alur`** (046): DRAFT → DIAJUKAN →
  DISETUJUI_BENDUM → FINAL; DIAJUKAN/DISETUJUI_BENDUM boleh kembali ke DRAFT
  (alasan ≥5 huruf, disimpan di `catatan_pengembalian`, persetujuan dihapus).
  Isi hanya boleh berubah di DRAFT; FINAL beku. Policy `lpj_update_ketua`
  untuk Ketua pada DISETUJUI_BENDUM. 047: DELETE langsung LPJ FINAL ditolak
  hanya bila `pg_trigger_depth() = 1`, supaya kaskade FK (hapus proker) tetap
  jalan.
- **RAB → SELESAI saat LPJ FINAL** (persetujuan Ketua), bukan saat generate
  seperti tertulis di komentar lama `majukanStatusRab` — LPJ yang dikembalikan
  masih perlu bisa memperbaiki nota.
- Generate: cek prasyarat (≥1 nota terverifikasi, RAB REALISASI/SELESAI,
  ≥1 foto dokumentasi; TOR/proposal opsional) + field manual wajib → 422
  `details.kurang`; hanya di DRAFT (lainnya 409). Snapshot analisis T-104 +
  baris pengeluaran ditulis ke `lpj.analisis`; laporan keuangan di DOCX dan
  halaman diambil dari snapshot begitu status ≠ DRAFT.
- **Template LPJ v2** (`templates/lpj.docx`, registry versi 2, `lpj_v2` SUDAH
  diunggah ke storage): bagian "Lampiran Nota Belanja"
  (`{#lampiran_nota}…{%gambar}{keterangan}…`) dan `{%foto}` dokumentasi.
  Op baru `sisipSalin` di `scripts/build-templates.ts`
  (`sisipSalinSebelum` di `scripts/docx-surgery.ts`). Ingat: build tidak
  deterministik — kembalikan template lain dengan `git checkout`.
- `lib/documents/image-module.ts` kini menerima JPEG (`jenis: 'jpeg'`):
  master JPEG/PNG disematkan apa adanya (byte identik), WebP → PNG; tampil
  maks 600×800 px.
- **Izin baca LPJ = `lpj.read || lpj.generate`** (`bolehBacaLpj`): matriks
  memberi Admin/Bendum C tanpa R. Upload gambar (`/api/images/upload`) kini
  `nota.create || lpj.generate` agar penyusun LPJ bisa unggah foto.
- PDF LPJ (`keys.lpjPdf`) hanya bila konversi PDF aktif (lihat keputusan
  PDF dilewati).
- Sekalian: `supabase/tests/{006,014a,015c}` dibuat hermetis (commit
  terpisah) — sebelumnya menghitung baris global dan gagal karena data dummy
  owner.

### T-104 · Analisis LPJ (2026-10-16)

`lib/lpj/analyze.ts` (`analisisLpj` murni + `muatBahanLpj`),
`GET /api/lpj/[kepanitiaanId]/analyze` (`langsung` + `snapshot` tersimpan),
`lib/lpj/__tests__/lpj-analyze.test.ts` (nama ber-prefiks seperti
`rab-calculate.test.ts` supaya `npm run test -- lpj-analyze` menemukannya).

- Seluruh field SYSTEM_DESIGN §11.5 + `underBudget`, `totalDiLuarRab`,
  `kekuranganDanaTakTerduga`, `jumlahNota`, `dihitungAt`.
- `totalAktual` = Σ total nota terverifikasi (= Σ alokasi, INV-28 — diuji);
  realisasi item dari alokasi; di luar RAB dari alokasi `rab_item_id NULL`.
- Persen selisih `null` bila rencana 0. Item ber-rencana 0 yang terealisasi =
  OVER_BUDGET.
- **Definisi dana tak terduga terpakai** (SYSTEM_DESIGN tak merinci
  `hitungDanaTakTerduga`): min(cadangan RAB, Σ kelebihan item over-budget + Σ
  pengeluaran di luar RAB); sisa kebutuhan = `kekuranganDanaTakTerduga`.
- Bahan memakai helper realisasi T-103 (`notaTerverifikasi`,
  `sumberPemasukan`, kini diekspor dari `lib/rab/service.ts`). Snapshot ke
  `lpj.analisis` ditulis T-105 saat generate.

### T-103 · PENGELUARAN & RAB AKTUAL otomatis (2026-10-16)

`lib/rab/realisasi.ts` (murni: `bukuPengeluaran`, `realisasiPerItem`,
`penandaSelisih`), `muatRabAktual` + refaktor `dataEksporRab` di
`lib/rab/service.ts`, `components/rab/{RabAktualTab,BatalkanVerifikasi}.tsx`
(tab RAB acara), `DELETE /api/nota/[id]/verify` (`batalkanVerifikasi`).

- Tidak ada saldo/realisasi yang disimpan: setiap baca menghitung ulang PENUH
  dari nota TERVERIFIKASI, urut tanggal belanja → waktu unggah → id. Membatalkan
  verifikasi nota tengah = otomatis hitung ulang dari awal (unit test).
- PENGELUARAN = satu baris per ALOKASI (nominal alokasi, bukan total nota);
  alokasi di luar RAB ikut, bertanda (layar: latar kuning; Excel: isian
  FFF2CC; uraian "Di luar RAB: …") dan TIDAK masuk realisasi item mana pun.
- Ekspor Excel memakai buku yang sama → angka layar = angka Excel.
- Batalkan verifikasi: Bendum/Admin, wajib alasan (disimpan di
  `alasan_penolakan` "Verifikasi dibatalkan: …"), ditolak bila RAB SELESAI
  (LPJ terbit). Status RAB tidak mundur dari REALISASI (trigger 041).

### T-102 · Verifikasi nota (2026-10-16)

`lib/nota/verifikasi.ts`, `POST /api/nota/[id]/{verify,reject,minta-perbaikan}`
(kerangka bersama `app/api/nota/[id]/_aksi.ts`),
`components/nota/{AntrianNota,NotaDetailSplit,VerifikasiAksi}.tsx`,
`/keuangan/nota/verifikasi` (sidebar diarahkan ke sini), `scripts/bench-galeri-nota.ts`.

- Antrian = nota MENUNGGU_VERIFIKASI periode berjalan, dikelompokkan per acara
  lalu divisi; kartu memakai `NotaImage varian="thumb"` (lazy), detail
  `varian="preview"`, unduh master hanya lewat `/api/images/[id]/download`.
  Gate e2e memeriksa lalu lintas jaringan: tak satu pun permintaan master.
- Setujui: baris dikunci `FOR UPDATE`, hanya dari MENUNGGU_VERIFIKASI (selain
  itu 409), Σ alokasi = total diperiksa ULANG (422 `ALOKASI_TIDAK_SEIMBANG`),
  nota pertama memajukan RAB DISETUJUI → REALISASI (`majukanStatusRab`).
  Tolak/minta perbaikan wajib alasan ≥ 5 karakter (422 di server), disimpan di
  `alasan_penolakan`; status DITOLAK / PERLU_PERBAIKAN kembali ke pengunggah
  (perbaikan T-101/045).
- Hak = `nota.verify` (Admin, Bendum) — cermin RLS nota_update.
- `next.config.ts` kini menerima `NEXT_DIST_DIR` (bawaan `.next`) agar build
  produksi benchmark dapat berjalan berdampingan dengan `next dev`;
  `.next-*/` di-ignore.
- Bench galeri (`scripts/bench-galeri-nota.ts`, build produksi `.next-bench`
  port 3100): median **936 ms** < 2000 ms, 30 thumbnail dimuat, 0 permintaan
  master; TTFB setara halaman `/surat` (layout + sesi). Antrian = SATU query
  SQL, detail = dua query paralel — relasi Prisma bersarang berarti satu
  round-trip per relasi. Di `next dev` setiap halaman +±2 detik (tak berarti).
- Gate: `upload-nota.spec` kini memfilter baris "Nota saya" dengan nama acara
  ber-tag project (desktop & mobile berbagi akun uji secara paralel).

### T-101 · Alur upload nota (2026-10-16)

`lib/nota/{skema,service,unggah-gambar}.ts`, `GET|POST /api/nota`,
`PATCH /api/nota/[id]`, `components/nota/{NotaForm,ItemRabSelector,AlokasiEditor}.tsx`,
`/keuangan/nota` (nota saya + Perbaiki) dan `/keuangan/nota/upload` (`?perbaiki=`).
Migrasi **045** · `015c` skenario 18.

- Urutan USER_FLOW §7.1: divisi (otomatis bila satu) → item RAB (select +
  "Pengeluaran di luar RAB") → baru tombol kamera aktif → CameraCapture (dimuat
  dinamis; OpenCV baru saat kamera dibuka — gate memeriksa tak ada request CDN
  sebelumnya) → pipeline T-097 → `/api/images/upload` → rincian & alokasi.
- Uang rupiah bulat; selisih alokasi real-time (`data-selisih`); server menolak
  `ALOKASI_TIDAK_SEIMBANG` + `details {total_nota,total_alokasi,selisih}`.
  Item RAB diperiksa milik divisi itu di server, gambar milik pengunggah dan
  belum dipakai nota lain, tanggal belanja tidak di masa depan.
- Hak unggah = `nota.create` + (Admin | `bisaTulisPanitiaDivisi`) — cermin
  `nota_insert` (039). Sekum sebagai Ketua Pelaksana tidak punya `nota.create`
  (matriks PRD) → tidak dapat mengunggah.
- 045: pengunggah memperbaiki nota DITOLAK/PERLU_PERBAIKAN (hasil wajib
  MENUNGGU_VERIFIKASI — tak dapat memverifikasi sendiri); alokasi hanya diubah
  Admin/Bendum atau pengunggah selama nota belum terverifikasi (sebelumnya
  SEMUA anggota divisi dapat mengubah alokasi nota terverifikasi).
- Belum dijalankan: `scripts/bench-bundle.ts -- /keuangan/nota/upload` (butuh
  port 3000 kosong; dev server sedang dipakai). Jalankan saat server mati.

### T-096 · Editor & generator Proposal (2026-10-16)

`lib/proposal/{schema,prefill,service,generate}.ts`,
`GET|PUT /api/proposal/[kepanitiaanId]`, `POST|GET /api/proposal/[kepanitiaanId]/generate`
(`?format=pdf`), `components/proposal/ProposalEditor.tsx`,
`app/(dashboard)/acara/[id]/proposal/page.tsx`; tab Proposal = kartu persentase
+ tautan. `components/tor/BidangDokumen.tsx` (TeksKaya/Teks) kini dipakai TOR & Proposal.

- `proposal.data` = 16 field yang dapat disunting + `asal` (tanda prefill) +
  `manual` (field yang pernah disunting — prefill tak pernah menyentuhnya lagi,
  termasuk bila dikosongkan). Susunan kepanitiaan, anggaran, rincian RAB,
  rundown, Ketua Pelaksana & Ketua Himpunan = tarikan (zod strict menolak).
- Prefill (`terapkanPrefill`, dijalankan setiap muat): TOR (8 field, placeholder
  sama), deskripsi/tujuan/sasaran proker, koordinator divisi bernama
  "*sekretar*" → Sekretaris, proposal terbaru lain di periode yang sama →
  landasan, asas, Ketua BEM, WD III, Kaprodi (pejabat fakultas tanpa akun —
  TEMPLATE_MAPPING Temuan 12; `app_config` belum punya kuncinya).
- Ukuran kontrak 2 = (field bertanda asal & terisi + tarikan yang datanya ada)
  / 23 (16 field + 7 tarikan). TOR lengkap + deskripsi proker → 16/23 = 70%;
  rinciannya tampil di sidebar ("x dari TOR…, y dari data acara & RAB").
- Generate: wajib nama, pengesahan (4 orang), latar belakang, landasan, tujuan,
  sasaran, bentuk acara, sesi, gambaran umum, penutup → selain itu 422
  `details.kurang`. Tanpa gambar TTD (lembar pengesahan ditandatangani basah).
  PDF hanya bila PDF_ENABLED (keys.proposalPdf baru); gagal → DOCX + peringatan.
- Hak = `bisaTulisTor` (RLS proposal_* identik tor_*); dokumen PROPOSAL lewat 044.

- Gate e2e: tunggu auto-save TOR/Proposal/Job desk dinaikkan ke 60 detik — PUT
  pertama di server dev dingin ikut mengompilasi route (>15 detik terukur saat
  dua sesi memakai server yang sama). PUT TOR/Proposal kini cukup cek
  visibilitas lewat `muatAcara`, bukan memuat dokumen penuh.

### T-095 · Generator dokumen TOR (2026-10-16)

`lib/tor/generate.ts` (`petakanTor` murni + `generateTor` + `dokumenTorTerakhir`),
`POST|GET /api/tor/[kepanitiaanId]/generate` (generate / unduh ulang),
tombol "Buat dokumen TOR" + tautan unduh di editor. Migrasi **044**
(`dokumen_insert` + panitia untuk jenis TOR/PROPOSAL) · `015c` skenario 17.
ADR-033 (nama loop template vs kontrak — alias).

- Anggaran ditarik ulang dari RAB setiap generate (`muatTor` → `anggaranTor`);
  gate e2e mengubah rab_item lalu generate ulang → angka di DOCX berubah.
- Bagian kurang → 422 `details.kurang` (sama dengan penghitung editor).
- TTD Ketua Himpunan WAJIB (+ stempel, seperti surat); TTD Ketua Pelaksana
  dipakai bila ada, selain itu ruang kosong (T-049 unggah TTD belum dikerjakan,
  tetapi tabel `signature` + `/api/users/me/signature` sudah ada).
- Dokumen di `dokumen/tor/{id}.docx` (ditimpa); setiap generate menambah baris
  `dokumen` (riwayat). Unduh dialirkan dari bucket privat.
- Rundown ↔ Surat Undangan: `/surat/baru?acara=` kini mengisi `rundown` dari
  tabel `rundown` (`lib/tor/rundown-surat.ts`), juga saat jenis diganti ke
  undangan dan field masih kosong. Surat = salinan saat dibuat (dibekukan saat
  terbit).
- **Flake lama (bukan dari T-095):** `surat-form.spec` "auto-save … draft benar
  tersimpan" — setelah reload `?id=` field perihal kadang kosong; gagal juga di
  baseline tanpa perubahan ini (1 dari 2 jalan). Perlu diselidiki terpisah.

### T-094 · Editor TOR 14 bagian (2026-10-16)

`lib/tor/{schema,service}.ts`, `GET|PUT /api/tor/[kepanitiaanId]`,
`app/(dashboard)/acara/[id]/tor/page.tsx`, `components/tor/{TorEditor,BagianRepeatable,RundownEditor,ParameterKelulusan}.tsx`;
tab TOR di ruang kerja acara kini kartu kelengkapan + tautan editor.
Migrasi **043** (`rundown_delete` + panitia acara) · `015c` skenario 16.

- `tor.data` = bagian 1–10 & 13 saja (zod strict: `anggaran`/`rundown` ditolak).
  Rundown (11) disinkronkan ke tabel `rundown` dengan `id` UUID dari klien
  (auto-save idempoten; baris yang hilang dari daftar dihapus). Rundown hanya
  dikirim bila SEMUA baris valid — baris setengah jadi menahan sinkron, tidak
  menghapus baris lama. Anggaran (12) = `anggaranTor()` (hitungRab atas RAB
  saat ini, dipakai lagi oleh generator T-095); Penandatangan (14) = Ketua
  Pelaksana acara + `bacaKetuaHimpunan`.
- `kelengkapanTor(data, faktaLuar)` = satu-satunya penghitung "x dari 14";
  T-095 memakai `kurang` untuk menolak generate dokumen bolong.
- Nama & Tema TOR baru diisi dari `kepanitiaan.nama_acara/tema` (tidak diketik
  ulang), tetap dapat disunting.
- Hak tulis `bisaTulisTor` = cermin RLS tor_update/rundown_* : Admin/Ketua/Wakil,
  Kadept PIC (RLS: Kadept mana pun — app lebih ketat), panitia acara non-BPH,
  periode berjalan. Matriks PRD §5.1 tidak punya baris TOR; akses baca =
  `muatAcara`.
- Belum ada audit trigger untuk `tor`/`rundown`/`job_desk` — di luar daftar
  §14.1 (014c); auto-save 10 detik akan membanjiri audit_log bila dipasang.

### T-093 · Job Desk & Gantt divisi (2026-10-16)

`lib/acara/job-desk.ts`, `GET|PUT /api/divisi/[id]/job-desk`,
`POST /api/divisi/[id]/gantt`, `components/acara/{JobDeskEditor,DivisiGantt,KontenProsa}.tsx`,
`lib/kepanitiaan/divisi.ts` (`buatDivisiLengkap`).

- Job desk = JSON ProseMirror di `job_desk.konten`, disanitasi allowlist
  notulensi (`sanitasiKonten`) sebelum simpan DAN sebelum render. Tampilan baca
  `KontenProsa` merender JSON tanpa TipTap; TipTap (NotulensiEditor, kini punya
  prop `label`) dimuat `next/dynamic` hanya setelah "Ubah job desk" — gate e2e
  memeriksa tidak ada chunk berisi `ProseMirror-hideselection` sebelum klik.
- Auto-save tiap 10 detik bila ada draf; "Selesai" menyimpan seketika. Hak tulis
  = `bisaTulisDivisi` (T-085); divisi lain tanpa tombol, PUT → 403.
- Gantt divisi = `GanttEditor` T-078 tertanam pada chart DIVISI tertua; chart
  tambahan tampil sebagai tautan. Hak tetap dari `hakChart`, jadi **Sekum/Bendum
  sebagai Ketua Pelaksana menulis job desk tetapi Gantt-nya baca saja** (matriks
  PRD §5.1 `gantt`) — tombol "Buat timeline divisi" memakai
  `bolehBuatChartDivisi` (sama persis dengan `punyaHak gantt.update`).
- Celah yang ditutup: divisi baru dari grid RAB (T-087) / impor Excel (T-091)
  sebelumnya lahir tanpa `job_desk` & `gantt_chart`. Kini semua jalur memakai
  `buatDivisiLengkap` (cermin `bentuk_kepanitiaan()` migrasi 022); divisi lama
  tanpa chart dibuatkan lewat `pastikanChartDivisi`.
- `cross-divisi.spec.ts`: testid `divisi-aksi-tulis` diganti `job-desk-ubah`.
- Catatan gate: `notulensi.spec` "ringkasan kehadiran" sekali gagal di server
  dev dingin, lulus 7/7 saat diulang.

### T-092 · Sheet PEMASUKAN & data peserta (2026-10-16)

`lib/rab/{pemasukan-skema,pemasukan}.ts`, `/api/kepanitiaan/[id]/{pemasukan,peserta}`
(+ `_pemasukan.ts` guard bersama), `components/rab/{PemasukanPanel,PesertaTable}.tsx`
— dipasang di tab RAB di bawah grid.

- Hak: baca = `boleh_rab`; tulis = Admin/Bendum/panitia acara (non-BPH,
  periode aktif); hapus = Admin/Bendum (cermin RLS 015b pemasukan_/peserta_*).
- `ringkasPeserta` satu-satunya rumus ringkasan (panel & server); gate e2e
  mencocokkan ringkasan layar dengan hitungan SQL setelah setiap perubahan.
- Status bayar boolean; centang optimistis, mengisi tanggal hari ini; batal
  centang mengosongkan tanggal (CHECK `peserta_tanggal_konsisten` dicerminkan
  di zod).
- Import peserta via parse-tabel: `kunciUnik: 'nim'` (ganda di berkas =
  peringatan, baris pertama dipakai), NIM terdaftar = DIPERBARUI (impor ulang
  memperbarui status bayar).
- `excel-export.ts` tidak perlu diubah: `dataEksporRab` (T-090) sudah
  menyalurkan "Total Pembayaran {acara}" + sumber dana ke PEMASUKAN dan saldo
  awal PENGELUARAN — dibuktikan gate e2e (unduh & baca sheet).
- Catatan gate rab-grid: ukuran rekalkulasi < 100 ms sesekali melewati batas
  pada dev server dingin/terbebani (terukur 24–46 ms pada jalan normal).

### T-091 · Import Excel (2026-10-16)

`lib/rab/excel-import.ts` (pengurai murni — dipakai juga `scripts/diff-excel.ts`),
`rencanaImpor`/`simpanImpor` di `lib/rab/service.ts`,
`POST /api/rab/[kepanitiaanId]/import` (`mode=pratinjau|simpan`, `manual` =
`{barisExcel: angka}`), `components/rab/ImportRabDialog.tsx` (tombol di StatusRabBar).

- Struktur dikenali dari bentuk (lihat T-090); judul kolom divalidasi terhadap
  varian template; galat menyebut sheet/baris/kolom.
- Jumlah dari rumus ekspor `E*n`/`ROUND(E*n,0)` = angka terkonfirmasi →
  roundtrip ekspor→impor→ekspor identik field per field (gate unit).
- Rencana yang sama untuk pratinjau dan simpan: TAMBAH/UBAH (field yang
  berubah)/SAMA/LEWATI (+alasan: divisi bukan hak, divisi baru tanpa hak tambah,
  baris kosong). Item dicocokkan per nama (tak peka huruf) dalam sub-section;
  impor **tidak pernah menghapus**. Dana tak terduga di berkas hanya informasi.
- RAB terkunci → 409 di pratinjau & simpan (baris rab_meta di-`FOR UPDATE`).

### T-090 · Export Excel 4 sheet (2026-10-16)

`lib/rab/{excel-style,excel-export}.ts` (murni), `dataEksporRab` di
`lib/rab/service.ts`, `GET /api/rab/[kepanitiaanId]/export`, tombol "Unduh
Excel" di StatusRabBar, `scripts/diff-excel.ts`.

- **Gaya diukur dari template, bukan SYSTEM_DESIGN §11.3:** Arial 10 rata
  tengah, garis tipis, isi header `#A4C2F4` (PEMASUKAN `#C0E6F5`/`#83CCEB`).
- **Formula tanpa #VALUE!:** jumlah bulat murni → D angka + `=D*E`; bersatuan →
  D teks asli + `=E*{n}` (pola template F42); pecahan → `=ROUND(E*{n},0)`
  (sama dengan kaliRupiah); manual → nilai statis. Dibuka di **Excel 16
  (COM)**: semua rumus terhitung, 0 sel galat, total = total aplikasi.
- `diff-excel.ts` membaca data dari template, mengekspor ulang, membandingkan
  sheet/lebar/merge/jenis baris: **0 selisih**; inkonsistensi template
  (C45:E45, dst.) dilaporkan terpisah — didokumentasikan RAB_CELL_MAP §5
  temuan 5–9 (divisi tanpa awalan "DIVISI" dikenali dari struktur, baris
  kosong bergaris, divisi tanpa sub-section).
- Sub-section bernama kosong = divisi tanpa sub-section; item kosong = baris
  bergaris tanpa nomor; nomor urut berjalan per DIVISI (PRD F-9.1).
- RAB AKTUAL: item sama, F = realisasi (Σ nota_alokasi nota TERVERIFIKASI)
  dengan catatan sel "Rencana · selisih" — tata letak tidak diubah. T-103
  memperkaya; Dana Tak Terduga aktual menunggu T-104.
- PEMASUKAN: "Total Pembayaran {acara}" (peserta sudah bayar) + baris
  `pemasukan`; T-092 boleh menyempurnakan sumber dananya.

### T-089 · Status & penguncian RAB (2026-10-16)

Migrasi **041_rab_status** (trigger mesin status `rab_meta`) dan
**042_audit_entitas_rab_meta** (fn_audit kini mengisi `entitas_id` =
`kepanitiaan_id` untuk rab_meta — sebelumnya NULL, jejak kunci RAB tak
tertelusuri; baris lama tidak diubah, audit append-only). Keduanya sudah
`db:migrate` ke DB dev. Route `POST /api/rab/[kepanitiaanId]/{submit,lock,unlock}`
(jalur bersama `app/api/rab/_status.ts`), `components/rab/StatusRabBar.tsx`,
`ubahStatusRab` + `majukanStatusRab` di `lib/rab/service.ts`.

- **Trigger 041 berlaku untuk SEMUA koneksi** (termasuk app/postgres): transisi
  hanya DRAFT→DIAJUKAN, DIAJUKAN→DRAFT|DISETUJUI, DISETUJUI→DRAFT|REALISASI,
  REALISASI→SELESAI; kembali ke DRAFT wajib `alasan_buka_kunci` BARU ≥ 10
  karakter. **Fixture/tes yang mengubah status langsung wajib lewat jalur sah**
  (lihat 015c skenario 7/15, rab-grid "RAB terkunci").
- Hak (`hitungIzinStatus`): ajukan = panitia acara/Admin/Bendum; kunci & buka
  = `rab.lock`; kembalikan (DIAJUKAN→DRAFT) = `rab.lock` atau Ketua
  Pelaksana. `/unlock` memilih kembalikan vs buka di dalam transaksi
  (`FOR UPDATE`). Tidak ada jalur paksa untuk Admin.
- **T-102 & T-105 wajib memanggil `majukanStatusRab(tx, id, 'REALISASI'|'SELESAI')`.**
- "Konfirmasi tingkat tinggi" buka kunci = `ConfirmDialog level="reason"`
  (satu-satunya level yang menangkap alasan); tombolnya disabled selama kosong.

### T-088 · Kalkulasi RAB (2026-10-16)

`lib/rab/calculate.ts`: `hitungRab(divisi, dana)` → per item/sub-section/divisi,
`totalDivisi` (tanpa dana), `grandTotal` (+ Dana Tak Terduga, baris terakhir
ringkasan per RAB_CELL_MAP), `itemTanpaJumlah`. Uang = rupiah bulat; jumlah ×
harga lewat BigInt perseratus + pembulatan setengah-ke-atas (`kaliRupiah`);
`bulatkanJumlah` meniru NUMERIC(12,2) Postgres (2,675 → 2,68). `item.ts`
(`totalItem`, `jumlahkan*`) kini membungkusnya → klien = server.

- PATCH item menerima `total_klien` (tak disimpan); jawaban memuat
  `diverifikasi { total_klien, total_server, selisih }` dan grid memberi tahu
  bila selisih (INV-27).
- Tes gate bernama `lib/rab/__tests__/rab-calculate.test.ts` (bukan
  `calculate.test.ts` seperti di kontrak) supaya `npm run test -- rab-calculate`
  benar-benar memilihnya.
- **Untuk T-090/T-103/T-104:** pakai `hitungRab`, jangan menjumlahkan sendiri.
- tsconfig target < ES2020: tulis `BigInt(50)`, bukan literal `50n`.

### T-087 · Grid RAB inline-editable (2026-10-16)

`lib/rab/{item,service}.ts`, `components/rab/{RabGrid,RabRow,RabSectionHeader,RabSummary,CurrencyInput,JumlahInput}.tsx`,
`GET/POST /api/kepanitiaan/[id]/rab` (pohon + aksi struktur: TAMBAH/HAPUS_DIVISI,
TAMBAH/UBAH/HAPUS_SECTION, TAMBAH_ITEM), `PATCH/DELETE /api/rab/item/[id]`.
Dipasang di tab RAB `/acara/[id]?tab=rab` dan bagian RAB ruang kerja divisi
(`fokusDivisi`).

- **Satu fungsi aturan item:** `terapkanUbah()` di `lib/rab/item.ts` dipakai
  grid (optimistis, setiap ketikan) DAN server (kebenaran, INV-27). Rupiah =
  integer; total = round(numerik × harga) kecuali `total_manual`. Jumlah butuh
  manual → perkiraan angka pertama sampai pengguna mengisi "jumlah untuk
  perhitungan". **T-088** membuat `hitungRab` lengkap — ganti `jumlahkan*`.
- Simpan saat sel ditinggalkan (blur/Enter/Tab), PATCH berisi field yang
  berubah, diantrekan; aksi struktur menunggu antrean. Esc → nilai tersimpan.
- Hak: item/sub-section = `bisaTulisDivisi` + RAB DRAFT/DIAJUKAN (409
  `RAB_TERKUNCI`); tambah divisi = pimpinan/Kadept PIC/Ketua Pelaksana; hapus
  divisi tanpa Ketua Pelaksana (cermin RLS) dan ditolak bila divisi punya nota.
- "Konfirmasi tingkat sedang" untuk hapus divisi/sub-section ditafsirkan
  `ConfirmDialog level="typed"` (ketik nama) — tidak ada definisi tingkat di
  DESIGN_SYSTEM; hapus item tanpa konfirmasi.
- Grid memberi `data-siap="1"` setelah hydration — test yang mengetik lewat
  event sintetis WAJIB menunggunya (sebelum itu React belum mendengar).
- Rekalkulasi terukur ±20 ms (anggaran 100 ms). Fixture e2e harus konsisten:
  `total` tanpa `total_manual` dihitung ulang grid dari numerik × harga.

### T-085 · Visibilitas cross-divisi (2026-10-16)

Migrasi **039_tulis_divisi** + **040_panitia_koordinator** (sudah diterapkan ke
DB dev lewat `db:migrate`), `lib/kepanitiaan/akses.ts`,
`components/acara/ModeBacaSajaBanner.tsx`.

- **Satu aturan tulis divisi, dua lapis:** SQL `panitia_tulis_divisi()` /
  `tulis_divisi()` ⇄ TS `bisaTulisPanitiaDivisi()` / `bisaTulisDivisi()`.
  Panitia = koordinator, anggota divisi, atau Ketua Pelaksana; periode AKTIF;
  role non-BPH. `tulis_divisi` menambah Admin & Bendum. **Route tulis RAB
  (T-087), job desk (T-093), dan nota (T-101) WAJIB memanggil versi TS** — app
  bypass RLS.
- Celah yang ditutup 039: Ketua Pelaksana ditolak RLS RAB; `gantt_task_update`
  terbuka untuk SEMUA Anggota (kini `gantt_divisi_boleh()` untuk chart DIVISI);
  BPH yang tercatat panitia bisa menulis RAB. 040: koordinator yang tak ada di
  `divisi_member` kini termasuk `my_kepanitiaan()` (dulu tak bisa membaca RAB
  divisinya sendiri).
- Gantt app: chart DIVISI ditulis panitia divisinya / Kadept PIC (role+dept
  sebaris, `kadeptPic`) / Admin-Ketua-Wakil — bukan lagi setiap Anggota
  departemen PIC. `GanttEditor` tidak lagi merender "Tambah task" tanpa izin
  (dulu disabled; INV-30).
- Halaman divisi: `data-mode="tulis|baca"`, banner untuk divisi lain, aksi
  tulis (`divisi-aksi-tulis`) hanya dirender bila boleh.
- Tes DB 014c & 017 dibuat hermetik (menyaring baris ujinya sendiri): audit_log
  nyata kini memuat DELETE kepanitiaan/rab_item dari pembersihan fixture e2e.
- `db:reset` dari kosong untuk 039/040 BELUM dijalankan (butuh izin pemilik).

### T-100 · Kamera & auto-scan dokumen (2026-10-15)

`components/nota/{CameraCapture,ScanPreview,ScanOverlay}.tsx`,
`lib/images/{jscanify-loader,pemindai}.ts`, harness `/qa/kamera`,
`scripts/bench-bundle.ts`, **ADR-032** (baca sebelum menyentuh pemindai).

- Keluaran `CameraCapture.onGunakan`: `{ berkas: Blob, terpindai, sumber }` —
  SATU berkas untuk `processImage` T-097 (`isScanned = terpindai`). T-101 tinggal
  memasangnya di `/keuangan/nota/upload`.
- jscanify + OpenCV.js dari jsDelivr (versi terkunci + SRI), disisipkan saat
  kamera dibuka; loader sendiri lewat `import()`. Gagal muat / tepi tak
  meyakinkan (`lib/images/pemindai.ts`: luas ≥ 20% bingkai, cembung, sisi ≥ 120
  px) → foto apa adanya, tidak memblokir.
- **Jebakan:** `window.cv` adalah Module *thenable* — jangan `await`/`return`
  dari fungsi async (tab membeku). Gate e2e yang memuat CDN wajib
  `extraHTTPHeaders: {}` (header `x-forwarded-for` dari config gagal preflight CORS).
- Gallery tidak memuat OpenCV (kontrak 1: hanya saat kamera dibuka).
- Bundle `/qa/kamera`: 114 KB gzip / 385 KB mentah (anggaran §19.1 dibaca
  gzip). Ukur ulang di rute T-101:
  `MSYS_NO_PATHCONV=1 npx tsx scripts/bench-bundle.ts -- /keuangan/nota/upload`
  (hentikan `next dev` dulu — skrip menimpa `.next`; di Git Bash wajib
  `MSYS_NO_PATHCONV=1` atau `/rute` berubah jadi path Windows).

### T-084 · Ruang kerja acara (2026-10-15)

Baca saja, tanpa migrasi. `lib/acara/service.ts` (`daftarAcara`, `muatAcara`,
`muatDivisi`), `components/acara/{AcaraHeader,TabNav,DivisiCard,RingkasanAcara,BelumTersedia}.tsx`,
halaman `/acara`, `/acara/[id]?tab=…` (8 tab), `/acara/[id]/divisi/[divId]` (6 bagian).

- **Visibilitas** (app bypass RLS): `kepanitiaan.read` tanpa lingkup → semua
  acara periode aktif; Kadept/Anggota → acara departemennya + acara tempat ia
  panitia (cermin `my_kepanitiaan()`). **Angka RAB/nota** hanya untuk `rab.read`
  tanpa lingkup (≈`is_pimpinan()`), Kadept PIC (`R*`), atau panitia; selain itu
  `null` → UI menulis "Terbatas", bukan Rp0. Catatan: RLS `rab_*_select` TIDAK
  memberi Kadept PIC yang bukan panitia — matriks memberi `R*`; app mengikuti
  matriks.
- Tab = `?tab=` (bukan subrute) supaya T-087/T-094/T-096/T-105 bebas memakai
  `/acara/[id]/rab|tor|proposal|lpj` (USER_FLOW §12) — ganti tautan tabnya saat itu.
  Tab yang belum punya fitur memakai `BelumTersedia` (pembungkus klien
  `EmptyState`, karena aksinya wajib `<Button>`).
- Progres = kartu Kanban `divisi_id` berkolom DONE ÷ semua kartu divisi.
- "Buat Surat untuk acara ini" → `/surat/baru?acara=<id>`; halaman surat membaca
  kepanitiaan di server (aturan baca yang sama) dan mengisi `kode_kegiatan`,
  `nama_kegiatan`, `tema_kegiatan` lewat prop baru `SuratForm.isianAwal`.
- Mode baca saja/penjagaan tulis divisi lain = T-085 (belum). Menu sidebar
  "Ruang Kerja Divisi" (`/acara/ruang-kerja`) masih 404 seperti sebelumnya.

### T-108 · Peminjaman ruangan (2026-10-15)

Tanpa migrasi — tabel `ruangan`/`booking_ruangan`, RLS, dan permission `ruangan`
sudah ada sejak 011/015b. `lib/ruangan/{skema,bentrok,service}.ts`,
`app/api/ruangan/{route,[id]/route,booking/route,booking/[id]/route,booking/[id]/surat/route}.ts`,
`components/ruangan/{DaftarRuangan,FormPeminjaman,KalenderBooking,PeringatanBentrok}.tsx`.

- **Bentrok = ruangan + tanggal sama** (USER_FLOW §9.3), jam tidak menyaring;
  irisan jam hanya ditandai "(jam beririsan)". Server menjawab 409 `BENTROK`
  berisi `details.bentrok`; klien mengirim ulang dengan
  `lanjutkan_meski_bentrok: true`. Tidak ada constraint/penolakan (T-030).
- **Hak:** kelola ruangan = `ruangan.update` (ADMIN/SEKUM, cermin RLS
  `ruangan_insert`) — KADEPT `C*` hanya mencatat booking. Hapus booking =
  `ruangan.delete`. "Hapus" ruangan = nonaktifkan (FK booking tanpa CASCADE).
  Halaman terbuka untuk `ruangan.read` ATAU `ruangan.create`; menu disembunyikan
  dari Anggota (`tampil` di Sidebar).
- **Surat 05:** `POST /api/ruangan/booking/[id]/surat` membuat draft
  `PEMINJAMAN_RUANGAN` terisi dari booking (ruangan, kegiatan, hari-tanggal,
  waktu, tempat, tujuan = pengelola) dan **langsung** menautkan
  `booking_ruangan.surat_id` (bukan menunggu terbit — supaya klik kedua membuka
  draft yang sama, bukan draft baru). Nomor tampil di booking begitu
  `nomor_lengkap` terisi; surat DIBATALKAN dianggap tidak tertaut.
- Booking dan bentrok ber-scope periode aktif (INV-08).

### T-083 · Sistem peringatan deadline (2026-10-15)

`lib/deadline.ts` (murni: nomor hari kalender bilangan bulat, 4 tingkat,
teks "Besok"/"3 hari lagi"/"Terlambat 2 hari"), `lib/deadline-config.ts`
(ambang dari `app_config`), `components/shared/{DeadlineBadge,KonteksDeadline}.tsx`.
Dipakai di KanbanCard, ChecklistItem (lewat `KonteksDeadline` di halaman
Kanban), baris "Tenggat" GanttPanel, dan dashboard (`ItemDashboard.deadline`).

- Migrasi 038: `hari_ini_jakarta()` — **pakai ini, bukan CURRENT_DATE** (server
  UTC; 00.00–07.00 WIB masih "kemarin"). Dashboard & cron sudah dialihkan.
  Tabel `deadline_ringkasan` (agregat per departemen, disegarkan cron harian,
  dibaca kartu BPH "Ringkasan seluruh departemen"). `app_config` WAJIB tepat
  5 kunci (test 013) — jangan menaruh agregat di sana.
- `vitest.config.ts` kini `esbuild.jsx = 'automatic'` (komponen tanpa
  `import React` dapat dirender di unit test).
- Kartu "Deadline terdekat" Kadept kini juga memuat yang terlambat.
- **Jebakan lingkungan e2e:** dev server lokal lambat (kompilasi dingin halaman
  15–20 s, Kanban hangat ±6 s). Test dengan anggaran 30 s (kanban, checklist,
  approval link di dashboard-role) gagal acak karena timeout — dibuktikan A/B:
  tanpa perubahan T-083 gagalnya sama. Matikan proses node sisa
  (`Get-CimInstance Win32_Process` berisi `HMIF_Centerpp`) sebelum menjalankan
  ulang; server basi di port 3000 membuat dev baru pindah ke 3001 dan test
  memukul server yang sekarat.

### T-099 · Unduhan master & uji cetak — kode selesai, BLOCKED uji manusia (2026-10-15)

`GET /api/images/[id]/download` (`lib/images/download.ts`): selalu
`master_path`, dikirim apa adanya (uji asap: byte unduhan = byte unggahan),
`attachment` + nama asli tersanitasi, `Cache-Control: private, max-age=3600`.
Hak: pengunggah; pemilik `nota.read` tanpa lingkup (Ketua/Wakil/Sekum/Bendum/
BPH); setelah jadi nota juga Kadept departemen proker, anggota/koordinator
divisi, ketua pelaksana. Tidak berhak → 404 (tak membocorkan). Bukan
`requirePermission('nota.read')` karena Anggota/Kadept hanya punya C.
`components/nota/NotaImage.tsx` hanya `'thumb' | 'preview'` (+ tautan unduh);
URL dari `lib/images/url-gambar.ts`.

- **Pemilik:** jalankan `docs/ai/UJI_CETAK.md` (3 nota fisik → unduh → Word →
  cetak) dan isi tabelnya. Setelah lulus, set T-099 DONE.

### T-098 · Validasi & penyimpanan gambar sisi server (2026-10-15)

`POST /api/images/upload` (form: `master`, `preview`, `thumb`, metadata sumber)
→ `lib/images/{server-validate,strip-metadata,upload}.ts`. Jenis dari magic
bytes (`file-type`), decode penuh dengan sharp (`stats()` + `failOn`), batas
15 MB & dimensi per peran, 30 unggahan/jam/pengguna (hitung tabel `image`),
UUID di key (`keys.notaMaster(uuid, ekstensi)` kini menerima ekstensi).

- **ADR-031:** metadata dibuang pada tingkat byte (APP1/APP13/COM JPEG; chunk
  teks/eXIf PNG; EXIF/XMP WebP) — BUKAN `sharp().withMetadata`, yang selalu
  meng-encode ulang dan melanggar I3. Tag orientasi > 1 ditolak.
- Urutan: validasi → simpan → baca ulang master → record; gagal → seluruh
  berkas dihapus (`Promise.allSettled`), tanpa record. Dibuktikan unit test
  `image-upload` (storage dalam memori) + uji asap API nyata (201/422/403).
- `tasks.json` T-044/T-097/T-086 masih READY padahal sudah ber-commit
  (`3d07af1`, `67b454d`, `fd9223e`) — status lama dari fase paralel.

### T-078 · Editor Gantt empat level (2026-10-15)

`components/gantt/{GanttEditor,TaskForm,ScaleSwitcher,GanttExport,BuatChartDepartemen}.tsx`
memakai `GanttChart` yang SAMA dengan Master Gantt (prop baru `drag`,
`onTaskActivate`, `labelColumnTitle`; konektor FS dari `task.dependsOn`).
`lib/gantt/{skema,service,export-svg}.ts`, `/api/gantt/{[chartId],[chartId]/export,
task/[id],grup/[id],departemen}`. Halaman: `/proker/gantt` (indeks per level —
sebelumnya tautan sidebar mati), `/gantt/[chartId]`, `/departemen/[kode]/gantt`
(buat chart departemen sekali), tombol "Gantt proker" di `/proker/[id]`.
Harness `/qa/gantt-editor?level=&izin=` (mode lokal, tanpa sesi).

- Migrasi 037: `gantt_chart.periode_id` (trigger isi dari proker/kepanitiaan/
  divisi, lalu periode AKTIF), unik satu chart DEPARTEMEN per departemen+periode,
  `gantt_task.chart_id` dijaga trigger (filter realtime `chart_id=eq.`),
  gantt_task & gantt_group masuk publication.
- Hak tulis: matriks `gantt` + panitia acara (anggota/koordinator divisi,
  ketua pelaksana) walau beda departemen — sama dengan RLS `my_kepanitiaan()`.
  Chart periode lain baca saja. Hak aksi dicek sebelum keberadaan (BPH 403).
- **ADR-030: export PNG saja** (keputusan pemilik). PNG 2x digambar ulang dari
  view model, bukan salinan layar. Dicek: disisipkan ke Word A4 landscape
  selebar halaman ≈ 259 dpi, label terbaca. Uji cetak fisik tetap baik
  dilakukan pemilik.
- `gantt-editor-data.spec.ts` hanya desktop (chart departemen = state global).
- **Jebakan e2e:** batas login 5×/15 menit per email+IP. Menjalankan ulang
  `master-gantt` (8 login) beberapa kali berturut-turut membuat login gagal
  dan test tampak rusak — tunggu 15 menit. `gantt-perf` "baseline tidak
  terukur" sudah gagal SEBELUM T-078 (diuji dengan kode chart lama).

### T-082 · Kendala departemen (2026-10-15)

`/departemen/kendala` (semua dalam lingkup + cari arsip lintas periode),
`/departemen/[kode]/kendala` (daftar + "Lapor kendala"), `/departemen/kendala/[id]`
(detail + utas). `lib/kendala/{skema,service,lampiran,berkas,filter-halaman}.ts`,
`/api/kendala/{,[id],[id]/reply,[id]/lampiran,lampiran/[lampiranId]}`,
`components/kendala/*`. Migrasi 035 (periode_id, updated_at, kolom FTS `cari`
judul+deskripsi+catatan, tabel `kendala_lampiran`, publication realtime) &
036 (trigger updated_at + periode otomatis dari proker).

- Hak: Ketua/Wakil/Admin ubah semua; Sekum/Bendum/BPH BACA saja (tak bisa
  membalas — hak balas = `kendala.create`); Kadept/Anggota departemennya.
  Periode lain = arsip baca saja (service `kunci()` menolak).
- Mention: token `@[Nama](uuid)` di teks; `MentionInput` hanya mengubah nama
  yang DIPILIH dari saran menjadi token. Tidak ada notifikasi (di luar MVP).
- Realtime Kritis: `components/dashboard/PantauKendalaKritis.tsx` dipasang di
  dashboard untuk KETUA/WAKIL/BPH/ADMIN → `router.refresh()` (debounce 250 ms).
- Tanggal dari SQL harus ISO (`to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
  `::text` timestamptz ditolak `format-tanggal`.
- Lampiran: bucket privat `kendala/{id}/{lid}.{ext}`, maks 5 MB & 10/kendala,
  dicek magic bytes (PNG/JPG/WEBP/PDF/DOCX/XLSX).
- Gate `kendala` 5/5 desktop + 5/5 mobile. `dashboard-role` dapat gagal di
  jalan pertama karena kompilasi dingin `/` (> 15 s) — hangatkan server dulu.

### T-107 · Data Pengurus (2026-10-15)

`/sekretariat/pengurus` (`components/pengurus/{PengurusTable,FormPengurusDialog,
ImportPengurusDialog,PilihUntukSurat}.tsx`), `lib/pengurus/{skema,service}.ts`,
`/api/pengurus/{,[id],import,export}`. Import CSV/XLSX memakai `parse-tabel`
+ `ImportPreview` T-048: pemetaan → pratinjau → simpan dalam SATU transaksi.
NIM yang sudah ada dicentang lewati bawaan; menghapus centang MEMPERBARUI
(tak pernah menabrak unik periode+NIM). Tidak membuat akun; baris ber-NIM
akun pengguna ditautkan `user_id`. Pilih banyak → "Buat Surat Aktif" →
`/surat/massal?pilih=`. Kadept/Anggota hanya departemennya.

- **DB dev berisi 30 pengurus CONTOH** (nama "(Contoh)", NIM `980000xxxx`,
  `scripts/seed-pengurus-contoh.ts`, hapus dengan `--hapus`). Data asli
  diimpor pemilik.
- ADR-052 → tidak diperlukan (single agent).

Gate: `data-pengurus` 10/10 (desktop + mobile), unit `skema-pengurus` 6.

### T-062 lanjutan · Gotenberg siap dipasang pemilik (2026-10-15)

Keputusan pemilik: PDF surat lewat **Gotenberg di Render Free**. Ditambahkan
basic auth (`GOTENBERG_USERNAME`/`GOTENBERG_PASSWORD`), `scripts/cek-pdf.ts`
(uji konverter + lapisan teks), `POST /api/surat/[id]/pdf` + tombol **Buat PDF**
di detail arsip (untuk surat yang terbit saat layanan tidur). Panduan langkah
demi langkah: **`docs/ai/GOTENBERG_SETUP.md`**. T-062 tetap BLOCKED sampai
pemilik menyelesaikan langkah 5 panduan itu.

### T-064 · generate massal Surat Keterangan Aktif (2026-10-15)

`/surat/massal` (`components/surat/SuratMassal.tsx`), `POST/GET
/api/surat/batch`, `lib/surat/batch.ts`. Migrasi **034**: `surat.batch_id`.
Sekum memilih pengurus + satu keperluan → N surat dibuat & diajukan dalam
SATU transaksi (validasi jalur `simpanDraft`, K-04). Approver menyetujui satu
batch dalam SATU request: `alokasi_nomor_batch` satu transaksi (nomor urut
nama, tanpa disela), lalu generate per dokumen dengan progres NDJSON
di-stream; yang gagal tetap bernomor → "Terbitkan ulang yang gagal". ZIP
`{nomor}-{nama}.docx` lewat `GET /api/surat/batch?batch=`.

- **Sumber = tabel `pengurus` (T-107), saat ini 0 baris** — halaman menampilkan
  empty state. Gate menyuntik 30 pengurus uji. Tidak ada fallback ke app_user.
- Surat batch MENUNGGU tidak muncul di antrian approval satuan dan ditolak
  `setujuiSurat` (409) — nomornya akan disela. Antrian menautkan ke /surat/massal.
- Cache TTD+stempel per versi tanda tangan (`generator.ts`), ZIP unduh paralel 6,
  `withAuditContext(..., { timeout })` baru untuk transaksi massal (bawaan 5 dtk
  terlewati: 30 draft ±5,2 dtk ke DB jarak jauh).
- Diperiksa di Word: 30/30 DOCX dari ZIP terbuka, masing-masing 1 halaman.
- Kegagalan SEBAGIAN diuji unit (`batch.test.ts`, penerbit tiruan); e2e
  menguji gagal-semua (TTD dihapus) → terbit ulang.

Gate: `surat-massal` 4 (desktop; mobile skip — data global), `surat-approval`
9+3, `arsip-surat` 9+1, `surat-form` 18, `surat-preview` 8 (sendirian;
latensi < 300 ms sensitif beban CPU), `verify` 816, `db:test` 32/32.

### T-063 · Arsip surat (2026-10-15)

`/surat` (route group `(arsip)` + `loading.tsx` skeleton + `layout.tsx`
penjaga akses) dan `/surat/[id]` (rincian, unduh ulang DOCX/PDF, pratinjau
dengan nomor final, tombol **Batalkan** untuk Ketua/Wakil/Sekum).
`GET /api/surat` (kursor 50 baris; `?format=xlsx` export). Service
`lib/surat/arsip.ts`; skema filter client-safe `lib/surat/filter-arsip.ts`
(satu skema untuk URL, API, export — K-04). Migrasi **033**: kolom tergenerasi
`surat.cari` (perihal/nomor A, tujuan B, isi HTML + NILAI data_dinamis C).

- Draft & DITOLAK hanya terlihat pembuatnya; Kadept hanya departemennya;
  periode lain boleh dibuka (baca saja). DIBATALKAN selalu tampil + badge.
- Filter "kegiatan" = `kode_kegiatan` di nomor (mis. KT2HMIF), bukan
  `kepanitiaan_id` — form surat belum mengisi kepanitiaan.
- Bug yang ditangkap gate: kursor memuat `created_at::text` Postgres, dan
  `Date.parse` menolak offset `+00` → halaman 2 mengulang halaman 1.

Gate: `arsip-surat` 9 + 1 skip, `surat-approval`/`surat-form`/`surat-preview`
35 + 3 skip, `verify` 811, `db:test` 32/32.

### T-061 lanjutan · tanda tangan Ketua sungguhan (2026-10-15)

Pemilik (Dimas Panca Pamungkas, Ketua Himpunan) mengirim tanda tangannya.
Generator disetel ulang dengannya — `rapikanTtd` (latar putih → transparan,
pangkas margin), ukuran 180×90 px, dua tambatan `{%ttd}`/`{%ttd_nama}`
(ADR-029 bagian "Penyesuaian"). Diperiksa di Word: 8 template, nama tak
tertimpa, jabatan tak tertimpa. Ikut diperbaiki: halaman kosong Undangan
Pemateri dan butir kosong lampiran Aspirasi. Template 02/03/04-pemateri → v3.

- **Berkas tanda tangan TIDAK disimpan di repo maupun di DB** — itu data
  pribadi, dan DB dev belum punya akun Dimas (satu-satunya KETUA = akun uji
  `e2e-aktif`, yang tanda tangannya ditimpa gate e2e). Agar surat sungguhan
  memakai tanda tangan ini: Admin mengundang akun Dimas dengan role KETUA,
  lalu Dimas mengunggahnya sendiri di `/profil`. Catatan: penandatangan =
  KETUA PALING AWAL didaftarkan di periode (`bacaPenandatanganKetua`).

### T-062 · konversi PDF — KODE SAJA, status BLOCKED (2026-10-15)

`lib/documents/pdf-converter.ts`: `docxToPdf()` (Gotenberg → soffice →
fallback HTML hanya bila `PDF_FALLBACK_HTML=true`, dan fallback itu sendiri
belum dipasang → penolakan jelas), `periksaPdfBerteks()` menolak PDF raster.
Generator membuat PDF bila `format_output` PDF/BOTH; gagal/dimatikan → tetap
TERBIT sebagai DOCX + peringatan "PDF belum tersedia". Unduh
`?format=pdf` → 409 `PDF_NONAKTIF` saat flag mati.

**Sesuai keputusan pemilik: tidak ditandai DONE.** `tasks.json` = BLOCKED +
`blocked_reason`. Langkah mengaktifkan PDF (manusia): ADR-010 bagian
"Status nyata" — pasang Gotenberg/LibreOffice, uji satu surat BOTH, pastikan
teks PDF dapat diseleksi & kop utuh, baru `PDF_ENABLED=true` di produksi.

Gate: unit `pdf-converter` 14/14, `verify` 801, `surat-approval` (+ cek
`?format=pdf` → 409) dan `surat-form` 27 lulus + 3 skip.

### T-061 · Document Engine DOCX (2026-10-15)

`lib/documents/`: `docx-engine.ts` (`renderDocx` — placeholder tanpa data =
`GalatTemplate`, bukan "undefined"), `data-mapper.ts` (`petakanSurat`,
`paragrafDariIsiHtml`), `image-module.ts` (modul gambar sendiri +
`gabungTtdStempel`), `template-loader.ts` (storage + cache memori).
`lib/surat/generator.ts` kini sungguhan; `terbitkanSurat(request, konteks, id)`
mencatat baris `dokumen` + TERBIT dalam satu transaksi beraudit.
`GET /api/surat/[id]/download` (`lib/surat/unduh.ts`). Tombol "Unduh DOCX" di
hasil approval. Keputusan lengkap: **ADR-029**.

- **Template surat memuat tanda tangan & stempel ASLI orang lain** (sisa
  T-006) — kini dibuang saat build (`hapusGambar`). Ketujuh template naik versi
  (02–05 → v2, 08 → v3) dan sudah diunggah; `surat-umum_v1.docx` dan
  `aset/stempel-hmif.png` juga. `upload-templates --kering` → 13 TETAP.
- Versi template ditetapkan saat **disetujui** (`pasangTemplateAktif`), jadi
  draft lama yang menunjuk v1 tidak akan pernah di-generate dari v1.
- **Ketua tanpa tanda tangan → generate gagal** (DISETUJUI + peringatan).
  Unggah di `/profil` lalu "Terbitkan ulang". Akun e2e Ketua kini punya
  tanda tangan dummy dari gate.
- Tag gambar wajib di AKHIR run-nya (`{nama}{%ttd}`) — teks sesudahnya
  kehilangan format. Dikunci test.
- Diperbaiki: `storage.get()` ke bucket publik selalu gagal "Bucket not found"
  sejak T-044 (lihat jebakan #8). Keterangan Aktif tak lagi dua halaman.
- **Pemeriksaan Word manual sudah dijalankan** lewat Word 16 COM (lihat
  jebakan #9) — menemukan dan memperbaiki satu korupsi sungguhan (Default png
  ganda). Pemilik tetap disarankan membuka satu surat terbit di Word sendiri.

Gate: unit `docx-engine` 26/26 (11 jenis × template sungguhan),
`template-dryrun` 12/12, `surat-approval` 9 lulus + 3 skip (test tanda tangan
hanya di project desktop — keadaan global), `surat-form` + `surat-preview`
26/26, `verify` hijau.

### T-060 · alur approval surat (2026-10-15)

`lib/surat/status.ts`: `TRANSISI` (state machine USER_FLOW §11.2),
`ajukanSurat` (pembuat + skema lengkap), `setujuiSurat` (baris dikunci
`FOR UPDATE` → `alokasiNomor`), `terbitkanSurat` (transaksi TERPISAH sesudah
commit), `tolakSurat` / `batalkanSurat` (alasan ≥ 5 karakter),
`daftarAntrianSurat`. Route `api/surat/[id]/{submit,approve,reject,cancel}`.
Halaman `surat/approval` (daftar kiri + pratinjau & aksi kanan) dengan
`SegarkanBerkala` (router.refresh tiap 10 dtk & saat tab difokus).

- **`lib/surat/generator.ts` masih stub** yang selalu gagal — semua surat
  disetujui berhenti di DISETUJUI dengan peringatan, nomor tetap sah. T-061
  tinggal mengisi `generateDokumenSurat(id)`; tombol "Terbitkan ulang"
  (`{terbitkanUlang:true}`) sudah ada.
- Approver kedua yang terlambat mendapat 409 "sudah disetujui oleh X dengan
  nomor Y", bukan nomor kedua.
- `muatSurat()` (draft.ts) = pemuat tanpa cek kepemilikan untuk approver;
  `detailDraft()` = milik pembuat. DITOLAK boleh disunting pembuat → DRAFT.
- Migrasi **030** (diajukan_at, kolom pembatalan), **031** (diajukan_at
  diisi trigger — CHECK 030 mematahkan 7 test SQL), **032** (alasan batal
  wajib hanya untuk surat bernomor). **Pelajaran: constraint baru pada tabel
  yang sudah dipakai → jalankan SELURUH `db:test` dan stress T-057.**
- Bug T-058 yang ditemukan di sini: Keterangan Aktif tak pernah dapat
  diajukan (tujuan tersembunyi `-` terbaca preset "Lainnya" saat dimuat).
  Field umum tak terpakai kini selalu dari default.
- Belum ada UI untuk membatalkan surat TERBIT — API siap, tombolnya di arsip
  T-063.

Gate: `surat-approval` 10/10 (desktop + mobile), `db:test` 31/31.

### T-059 · pratinjau surat langsung (2026-10-15)

`lib/surat/render-preview.ts` (murni): `susunPratinjau(nilai, konfig, ketua)`
→ model surat; segmen kosong berlabel, isi surat lewat `sanitasiIsiHtml`.
`components/surat/SuratPreview.tsx`: kertas A4 794×1123 px diskala ke lebar
panel (ResizeObserver), garis batas halaman, kop UNTIRTA + HMIF
(`public/kop/`), nomor lewat `NomorSuratBadge` sementara. Isi kertas
`React.memo` — form re-render tiap ketikan. Kertas disembunyikan sampai
skalanya terukur (HTML server belum tahu lebar panel). Ketua Himpunan untuk
kolom kanan dari `bacaKetuaHimpunan(periodeId)`.

Keputusan:
- **Debounce 200 ms, bukan 250** — render kertas ±45–75 ms di dev server;
  terukur 249–265 ms dari ketikan terakhir (desktop + mobile).
- **`formatTanggalSurat()`** (`lib/utils/format-tanggal.ts`) = "02 Agustus
  2025" tanpa nama hari. **T-061 wajib memakainya untuk
  `{tanggal_surat_format}`** supaya DOCX = pratinjau.
- Test membandingkan kalimat baku pratinjau dengan teks `templates/*.docx`
  (dibuktikan lewat mutasi). Mengubah resep template kini wajib diikuti
  `render-preview.ts`.

Ditemukan & diperbaiki: template Kerja Sama berbunyi "panitia AKSARA" untuk
semua surat (sisa T-006). Resep diperbaiki, template naik ke **v2**
(v1 nonaktif) — jalur VERSI_BARU T-055 terpakai sungguhan pertama kali.
Catatan: `build-templates.ts` mengubah kesebelas `.docx` meski isinya sama
(stempel waktu zip) — **commit hanya berkas yang memang berubah**, kalau
tidak skrip unggah membuat versi baru palsu untuk semuanya.

Gate: `surat-preview` 8/8, `surat-form` 18/18. Temuan Aspirasi→DPM di BACKLOG.

### T-058 · form surat dinamis (2026-10-14)

Halaman `app/(dashboard)/surat/baru` (`?id=` lanjutkan draft, `?jenis=`
jenis awal) → `components/surat/SuratForm.tsx` (60/40, pratinjau kanan
masih kerangka + `NomorSuratBadge` sementara — isinya T-059),
`FieldRenderer.tsx` (render dari `serialisasiFieldSchema`; daftar berulang
dengan tambah/naik/turun/hapus), `IsiSuratEditor.tsx` (TipTap: paragraf,
tebal, miring, daftar saja). API `POST /api/surat` + `GET/PATCH
/api/surat/[id]` → `lib/surat/draft.ts`. Auto-save tiap 10 dtk dan saat
fokus keluar form, hanya bila ada perubahan; id draft dipasang ke URL lewat
`history.replaceState` (bukan router, supaya form tak di-render ulang).

Keputusan (ADR-028):
- Migrasi **029**: `surat.template_id` boleh NULL hanya untuk kode generik
  01/06/07/09. Prisma diperbarui (`template_id String?`).
- Draft disimpan lewat `SkemaDraftSurat` (tipe & ukuran saja);
  kelengkapan tetap `periksaKelengkapan()` dari skema penuh.
- Isi surat: allowlist 7 tag tanpa atribut (`lib/surat/isi-html.ts`), dan
  "wajib" dinilai dari teks (`<p></p>` = kosong).
- **Ajukan masih sementara**: menyimpan draft lengkap + toast. T-060 wajib
  menggantinya dengan route submit dan menolak yang belum lolos skema penuh.

Gate: `surat-form` 18/18 (desktop + mobile). Unit 3 berkas baru/ubah.
Template untuk 4 kode generik belum ada — lihat BACKLOG.

### T-057 · uji konkurensi penomoran (2026-10-14)

`scripts/stress-nomor-surat.ts`: 50 klien terpisah lewat transaction pooler
(DATABASE_URL — jalur produksi), barrier sesudah koneksi hidup, tumpang tindih
transaksi diukur. Hasil: 50/50 tumpang tindih → 50 nomor unik berurutan
(1,8 dtk); batch 30 berurutan mengikuti urutan larik; draft dibatalkan tidak
menaikkan counter; 10 retry serentak pada surat sama → satu nomor. 21/21.
Data uji `T057` di periode PERSIAPAN, dibersihkan, counter periode AKTIF
diverifikasi tak tersentuh. **Jangan pernah memanggil `aktifkan_periode` dari
skrip yang meng-commit data** — ia mengarsipkan periode aktif.

Bukan 50 sesi backend: `max_connections = 60`, ±15 dipakai layanan Supabase;
barrier yang menunggu 50 transaksi terbuka di session pooler akan macet.

`supabase/tests/020_nomor_konkuren.sql`: advisory lock dipasang (kunci surat
seed 0 ≠ kunci proker seed 1), counter antar-periode terpisah, nomor terbit
lalu dibatalkan tidak didaur ulang, batch semua-atau-tidak, index unik menolak
nomor kembar, counter tak bisa negatif. Dibuktikan lewat mutasi (lock dihapus
→ test gagal). INV-15 di DB_TEST_MATRIX kini **TERBUKTI**.

### T-056 · service nomor surat (2026-10-14)

`lib/surat/nomor.ts` (aman untuk klien — tx disuntikkan pemanggil):
`previewNomor()` → `05/???/UN43.3.7/HMIF/X/2026` (bulan/tahun dibaca dari
string tanggal, bukan `Date`, supaya tidak bergeser zona waktu);
`alokasiNomor(tx, konteks, suratId)` dan `alokasiNomorBatch(...)` (maks 50)
hanya memanggil `alokasi_nomor_surat` / `alokasi_nomor_batch` (INV-15).
Approver = `konteks.sesi.userId`, surat periode lain = TIDAK_DITEMUKAN,
sudah bernomor = nomor yang sama (retry). `components/surat/NomorSuratBadge.tsx`
+ `salinNomor()`: badge sementara (ikon jam, teks tertulis, tidak dapat
disalin) vs final (mono, ikon centang, tombol salin). Badge final butuh
`ToastProvider`. Test 24 baru.

Signature berbeda dari kontrak (`alokasiNomor(suratId, approverId)`): tx dan
konteks wajib karena alokasi harus satu transaksi dengan transisi status di
route T-060 (K-09), dan approver tidak boleh datang dari parameter (INV-02).

Ditemukan: `lpad` di `alokasi_nomor_surat` memotong nomor urut ≥ 1000 —
dicatat di BACKLOG, belum mendesak.

### T-055 · registrasi template surat (2026-10-14)

`scripts/upload-templates.ts` (+ `--kering`) mengunggah 11 `.docx` ke
`template/{slug}_v{n}.docx` di bucket privat dan mengisi 7 baris
`surat_template` (`storage_key` + `field_schema`). Sudah dijalankan dua kali
terhadap DB dev: jalan 1 = 7 ADOPSI + 4 UNGGAH, jalan 2 = 11 TETAP.
`lib/surat/template-registry.ts`: perencanaan murni (`rencanakanSurat`,
`rencanakanDokumen`) + pembaca runtime `templateAktif(jenis)` /
`templateById(id)`. Test 16 baru.

Keputusan (ADR-027): 4 template dokumen acara (TOR, Proposal, LPJ, Notulensi)
diunggah tetapi **tidak** masuk `surat_template` — versinya konstanta di
`TEMPLATE_DOKUMEN`. Seed 018 tidak disunting (runner migrasi menolak berkas
yang berubah setelah diterapkan). `serialisasiFieldSchema` kini tanpa argumen
`konfig`, karena `field_schema` tidak boleh bergantung pada konfigurasi.

### T-054 · skema field per jenis surat (2026-10-14)

Rantai surat dimulai atas permintaan pemilik produk — penundaan ADR-025
berakhir. `lib/surat/field-schemas.ts` (pabrik `buatSkemaSurat(konfig)`,
diskriminator `jenis` untuk 11 jenis: 7 varian bertemplate + 4 kode generik),
`lib/surat/preset-tujuan.ts` (6 preset, `terapkanPreset`), dan
`lib/surat/konfig.ts` (server-only: `bacaKonfigSurat()` dari `app_config` +
`PDF_ENABLED`, `bacaPresetTujuan()` dari tabel). Test 44/44.

Keputusan penting (ADR-026):
- Nama field `data_dinamis` = nama placeholder template, bukan nama PRD F-4.2.
  Test mencocokkannya **dua arah** dengan tag tiap `.docx` — mengganti nama
  placeholder di `build-templates.ts` kini wajib diikuti skema.
- Skema berbentuk pabrik karena default (`kode_kegiatan`, `kota`) dan opsi PDF
  datang dari server. Halaman T-058 memanggil `bacaKonfigSurat()` lalu
  meneruskan hasilnya sebagai props; route T-058 memanggil pabrik yang sama.
- `serialisasiFieldSchema(konfig, jenis)` adalah isi `field_schema` untuk
  T-055; membawa kunci baru `tetap` (mis. `label_kanan`).
- Penandatangan tambahan paling banyak satu (kolom KIRI, ADR-021).
- Belum dikonfirmasi: redaksi 6 preset tujuan ke Sekum (SEED_DATA §4).

### T-048 · import massal pengguna (2026-09-27)

Kontrak batch ADR-054 dibangun: `lib/auth/import-pengguna.ts` (pratinjau hanya
SELECT; simpan per baris dengan laporan berhasil/gagal/dilewati), route
`api/users/bulk-import` (multipart, mode pratinjau|simpan), komponen generik
`components/shared/ImportPreview.tsx` (pemetaan kolom, ringkasan, lewati per
baris, unduh laporan) — **siap dipakai ulang T-092 dan T-107** — dan
`DialogImportPengguna` di halaman Admin. Keputusan penting: **parsial per
baris, bukan atomik** (akun Supabase Auth tak bisa di-rollback transaksi
Postgres); konfirmasi mengirim ulang berkas, bukan data baris.

### T-047 UI · undangan & manajemen pengguna (2026-09-27)

Halaman `admin/pengguna` (tabel + saring, dialog undang dengan tautan
sekali-tampil, dialog ubah, nonaktif/aktifkan kembali), halaman publik
`undangan/[token]`, route `api/users/{,invite,[id]}` dan `api/auth/activate`.
Gate `undangan` 26/26. Blocker ADR-053 ternyata sudah terselesaikan oleh
`99a361e`; catatan penerapan ditambahkan di ADR itu.

Perubahan di lapisan data:
- Skema dipindah ke `lib/auth/skema-pengguna.ts` (aman untuk klien, K-04).
- `SkemaUbahPengguna` kini memeriksa aturan peran yang sama dengan undangan —
  sebelumnya KADEPT tanpa departemen lolos skema lalu jatuh 500 di CHECK DB.
- `ubahPengguna` menolak menonaktifkan akun sendiri.
- `daftarPenggunaTerlingkup` menegakkan `user: R*` untuk KADEPT/ANGGOTA.

Celah yang dicatat di BACKLOG: **undang ulang** untuk undangan kedaluwarsa belum
ada — pengguna seperti itu buntu.

### T-106 UI · notulensi rapat (2026-09-27)

Routes `app/api/notulensi/**` (daftar/buat, detail/ubah, pengurus, action item
tambah/hapus/konversi, generate DOCX), halaman `app/(dashboard)/sekretariat/
notulensi/{page,baru,[id]}`, komponen `components/notulensi/*` (editor TipTap,
daftar hadir, keputusan, action item, form). Gate `notulensi` 14/14.

Keputusan yang lahir di sini (ADR-025):
- T-106 dikerjakan mendahului T-061 atas persetujuan pemilik produk; pengecualian
  **tidak** berlaku untuk task surat/dokumen lain.
- Lingkup baca notulensi (`R*`/`CRU*`) kini ditegakkan di service.
- Skema Zod notulensi pindah ke `lib/notulensi/skema.ts` (aman untuk klien).

Sisa di luar kontrak (hapus notulensi, lampiran, pengetatan RLS SELECT) →
`docs/ai/BACKLOG.md`.

### T-106 · fondasi data notulensi

Commit `b30f61d`. 11 file dibuat/diubah, 1646 baris ditambah.

- `supabase/migrations/027_notulensi.sql` — kolom `konten_teks` + `cari_tsv`
  (tsvector STORED) untuk pencarian isi; tabel `notulensi_lampiran`; kolom
  `action_item.departemen_id`; helper `notulensi_boleh_tulis`; RLS attendance/
  action_item/lampiran/notulensi berlingkup periode+departemen dari notulensi
  induk.
- `lib/notulensi/service.ts` — daftar/detail/pencarian isi, buat & perbarui
  transaksional, daftar hadir, keputusan terpisah, action item, konversi ke
  Kanban (lock `FOR UPDATE`, anti-duplikasi), generate DOCX. Lingkup dipaksakan
  di service.
- `lib/notulensi/sanitasi.ts` — allowlist TipTap JSON (node/mark aman, href
  aman) + ekstraksi teks pencarian.
- `lib/notulensi/docx.ts` — generate DOCX dari `templates/notulensi.docx`
  (docxtemplater + pizzip).
- `docs/ai/NOTULENSI_CONTRACT.md` — bentuk data, kode→HTTP, izin per role,
  data-testid wajib.
- `e2e/notulensi.spec.ts` — gate data-owned 8 skenario, skip-until-UI.
- `supabase/tests/027_notulensi.sql` — RLS negatif: lintas-departemen, BPH,
  periode bertentangan, multi-role sah, himpunan hanya pimpinan/Sekum.
- `lib/notulensi/__tests__/notulensi.test.ts` — unit sanitasi/ekstraksi/skema/
  lingkup (12 test).
- `package.json` — tambah `@tiptap/extension-{table,-row,-cell,-header,
  task-list,task-item}@3.31.0` (pin exact karena peer-dep ke `@tiptap/core`).

---

## 3. Blocker aktif

1. **[SELESAI 2026-10-15] Rantai surat T-054…T-064.** Semua DONE kecuali
   T-062 (kode siap, BLOCKED menunggu Gotenberg — ADR-010). Yang tadinya
   menunggu rantai ini kini dapat dikerjakan: T-095 (TOR), T-096 (Proposal),
   T-105 (LPJ), T-107 bagian surat massal, T-108 (Peminjaman ruangan).
   Yang menunggu rantai ini: T-063, T-064, T-095 (TOR), T-096 (Proposal),
   T-105 (LPJ), T-108 (Peminjaman ruangan), dan T-113…T-116.
2. **[SELESAI 2026-10-15] Daftar hadir notulensi** kini terisi dari Data
   Pengurus (T-107). Saat ini berisi 30 pengurus contoh.
3. **[DIPERBAIKI 2026-09-27 — migrasi 028 + `withAuditContext(req, pelaku, fn)`; `db:reset` dari kosong BELUM dijalankan]** `audit_log.user_id` selalu NULL untuk mutasi aplikasi (INV-07).
   Ditemukan 2026-09-27: `fn_audit` membaca pelaku dari `auth.uid()`, tetapi
   `withAuditContext` hanya menyetel `app.ip`/`user_agent`/`periode_id`. Semua
   baris audit trigger (proker, app_user, user_role, periode) tanpa pelaku.
   Butuh migrasi `konteks_user_id()` + `set_config('app.user_id')` di
   `withAuditContext` + ubah semua pemanggil. Sudah diajukan sebagai task
   terpisah.
4. **Pola blocker lama "menunggu lane lain".** Banyak task (T-078, T-082, T-107…)
   ditandai blocked di era dua-lane karena satu sisi menunggu sisi lain. Di mode
   single-agent periksa ulang: sering kali blocker-nya sudah hilang (seperti
   ADR-053).

---

5. **[DITEMUKAN 2026-10-14] Gate `command-palette` gagal 10–13 test, sudah
   sejak sebelum T-058.** Dibuktikan dengan menjalankan spec yang sama pada
   commit `796c449` (T-057) lewat stash: 10 dari 14 gagal di desktop. Pola
   galatnya sama: `waiting for "http://localhost:3000/" navigation to
   finish` lalu `command-palette` tidak muncul dalam 5 dtk — beranda (Master
   Gantt) belum selesai dimuat saat pintasan ditekan. Belum diselidiki apakah
   penyebabnya beranda yang lambat di dev server atau test yang terlalu cepat.

## 4. Jebakan lingkungan yang sudah ditemukan

Empat belas hal yang tidak obvious dari kode:

0. **Node 22 wajib (`.nvmrc`, `engines.node >=22`).** Di Node 20, 6 test
   storage gagal palsu ("native WebSocket not found", `markAsUncloneable is not
   a function`) — bukan bug kode. Ditemukan 2026-10-14 di mesin yang PATH-nya
   mendahulukan Node 20.

1. **Koneksi app bypass RLS.** `withAuditContext()` set audit config
   (`app.ip`/`user_agent`/`periode_id`) tapi **tidak** set
   `request.jwt.claims`, jadi service **harus** memaksakan lingkup di JS. RLS
   menjaga akses langsung/authenticated saja (diuji `db:test` dengan
   `SET LOCAL ROLE authenticated`).
2. **RLS scope correlation.** Role+departemen harus di baris `user_role` yang
   **sama** — bukan pakai `my_departemen()` set yang mencampur role
   (BPH-with-dept bocor).
3. **`db:reset` menghapus akun e2e dan mengosongkan `field_schema`.** Setelah
   tiap `db:reset`, wajib `npm run seed:e2e-auth` dan
   `npx tsx scripts/upload-templates.ts` sebelum menjalankan test e2e atau
   form surat (ADR-027).
4. **TipTap extension peer-dep exact.** Semua `@tiptap/*` harus sama versi
   `@tiptap/core` (saat ini 3.31.0). `^3.6.2` gagal `ERESOLVE`.
5. **Realtime butuh JWT.** `klien.realtime.setAuth(access_token)` +
   `onAuthStateChange` diperlukan supaya RLS aktif di realtime channel
   (`lib/realtime/use-master-gantt-realtime.ts`).
6. **Gate e2e gagal di jalan pertama pada dev server dingin.** Spec yang
   memuat editor TipTap memakai `timeout: 90_000` (lihat `surat-form`).
   Browser Playwright juga harus cocok versinya: `npx playwright install
   chromium` bila galatnya "Executable doesn't exist". Halaman berat
   (mis. editor TipTap) dikompilasi saat diminta pertama kali dan bisa melewati
   batas 30 dtk/test. Jalankan ulang sekali sebelum menganggapnya bug; kalau
   gagal lagi, itu nyata.
7. **Tombol toolbar editor wajib `onMouseDown={e => e.preventDefault()}`.**
   Tanpa itu tombol mencuri fokus dan TipTap memulihkannya lewat
   `requestAnimationFrame`, yang tak berjalan di tab tak terlihat — teks jatuh di
   luar node yang baru dibuat.
8. **Bucket publik bernama `public` bentrok dengan rute Storage.**
   `download()` supabase-js → `/object/public/{key}` = rute objek publik, yang
   membaca segmen pertama key sebagai nama bucket ("Bucket not found").
   `SupabaseStorageAdapter.get()` kini membaca bucket publik lewat URL
   publiknya. Jangan kembalikan ke `download()`.
9. **Memeriksa DOCX di Word tanpa membukanya manual.** Word 16 terpasang di
   mesin pengembang; dari PowerShell: `$w = New-Object -ComObject
   Word.Application; $d = $w.Documents.Open($path, $false, $true)` — berkas
   korup melempar "The file appears to be corrupted"; `$d.SaveAs2($pdf, 17)`
   menghasilkan PDF untuk dilihat; `$d.ComputeStatistics(2)` = jumlah halaman.
   Selalu `$w.Quit()` di `finally`.
10. **`loading.tsx` membuat `notFound()` di halaman menjadi HTTP 200.** Next
   mulai streaming sebelum halaman berjalan. Penjaga akses halaman yang punya
   skeleton wajib di `layout.tsx` segmennya (lihat `surat/(arsip)/layout.tsx`),
   kalau tidak test `status() === 404` gagal walau isinya halaman 404.
   Jalur gate e2e juga bisa gagal massal karena DNS Supabase putus sesaat
   (`ENOTFOUND ...pooler.supabase.com`) — cek `npm run db:ping` dulu.
11. **Tanda tangan Ketua uji = keadaan global e2e.** `surat-approval` menghapusnya,
   `surat-massal` membutuhkannya. Keduanya memegang advisory lock sesi
   (`e2e/fixtures/kunci-ttd.ts`) di project desktop supaya tidak berjalan
   bersamaan. Spec baru yang menyentuh tanda tangan Ketua WAJIB memakainya.
   `next.config.ts` `onDemandEntries` (1 jam) mencegah dev server
   mengompilasi ulang rute di tengah gate panjang.

12. **Sesi cloud (kontainer tanpa `.env.local`): stack Supabase lokal.**
   Kontainer Claude Code cloud tidak membawa `.env.local`; T-114 diukur pada
   stack lokal. Resepnya (semua di luar repo): jalankan `dockerd`; unduh
   Supabase CLI dari rilis GitHub; `supabase init` di folder scratch, matikan
   studio/inbucket/edge_runtime/analytics dan migrasi/seed bawaan; registri
   ECR menolak (`Data limit exceeded`) → `SUPABASE_INTERNAL_IMAGE_REGISTRY=
   docker.io supabase start`. Kernel kontainer tanpa IPv6, sedangkan Realtime
   v2.57.3 mengikat `socket_opts: [:inet6]` → bangun ulang image
   `supabase/realtime:v2.57.3` lokal dengan `sed` ke `[:inet]`. Skrip proyek
   memakai `ssl: 'require'` → aktifkan SSL Postgres (sertifikat self-signed +
   `ALTER SYSTEM SET ssl = on` sebagai `supabase_admin`). Lalu buat schema
   `extensions` + 3 extension (ENV_SETUP §1.3), bucket `private`/`public`,
   `.env.local` ke `127.0.0.1:54321/54322`, `npm run db:reset`,
   `seed:e2e-auth`, `upload-templates.ts`. Playwright 1.62 meminta Chromium
   build 1234 sedangkan kontainer membawa 1194 → symlink direktori 1234 ke
   biner 1194 (jangan `playwright install`).
13. **`page.evaluate` dari skrip tsx:** esbuild `keepNames` membungkus fungsi
   bernama di dalam callback dengan `__name()` yang tidak ada di browser —
   ReferenceError diam-diam di init script. `bench-all.ts` memasang shim
   `globalThis.__name = (f) => f` per konteks.

---

## 5. Langkah berikutnya (rekomendasi)

Per 2026-10-19 seluruh fitur fase 0–9 sudah berkode. Yang tersisa menunggu
manusia:

1. **Akses push GitHub untuk sesi Claude Code cloud.** Commit T-114/T-116 dibuat
   di cabang `claude/sharp-gates-ngoq4i` tetapi push ditolak 403 ("Claude
   doesn't have GitHub access…"). Pemilik: sambungkan ulang GitHub / instal
   Claude GitHub App pada repo, lalu push cabang itu.
2. **ADR-035** — terima/tolak anggaran JS login "runtime + ≤ 20 KB". Setelah
   diterima: anggaran login di `scripts/bench-all.ts` → 120 KB, T-114 DONE.
3. **Sesi onboarding + UAT** (T-116) memakai `UAT_SKENARIO.md`; isi
   `UAT_HASIL.md`.
4. **T-062** Gotenberg (PDF) dan **T-099** uji cetak nota — tetap menunggu
   pemilik (lihat GOTENBERG_SETUP.md, UJI_CETAK.md).
5. Ukur ulang performa di Vercel staging (`bench-all.ts --url …`) — cold start
   belum tercakup.
6. Perbaiki gate e2e lama yang ditemukan T-114 (lihat bagian T-114 di atas):
   `gantt-editor` "mengganti skala…" dan `login` "keluar mengakhiri sesi".

`tasks.json` tidak bisa dipercaya untuk status task lama (dibekukan selama fase
paralel): cek `git log --oneline | grep " T-0XX"` sebelum menganggap sebuah
dependency DONE. Baca kontrak di `docs/ai/tasks/P{fase}-*.md`.
