# ADR-031 — Metadata gambar dibuang pada tingkat byte, bukan lewat sharp

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-10-15 |
| **Task terkait** | T-098 |
| **Ditemukan oleh** | agent saat mengerjakan T-098 |

## Konteks

Kontrak T-098 butir 4 berbunyi: "Strip metadata sensitif **tanpa re-encode
piksel**: `sharp().rotate().withMetadata({ exif: {} })`". Kedua bagian kalimat
itu bertentangan. sharp selalu men-decode masukan lalu meng-encode ulang
keluarannya; tidak ada mode salin-apa-adanya. Master JPEG nota akan
dikompresi untuk kedua kalinya (setelah pipeline klien T-097), yang
dilarang PRD I3 dan justru merusak tepi teks angka pada nota — bagian yang
menentukan lulus-tidaknya uji cetak T-099.

## Keputusan

Maksud kontrak ("tanpa re-encode piksel", buang GPS/perangkat) diutamakan di
atas contoh kodenya. `lib/images/strip-metadata.ts` membuang segmen metadata
pada tingkat byte dan menyalin data citra apa adanya:

- **JPEG** — buang APP1 (EXIF/XMP), APP13 (IPTC), COM; pertahankan APP0
  (JFIF), APP2 (profil ICC), APP14 (Adobe), dan seluruh data setelah SOS.
- **PNG** — buang chunk `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME`.
- **WebP** — buang chunk `EXIF` dan `XMP `, matikan benderanya di `VP8X`,
  hitung ulang ukuran RIFF.

`rotate()` tidak diperlukan: pipeline klien sudah memutar piksel. Berkas yang
masih membawa tag orientasi > 1 berarti tidak lewat pipeline, dan **ditolak**
— membuang tag-nya tanpa memutar piksel akan membuat nota tampak miring.

Unit test `image-upload` membuktikan data setelah SOS identik byte demi byte
dan GPS tidak lagi terbaca `exifr`.

## Akibat

- Master yang diunduh (T-099) adalah persis keluaran pipeline klien, minus
  metadata — tidak ada generasi kompresi kedua.
- Unggahan dari luar aplikasi yang bergantung pada tag orientasi ditolak
  dengan pesan "Unggah lewat aplikasi HMIF Center".
