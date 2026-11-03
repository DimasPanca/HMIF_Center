# FORM_CONTRACT.md — Kontrak fitur Formulir (ADR-038)

## 1. Model data (migrasi 052)

| Tabel | Isi |
|---|---|
| `form_template` | nama, kategori, deskripsi, `isi` (struktur bagian+pertanyaan, bentuk = `SkemaStruktur`), `bawaan`, `aktif` |
| `form` | periode, `kepanitiaan_id?`, kategori, judul, deskripsi, status `DRAF/DIBUKA/DITUTUP`, akses `PUBLIK/INTERNAL`, `anonim`, `satu_respons`, `ditutup_pada?`, `kuota?`, `pesan_selesai`, `token` (tautan publik), `template_id?`, pembuat |
| `form_bagian` | urutan, judul, deskripsi, `lanjut_ke` (`null` = bagian berikutnya, `'KIRIM'`, atau id bagian) |
| `form_pertanyaan` | bagian, urutan, `tipe`, judul, deskripsi, `wajib`, `opsi` (per tipe, §2), `peran?` (pemetaan integrasi), `diarsipkan_at?` |
| `form_respons` | form, `user_id?` (null bila anonim/publik), `responden_kunci?` (SHA-256 form+user, menegakkan satu respons per akun tanpa membuka identitas), `status_seleksi` (oprec), `integrasi` (id baris peserta/pengurus yang terbentuk), `dikirim_at` |
| `form_jawaban` | respons, pertanyaan, salah satu: `nilai_teks`, `nilai_angka`, `nilai_tanggal`, `nilai_waktu`, `nilai_json` (larik pilihan / peta kisi), `berkas` ({key, nama, mime, ukuran}); UNIQUE(respons, pertanyaan) |

Kategori ↔ acara (CHECK): `PENDAFTARAN`, `EVALUASI` wajib `kepanitiaan_id`;
`OPEN_RECRUITMENT`, `PENDATAAN_PENGURUS` wajib tanpa acara; `LAINNYA` bebas.

## 2. Tipe pertanyaan & opsi

| Tipe | `opsi` | Jawaban tersimpan di |
|---|---|---|
| `TEKS_SINGKAT` | `{ maks? }` | `nilai_teks` (≤ 500) |
| `PARAGRAF` | `{ maks? }` | `nilai_teks` (≤ 5000) |
| `EMAIL` | — | `nilai_teks` (format email) |
| `ANGKA` | `{ min?, maks? }` | `nilai_angka` |
| `PILIHAN_GANDA` | `{ pilihan: [{id, label, lompat_ke?}], lainnya? }` | `nilai_teks` (id pilihan) / `nilai_json.lainnya` |
| `DROPDOWN` | `{ pilihan: [{id, label, lompat_ke?}] }` | `nilai_teks` |
| `KOTAK_CENTANG` | `{ pilihan, min?, maks? }` | `nilai_json` (larik id) |
| `SKALA` | `{ min: 0|1, maks: 2..10, label_min?, label_maks? }` | `nilai_angka` |
| `TANGGAL` | — | `nilai_tanggal` |
| `WAKTU` | — | `nilai_waktu` |
| `UNGGAH_BERKAS` | `{ jenis: ('gambar'|'pdf')[], maks_mb ≤ 4 }` | `berkas` |
| `KISI_PILIHAN` | `{ baris: [{id,label}], kolom: [{id,label}] }` | `nilai_json` {baris→kolom} |
| `KISI_CENTANG` | sama | `nilai_json` {baris→[kolom]} |

`lompat_ke` hanya pada `PILIHAN_GANDA`/`DROPDOWN` dan hanya bila pertanyaan itu
satu-satunya yang berlogika di bagiannya; nilainya id bagian atau `'KIRIM'`.
Jalur bagian dihitung `jalurBagian()`; hanya pertanyaan di jalur yang
divalidasi & disimpan.

## 3. Aturan

- Struktur divalidasi `SkemaStruktur` (Zod) di editor DAN server (K-04).
- Membuka form (`DRAF/DITUTUP → DIBUKA`) menuntut ≥ 1 pertanyaan; Pendaftaran
  menuntut pertanyaan ber-`peran` `nama_lengkap`; Pendataan Pengurus menuntut
  `nama_lengkap` + `nim`.
- Respons ditolak bila status ≠ DIBUKA, lewat `ditutup_pada`, kuota penuh
  (dicek di transaksi berkunci `pg_advisory_xact_lock`), atau akun sudah
  merespons (`satu_respons`).
- Pertanyaan yang sudah punya jawaban: tipe terkunci; menghapusnya =
  `diarsipkan_at` (tetap tampil di ekspor sebagai kolom arsip).
- Publik: rate limit 20 kirim/jam per IP per form, honeypot `situs_web`.
- Unggahan: JPEG/PNG/WebP/PDF via magic bytes, ≤ 4 MB/berkas dan total kiriman
  ≤ 4,4 MB (batas badan permintaan Vercel 4,5 MB; foto dikompres di peramban
  sebelum dikirim), ≤ 5 berkas per respons, key `form/{form}/{respons}/{uuid}.{ext}` (bucket privat).

## 4. API

| Method | Rute | Izin |
|---|---|---|
| GET/POST | `/api/form` | baca: terlihat; buat: §ADR-038 #4 |
| GET/PUT/DELETE | `/api/form/{id}` | pembuat & pengelola; DELETE hanya tanpa respons |
| POST | `/api/form/{id}/status` `{aksi: buka|tutup}` | pengelola |
| GET | `/api/form/{id}/respons` · `/respons/ekspor` (xlsx) | pembaca respons |
| PATCH | `/api/form/{id}/respons/{rid}` `{status_seleksi}` | pengelola (oprec) |
| POST | `/api/form/{id}/respons/{rid}/terapkan` | Sekum/Admin (pendataan) |
| GET | `/api/form/{id}/berkas/{jawabanId}` | pembaca respons |
| GET/POST, PUT/DELETE | `/api/form/template`, `/api/form/template/{id}` | baca semua; tulis Sekum/Admin |
| GET/POST | `/api/f/{token}` | publik (PUBLIK) / login (INTERNAL) |

## 5. Layar

- `/form` daftar form · `/form/baru` 3 langkah: **Untuk apa?** (kategori) →
  **Mulai dari** (template/kosong) → **Judul & deskripsi** · `/form/{id}`
  editor · `/form/{id}/respons` ringkasan, daftar, ekspor, tindakan integrasi
  · `/form/template` (Sekum/Admin) · `/f/{token}` halaman isi · tab acara
  "Formulir".
