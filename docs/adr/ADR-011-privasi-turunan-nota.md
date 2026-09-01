# ADR-011 — Privasi turunan nota

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-044, T-098, T-102 |

## Konteks

SYSTEM_DESIGN §12.2 menempatkan turunan preview dan thumbnail nota di bucket `public/` yang dapat diakses langsung lewat CDN.

PRD §8.4 S4 mewajibkan **"File nota & TTD di bucket privat — diakses melalui signed URL berdurasi pendek"**.

Nota belanja memuat data keuangan organisasi: nama toko, nominal, tanggal. Menaruh preview-nya di URL publik berarti siapa pun yang menebak atau memperoleh URL dapat membacanya tanpa autentikasi — termasuk setelah pengurus yang bersangkutan tidak lagi menjabat.

## Keputusan

**Seluruh turunan nota — master, preview, dan thumbnail — berada di storage privat.**

Preview dan thumbnail disajikan lewat **signed URL yang diautorisasi**, bukan URL publik.

Bucket `public/` hanya untuk aset yang memang boleh dilihat siapa saja: logo, stempel, dan avatar.

## Konsekuensi implementasi

- Struktur bucket berbeda dari SYSTEM_DESIGN §12.2: `private/nota/{master,preview,thumb}/` (T-044).
- Galeri nota meminta signed URL secara **batch** untuk seluruh thumbnail yang tampil, agar target "30 nota dimuat < 2 detik" tetap tercapai (T-102).
- Signed URL berumur 5 menit, sejalan dengan kontrol keamanan SYSTEM_DESIGN §18.1.
- Aturan INV-19 tetap berlaku penuh: unduhan selalu mengambil `master_path` tanpa rekompresi, dan `NotaImage` tetap tidak memiliki varian `master`.
