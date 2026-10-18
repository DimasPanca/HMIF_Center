# A11Y_REPORT.md — Aksesibilitas & responsif (T-115)

|             |                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Tanggal** | 2026-10-19                                                                                                                           |
| **Lingkup** | PRD §8.6 · DESIGN_SYSTEM §13–14, §6.4 · kontrak T-115                                                                                |
| **Alat**    | `npm run test -- a11y-kontras` (token kedua tema) · `npm run test:e2e -- a11y` · `e2e/upload-nota.spec.ts --project=mobile` (375 px) |
| **Status**  | Nol pelanggaran kontras WCAG AA di kedua tema; seluruh pemeriksaan e2e lulus                                                         |

## 1. Kontras WCAG AA — kedua tema (kontrak 1)

`lib/a11y/kontras.ts` membaca token `app/globals.css` dan menghitung rasio
WCAG untuk **117 pasangan** yang dipakai antarmuka: teks (`text-primary`,
`-secondary`, `-tertiary`, `-link`, `primary`, `danger`, `warning`, `success`)
di atas lima latar permukaan; teks utama di atas latar _subtle_ status
(Badge/StatusPill); teks tombol di atas `primary`/`-hover`/`-active`/`danger`;
ikon status di latar subtle-nya dan cincin fokus (non-teks, 3:1). Test
`a11y-kontras` ikut `npm run verify` — token yang menurunkan kontras gagal di CI.

Sebelum perbaikan: **23 pasangan gagal.** Target tidak diturunkan; tokennya diperbaiki:

| Tema   | Token              | Sebelum   | Sesudah   | Pasangan terburuk sebelum → sesudah                                                                        |
| ------ | ------------------ | --------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Terang | `--text-tertiary`  | `#6C757D` | `#5B6672` | di `bg-muted` 3,89 → 4,85                                                                                  |
| Terang | `--danger`         | `#DC2626` | `#C42020` | di `bg-muted` 4,01 → 4,87                                                                                  |
| Terang | `--warning`        | `#D97706` | `#A84B05` | di `bg-muted` 2,64 → 4,74                                                                                  |
| Terang | `--success`        | `#0E9F6E` | `#05714F` | di `bg-muted` 2,81 → 5,00                                                                                  |
| Terang | `--info` (ikon)    | `#00B4D8` | `#0891B2` | di `info-subtle` 2,23 → 3,32                                                                               |
| Gelap  | `--text-tertiary`  | `#6C757D` | `#94A3B8` | di `bg-muted` 3,13 → 5,73                                                                                  |
| Gelap  | `--primary-text`   | `#FFFFFF` | `#111C44` | di `primary` 3,24 → 5,10 (tombol sudah memakai `dark:text-inverse`; lencana sidebar & ScaleSwitcher belum) |
| Gelap  | `--primary-active` | `#0F7AE0` | `#4FA8FF` | teks gelap di atasnya ≥ 4,5                                                                                |

Hero login berlatar gradien gelap yang SAMA di kedua tema, jadi teksnya kini
`text-white` tetap (sebelumnya mengikuti `--primary-text`).

**Di luar audit token:** `--text-disabled` (WCAG mengecualikan kontrol
nonaktif) dan warna data pilihan pengguna (warna departemen/grup Gantt) —
kontras label di atasnya belum diaudit; dicatat untuk T-114/UAT.

## 2. Keyboard & fokus (kontrak 2)

- Login diselesaikan **tanpa mouse** (Tab ke email → ketik → Tab → password →
  Enter), termasuk jalur galat; kolom terfokus menampilkan indikator fokus
  (`outline`/`box-shadow` ≠ none); tautan sidebar dapat difokus.
- Komponen dasar (Button, Input, Select, Dialog Radix, ConfirmDialog) memakai
  `focus-visible` dengan `--border-focus` (≥ 3:1 di kedua tema, diaudit).

## 3. Label, galat, live region (kontrak 3)

- Gate `a11y` memeriksa di setiap halaman inti: tiap input/select/textarea
  berlabel, tiap tombol/tautan bernama, tiap gambar ber-`alt` — **0 temuan**.
- Galat login terhubung `aria-describedby` ke pesan `role="alert"`
  `aria-live="polite"`; toast memakai live region (komponen `toast`).

## 4. Status tidak hanya warna — K-15 (kontrak 4)

Setiap `StatusPill` di Proker, Acara, dan Surat membawa **ikon dan teks
label**; Badge memakai teks utama di atas latar lembut. Dalam grayscale status
tetap terbaca dari teks + ikonnya (diperiksa gate `a11y`).

## 5. Lebar 375 px — Nota & Kanban (kontrak 5)

- Gate `a11y` membuka di 375 × 812: `/login`, `/`, `/keuangan/nota`,
  `/keuangan/nota/upload`, `/acara` (Anggota), `/departemen/kanban`,
  `/proker`, `/departemen/kendala` (Kadept), `/keuangan/nota/verifikasi`,
  `/surat` (Bendum) — **tanpa gulir horizontal**.
- **Alur unggah nota lengkap dari ponsel** (kamera/galeri → pindai → pilih
  item RAB → alokasi → kirim, termasuk perbaikan nota yang dikembalikan) lulus
  4/4 di 375 px bersentuh.
- **Temuan & perbaikan:** proyek Playwright "mobile" membuka konteks lewat
  `browser.newContext()` yang TIDAK mewarisi profil perangkat, sehingga
  `upload-nota.spec` sebenarnya berjalan di 1280 px. Kini spec itu membuka
  konteks 375 px `isMobile`/`hasTouch` untuk proyek mobile. Spec lain yang
  memakai pola sama tetap menguji fungsi, bukan tata letak ponsel — tata
  letaknya dijaga gate `a11y`.

## 6. Gerak (kontrak 6)

`@media (prefers-reduced-motion: reduce)` di `globals.css` mematikan durasi
transisi/animasi; komponen memakai `motion-reduce:`. Logo animasi login
diganti logo statis. Gate `a11y` memverifikasi keduanya dengan
`reducedMotion: 'reduce'`.
