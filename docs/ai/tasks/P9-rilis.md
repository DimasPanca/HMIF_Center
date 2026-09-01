# FASE 9 — Backup, Hardening & Rilis (T-110 … T-116)

**Deliverable fase:** sistem siap produksi dengan jaminan pemulihan data, keamanan terverifikasi, performa terukur, dan pengurus yang sudah dilatih.
**Catatan prioritas:** T-110/T-111/T-112 **tidak boleh digeser**. Menghapus backup dari MVP membuat risiko kehilangan data (PRD R11) tanpa mitigasi.

---

### T-110 · Backup tiga lapis
**Fase** 9 · **Butuh** T-044, T-090 · **Baca** PRD F-16.1 · SYSTEM_DESIGN §15.1

**Buat:** `lib/backup/{service,export-modul,manifest,zip-storage}.ts` · `app/api/backup/route.ts` · `app/(dashboard)/admin/backup/page.tsx`
**Ubah:** —

**Kontrak:**
1. Struktur bundel persis PRD F-16.1:
   `manifest.json` · `database/full-dump.sql.gz` · `modules/*.json` (12 berkas) · `exports/rab-{acara}.xlsx` + `daftar-surat.xlsx` · `files/storage-archive.zip`.
2. `manifest.json` memuat: versi skema, waktu, jenis, daftar berkas dengan **ukuran dan checksum SHA-256**, jumlah record per modul.
3. Lapis 1 memakai `pg_dump` (via koneksi langsung); bila binary tidak tersedia di lingkungan serverless, pakai fallback export SQL per tabel dan **catat keterbatasannya di manifest**.
4. Lapis 2: 12 modul sesuai PRD F-16.1 (users, periode, departemen, prokers, gantt, kepanitiaan, rab, nota, surat, notulensi, pengurus, audit-log).
5. Lapis 3: arsip ZIP seluruh berkas storage (`nota/`, `dokumen/`, `ttd/`, `avatar/`).
6. Kegagalan di tengah menandai backup `GAGAL` dengan pesan error, dan **tidak** meninggalkan bundel setengah jadi yang terlihat sukses.
7. Progres backup terlihat di UI Admin.

**Verifikasi:**
```bash
npm run test -- backup-service && npx tsx scripts/verify-backup.ts <backupId>
```

**Selesai bila:**
- [ ] Bundel lengkap sesuai struktur PRD F-16.1
- [ ] Setiap berkas punya checksum di manifest, dan checksum cocok saat diverifikasi ulang
- [ ] Backup yang gagal tidak berstatus SUKSES

**Jangan:** jangan menandai backup sukses sebelum seluruh berkas terverifikasi.

---

### T-111 · Cron backup & retensi
**Fase** 9 · **Butuh** T-110, T-079 · **Baca** PRD F-16.2 · ADR-009, ADR-016

**Buat:** `lib/backup/retensi.ts`
**Ubah:** `app/api/cron/harian/route.ts` · `vercel.json`

**Kontrak:**
1. Cabang **tanggal 1** pada `/api/cron/harian` menjalankan backup bulanan (ADR-009) — tetap satu entri cron.
2. Retensi: simpan **12 backup otomatis terakhir**; backup `MANUAL` dan `PRA_RESTORE` **tidak pernah** dihapus otomatis (ADR-016).
3. Penghapusan menghapus berkas storage **dan** baris `backup`, dicatat di audit log.
4. Rate limit backup manual: 3 per hari.
5. Sinkronisasi ke Google Drive dijalankan hanya bila `GDRIVE_ENABLED=true`; bila gagal, backup tetap dianggap sukses di Supabase Storage dan kegagalan sinkronisasi dicatat sebagai peringatan.

**Verifikasi:**
```bash
npm run test -- backup-retensi
```

**Selesai bila:**
- [ ] Simulasi 15 backup otomatis menyisakan 12 yang terbaru
- [ ] Backup manual tidak ikut terhapus
- [ ] Cron terpicu hanya dengan `CRON_SECRET` yang benar

**Jangan:** jangan menghapus backup pra-restore.

---

### T-112 · Restore & import per modul
**Fase** 9 · **Butuh** T-110 · **Baca** PRD F-16.3 · SYSTEM_DESIGN §15.3 · USER_FLOW §10.2

**Buat:** `lib/backup/{restore,import-modul}.ts` · `app/api/backup/[id]/restore/route.ts` · `components/backup/{RestoreDialog,ImportModulDialog,ProgresRestore}.tsx`
**Ubah:** `app/(dashboard)/admin/backup/page.tsx`

**Kontrak:**
1. **Backup pra-restore wajib** dijalankan lebih dulu, tanpa opsi dilewati (safety net).
2. Verifikasi checksum seluruh berkas sebelum restore; checksum tidak cocok → batalkan dengan pesan berkas mana yang rusak.
3. Versi skema berbeda → **tolak** dengan pesan yang menyebut kedua versi. Jangan mencoba migrasi otomatis.
4. Dua mode: **Penuh** (konfirmasi tingkat kritis: ketik nama sistem) dan **Per Modul** dengan strategi `TAMBAH` (lewati duplikat) · `TIMPA` · `GABUNG`.
5. Pratinjau perubahan sebelum diterapkan: berapa record ditambah, ditimpa, dilewati.
6. Progres restore terlihat; kegagalan di tengah menghasilkan laporan bagian mana yang sudah terpakai.
7. Seluruh operasi restore tercatat di audit log.

**Verifikasi:**
```bash
npx tsx scripts/e2e-restore.ts
```
(script: backup → hapus data → restore → bandingkan jumlah record dan checksum berkas)

**Selesai bila:**
- [ ] Restore end-to-end dari `.sql.gz` selesai **< 1 jam** (diukur)
- [ ] Import `prokers.json` ke database kosong menghasilkan proker identik
- [ ] Backup dengan versi skema berbeda ditolak dengan pesan jelas
- [ ] Berkas hasil restore dapat dibuka dan tidak korup

**Jangan:** jangan menyediakan restore tanpa backup pra-restore.

---

### T-113 · Hardening keamanan
**Fase** 9 · **Butuh** seluruh fase fitur · **Baca** SYSTEM_DESIGN §18 · PRD §8.4

**Buat:** `lib/security/{rate-limit,sanitize}.ts` · `docs/ai/SECURITY_AUDIT.md`
**Ubah:** `next.config.ts` · middleware · route handler terkait

**Kontrak:**
1. Security headers lengkap SYSTEM_DESIGN §18.2, termasuk `Permissions-Policy: camera=(self), microphone=(), geolocation=()` dan HSTS.
2. Rate limiting pada 5 endpoint SYSTEM_DESIGN §18.3: login (5/15 mnt), upload gambar (30/jam), approve surat (100/jam), backup (3/hari), umum (300/mnt per IP).
3. Sanitasi output TipTap di **kedua sisi** (simpan dan render).
4. Verifikasi origin pada Server Actions; cookie `SameSite=Lax` minimal.
5. Signed URL berumur 5 menit untuk seluruh berkas privat.
6. `SECURITY_AUDIT.md` memuat hasil uji penetrasi internal untuk **tiga jalur**: akses lintas departemen, akses lintas divisi, upload berbahaya (PDF menyamar sebagai JPG, berkas 100 MB, nama berkas path traversal, SVG berisi script).
7. Setiap temuan wajib diperbaiki atau dicatat dengan mitigasi eksplisit.

**Verifikasi:**
```bash
npx tsx scripts/security-scan.ts && npm run db:test -- 015c_rls_negatif
```

**Selesai bila:**
- [ ] Ketiga jalur uji penetrasi ditolak di **dua lapis** (aplikasi dan RLS)
- [ ] Seluruh header keamanan muncul pada response produksi
- [ ] Tidak ada berkas privat yang dapat diakses tanpa signed URL

**Jangan:** jangan menandai audit selesai dengan temuan terbuka yang belum dimitigasi.

---

### T-114 🧑 · Verifikasi performa
**Fase** 9 · **Butuh** seluruh fase fitur · **Baca** PRD §8.1 (10 metrik) · SYSTEM_DESIGN §19

**Buat:** `scripts/bench-all.ts` · `docs/ai/PERFORMANCE_REPORT.md`
**Ubah:** berkas yang perlu dioptimalkan berdasarkan hasil

**Kontrak:**
1. Ukur **10 metrik PRD §8.1** satu per satu, pada profil jaringan **4G tersimulasi**, dengan data realistis (60 proker, 500 surat, 100 item RAB, 50 nota):
   FCP < 1,0 s · dashboard siap < 1,5 s · Master Gantt 48 bar < 500 ms · Gantt 100 task < 500 ms · cek konflik < 500 ms · pratinjau surat < 300 ms · pipeline gambar < 5 s · hitung ulang RAB < 100 ms · galeri 30 nota < 2 s · scroll Gantt 60 fps.
2. Ukur juga anggaran bundle SYSTEM_DESIGN §19.1 per halaman (login < 80 KB, beranda < 180 KB, RAB < 200 KB, upload nota < 250 KB).
3. Terapkan teknik SYSTEM_DESIGN §19.2 hanya pada metrik yang **belum** memenuhi target — jangan optimasi buta.
4. `PERFORMANCE_REPORT.md` mencatat **angka nyata sebelum dan sesudah** setiap optimasi.
5. Metrik yang tidak tercapai dicatat beserta penyebab dan rencana tindak lanjut, bukan disembunyikan.

**Verifikasi:**
```bash
npx tsx scripts/bench-all.ts
```

**Selesai bila:**
- [ ] Sepuluh metrik terukur dengan angka nyata (bukan perkiraan)
- [ ] Anggaran bundle keempat halaman terpenuhi
- [ ] Setiap metrik yang meleset punya catatan penyebab

**Jangan:** jangan menandai metrik "terpenuhi" tanpa angka pengukuran di laporan.

---

### T-115 · Aksesibilitas & responsif
**Fase** 9 · **Butuh** seluruh fase fitur · **Baca** PRD §8.6 · DESIGN_SYSTEM §13, §14

**Buat:** `docs/ai/A11Y_REPORT.md`
**Ubah:** komponen yang perlu perbaikan

**Kontrak:**
1. Audit kontras WCAG AA (4.5:1) pada **kedua tema**; catat setiap pasangan warna yang gagal beserta perbaikannya.
2. Seluruh aksi utama dapat dijangkau keyboard; urutan tab logis; focus indicator terlihat jelas.
3. Label form eksplisit; error terhubung lewat `aria-describedby`; status diumumkan ke screen reader lewat live region.
4. Status **tidak pernah** disampaikan hanya lewat warna (K-15) — verifikasi dengan mode grayscale.
5. Uji pada lebar **375 px**: prioritas modul **Nota** dan **Kanban** (panitia memakai ponsel di lapangan, PRD §8.5).
6. Hormati `prefers-reduced-motion` (DESIGN_SYSTEM §6.4).

**Verifikasi:**
```bash
npm run test:e2e -- a11y
```

**Selesai bila:**
- [ ] Panitia dapat memotret dan mengunggah nota **sepenuhnya dari ponsel** (alur lengkap di 375 px)
- [ ] Nol pelanggaran kontras WCAG AA di kedua tema
- [ ] Seluruh alur utama dapat diselesaikan tanpa mouse

**Jangan:** jangan menurunkan target kontras agar audit lulus.

---

### T-116 🧑 · Dokumentasi pengguna & UAT
**Fase** 9 · **Butuh** T-113, T-114, T-115 · **Baca** USER_FLOW (seluruh alur) · PRD §3.2

**Buat:** `docs/panduan/{admin,ketua,wakil,sekum,bendum,kadept,anggota,bph}.md` · `docs/ai/UAT_SKENARIO.md` · `docs/ai/UAT_HASIL.md`
**Ubah:** `README.md`

**Kontrak:**
1. Delapan panduan pengguna, satu per role, berisi hanya alur yang relevan untuk role tersebut, dengan tangkapan layar dan langkah bernomor.
2. `UAT_SKENARIO.md` berisi skenario end-to-end yang diturunkan dari USER_FLOW, minimal:
   - Kadept: buat proker terjadwal → hadapi konflik → ubah tanggal → ajukan.
   - Ketua: setujui proker → cek kepanitiaan otomatis terbentuk.
   - Sekum: buat surat peminjaman ruangan → setujui → unduh DOCX.
   - Bendum: verifikasi 5 nota → cek RAB Aktual → generate LPJ.
   - Anggota: upload nota dari ponsel → alokasi ke 2 item RAB.
3. `UAT_HASIL.md` diisi setelah sesi UAT nyata: siapa, kapan, skenario mana lulus/gagal, temuan.
4. Sesi onboarding pengurus dijadwalkan dan hasilnya dicatat.
5. `README.md` diperbarui: cara menjalankan, cara deploy, tautan ke seluruh dokumen.

**Verifikasi:**
```bash
ls docs/panduan/*.md | wc -l
```

**Selesai bila:**
- [ ] Delapan panduan role tersedia
- [ ] 🧑 Ketua, Sekum, Bendum, dan 2 Kadept menyelesaikan alur end-to-end **tanpa bantuan**
- [ ] Seluruh temuan UAT tercatat dan diklasifikasi (blocker / perbaikan / catatan)

**Jangan:** jangan menyatakan UAT lulus bila ada blocker yang belum ditutup.
