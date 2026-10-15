# ADR-032 — jscanify & OpenCV.js dimuat dari jsDelivr dengan SRI, bukan dari paket npm

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-10-15 |
| **Task terkait** | T-100 |
| **Ditemukan oleh** | agent saat mengerjakan T-100 |

## Konteks

SYSTEM_DESIGN §2 menetapkan **jscanify (OpenCV.js)** untuk deteksi tepi dan
koreksi perspektif nota, dimuat lazy saat kamera dibuka (§19.1¹). Tiga cara
memasukkannya ke aplikasi diperiksa:

1. **Paket npm `jscanify@1.4.3`.** `main`-nya `src/jscanify-node.js` dan
   dependensinya `canvas` (biner native) + `jsdom`. Keduanya tidak pernah
   berjalan di browser, tetapi ikut dipasang di build produksi Vercel — risiko
   build gagal untuk kode yang tidak dipakai server sama sekali.
2. **Menyalin `opencv.js` (±9 MB) ke `public/`.** Repo saat ini ±36 MB; satu
   berkas ini menambah ±25%, dan setiap pembaruan versi menambah lagi.
3. **Membundel lewat webpack** (`import()` paket OpenCV). Minifikasi berkas
   ±9 MB memperlambat setiap `next build` untuk kode yang isinya tidak berubah.

## Keputusan

`lib/images/jscanify-loader.ts` menyisipkan dua `<script>` saat kamera dibuka:

```
https://cdn.jsdelivr.net/npm/jscanify@1.4.3/src/opencv.js    sha384-gIQOiZ94…h3KT
https://cdn.jsdelivr.net/npm/jscanify@1.4.3/src/jscanify.js  sha384-1lFiUI8f…X6Dz
```

- Versi terkunci di URL, dan atribut `integrity` (SRI) membuat browser menolak
  menjalankan skrip bila isinya berbeda satu bita pun dari tarball npm yang
  diperiksa. Hash dihitung dari tarball dan dicocokkan dengan salinan jsDelivr
  (2026-10-15); jsDelivr menjawab `Access-Control-Allow-Origin: *`.
- Loader sendiri hanya diambil lewat `import()` di `CameraCapture`, sehingga
  baik loader maupun OpenCV tidak ada di bundle awal halaman. Dijaga oleh
  `scripts/bench-bundle.ts` (memeriksa URL & hash tidak ada di chunk awal).
- Gagal memuat (offline, CDN diblokir, hash tak cocok) **tidak memblokir**:
  foto dipakai apa adanya (kontrak T-100 butir 4).

## Konsekuensi

- Pemindaian butuh akses ke `cdn.jsdelivr.net`. Tanpanya, upload tetap jalan
  tanpa koreksi perspektif. Bila kelak CSP `script-src` dipasang, origin ini
  harus diizinkan.
- `opencv.js` build ini mengembalikan Module **thenable**. Jangan pernah
  `await` atau me-`return` objek `cv` dari fungsi async — promise-nya mengadopsi
  `cv.then` tanpa akhir dan membekukan tab (terukur di gate `kamera-nota`).
- Memperbarui versi = ubah URL **dan** hitung ulang kedua hash SRI.
- Gate e2e: `playwright.config` menambahkan `x-forwarded-for` ke semua
  permintaan, termasuk lintas origin, dan jsDelivr menolak preflight-nya.
  Spec yang memuat pemindai memakai `extraHTTPHeaders: {}`.
- Anggaran SYSTEM_DESIGN §19.1 "< 250 KB" dibaca sebagai ukuran **gzip** (yang
  diunduh browser, sama dengan kolom "First Load JS" `next build`).
  Terukur di harness `/qa/kamera`: 114 KB gzip (385 KB mentah).
