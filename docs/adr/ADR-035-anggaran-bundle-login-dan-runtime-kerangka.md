# ADR-035 — Anggaran JS halaman login dihitung di atas runtime kerangka kerja

|                    |                              |
| ------------------ | ---------------------------- |
| **Status**         | Usulan                       |
| **Tanggal**        | 2026-10-19                   |
| **Task terkait**   | T-114                        |
| **Ditemukan oleh** | agent saat mengerjakan T-114 |

## Konteks

SYSTEM_DESIGN §19.1 menetapkan JS bundle halaman Login **< 80 KB**. SYSTEM_DESIGN
§2 menetapkan stack Next.js 15 (App Router) + React 19. Keduanya tidak dapat
dipenuhi bersamaan — diukur, bukan diperkirakan (`scripts/bench-bundle.ts`,
build produksi 2026-10-19, ukuran gzip):

| Bagian | KB gzip |
|---|---:|
| `react-dom` (chunk `4bd1b696-*`) | 53,0 |
| runtime klien Next App Router (chunk `1255-*`) | 45,0 |
| `webpack-*` + `main-app-*` + `app/layout` | 2,4 |
| **Runtime kerangka kerja (lantai, dimuat setiap halaman)** | **100,4** |
| `next/image` (chunk `1356-*`) | 5,1 |
| `clsx` + `tailwind-merge` untuk `cn()` (chunk `4909-*`) | 8,4 |
| halaman login sendiri | 5,1 |
| **Total JS awal /login** | **119,1** |

App Router selalu menghidrasi halaman, termasuk halaman tanpa interaksi; tidak
ada padanan `unstable_runtimeJS: false` milik Pages Router. Halaman kosong pun
sudah 100,4 KB, sehingga angka 80 KB berada **di bawah lantai** stack yang
dipilih. Tiga halaman lain di tabel §19.1 (Beranda 180, RAB 200, Upload Nota
250 KB) dihitung dengan cara yang sama — total, runtime ikut — dan ketiganya
terpenuhi setelah T-114 (165,1 · 196,7 · 181,5 KB).

Yang sebenarnya dijaga anggaran itu adalah pengalaman membuka halaman login di
jaringan seluler. Kolom LCP dan TTI di baris yang sama mengukurnya langsung,
dan keduanya terpenuhi (4G tersimulasi + CPU 4×, median 5 jalan,
`scripts/bench-all.ts`): FCP/LCP **400 ms** (< 800), siap dipakai (tombol Masuk
terhidrasi) **±0,9–0,96 s** (< 1,0 s) — setelah video logo diperkecil dan
ditunda (T-114).

## Keputusan

Anggaran JS halaman Login dibaca sebagai **runtime kerangka kerja + paling
banyak 20 KB gzip JS milik halaman** (saat ini 100,4 + 18,7 = 119,1 KB).
LCP < 0,8 s dan TTI < 1,0 s pada profil 4G tetap menjadi penjaga utama
pengalamannya. Anggaran tiga halaman lain tidak berubah.

Alternatif yang ditolak: (a) menulis login sebagai HTML statis di luar React —
memecah design system, tema, dan komponen form bersama demi angka; (b) mengganti
kerangka kerja — di luar wewenang task dan bertentangan dengan §2.

## Konsekuensi implementasi

- `scripts/bench-all.ts` tetap melaporkan anggaran 80 KB apa adanya (GAGAL)
  sampai ADR ini diterima; setelah diterima, ubah anggaran login di
  `ukurBundle()` menjadi 120 KB dan catat di PERFORMANCE_REPORT.
- JS milik halaman login dijaga ≤ 20 KB: komponen berat (editor, ikon set
  lengkap, pustaka tanggal) dilarang diimpor dari `app/(auth)/**`.
- Bila pemilik produk menolak usulan ini, T-114 tetap BLOCKED pada kriteria
  "anggaran bundle keempat halaman terpenuhi" — tidak ada jalur teknis di
  dalam stack §2 yang dapat mencapainya.
