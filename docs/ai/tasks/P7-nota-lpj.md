# FASE 7 — Nota, Pipeline Gambar & LPJ (T-097 … T-105)

**Deliverable fase:** nota belanja terarsip dengan kualitas cetak, dan LPJ ter-generate otomatis lengkap dengan analisis selisih.
**Fase paling ketat aturannya.** Aturan gambar I1–I12 (PRD F-11.2) = invariant INV-18 … INV-24. Melanggar satu saja membuat arsip nota tidak layak audit.
**Gerbang keluar:** lihat AI_EXECUTION_PLAN §6 (P7 → P9) — termasuk **uji cetak fisik**.

---

### T-097 · Pipeline gambar sisi klien
**Fase** 7 · **Butuh** T-009 · **Baca** PRD F-11.2 (aturan I1–I12) · SYSTEM_DESIGN §9.1, §9.2

**Buat:** `lib/images/{client-pipeline,detect-kind,constants,fit-within}.ts` · `lib/images/__tests__/pipeline.test.ts`
**Ubah:** —

**Kontrak:**
1. Urutan wajib: baca EXIF orientation (`exifr`) → auto-rotate → **decode sekali** ke `ImageBitmap` → buat **tiga turunan paralel dari bitmap yang sama** (INV-18). Dilarang berantai `master → preview`.
2. Konstanta persis: MASTER JPEG `maxDim 3000`, kualitas **0.90 foto / 0.93 dokumen**; PREVIEW WebP `1280` q`0.78`; THUMB WebP `400` q`0.70`.
3. `fitWithin` **tidak pernah upscale** dan tidak pernah memaksa aspect ratio (INV-22).
4. `detect-kind.ts` memakai heuristik histogram SYSTEM_DESIGN §9.2 (rasio terang > 0.55 dan rasio tengah < 0.30 → `DOKUMEN`).
5. Gambar bertransparansi **tidak** dipaksa ke JPEG; pakai WebP lossless (I8).
6. `bitmap.close()` dipanggil setelah selesai (hindari kebocoran memori di ponsel).
7. Test dengan gambar fixture nyata: 4032×3024, 1600×1200, PNG transparan, JPEG portrait ber-EXIF orientation 6.

**Verifikasi:**
```bash
npm run test -- image-pipeline
```

**Selesai bila:**
- [ ] Foto 4032×3024 menghasilkan master 3000×2250, ukuran 800 KB – 2 MB
- [ ] Foto 1600×1200 **tidak** di-upscale (master tetap 1600×1200)
- [ ] Foto portrait ber-EXIF tidak miring setelah diproses
- [ ] PNG transparan tidak berubah menjadi latar hitam

**Jangan:** jangan membuat preview dari master. Jangan menghapus EXIF sebelum rotasi diterapkan.

---

### T-098 · Validasi & penyimpanan sisi server
**Fase** 7 · **Butuh** T-097, T-044 · **Baca** SYSTEM_DESIGN §9.3 · PRD F-11.2 (I6, I7, I10, I11)

**Buat:** `app/api/images/upload/route.ts` · `lib/images/server-validate.ts`
**Ubah:** —

**Kontrak:**
1. Batas ukuran **15 MB** (ADR-014); melebihi → `FILE_TIDAK_VALID` dengan pesan jelas.
2. **MIME sniffing dengan magic bytes** (`file-type`), bukan ekstensi atau `Content-Type` klien (INV-21). Hanya `image/jpeg`, `image/png`, `image/webp`.
3. Decode ulang master dengan `sharp` untuk memastikan tidak korup; cek dimensi dan ukuran > 0 (I10).
4. Strip metadata sensitif **tanpa re-encode piksel**: `sharp().rotate().withMetadata({ exif: {} })` (I5).
5. Nama berkas storage memakai **UUID** (INV-21); nama asli disimpan di kolom `original_filename` untuk keperluan unduh.
6. Verifikasi akhir: baca kembali master dari storage dan pastikan bisa di-decode — **baru** buat record `image`.
7. Bila gagal di titik mana pun: hapus **seluruh** berkas parsial yang sudah terunggah, jangan buat record apa pun (INV-23).
8. Rate limit 30 upload/jam per user.

**Verifikasi:**
```bash
npm run test -- image-upload
```

**Selesai bila:**
- [ ] Berkas bernama `foto.jpg` yang sebenarnya PDF ditolak
- [ ] Data GPS hilang dari master (diperiksa dengan pembaca EXIF)
- [ ] Kegagalan pemrosesan tidak menyisakan berkas di storage maupun record di DB

**Jangan:** jangan mempercayai `Content-Type` dari klien.

---

### T-099 🧑 · Endpoint unduhan master & uji cetak
**Fase** 7 · **Butuh** T-098 · **Baca** SYSTEM_DESIGN §9.4, §9.5 · PRD F-11.2 (I2, I3) · USER_FLOW §7.3

**Buat:** `app/api/images/[id]/download/route.ts` · `components/nota/NotaImage.tsx` · `docs/ai/UJI_CETAK.md`
**Ubah:** —

**Kontrak:**
1. Endpoint **wajib** membaca `master_path` — bukan preview, bukan thumbnail (INV-19). Tulis komentar peringatan di atas kode.
2. Berkas dikirim **apa adanya**: tanpa transform, resize, atau re-encode. Header: `Content-Type` dari `master_mime_type`, `Content-Disposition: attachment; filename="{original_filename}"`, `Content-Length`, `Cache-Control: private, max-age=3600`.
3. Permission diperiksa sebelum mengirim; nama berkas disanitasi (hilangkan path traversal).
4. `NotaImage.tsx` hanya menerima varian `'thumb' | 'preview'` — **tidak ada varian `master`** (INV-24). Tulis komentar penjelas.
5. `UJI_CETAK.md` berisi prosedur uji manual: unduh master → sisipkan ke Word → cetak → periksa keterbacaan nominal, tanggal, dan nama toko pada nota.
6. Set task `BLOCKED` sampai manusia menyelesaikan uji cetak dan mencatat hasilnya di `UJI_CETAK.md`.

**Verifikasi:**
```bash
npm run test -- image-download && grep -rn "master" components/nota/NotaImage.tsx
```

**Selesai bila:**
- [ ] Endpoint mengembalikan `Content-Type: image/jpeg` dan `Content-Disposition: attachment`
- [ ] `NotaImage.tsx` tidak memuat varian master (dibuktikan dengan grep)
- [ ] 🧑 Uji cetak nyata lulus: teks pada nota terbaca jelas di kertas

**Jangan:** jangan menambahkan parameter query untuk resize di endpoint unduh.

---

### T-100 · Kamera & auto-scan dokumen
**Fase** 7 · **Butuh** T-097 · **Baca** PRD F-11.3 · DESIGN_SYSTEM §9.6

**Buat:** `components/nota/{CameraCapture,ScanPreview,ScanOverlay}.tsx` · `lib/images/jscanify-loader.ts`
**Ubah:** —

**Kontrak:**
1. jscanify (OpenCV.js) dimuat **lazy**, hanya saat kamera dibuka (`dynamic import`) — bundle halaman upload tetap < 250 KB sebelum kamera aktif.
2. Deteksi tepi ditampilkan sebagai overlay real-time; koreksi perspektif diterapkan pada hasil tangkapan.
3. **Preview wajib** sebelum upload, dengan tombol **Ambil Ulang** dan **Gunakan** (PRD F-11.3).
4. Fallback: bila deteksi tepi gagal atau OpenCV gagal dimuat, pakai foto apa adanya setelah auto-rotate — jangan memblokir user.
5. Mendukung juga pilih dari galeri (input file) dengan alur preview yang sama.
6. UI dioptimalkan untuk ponsel (DESIGN_SYSTEM §9.6): tombol besar, area preview penuh, orientasi potret.
7. Izin kamera ditolak → pesan jelas + tombol "Pilih dari galeri".

**Verifikasi:**
```bash
npm run test:e2e -- kamera-nota && npx tsx scripts/bench-bundle.ts -- /keuangan/nota/upload
```

**Selesai bila:**
- [ ] Bundle halaman upload < 250 KB sebelum kamera dibuka (diukur)
- [ ] Deteksi tepi gagal tidak memblokir upload
- [ ] Alur lengkap dapat diselesaikan di layar 375 px

**Jangan:** jangan memuat OpenCV.js di layout atau halaman lain.

---

### T-101 · Alur upload nota
**Fase** 7 · **Butuh** T-100, T-089 · **Baca** PRD F-11.1 · USER_FLOW §7.1 · ADR-006, ADR-007

**Buat:** `app/(dashboard)/keuangan/nota/upload/page.tsx` · `components/nota/{ItemRabSelector,AlokasiEditor,NotaForm}.tsx` · `app/api/nota/route.ts`
**Ubah:** —

**Kontrak:**
1. Urutan alur **wajib** seperti USER_FLOW §7.1: pilih divisi → **pilih item RAB** → baru kamera aktif. Tombol kamera nonaktif sebelum item RAB dipilih (PRD F-11.1).
2. Panitia hanya melihat item RAB dari divisi tempat ia terdaftar.
3. Satu nota dapat dialokasikan ke **beberapa item RAB** dengan nominal per item; sisa alokasi ditampilkan real-time.
4. Total alokasi **wajib sama** dengan total nota saat submit (INV-28, ADR-007). Bila tidak, tolak dengan `ALOKASI_TIDAK_SEIMBANG` **dan tampilkan selisihnya**.
5. Alokasi di luar RAB diisi lewat `uraian_luar_rab` (ADR-006) — tersedia sebagai opsi "Pengeluaran di luar RAB" pada editor alokasi.
6. Metadata: tanggal belanja, total nota, jumlah aktual & harga aktual per item, keterangan.
7. Status awal `MENUNGGU_VERIFIKASI`. Nota ditolak dapat diperbaiki dan diunggah ulang oleh pengunggah.

**Verifikasi:**
```bash
npm run test:e2e -- upload-nota
```

**Selesai bila:**
- [ ] Kamera tidak bisa dibuka sebelum item RAB dipilih
- [ ] Alokasi `Rp50.000 + Rp25.000` pada nota `Rp75.000` diterima; `Rp60.000 + Rp25.000` ditolak dengan selisih ditampilkan
- [ ] Panitia divisi lain tidak muncul di dropdown item RAB

**Jangan:** jangan mengizinkan upload tanpa kaitan ke item RAB atau uraian luar RAB.

---

### T-102 · Verifikasi nota
**Fase** 7 · **Butuh** T-101, T-099 · **Baca** PRD F-11.4 · USER_FLOW §7.2 · SYSTEM_DESIGN §9.5

**Buat:** `app/(dashboard)/keuangan/nota/verifikasi/page.tsx` · `components/nota/{AntrianNota,NotaDetailSplit,VerifikasiAksi}.tsx` · `app/api/nota/[id]/{verify,reject,minta-perbaikan}/route.ts`
**Ubah:** —

**Kontrak:**
1. Antrian nota menunggu verifikasi, dikelompokkan per acara dan divisi.
2. Aturan varian gambar ditegakkan (SYSTEM_DESIGN §9.5): **grid pakai thumbnail**, **detail pakai preview**, **unduh pakai master**.
3. Tampilan berdampingan: gambar nota vs data yang diinput, agar Bendum bisa membandingkan tanpa berpindah layar.
4. Tiga aksi: **Setujui** · **Tolak** (wajib alasan) · **Minta Perbaikan** (wajib catatan).
5. Verifikasi memeriksa ulang kesamaan total alokasi (INV-28) sebelum menyetujui.
6. Hanya Bendum dan Admin yang dapat memverifikasi (`nota.verify`).
7. Galeri 30 nota dimuat **< 2 detik** menggunakan thumbnail + lazy loading.

**Verifikasi:**
```bash
npm run test:e2e -- verifikasi-nota && npx tsx scripts/bench-galeri-nota.ts
```

**Selesai bila:**
- [ ] Galeri 30 nota dimuat < 2 detik (diukur)
- [ ] Penolakan tanpa alasan ditolak server
- [ ] Grid tidak pernah memuat berkas master (diperiksa di panel jaringan)

**Jangan:** jangan menampilkan master di grid "supaya lebih jelas".

---

### T-103 · PENGELUARAN & RAB AKTUAL otomatis
**Fase** 7 · **Butuh** T-102, T-090 · **Baca** PRD F-9.2 · SYSTEM_DESIGN §11.4

**Buat:** `lib/rab/realisasi.ts` · `components/rab/RabAktualTab.tsx`
**Ubah:** `lib/rab/excel-export.ts` · `app/api/nota/[id]/verify/route.ts`

**Kontrak:**
1. Verifikasi nota menyisipkan baris ke sheet PENGELUARAN (tanggal, uraian, divisi, nominal) dan memperbarui RAB AKTUAL per item.
2. Saldo berjalan dihitung ulang **secara berurutan menurut tanggal**, bukan urutan input.
3. **Membatalkan verifikasi** menghitung ulang seluruh saldo dari awal, bukan sekadar menghapus baris.
4. Perhitungan realisasi memakai `nota_alokasi.nominal`, bukan `nota.total_nota` (satu nota bisa terbagi ke beberapa item).
5. Alokasi ber-`rab_item_id NULL` (di luar RAB) masuk PENGELUARAN tetapi **tidak** masuk RAB AKTUAL per item — ia muncul sebagai temuan di LPJ (ADR-006).
6. Tab RAB Aktual menampilkan rencana vs realisasi berdampingan dengan penanda selisih.

**Verifikasi:**
```bash
npm run test -- rab-realisasi
```

**Selesai bila:**
- [ ] Membatalkan verifikasi nota tengah menghitung ulang saldo dengan benar
- [ ] Nota yang terbagi ke 3 item RAB menambah realisasi ketiga item sesuai porsinya
- [ ] Pengeluaran di luar RAB muncul di PENGELUARAN dan ditandai

**Jangan:** jangan menghitung saldo secara inkremental tanpa kemampuan hitung ulang penuh.

---

### T-104 · Analisis LPJ
**Fase** 7 · **Butuh** T-103, T-092 · **Baca** PRD F-12.2 · SYSTEM_DESIGN §11.5 · ADR-006

**Buat:** `lib/lpj/analyze.ts` · `lib/lpj/__tests__/analyze.test.ts` · `app/api/lpj/[kepanitiaanId]/analyze/route.ts`
**Ubah:** —

**Kontrak:**
1. Menghasilkan seluruh field `AnalisisLpj` SYSTEM_DESIGN §11.5: per item, per divisi, over-budget, belum realisasi, **di luar RAB**, total rencana, total aktual, total pemasukan, sisa dana, dana tak terduga terpakai.
2. Kategori per item: `SESUAI` · `OVER_BUDGET` · `UNDER_BUDGET` · `BELUM_REALISASI`.
3. `diLuarRab` diambil dari alokasi ber-`rab_item_id IS NULL` (ADR-006) — bukan filter yang selalu kosong.
4. Persentase selisih aman terhadap pembagian nol.
5. Hasil analisis disimpan sebagai **snapshot** di `lpj.analisis` saat generate, agar LPJ yang sudah terbit tidak berubah bila RAB diedit kemudian.
6. Test dengan skenario: item tanpa nota, item over 200%, nota terbagi 3 item, pengeluaran di luar RAB, pemasukan dari 2 sumber.

**Verifikasi:**
```bash
npm run test -- lpj-analyze
```

**Selesai bila:**
- [ ] Total pengeluaran LPJ **sama persis** dengan jumlah nota terverifikasi
- [ ] Item RAB tanpa nota muncul di daftar "Belum Direalisasikan"
- [ ] Pengeluaran di luar RAB muncul sebagai temuan (bukan daftar kosong)

**Jangan:** jangan menghitung analisis ulang saat menampilkan LPJ yang sudah final. Pakai snapshot.

---

### T-105 · Generator LPJ
**Fase** 7 · **Butuh** T-104, T-061 · **Baca** PRD F-12.1 · USER_FLOW §7.4 · ADR-015

**Buat:** `app/(dashboard)/acara/[id]/lpj/page.tsx` · `lib/lpj/generate.ts` · `app/api/lpj/[kepanitiaanId]/{route.ts,generate,approve}/route.ts` · `components/lpj/{PrasyaratChecklist,BagianManual,LampiranNota}.tsx`
**Ubah:** —

**Kontrak:**
1. **Checklist prasyarat** sebelum generate: minimal 1 nota terverifikasi, RAB berstatus `REALISASI`/`SELESAI`, TOR/Proposal ada (opsional, ditandai), dokumentasi terunggah.
2. Bagian otomatis (identitas, kepanitiaan, laporan keuangan, rincian pemasukan/pengeluaran, perbandingan RAB vs aktual, sisa dana, lampiran nota) vs bagian manual (realisasi kegiatan, evaluasi, saran, dokumentasi) dibedakan visual.
3. **Lampiran nota**: seluruh gambar **master** (INV-19), dikelompokkan per divisi, dengan keterangan item RAB dan nominal.
4. Lembar Pengesahan disertakan mengikuti `Lembar Pengesahan LPJ.pdf`, dengan TTD yang benar.
5. Alur approval dua tahap (ADR-015): `DRAFT → DIAJUKAN → DISETUJUI_BENDUM → FINAL`. LPJ `FINAL` tidak dapat diubah.
6. Output DOCX mengikuti `Template LPJ HMIF.docx`; PDF bila `PDF_ENABLED`.
7. Generate menyimpan snapshot analisis (T-104) ke `lpj.analisis`.

**Verifikasi:**
```bash
npm run test:e2e -- lpj-generate
```

**Selesai bila:**
- [ ] LPJ dapat di-generate setelah minimal 1 nota terverifikasi
- [ ] Seluruh nota terlampir sebagai gambar master berkualitas cetak
- [ ] Output mengikuti struktur `Template LPJ HMIF.docx` dan memuat Lembar Pengesahan
- [ ] LPJ FINAL tidak dapat diubah

**Jangan:** jangan melampirkan preview/thumbnail ke LPJ.
