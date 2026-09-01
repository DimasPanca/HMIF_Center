# FASE 2 — Persuratan (T-054 … T-064)

**Deliverable fase:** 9 jenis surat dapat dibuat, disetujui oleh Ketua/Wakil/Sekum, mendapat nomor unik anti-duplikat, dan menghasilkan DOCX resmi ber-kop, ber-TTD, ber-stempel.
**Invariant yang dijaga fase ini:** INV-05, INV-14, INV-15, INV-16, INV-17.
**Gerbang keluar:** lihat AI_EXECUTION_PLAN §6 (P2 → P6).

---

### T-054 · Skema field per jenis surat
**Fase** 2 · **Butuh** T-046 · **Baca** PRD F-4.2 (tabel field umum & field khusus) · `docs/ai/SEED_DATA.md`

**Buat:** `lib/surat/field-schemas.ts` · `lib/surat/preset-tujuan.ts` · `lib/surat/__tests__/field-schemas.test.ts`
**Ubah:** —

**Kontrak:**
1. **13 field umum** sebagai skema Zod dasar: jenis surat, kegiatan (default `HMIF`), tanggal surat (default hari ini), kota (default `Cilegon`), lampiran (default `-`), perihal, tujuan preset, tujuan nama, tujuan alamat, isi surat, penandatangan utama, penandatangan tambahan (repeatable), format output.
2. **7 skema khusus** yang meng-extend skema dasar, persis PRD F-4.2:
   `02 KETERANGAN_AKTIF` · `05 PEMINJAMAN_BARANG` · `05 PEMINJAMAN_RUANGAN` · `04 UNDANGAN_PEMATERI` · `04 UNDANGAN_SAMBUTAN` · `08 KERJA_SAMA` · `03 ASPIRASI` (ADR-002).
3. 6 preset tujuan (BEM FT UNTIRTA, DPM FT UNTIRTA, Kepala Bagian Sekretariat FT, Ketua Jurusan, Wakil Dekan III, Lainnya) berisi nama/jabatan dan alamat default.
4. Satu skema dipakai form klien **dan** validasi server (K-04). Ekspor tipe `SuratFormValues` yang diturunkan dari Zod, bukan interface manual.
5. Default `kegiatan`, `kota`, `kode_administrasi` dibaca dari `app_config`, bukan hardcode.
6. Field `format_output` menampilkan opsi PDF hanya bila `PDF_ENABLED=true` (ADR-010).

**Verifikasi:**
```bash
npm run test -- field-schemas
```

**Selesai bila:**
- [ ] 9 kode surat punya skema; 7 di antaranya punya field khusus
- [ ] Validasi menolak field wajib kosong dengan pesan Indonesia
- [ ] Skema yang sama benar-benar diimpor di sisi klien dan server

**Jangan:** jangan membuat skema kedua "khusus server".

---

### T-055 · Registrasi template surat
**Fase** 2 · **Butuh** T-006, T-042, T-044 · **Baca** SYSTEM_DESIGN §4.8 · `docs/ai/TEMPLATE_MAPPING.md`

**Buat:** `scripts/upload-templates.ts` · `lib/surat/template-registry.ts`
**Ubah:** `supabase/migrations/018_seed.sql`

**Kontrak:**
1. Script mengunggah 11 berkas `templates/*.docx` ke bucket privat dengan key `template/{template_id}_v{n}.docx`.
2. Setiap template terdaftar di `surat_template` dengan `kode_surat`, `varian`, `nama`, `storage_key`, `field_schema` (JSONB hasil serialisasi skema T-054), `versi`, `is_active`.
3. `field_schema` juga memuat `signers[]` yang menentukan blok TTD per jenis (ADR-004).
4. Template bersifat **versioned**: mengunggah versi baru menambah baris dengan `versi + 1` dan menonaktifkan versi lama, **tidak menimpa**. Surat lama tetap merujuk versi yang dipakai saat terbit.
5. Script idempoten: menjalankan dua kali tidak menggandakan baris.

**Verifikasi:**
```bash
npx tsx scripts/upload-templates.ts && npx tsx scripts/upload-templates.ts
```

**Selesai bila:**
- [ ] 11 template terdaftar dan file-nya ada di storage
- [ ] Query template mengembalikan skema field yang bisa langsung dirender jadi form
- [ ] Menjalankan dua kali tidak menggandakan baris

**Jangan:** jangan menimpa berkas template versi lama.

---

### T-056 · Service nomor surat
**Fase** 2 · **Butuh** T-034, T-046 · **Baca** SYSTEM_DESIGN §7 · PRD F-4.1 · ADR-001, ADR-003

**Buat:** `lib/surat/nomor.ts` · `components/surat/NomorSuratBadge.tsx`
**Ubah:** —

**Kontrak:**
1. `alokasiNomor(suratId, approverId)` **hanya** memanggil fungsi DB `alokasi_nomor_surat` (INV-15). Dilarang menyusun nomor di TypeScript kecuali untuk **pratinjau**.
2. `previewNomor(input)` menghasilkan string bergaya `05/???/UN43.3.7/HMIF/X/2026` dengan bagian nomor urut sebagai `???`, ditandai jelas sebagai sementara.
3. `NomorSuratBadge` menampilkan dua keadaan visual berbeda: **sementara** (abu, ikon jam, teks "nomor sementara — ditetapkan saat disetujui") dan **final** (mono, kontras penuh).
4. Nomor final ditampilkan dengan font JetBrains Mono agar mudah dibaca dan disalin.
5. Sediakan `salinNomor()` dengan umpan balik toast.

**Verifikasi:**
```bash
npm run test -- nomor-surat
```

**Selesai bila:**
- [ ] Tidak ada perakitan nomor final di TypeScript (dibuktikan lewat grep pola `lpad|padStart` di `lib/surat`)
- [ ] Badge sementara jelas berbeda dari badge final tanpa hanya mengandalkan warna (INV: K-15)

**Jangan:** jangan menghitung "nomor berikutnya" dari `MAX()` untuk pratinjau. Pakai `???`.

---

### T-057 · Uji konkurensi penomoran
**Fase** 2 · **Butuh** T-056 · **Baca** PRD F-4.1 (Acceptance Criteria)

**Buat:** `scripts/stress-nomor-surat.ts` · `supabase/tests/020_nomor_konkuren.sql`
**Ubah:** —

**Kontrak:**
1. Script membuat 50 surat berstatus `MENUNGGU_APPROVAL`, lalu menjalankan 50 approval **paralel lewat 50 koneksi nyata** (bukan `Promise.all` di satu koneksi).
2. Assert: 50 nomor **unik**, berurutan tanpa lompatan, tidak ada exception unique violation.
3. Skenario kedua: 30 surat batch dalam satu transaksi → 30 nomor berurutan.
4. Skenario ketiga: draft dibatalkan **tidak** menghabiskan nomor (counter tidak naik).
5. Skenario keempat: alokasi dipanggil dua kali pada surat sama → nomor identik (idempoten).
6. Cetak ringkasan dan exit 1 bila ada anomali.

**Verifikasi:**
```bash
npx tsx scripts/stress-nomor-surat.ts
```

**Selesai bila:**
- [ ] 50 approval paralel → 50 nomor unik berurutan, 0 duplikat
- [ ] Bulan Oktober menghasilkan `X`, bukan `10`
- [ ] Draft dibatalkan tidak menaikkan counter

**Jangan:** jangan mensimulasikan konkurensi dengan `setTimeout`. Harus koneksi paralel sungguhan.

---

### T-058 · Form surat dinamis
**Fase** 2 · **Butuh** T-054, T-055 · **Baca** PRD F-4.2 · USER_FLOW §5.1 · DESIGN_SYSTEM §9.5

**Buat:** `app/(dashboard)/surat/baru/page.tsx` · `components/surat/SuratForm.tsx` · `components/surat/FieldRenderer.tsx` · `app/api/surat/route.ts`
**Ubah:** —

**Kontrak:**
1. Layout split: form kiri (60%), pratinjau kanan (40%), sesuai DESIGN_SYSTEM §9.5.
2. Mengganti jenis surat mengubah field **tanpa reload halaman**; nilai field bersama (perihal, tujuan, tanggal) dipertahankan.
3. Memilih preset tujuan mengisi nama dan alamat otomatis, tetap dapat diedit.
4. Field wajib kosong membuat tombol "Ajukan" nonaktif **dan** menampilkan daftar field yang kurang (bukan hanya menonaktifkan tombol).
5. Auto-save draft setiap **10 detik** dan saat blur; indikator halus "Tersimpan ✓" selama 2 detik.
6. Field repeatable (penandatangan tambahan, tabel kebutuhan, poin aspirasi, rundown) mendukung tambah/hapus/urut-ulang.
7. Isi surat memakai editor teks kaya sederhana (TipTap) yang menghasilkan HTML bersih untuk konversi DOCX.

**Verifikasi:**
```bash
npm run test:e2e -- surat-form
```

**Selesai bila:**
- [ ] Ganti jenis surat tidak me-reload halaman
- [ ] Draft tersimpan otomatis tiap 10 detik
- [ ] Preset "BEM FT UNTIRTA" mengisi nama & alamat otomatis

**Jangan:** jangan memakai editor teks kaya penuh fitur untuk isi surat. Hanya paragraf, tebal, miring, daftar.

---

### T-059 · Pratinjau surat langsung
**Fase** 2 · **Butuh** T-058 · **Baca** PRD F-4.2 · DESIGN_SYSTEM §9.5

**Buat:** `components/surat/SuratPreview.tsx` · `lib/surat/render-preview.ts`
**Ubah:** —

**Kontrak:**
1. Pratinjau adalah **replika HTML** dari tata letak surat: kop, nomor, lampiran, perihal, tujuan, isi, blok TTD. Bukan render DOCX.
2. Diperbarui **< 300 ms** setelah user berhenti mengetik (debounce 250 ms).
3. Nomor ditampilkan lewat `NomorSuratBadge` versi sementara.
4. Pratinjau memakai ukuran kertas A4 dengan skala, agar user melihat pemenggalan halaman kira-kira.
5. Bagian yang belum diisi ditampilkan sebagai placeholder abu bertanda, bukan kosong.

**Verifikasi:**
```bash
npm run test:e2e -- surat-preview
```

**Selesai bila:**
- [ ] Waktu dari berhenti mengetik sampai pratinjau berubah < 300 ms (diukur)
- [ ] Field kosong terlihat jelas sebagai belum terisi

**Jangan:** jangan memanggil server untuk setiap ketikan. Render di klien.

---

### T-060 · Alur approval surat
**Fase** 2 · **Butuh** T-056, T-058 · **Baca** PRD F-4.3 · USER_FLOW §5.2, §11.2

**Buat:** `app/(dashboard)/surat/approval/page.tsx` · `app/api/surat/[id]/{submit,approve,reject,cancel}/route.ts` · `lib/surat/status.ts`
**Ubah:** —

**Kontrak:**
1. State machine persis USER_FLOW §11.2: `DRAFT → MENUNGGU_APPROVAL → DISETUJUI → TERBIT`, plus `DITOLAK → DRAFT` dan `→ DIBATALKAN`. Transisi ilegal ditolak di server.
2. Approver: Ketua **atau** Wakil **atau** Sekum — satu cukup (INV-05). BPH tidak pernah muncul di antrian (INV-04).
3. Setelah satu approver menyetujui, item **hilang dari antrian dua approver lain** secara langsung.
4. Penolakan **wajib** disertai catatan alasan (konfirmasi tingkat tinggi).
5. Approve memicu urutan: alokasi nomor (T-056) → generate dokumen (T-061) → simpan arsip → status `TERBIT`. Bila generate gagal, nomor **tetap terpakai** dan status berhenti di `DISETUJUI` dengan pesan jelas (nomor tidak didaur ulang, INV-16).
6. Surat `TERBIT` tidak dapat diedit; hanya dapat dibatalkan, dan dokumen dibatalkan tetap tersimpan dengan badge `DIBATALKAN`.

**Verifikasi:**
```bash
npm run test:e2e -- surat-approval
```

**Selesai bila:**
- [ ] Kadept mengajukan surat → muncul di antrian Ketua, Wakil, dan Sekum
- [ ] Setelah satu menyetujui, hilang dari antrian dua lainnya
- [ ] Penolakan tanpa alasan ditolak server

**Jangan:** jangan mengembalikan nomor ke pool saat pembatalan.

---

### T-061 · Document Engine (DOCX)
**Fase** 2 · **Butuh** T-006, T-049, T-055, T-060 · **Baca** SYSTEM_DESIGN §8.1, §8.3 · PRD F-4.3

**Buat:** `lib/documents/{docx-engine,template-loader,data-mapper,image-module}.ts` · `app/api/surat/[id]/download/route.ts`
**Ubah:** —

**Kontrak:**
1. `TemplateLoader` mengambil `.docx` dari storage berdasarkan `template_id` **dan versi yang tercatat di surat**, dengan cache in-memory.
2. `DataMapper` memetakan baris DB → objek placeholder sesuai kamus SYSTEM_DESIGN §8.3, termasuk `tanggal_surat_format` (format Indonesia lewat `lib/utils`), loop `items`, `signers`, `rundown`, `poin`.
3. `ImageModule` menyisipkan `{%ttd_ketua}`, `{%ttd_sekum}` (dari bucket privat), dan `{%stempel}` (aset sistem) dengan ukuran yang benar; stempel di-overlay pada posisi TTD Ketua.
4. Isi surat HTML dikonversi ke paragraf DOCX; tag yang tidak didukung dibuang (sanitasi, mencegah injeksi XML).
5. Dokumen hasil disimpan sebagai baris `dokumen` (jenis `SURAT`, format `DOCX`) dan diunggah ke bucket privat.
6. Endpoint download memverifikasi permission, mengembalikan berkas dengan `Content-Disposition: attachment` dan nama berkas `{nomor_lengkap}.docx` dengan `/` diganti `-`.
7. Bila generate gagal, hapus berkas parsial dan jangan buat baris `dokumen`.

**Verifikasi:**
```bash
npm run test -- docx-engine && npx tsx scripts/template-dryrun.ts
```

**Selesai bila:**
- [ ] Dokumen hasil memiliki kop, nomor benar, TTD dan stempel pada posisi tepat
- [ ] Berkas dibuka di Word 2016+ tanpa peringatan korupsi
- [ ] Sembilan jenis surat berhasil di-generate dengan data contoh

**Jangan:** jangan merender surat dari nol dengan library DOCX generatif. Wajib memakai template asli (kop harus utuh).

---

### T-062 🧑 · Konversi PDF
**Fase** 2 · **Butuh** T-061 · **Baca** SYSTEM_DESIGN §8.4 · ADR-010

**Buat:** `lib/documents/pdf-converter.ts` · `docs/adr/ADR-010-pdf-strategi.md` (perbarui status nyata)
**Ubah:** `lib/surat/field-schemas.ts` (opsi format)

**Kontrak:**
1. Tiga jalur berurutan: `GOTENBERG_URL` → `SOFFICE_PATH` → fallback HTML→PDF.
2. `PDF_ENABLED=false` (ADR-010) menyembunyikan opsi PDF di seluruh UI dan menolak permintaan PDF di server dengan pesan jelas — **bukan** menghasilkan PDF berkualitas rendah diam-diam.
3. Jalur fallback HTML hanya boleh dipakai bila secara eksplisit diaktifkan; hasilnya ditandai "fidelitas rendah" di UI.
4. PDF hasil wajib punya **teks yang bisa diseleksi**, bukan rasterisasi — verifikasi otomatis dengan ekstraksi teks.
5. Bila Gotenberg belum tersedia saat fase ini, set task `BLOCKED`, rilis DOCX-only, dan catat di ADR-010.

**Verifikasi:**
```bash
npm run test -- pdf-converter
```

**Selesai bila:**
- [ ] Dengan `PDF_ENABLED=false`, opsi PDF tidak muncul di mana pun
- [ ] Dengan Gotenberg aktif, ekstraksi teks dari PDF hasil mengembalikan isi surat

**Jangan:** jangan memaksakan PDF hasil screenshot atau rasterisasi.

---

### T-063 · Arsip surat
**Fase** 2 · **Butuh** T-061 · **Baca** PRD F-4.4 · DESIGN_SYSTEM §11.3

**Buat:** `app/(dashboard)/surat/page.tsx` · `app/(dashboard)/surat/[id]/page.tsx` · `app/api/surat/route.ts` (GET) · `lib/surat/export-daftar.ts`
**Ubah:** —

**Kontrak:**
1. Tabel 9 kolom: Nomor · Jenis · Perihal · Tujuan · Tanggal · Pembuat · Approver · Status · Aksi.
2. Filter: periode, jenis surat, bulan, status, departemen, kegiatan. Filter tersimpan di URL (dapat dibagikan).
3. Pencarian teks penuh pada perihal, tujuan, dan isi (index T-028).
4. Unduh ulang DOCX/PDF kapan saja; export daftar ke Excel.
5. Surat `DIBATALKAN` tetap tampil dengan badge, nomornya tidak hilang dari urutan.
6. Paginasi kursor, 50 baris per halaman, dengan skeleton saat memuat.

**Verifikasi:**
```bash
npm run test:e2e -- arsip-surat
```

**Selesai bila:**
- [ ] Seluruh Acceptance Criteria PRD F-4.4 terpenuhi
- [ ] Pencarian "peminjaman tandu" menemukan surat yang relevan
- [ ] Surat dibatalkan tetap terlihat dengan badge

**Jangan:** jangan menyembunyikan surat dibatalkan dari arsip.

---

### T-064 · Generate massal Surat Keterangan Aktif Organisasi
**Fase** 2 · **Butuh** T-063, T-057 · **Baca** PRD F-4.2 (generate massal) · USER_FLOW §5.3

**Buat:** `app/(dashboard)/surat/massal/page.tsx` · `app/api/surat/batch/route.ts` · `lib/surat/batch.ts`
**Ubah:** —

**Kontrak:**
1. Pilih banyak mahasiswa dari **Data Pengurus** (T-107; sementara boleh dari data seed dev), isi satu keperluan bersama.
2. Batch approve memanggil `alokasi_nomor_batch` dalam **satu transaksi** (INV-15) sehingga nomor berurutan tanpa disela.
3. Generate 30 dokumen lalu bundel menjadi satu ZIP dengan nama berkas `{nomor}-{nama}.docx`.
4. Progres ditampilkan per dokumen; kegagalan satu dokumen tidak membatalkan seluruh batch, tetapi dilaporkan di ringkasan.
5. Batas aman satu batch: 50 dokumen. Lebih dari itu diminta dipecah.

**Verifikasi:**
```bash
npm run test:e2e -- surat-massal
```

**Selesai bila:**
- [ ] 30 mahasiswa menghasilkan 30 nomor berbeda dan berurutan
- [ ] ZIP berisi 30 berkas DOCX yang semuanya terbuka di Word
- [ ] Kegagalan satu dokumen dilaporkan, tidak menggagalkan sisanya

**Jangan:** jangan menjalankan 30 approval sebagai 30 request terpisah dari klien.
