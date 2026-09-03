# ADR-047 — Harness verifikasi E2E Gantt T-073

|                    |                                                    |
| ------------------ | -------------------------------------------------- |
| **Status**         | **Diterima**                                       |
| **Tanggal**        | 2026-09-03                                         |
| **Ditemukan oleh** | T-073 saat menjalankan perintah verifikasi kontrak |
| **Task terkait**   | T-073                                              |

## Konteks

Kontrak T-073 mewajibkan `npm run test:e2e -- gantt-render`, tetapi saat gate
pertama kali dijalankan direktori `e2e/` belum memiliki spesifikasi tersebut.
Konfigurasi Playwright menetapkan `e2e/` sebagai `testDir`, sedangkan sumber
kebenaran kepemilikan di `scripts/lane.ts` menetapkan seluruh `e2e/**` sebagai
milik lane `data`. Lane `ui` karena itu tidak boleh menambahkan test tersebut.

Selain itu, daftar **Buat/Ubah** T-073 hanya mencakup sembilan komponen Gantt
dan `app/globals.css`. Belum ada route yang merender komponen tersebut;
`app/page.tsx` baru dijadwalkan berubah pada T-075. Akibatnya komponen tidak
memiliki halaman yang bisa dibuka Playwright, walaupun perilaku komponennya
sudah tersedia.

Pemeriksaan awal `npx playwright test gantt-render --list` menghasilkan
`Error: No tests found` dengan total nol test. Akar masalahnya adalah urutan
gate: test render T-073 membutuhkan halaman, sedangkan halaman produk baru
lahir dua task setelahnya.

## Keputusan

Sync tak terjadwal menetapkan pembagian berikut:

- lane `data` menyediakan `e2e/gantt-render.spec.ts`;
- lane `ui` mendapat izin eksplisit membuat route `/qa/gantt` sebagai harness
  deterministik untuk T-073, walaupun route tidak tercantum pada daftar
  **Buat/Ubah** awal;
- route memanggil `notFound()` saat `NODE_ENV === 'production'`, tidak membaca
  database, dan tidak memakai data acak;
- hubungan antara test dan komponen dibatasi pada kontrak `data-testid`, bukan
  nama kelas atau struktur internal.

Larangan awal tidak melarang route QA secara substantif; yang dibutuhkan adalah
otorisasi manusia untuk pengecualian P-10. Otorisasi tersebut diberikan bersama
fixture dan selector yang wajib, sehingga perubahan tetap sempit dan dapat
diaudit.

## Konsekuensi

- Gate T-073 dapat berjalan pada desktop 1366×768 dan mobile 375 px tanpa
  menunggu integrasi halaman produk T-075.
- Test E2E tetap milik lane `data`; route dan komponen tetap milik lane `ui`.
- Harness tidak dapat menjadi permukaan produksi dan tidak bergantung pada
  autentikasi, RLS, seed, atau keadaan layanan eksternal.
- Pengecualian P-10 terdokumentasi sebagai keputusan manusia, bukan perubahan
  ownership sepihak.
