# FASE 5 — Kepanitiaan & RAB (T-084 … T-093)

**Deliverable fase:** acara besar dikelola penuh lewat web; RAB tersusun terstruktur dan dapat diekspor ke Excel dengan struktur **identik** template asli.
**Invariant yang dijaga:** INV-25 … INV-30.
**Gerbang keluar:** lihat AI_EXECUTION_PLAN §6 (P5 → P7).

---

### T-084 · Ruang kerja acara
**Fase** 5 · **Butuh** T-070 · **Baca** PRD F-8.1, F-8.2 · USER_FLOW §6.2

**Buat:** `app/(dashboard)/acara/page.tsx` · `app/(dashboard)/acara/[id]/page.tsx` · `app/(dashboard)/acara/[id]/divisi/[divId]/page.tsx` · `components/acara/{AcaraHeader,TabNav,DivisiCard,RingkasanAcara}.tsx`
**Ubah:** —

**Kontrak:**
1. `/acara` menampilkan daftar acara besar (dari `kepanitiaan`) dengan status, tanggal, PIC departemen, total RAB, dan progres.
2. `/acara/[id]` memiliki **8 tab** (USER_FLOW §6.2): Ringkasan · Gantt · Divisi · RAB · TOR · Proposal · Nota · LPJ. Tab yang belum tersedia pada fase ini tetap ada dengan `EmptyState` yang menjelaskan.
3. Kartu divisi menampilkan: nama, koordinator, jumlah anggota, total RAB divisi, progres kanban divisi.
4. Ruang kerja divisi memuat 6 bagian (PRD F-8.2): Job Desk · Gantt Divisi · RAB Divisi · Progres · Dokumen · Nota.
5. Breadcrumb: Acara → Divisi, selalu terlihat.
6. Header acara menampilkan `kode_kegiatan` (dipakai untuk nomor surat) dan tautan cepat "Buat Surat untuk acara ini" yang mengisi field kegiatan otomatis.

**Verifikasi:**
```bash
npm run test:e2e -- ruang-acara
```

**Selesai bila:**
- [ ] Delapan tab dapat diakses dan tidak ada yang menampilkan halaman kosong tanpa penjelasan
- [ ] Kartu divisi menampilkan keempat metrik

**Jangan:** jangan membuat halaman terpisah per divisi di luar pola rute yang ditentukan USER_FLOW §12.

---

### T-085 · Visibilitas cross-divisi
**Fase** 5 · **Butuh** T-084, T-038 · **Baca** PRD F-8.3 · SYSTEM_DESIGN §5.3

**Buat:** `lib/kepanitiaan/akses.ts` · `components/acara/ModeBacaSajaBanner.tsx`
**Ubah:** halaman divisi & komponen RAB

**Kontrak:**
1. `bisaTulisDivisi(user, divisiId)` menggabungkan: koordinator/anggota divisi tersebut, ketua pelaksana acara, Bendum, Admin.
2. Saat membuka divisi lain: banner "Tampilan baca saja — Divisi {nama}" dan **tombol edit/hapus tidak dirender** (INV-30) — bukan disabled.
3. Panitia divisi lain **boleh membaca** RAB, progres, Gantt, dokumen, dan job desk divisi lain dalam acara yang sama.
4. Percobaan API langsung untuk mengubah data divisi lain ditolak **403 oleh RLS**, bukan hanya oleh UI.
5. Ketua Pelaksana dapat menulis di seluruh divisi.

**Verifikasi:**
```bash
npm run test:e2e -- cross-divisi && npm run db:test -- 015c_rls_negatif
```

**Selesai bila:**
- [ ] Panitia Divisi Konsumsi dapat membuka RAB Divisi PDD dan melihat seluruh itemnya
- [ ] Tombol edit **tidak ada di DOM** pada tampilan divisi lain
- [ ] Panggilan API langsung ditolak oleh RLS

**Jangan:** jangan mengandalkan `disabled` sebagai mekanisme keamanan.

---

### T-086 · Parser kolom jumlah
**Fase** 5 · **Butuh** T-015 · **Baca** SYSTEM_DESIGN §11.1 · PRD F-9.1

**Buat:** `lib/rab/parse-jumlah.ts` · `lib/rab/__tests__/parse-jumlah.test.ts`
**Ubah:** —

**Kontrak:**
1. Tiga kasus sesuai SYSTEM_DESIGN §11.1: (a) murni angka, (b) angka + satuan, (c) kompleks → `butuhInputManual: true`.
2. Mendukung koma sebagai desimal (`2,5` → 2.5).
3. Mengembalikan `{ teks, numerik, butuhInputManual }`; `teks` **selalu** apa adanya (INV-26).
4. Test wajib memuat **tujuh baris** tabel SYSTEM_DESIGN §11.1 persis: `10`, `156`, `16 Unit`, `10 lembar`, `2 pack (12 pcs/pack)`, `2 Hari 1 Malam`, `1 pack (isi 100)`.
5. Tambahan kasus uji: input kosong, input tanpa angka (`Paket`), angka negatif (ditolak).

**Verifikasi:**
```bash
npm run test -- parse-jumlah
```

**Selesai bila:**
- [ ] Ketujuh baris tabel lulus persis
- [ ] `2 Hari 1 Malam` menghasilkan `butuhInputManual: true`

**Jangan:** jangan "memperbaiki" teks asli (mis. menormalkan kapitalisasi). Teks disimpan apa adanya.

---

### T-087 · Grid RAB inline-editable
**Fase** 5 · **Butuh** T-086, T-085 · **Baca** PRD F-9.1, F-9.3 · DESIGN_SYSTEM §9.3

**Buat:** `components/rab/{RabGrid,RabRow,RabSectionHeader,RabSummary,CurrencyInput,JumlahInput}.tsx` · `app/api/rab/item/[id]/route.ts` · `app/api/kepanitiaan/[id]/rab/route.ts`
**Ubah:** —

**Kontrak:**
1. Hierarki tiga tingkat: **Divisi → Sub-section → Item** (PRD F-9.1).
2. Kolom item: No (otomatis) · Jenis Barang · Jumlah (teks bebas) · Harga Satuan · Total (terhitung) · Keterangan.
3. `CurrencyInput` memformat Rupiah saat mengetik (`50000` → `Rp50.000`) dan menyimpan angka murni.
4. `JumlahInput` memakai `parse-jumlah`; bila `butuhInputManual`, tampilkan field kecil "jumlah untuk perhitungan" di sebelahnya (jangan blokir alur).
5. Kolom Total read-only dengan opsi override manual yang **ditandai visual** (`total_manual`).
6. Sticky footer menampilkan total acara; ringkasan per divisi terhitung otomatis.
7. Navigasi keyboard ala spreadsheet: Enter turun, Tab kanan, Esc batal edit.
8. Tambah/hapus divisi dan sub-section lewat tombol; hapus memakai konfirmasi tingkat sedang.

**Verifikasi:**
```bash
npm run test:e2e -- rab-grid
```

**Selesai bila:**
- [ ] Mengubah harga satuan memperbarui total item + total divisi + total acara **< 100 ms** (diukur)
- [ ] Input `16 Unit` tersimpan apa adanya dan terhitung sebagai 16
- [ ] Input `2 Hari 1 Malam` memunculkan prompt nilai numerik

**Jangan:** jangan memakai komponen spreadsheet pihak ketiga.

---

### T-088 · Kalkulasi RAB
**Fase** 5 · **Butuh** T-087 · **Baca** SYSTEM_DESIGN §11.2 · PRD F-9.3

**Buat:** `lib/rab/calculate.ts` · `lib/rab/__tests__/calculate.test.ts`
**Ubah:** `app/api/rab/item/[id]/route.ts`

**Kontrak:**
1. Fungsi murni `hitungRab(divisiList)` menghasilkan total per item, per sub-section, per divisi, dan grand total, persis SYSTEM_DESIGN §11.2.
2. `total_manual = true` mengunci nilai; jangan ditimpa hasil perhitungan.
3. Dijalankan di klien untuk responsivitas, **diverifikasi ulang di server** sebelum simpan (INV-27); bila selisih, nilai server yang menang dan user diberi tahu.
4. Seluruh aritmetika uang memakai integer rupiah atau `Decimal`, **bukan float** — hindari galat pembulatan.
5. Dana tak terduga dihitung terpisah dan tidak tercampur ke total divisi.
6. Test: 3 divisi × 2 sub-section × 5 item, termasuk item dengan `jumlah_numerik` NULL (dianggap 0 dan ditandai).

**Verifikasi:**
```bash
npm run test -- rab-calculate
```

**Selesai bila:**
- [ ] Total dari klien dan server selalu identik untuk data yang sama
- [ ] Tidak ada galat pembulatan pada 100 item acak

**Jangan:** jangan memakai `number` float untuk penjumlahan rupiah berskala besar tanpa pembulatan eksplisit.

---

### T-089 · Status & penguncian RAB
**Fase** 5 · **Butuh** T-088 · **Baca** PRD F-9.5 · USER_FLOW §11.3

**Buat:** `app/api/rab/[kepanitiaanId]/{lock,unlock,submit}/route.ts` · `components/rab/StatusRabBar.tsx`
**Ubah:** `lib/rab/service.ts`

**Kontrak:**
1. State machine: `DRAFT → DIAJUKAN → DISETUJUI → REALISASI → SELESAI` (USER_FLOW §11.3). Transisi ilegal ditolak server.
2. Yang berhak mengunci: Bendum, Ketua, Wakil, Admin (`rab.lock`).
3. RAB terkunci menolak perubahan item **di level RLS** (INV-29) — bukan hanya UI. Uji ulang dengan panggilan API langsung.
4. Buka kunci **wajib** disertai alasan (konfirmasi tingkat tinggi); alasan disimpan di `rab_meta.alasan_buka_kunci` dan tercatat di `audit_log`.
5. `StatusRabBar` menampilkan status, siapa yang mengunci, kapan, dan tombol aksi sesuai izin.

**Verifikasi:**
```bash
npm run test:e2e -- rab-lock && npm run db:test -- 015c_rls_negatif
```

**Selesai bila:**
- [ ] Perubahan item pada RAB terkunci ditolak oleh database
- [ ] Buka kunci tanpa alasan ditolak
- [ ] Riwayat buka kunci terlihat di audit log beserta alasannya

**Jangan:** jangan menyediakan jalur "paksa edit" untuk Admin.

---

### T-090 · Export Excel 4 sheet
**Fase** 5 · **Butuh** T-089, T-007 · **Baca** SYSTEM_DESIGN §11.3, §11.4 · `docs/ai/RAB_CELL_MAP.md` · PRD F-9.2

**Buat:** `lib/rab/excel-export.ts` · `lib/rab/excel-style.ts` · `app/api/rab/[kepanitiaanId]/export/route.ts`
**Ubah:** —

**Kontrak:**
1. Empat sheet: **RAB · PEMASUKAN · PENGELUARAN · RAB AKTUAL**, sesuai PRD F-9.2.
2. Seluruh koordinat kolom/baris diambil dari `RAB_CELL_MAP.md` (T-007), **bukan** ditebak.
3. Replikasi persis: merge cell, lebar kolom, warna header, border, format `"Rp"#,##0`, dan **formula hidup** (`=D5*E5`, `=SUM(F5:F20)`, saldo berjalan `=H4-G5`).
4. Kolom Jumlah diisi `jumlah_teks` (teks asli), bukan angka (INV-26).
5. Sheet PENGELUARAN dibangun dari nota terverifikasi (baris pemasukan dulu, lalu pengeluaran berurutan tanggal, dengan saldo berjalan).
6. Sheet RAB AKTUAL membandingkan rencana dan realisasi per item.
7. Nama berkas: `RAB-{namaAcara}-{YYYYMMDD}.xlsx`.

**Verifikasi:**
```bash
npm run test -- excel-export && npx tsx scripts/diff-excel.ts
```
(`diff-excel.ts` membandingkan struktur hasil export dengan `Template/RAB_Template.xlsx`: daftar sheet, merge range, lebar kolom, posisi header.)

**Selesai bila:**
- [ ] `diff-excel.ts` melaporkan **nol** selisih struktur
- [ ] Total pada sheet ringkasan sama dengan jumlah total tiap divisi
- [ ] Berkas dibuka di Excel dan formula-nya hidup (bukan nilai statis)

**Jangan:** jangan mengubah tata letak "supaya lebih rapi". Struktur harus identik dengan template asli.

---

### T-091 · Import Excel
**Fase** 5 · **Butuh** T-090 · **Baca** PRD F-9.3 (AC import)

**Buat:** `lib/rab/excel-import.ts` · `app/api/rab/[kepanitiaanId]/import/route.ts` · `components/rab/ImportRabDialog.tsx`
**Ubah:** —

**Kontrak:**
1. Membaca berkas berformat template dan memetakannya ke struktur Divisi → Sub-section → Item.
2. **Pratinjau wajib** sebelum menyimpan: baris yang akan ditambah/diubah/dilewati, beserta alasan.
3. Nilai kolom Jumlah diproses lewat `parse-jumlah`; baris yang butuh konfirmasi manual ditandai dan dapat diisi di pratinjau.
4. Import ditolak bila RAB berstatus terkunci.
5. **Roundtrip test**: export → import → export menghasilkan data yang identik.

**Verifikasi:**
```bash
npm run test -- excel-import
```

**Selesai bila:**
- [ ] Roundtrip menghasilkan data identik (dibandingkan field per field)
- [ ] Berkas dengan struktur berbeda ditolak dengan pesan yang menyebut sheet/kolom yang salah

**Jangan:** jangan mengimpor tanpa pratinjau.

---

### T-092 · Sheet PEMASUKAN & data peserta
**Fase** 5 · **Butuh** T-090, T-048 · **Baca** PRD F-9.4

**Buat:** `components/rab/{PemasukanPanel,PesertaTable}.tsx` · `app/api/kepanitiaan/[id]/{pemasukan,peserta}/route.ts`
**Ubah:** `lib/rab/excel-export.ts`

**Kontrak:**
1. Daftar peserta: No, Nama Lengkap, NIM, Status Bayar (checkbox), Tanggal Bayar, Jumlah.
2. Import massal CSV/XLSX memakai `parse-tabel.ts` dari T-048.
3. Ringkasan otomatis: total terkumpul, jumlah sudah bayar, jumlah belum bayar — selalu konsisten dengan baris peserta.
4. Sumber dana lain (Kas Himpunan, Sponsor, Dana Fakultas) sebagai baris `pemasukan` manual.
5. Total pemasukan mengalir ke sheet PENGELUARAN sebagai saldo awal dan ke analisis LPJ (T-104).

**Verifikasi:**
```bash
npm run test:e2e -- pemasukan-peserta
```

**Selesai bila:**
- [ ] Ringkasan cocok dengan jumlah baris peserta pada setiap perubahan
- [ ] Import 100 peserta menampilkan pratinjau sebelum simpan

**Jangan:** jangan menyimpan status bayar sebagai teks bebas.

---

### T-093 · Job Desk & Gantt divisi
**Fase** 5 · **Butuh** T-085, T-078 · **Baca** PRD F-8.2 · SYSTEM_DESIGN §4.5

**Buat:** `components/acara/{JobDeskEditor,DivisiGantt}.tsx` · `app/api/divisi/[id]/job-desk/route.ts`
**Ubah:** —

**Kontrak:**
1. Job desk memakai TipTap (heading, daftar, checklist, tabel sederhana); disimpan sebagai JSONB.
2. Output HTML disanitasi sebelum disimpan **dan** sebelum dirender (K: XSS).
3. Auto-save 10 detik, indikator "Tersimpan ✓".
4. Gantt divisi memakai komponen T-078 dengan `scope='DIVISI'`.
5. Koordinator dapat menulis; anggota divisi lain hanya membaca (T-085).
6. TipTap dimuat lewat dynamic import agar tidak menambah bundle halaman lain.

**Verifikasi:**
```bash
npm run test:e2e -- job-desk
```

**Selesai bila:**
- [ ] Koordinator dapat menulis job desk; anggota divisi lain hanya membaca
- [ ] Bundle halaman divisi tidak menyertakan TipTap sampai editor dibuka

**Jangan:** jangan menyimpan HTML mentah tanpa sanitasi.
