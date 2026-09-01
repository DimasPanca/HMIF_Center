# FASE 3 — Proker, Anti-Bentrok & Gantt (T-065 … T-079)

**Deliverable fase:** proker tidak bisa bentrok (dijamin database), dan Master Gantt tampil live di halaman utama untuk semua role.
**Fase paling berisiko.** Bila tim harus memilih satu fase untuk dikerjakan lebih dulu, pilih fase ini, bukan P2.
**Invariant yang dijaga:** INV-09 … INV-13.
**Gerbang keluar:** lihat AI_EXECUTION_PLAN §6 (P3 → P5).

---

### T-065 · Service proker & API
**Fase** 3 · **Butuh** T-046, T-033 · **Baca** PRD F-5.1, F-5.2 · SYSTEM_DESIGN §16.2 (blok Proker)

**Buat:** `lib/proker/{service,schema,status}.ts` · `app/api/proker/{route.ts,[id]/route.ts,cek-konflik/route.ts,kalender/route.ts}`
**Ubah:** —

**Kontrak:**
1. Skema Zod proker mencakup 3 kategori (`TERJADWAL`, `BERKALA`, `RESPONSIF`) dengan aturan berbeda:
   - `TERJADWAL`: tanggal persiapan + hari-H wajib, durasi persiapan 15–45 hari, Gantt wajib, kepanitiaan wajib.
   - `BERKALA`: `pola_ulang` wajib (frekuensi, hari, rentang), tanggal tunggal tidak wajib, tanpa approval (PRD F-5.1).
   - `RESPONSIF`: tanggal hari-H wajib, tetap butuh approval, tidak mengunci kalender.
2. `POST /api/proker/cek-konflik` memanggil fungsi DB `cek_konflik_proker` dan mengembalikan daftar konflik lengkap (nama proker, departemen, rentang). Target respons **< 500 ms**.
3. `GET /api/proker/kalender` mengembalikan seluruh rentang terkunci periode aktif untuk render kalender, dalam satu query.
4. Matriks konflik SYSTEM_DESIGN §6.6 diterjemahkan apa adanya: hanya TERJADWAL×TERJADWAL yang ditolak.
5. Seluruh mutasi lewat `withAuditContext` (K-09).

**Verifikasi:**
```bash
npm run test -- proker-service
```

**Selesai bila:**
- [ ] Cek konflik mengembalikan detail proker & departemen yang bentrok
- [ ] Proker BERKALA di rentang terkunci tersimpan tanpa peringatan
- [ ] Waktu respons cek konflik < 500 ms dengan 60 proker

**Jangan:** jangan menegakkan anti-bentrok di service. Service hanya memberi tahu; database yang menolak.

---

### T-066 · Uji konkurensi anti-bentrok
**Fase** 3 · **Butuh** T-065 · **Baca** PRD F-5.2 (Acceptance Criteria) · SYSTEM_DESIGN §6.4

**Buat:** `scripts/stress-anti-bentrok.ts` · `supabase/tests/021_konflik_konkuren.sql`
**Ubah:** —

**Kontrak:**
1. Dua **koneksi database nyata** menjalankan `setujui_proker` untuk dua proker dengan rentang beririsan, pada saat yang sama (barrier sinkronisasi sebelum eksekusi).
2. Assert: tepat **satu** berhasil (`ok:true, locked:true`), satunya `ok:false, reason:'KONFLIK'` dengan daftar konflik terisi dan statusnya berubah `PERLU_REVISI`.
3. Skenario tambahan: 10 proker bentrok serentak → tepat 1 berhasil.
4. Skenario batas: proker B mulai persis di hari terakhir proker A → **ditolak** (INV-11).
5. Skenario revisi: proker terkunci diubah tanggalnya, disetujui ulang, lock lama terhapus dan lock baru terpasang dalam satu transaksi.

**Verifikasi:**
```bash
npx tsx scripts/stress-anti-bentrok.ts
```

**Selesai bila:**
- [ ] Kelima skenario lulus dengan koneksi paralel sungguhan
- [ ] Tidak pernah ada dua lock beririsan di tabel setelah stress test

**Jangan:** jangan menganggap test lulus bila dijalankan serial.

---

### T-067 · Kalender ketersediaan
**Fase** 3 · **Butuh** T-065 · **Baca** PRD F-5.3 (Langkah 2) · USER_FLOW §4.2

**Buat:** `app/(dashboard)/proker/kalender/page.tsx` · `components/proker/{KalenderKetersediaan,TanggalTooltip,LegendaKalender}.tsx`
**Ubah:** —

**Kontrak:**
1. Grid bulanan, dapat digeser antar bulan, menampilkan 3 keadaan tanggal: **terkunci** (warna departemen pemilik), **berkala** (garis tipis, tidak memblokir), **tersedia**.
2. Hover tanggal terkunci menampilkan: nama proker, departemen, rentang persiapan, rentang hari-H, penanggung jawab.
3. Legenda selalu terlihat; warna disertai pola/teks agar tidak bergantung warna saja (K-15).
4. Dapat dipakai sebagai komponen terkontrol di wizard (T-068), dengan prop `onPilihTanggal`.
5. Data diambil sekali lewat `GET /api/proker/kalender`, lalu difilter di klien saat ganti bulan.

**Verifikasi:**
```bash
npm run test:e2e -- kalender-ketersediaan
```

**Selesai bila:**
- [ ] Tanggal terkunci berbeda jelas dari tanggal tersedia
- [ ] Tooltip memuat 5 informasi yang disebut di kontrak
- [ ] Ganti bulan tidak memicu request baru

**Jangan:** jangan menampilkan proker berstatus DRAFT sebagai terkunci (INV-10).

---

### T-068 · Wizard proker langkah 1–3
**Fase** 3 · **Butuh** T-067 · **Baca** PRD F-5.3 (Langkah 1–3) · USER_FLOW §4.1

**Buat:** `app/(dashboard)/proker/baru/page.tsx` · `components/proker/wizard/{WizardShell,Langkah1Informasi,Langkah2Jadwal,Langkah3Anggaran}.tsx` · `lib/proker/wizard-state.ts`
**Ubah:** —

**Kontrak:**
1. `WizardShell` menampilkan 6 langkah dengan indikator progres; langkah yang belum valid tidak bisa dilewati.
2. **Progres tersimpan per langkah** (draft proker di server), sehingga wizard bisa ditinggal dan dilanjutkan.
3. Langkah 2 menampilkan `KalenderKetersediaan`; memilih tanggal memicu **cek konflik real-time < 500 ms** dan menampilkan `InlineAlert` merah (bukan modal) berisi daftar proker yang bentrok.
4. Validasi durasi persiapan 15–45 hari dengan pesan yang menyebut angka aktualnya (mis. "Persiapan 12 hari — minimal 15 hari").
5. Kategori `BERKALA` mengganti Langkah 2 menjadi form pola pengulangan (frekuensi, hari, rentang periode) dan menyembunyikan cek konflik.
6. Langkah 3: estimasi anggaran, sumber dana (multi-pilih), kebutuhan ruangan, kebutuhan barang.

**Verifikasi:**
```bash
npm run test:e2e -- wizard-proker-1-3
```

**Selesai bila:**
- [ ] Peringatan konflik muncul **sebelum** user melanjutkan ke langkah berikutnya
- [ ] Meninggalkan wizard lalu kembali memulihkan seluruh isian
- [ ] Persiapan 14 hari dan 46 hari ditolak dengan pesan jelas

**Jangan:** jangan menyimpan wizard di localStorage saja. Draft harus ada di server.

---

### T-069 · Wizard proker langkah 4–6
**Fase** 3 · **Butuh** T-068 · **Baca** PRD F-5.3 (Langkah 4–6) · PRD F-8.1

**Buat:** `components/proker/wizard/{Langkah4Kepanitiaan,Langkah5Gantt,Langkah6Tinjau}.tsx` · `app/api/proker/[id]/submit/route.ts`
**Ubah:** —

**Kontrak:**
1. Langkah 4 (wajib untuk TERJADWAL): pilih Ketua Pelaksana dari **seluruh pengurus, bebas departemen** (PRD F-8.1); pilih divisi dari 9 preset atau tambah manual; pilih koordinator dan anggota tiap divisi.
2. Langkah 5 (wajib untuk TERJADWAL): editor Gantt tingkat proker, minimal 1 task, task dapat dikelompokkan ke fase Persiapan/Pelaksanaan/Evaluasi. Memakai komponen dari T-078 bila sudah ada; bila belum, pakai form tabel sederhana yang menghasilkan struktur data yang sama.
3. Langkah 6: ringkasan seluruh isian + **cek konflik final** + tombol Ajukan.
4. Submit mengubah status menjadi `MENUNGGU_APPROVAL`. **Kalender belum terkunci** pada tahap ini (INV-10).
5. Untuk kategori BERKALA, langkah 4 dan 5 opsional dan submit langsung menjadikan status `DISETUJUI` (tidak butuh approval, PRD F-5.1).

**Verifikasi:**
```bash
npm run test:e2e -- wizard-proker-4-6
```

**Selesai bila:**
- [ ] Langkah 5 tidak bisa dilewati untuk kategori TERJADWAL
- [ ] Ketua Pelaksana dari departemen lain dapat dipilih tanpa batasan
- [ ] Setelah submit, `proker_lock` **belum** berisi baris untuk proker ini

**Jangan:** jangan membuat entri kepanitiaan di tahap ini. Kepanitiaan dibentuk saat approval (T-070).

---

### T-070 · Approval proker & pembentukan kepanitiaan
**Fase** 3 · **Butuh** T-069, T-033 · **Baca** PRD F-5.4 · PRD F-8.1 · USER_FLOW §4.3, §6.1

**Buat:** `app/(dashboard)/proker/approval/page.tsx` · `app/api/proker/[id]/{approve,reject,revisi}/route.ts` · `lib/kepanitiaan/bentuk-otomatis.ts`
**Ubah:** —

**Kontrak:**
1. Antrian approval hanya untuk Ketua dan Wakil (INV-05); BPH tidak melihat antrian ini (INV-04).
2. Halaman detail approval menampilkan: seluruh data proker, pratinjau Gantt, dan **peta konflik** bila ada.
3. Tiga aksi: **Setujui** (memanggil `setujui_proker`), **Tolak** (wajib alasan), **Minta Revisi** (wajib catatan).
4. Bila `setujui_proker` mengembalikan `ok:false`, tampilkan panel konflik inline berisi nama proker, departemen, dan rentang; status berubah `PERLU_REVISI`.
5. Approval sukses untuk TERJADWAL memicu `bentukKepanitiaanOtomatis(prokerId)`: buat `kepanitiaan`, `divisi`, `divisi_member`, `rab_meta` (status DRAFT), `job_desk` kosong, `gantt_chart` per divisi, dan folder dokumen — semuanya dalam **satu transaksi** bersama approval.
6. `kode_kegiatan` kepanitiaan diisi dari nama acara (slug huruf besar) dan dapat diedit — dipakai pada nomor surat.

**Verifikasi:**
```bash
npm run test:e2e -- approval-proker
```

**Selesai bila:**
- [ ] Menyetujui proker TERJADWAL menghasilkan kepanitiaan + seluruh ruang kerja divisi tanpa aksi manual
- [ ] Kalender terkunci hanya setelah approval berhasil
- [ ] Konflik saat approval menampilkan detail, bukan pesan generik

**Jangan:** jangan membentuk kepanitiaan di luar transaksi approval (bisa menghasilkan kepanitiaan yatim bila approval gagal).

---

### T-071 · Edit proker yang sudah terkunci
**Fase** 3 · **Butuh** T-070 · **Baca** PRD §5.2 no.4 · USER_FLOW §4.4, §11.1

**Buat:** `lib/proker/klasifikasi-perubahan.ts` · `app/(dashboard)/proker/[id]/page.tsx`
**Ubah:** `app/api/proker/[id]/route.ts`

**Kontrak:**
1. Klasifikasi perubahan:
   - **Minor** (deskripsi, tujuan, sasaran, estimasi peserta, anggaran): simpan langsung, tetap `DISETUJUI`.
   - **Mayor** (tanggal apa pun, kategori, departemen): status → `MENUNGGU_APPROVAL_REVISI`, **kunci lama dipertahankan** sampai revisi diputuskan (INV-13).
2. Revisi ditolak → proker kembali ke tanggal lama dan status `DISETUJUI` (lock lama masih ada, tidak perlu dipasang ulang).
3. Revisi disetujui → lock lama dihapus dan lock baru dipasang dalam satu transaksi; bila lock baru bentrok, seluruh transaksi dibatalkan dan lock lama tetap berlaku.
4. UI menampilkan peringatan eksplisit sebelum menyimpan perubahan mayor: "Perubahan tanggal memerlukan persetujuan ulang Ketua/Wakil."
5. Seluruh transisi status mengikuti diagram USER_FLOW §11.1 tanpa kecuali.

**Verifikasi:**
```bash
npm run test:e2e -- edit-proker-terkunci
```

**Selesai bila:**
- [ ] Perubahan minor tidak memicu re-approval
- [ ] Revisi ditolak mengembalikan tanggal lama dan kunci lama tetap utuh
- [ ] Tidak ada jendela waktu ketika proker kehilangan kuncinya

**Jangan:** jangan menghapus lock lama saat pengajuan revisi. Hanya saat revisi disetujui.

---

### T-072 · Mesin geometri Gantt
**Fase** 3 · **Butuh** T-015 · **Baca** SYSTEM_DESIGN §10.2 · DESIGN_SYSTEM §10.2, §10.6

**Buat:** `lib/gantt/{types,geometry,transform}.ts` · `lib/gantt/__tests__/geometry.test.ts`
**Ubah:** —

**Kontrak:**
1. Tipe `GanttViewModel`, `GanttGroupVM`, `GanttTaskVM`, `TimelineVM` persis SYSTEM_DESIGN §10.2.
2. `geometry.ts` menyediakan fungsi murni: `dateToX(date)`, `xToDate(x)`, `barRect(row)`, `dateSpanWidth(a,b)`, `buildColumns(scale, range)`.
3. Lebar per hari mengikuti DESIGN_SYSTEM §10.2: **minggu 6px**, **bulan 2px**, **kuartal 0.8px**. Tinggi baris grup 32px, baris task 26px, bar grup 14px, bar task 10px, gap antar grup 8px.
4. `transform.ts` mengubah baris `v_master_gantt` dan `gantt_task` menjadi `GanttViewModel`, termasuk menghitung bar ringkas grup (rentang gabungan seluruh anak).
5. Seluruh fungsi **murni dan deterministik** (tanpa `Date.now()` internal — "hari ini" adalah parameter).
6. Unit test wajib: 1 Nov – 7 Des pada tiga skala menghasilkan x & lebar yang benar; bar 1 hari tetap terlihat (lebar minimum 4px); rentang lintas tahun benar.

**Verifikasi:**
```bash
npm run test -- gantt-geometry
```

**Selesai bila:**
- [ ] Seluruh test geometri lulus di tiga skala
- [ ] Tidak ada pemanggilan `Date.now()` di dalam `lib/gantt`

**Jangan:** jangan menaruh logika perhitungan koordinat di dalam komponen React.

---

### T-073 · Komponen Gantt SVG
**Fase** 3 · **Butuh** T-072, T-013 · **Baca** DESIGN_SYSTEM §10.1, §10.3, §10.4, §10.5, §10.6, §10.7

**Buat:** `components/gantt/{GanttChart,TimelineHeader,GroupBar,TaskBar,Connectors,GridLines,TodayLine,GanttTooltip,GanttPanel}.tsx`
**Ubah:** `app/globals.css` (bila ada token Gantt yang kurang)

**Kontrak:**
1. **Satu elemen `<svg>`** untuk seluruh area chart (bukan per baris).
2. Bar berbentuk pill (`rx = height/2`), badan opacity 0.85, isian progres opacity 1, **marker Hari-H putih** di atas layer bar (DESIGN_SYSTEM §10.4).
3. Label penanggung jawab 11px berada **6px di atas** bar grup, rata kiri bar.
4. Konektor siku bersudut tajam dari bar induk ke bar anak, stroke 1px.
5. Kolom label kiri **sticky** saat scroll horizontal (200px desktop / 140px mobile); header timeline sticky saat scroll vertikal.
6. Garis "hari ini" vertikal + highlight kolom hari ini.
7. Interaksi: hover (tooltip setelah 400 ms, isi persis §10.7), klik bar (panel samping meluncur 180 ms), collapse/expand grup (180 ms).
8. Scroll horizontal memakai transform CSS, **bukan** re-render SVG.

**Verifikasi:**
```bash
npm run test:e2e -- gantt-render
```

**Selesai bila:**
- [ ] Marker Hari-H terlihat jelas berbeda dari badan bar persiapan
- [ ] Kolom nama task tetap terlihat saat scroll horizontal
- [ ] Tooltip memuat 6 baris informasi sesuai §10.7

**Jangan:** jangan memakai library Gantt. Jangan menambah animasi di luar yang disebut §10.7.

---

### T-074 · Virtualisasi & performa Gantt
**Fase** 3 · **Butuh** T-073 · **Baca** PRD F-6.3 (AC) · SYSTEM_DESIGN §10.3, §19.2

**Buat:** `lib/gantt/use-virtual-rows.ts` · `scripts/bench-gantt.ts`
**Ubah:** `components/gantt/GanttChart.tsx`

**Kontrak:**
1. Hanya baris di dalam viewport (+ buffer 5 baris atas/bawah) yang dirender.
2. Geometri di-memo; dihitung ulang hanya saat data, skala, atau lebar kontainer berubah.
3. `scripts/bench-gantt.ts` mengukur waktu render 100 task dan 48 bar dengan `performance.now()` dan mencetak hasilnya.
4. Target terukur: **100 task < 500 ms**, **48 bar < 500 ms**, scroll horizontal **60 fps**.
5. Bila target tidak tercapai, catat angka aktual dan penyebabnya; jangan menandai selesai dengan asumsi.

**Verifikasi:**
```bash
npx tsx scripts/bench-gantt.ts && npm run test:e2e -- gantt-perf
```

**Selesai bila:**
- [ ] Angka hasil pengukuran nyata dilampirkan di laporan task
- [ ] Ketiga target terpenuhi

**Jangan:** jangan mengklaim performa tanpa angka pengukuran.

---

### T-075 · Master Gantt di beranda
**Fase** 3 · **Butuh** T-074, T-070, T-040 · **Baca** PRD F-3.1 · DESIGN_SYSTEM §10.8 · USER_FLOW §3.1, §3.3

**Buat:** `components/gantt/MasterGantt.tsx` · `app/api/gantt/master/route.ts`
**Ubah:** `app/(dashboard)/page.tsx`

**Kontrak:**
1. Sumber data: view `v_master_gantt` (proker `DISETUJUI` + `BERJALAN`, periode aktif), satu query.
2. Struktur baris: **departemen** (grup) → **proker** (anak); warna departemen dari `departemen.warna`.
3. Rentang bar = `tanggal_mulai_persiapan` → `tanggal_hari_h_selesai`, dengan **marker Hari-H selalu tampil** (§10.8).
4. Rentang tampilan default: **3 bulan lalu → 6 bulan depan**; skala default **Minggu**; tinggi maksimum `calc(100vh - 320px)` dengan scroll internal.
5. Read-only untuk semua role, **termasuk Ketua** (edit lewat halaman proker).
6. Filter: departemen, kategori, status. Grup dapat dilipat.
7. **Semua role melihat Master Gantt yang identik**, termasuk BPH (PRD F-3.1).

**Verifikasi:**
```bash
npm run test:e2e -- master-gantt
```

**Selesai bila:**
- [ ] 8 role melihat Master Gantt yang sama
- [ ] Mode "Bulan" + seluruh grup terlipat muat di layar 1366×768 **tanpa scroll vertikal**
- [ ] 48 bar render < 500 ms

**Jangan:** jangan menambahkan aksi edit di Master Gantt.

---

### T-076 · Realtime & degradasi anggun
**Fase** 3 · **Butuh** T-075 · **Baca** SYSTEM_DESIGN §13 · PRD F-3.1 (AC) · PRD §8.3

**Buat:** `lib/realtime/{channels,use-master-gantt-realtime}.ts` · `components/shared/KoneksiBanner.tsx`
**Ubah:** `supabase/migrations/019_realtime.sql` · `components/gantt/MasterGantt.tsx`

**Kontrak:**
1. **Tambahkan `proker` dan `proker_lock` ke publication `supabase_realtime`** — langkah yang paling sering terlewat; buat sebagai migrasi tersendiri agar tercatat.
2. Hook berlangganan kanal `proker:{periode_id}`, meng-invalidate query `['master-gantt', periodeId]` saat ada perubahan.
3. Bar baru muncul dengan highlight flash 400 ms (DESIGN_SYSTEM §10.7), bukan animasi lain.
4. Koneksi putus → banner kuning tipis di atas Gantt: "Pembaruan langsung terputus. Muat ulang untuk data terbaru." Chart **tetap menampilkan data terakhir** (PRD §8.3).
5. Indikator koneksi juga tampil di header (T-051).
6. Berlangganan dibersihkan saat komponen unmount (tidak ada kebocoran kanal).

**Verifikasi:**
```bash
npm run test:e2e -- realtime-gantt
```

**Selesai bila:**
- [ ] Menambah proker di tab lain memunculkan bar baru **< 3 detik** tanpa refresh
- [ ] Mematikan jaringan menampilkan banner, chart tetap tampil
- [ ] Publication memuat kedua tabel (diverifikasi lewat query)

**Jangan:** jangan memakai polling sebagai pengganti realtime.

---

### T-077 · Dashboard kontekstual per role
**Fase** 3 · **Butuh** T-075, T-060 · **Baca** PRD F-3.2 · USER_FLOW §3.1 · DESIGN_SYSTEM §11.2

**Buat:** `components/dashboard/{PanelKetua,PanelSekum,PanelBendum,PanelKadept,PanelAnggota,PanelBPH,PanelAdmin}.tsx` · `app/api/dashboard/route.ts`
**Ubah:** `app/(dashboard)/page.tsx`

**Kontrak:**
1. Tujuh panel persis tabel PRD F-3.2, dirender **di bawah** Master Gantt.
2. User multi-role melihat **gabungan** panel yang relevan, tanpa duplikasi kartu.
3. Setiap panel dimuat paralel dengan `Suspense` + skeleton berbentuk sesuai kontennya.
4. Antrian approval menampilkan **badge angka**; klik item langsung membuka detail beserta tombol Setujui/Tolak.
5. Kendala berprioritas `KRITIS` muncul di panel Ketua/Wakil/BPH.
6. Target: dashboard + Master Gantt siap interaksi **< 1,5 detik** pada 4G tersimulasi.

**Verifikasi:**
```bash
npm run test:e2e -- dashboard-role && npx tsx scripts/bench-dashboard.ts
```

**Selesai bila:**
- [ ] 7 role melihat panel yang benar; multi-role melihat gabungan tanpa duplikat
- [ ] Waktu siap interaksi terukur < 1,5 detik pada profil jaringan 4G
- [ ] Badge angka akurat terhadap isi antrian

**Jangan:** jangan memuat seluruh panel secara serial.

---

### T-078 · Editor Gantt & 4 level lainnya
**Fase** 3 · **Butuh** T-073 · **Baca** PRD F-6.1, F-6.3 · SYSTEM_DESIGN §4.4

**Buat:** `components/gantt/{GanttEditor,TaskForm,ScaleSwitcher,GanttExport}.tsx` · `app/api/gantt/{[chartId]/route.ts,task/[id]/route.ts,[chartId]/export/route.ts}`
**Ubah:** —

**Kontrak:**
1. Empat level selain Master: **Departemen**, **Proker**, **Ketua Pelaksana**, **Divisi** — semuanya memakai `GanttChart` yang sama dengan `scope` berbeda.
2. Editor: tambah/ubah/hapus task dan grup; drag bar untuk menggeser tanggal (snap ke hari); drag tepi untuk mengubah durasi. Drag hanya aktif bila user punya izin tulis pada chart tersebut.
3. Dependensi Finish-to-Start opsional; bila ada, konektor digambar.
4. Export **PNG** (untuk disisipkan ke Word) dan **PDF**: render SVG ke canvas dengan skala 2x agar tajam saat dicetak.
5. Perubahan task memancarkan event realtime pada kanal `gantt:{chart_id}`.
6. Progres task 0–100 ditampilkan sebagai isian gelap di dalam bar.

**Verifikasi:**
```bash
npm run test:e2e -- gantt-editor
```

**Selesai bila:**
- [ ] Export PNG tajam dan terbaca saat disisipkan ke Word (uji nyata, bukan hanya file terbentuk)
- [ ] User tanpa izin tidak dapat menggeser bar (tombol drag tidak aktif dan API menolak)
- [ ] Empat level chart bekerja dengan komponen yang sama

**Jangan:** jangan membuat komponen Gantt kedua untuk level berbeda.

---

### T-079 · Cron harian
**Fase** 3 · **Butuh** T-070 · **Baca** SYSTEM_DESIGN §15.2 · ADR-009 · SYSTEM_DESIGN §6.5

**Buat:** `app/api/cron/harian/route.ts` · `vercel.json` · `lib/cron/{lepas-kunci,cek-deadline}.ts`
**Ubah:** —

**Kontrak:**
1. **Satu endpoint** `/api/cron/harian` (ADR-009), dipanggil sekali sehari, yang bercabang:
   - Setiap hari: `lepas_kunci_selesai()` + hitung ulang status deadline.
   - Tanggal 1: tambahan menjalankan backup bulanan (diaktifkan di T-111).
2. Verifikasi header `Authorization: Bearer ${CRON_SECRET}`; tolak 401 bila tidak cocok.
3. Idempoten: dijalankan dua kali dalam sehari tidak menimbulkan efek ganda.
4. Setiap eksekusi mencatat ringkasan ke `audit_log` (aksi `CRON`) berisi jumlah proker yang berubah status.
5. `vercel.json` memuat **satu** entri cron (batas tier Hobby).

**Verifikasi:**
```bash
npm run test -- cron-harian
```

**Selesai bila:**
- [ ] Proker yang hari-H terakhirnya lewat berubah `SELESAI` dan kuncinya lepas
- [ ] Proker yang mulai persiapannya tiba berubah `DISETUJUI` → `BERJALAN`
- [ ] Request tanpa `CRON_SECRET` ditolak 401

**Jangan:** jangan mendefinisikan 3 cron terpisah (melebihi batas Vercel Hobby).
