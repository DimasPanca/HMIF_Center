# ADR-055 — Cakupan harness dan beranda shell T-051

|                    |                                                        |
| ------------------ | ------------------------------------------------------ |
| **Status**         | **Diterima**                                           |
| **Tanggal**        | 2026-09-08                                             |
| **Ditemukan oleh** | T-051 setelah gate `sidebar-role` diperiksa            |
| **Task terkait**   | T-045, T-051, T-052, T-075, T-077                      |

## Konteks

Kontrak T-051 hanya mengizinkan pembuatan
`app/(dashboard)/layout.tsx` dan empat komponen di `components/layout/**`,
tanpa berkas pada bagian **Ubah**. Dua syarat gate tidak dapat diwujudkan
dengan cakupan itu:

1. `e2e/sidebar-role.spec.ts` mewajibkan halaman nonproduksi
   `/qa/sidebar?role=<ROLE[,ROLE...]>` agar delapan susunan menu dapat diuji
   tanpa membuat delapan akun permanen dan tanpa menghantam pembatas login.
   Route itu memerlukan `app/qa/sidebar/page.tsx`, yang tidak tercantum dalam
   daftar **Buat** T-051.
2. Test sesi sungguhan masuk sebagai ADMIN lalu membuka `/` dan mengharapkan
   sidebar dari role server. Saat ini `/` dimiliki `app/page.tsx`, berada di
   luar route group `(dashboard)`, dan merupakan shell sementara T-045.
   Membuat `app/(dashboard)/layout.tsx` saja tidak akan membungkus halaman `/`.
   Memindahkan halaman tersebut juga tidak tercantum dalam cakupan T-051.

Membiarkan kondisi pertama membuat 16 pemeriksaan role dilewati. Membiarkan
kondisi kedua membuat harness dapat lulus sementara aplikasi sungguhan tidak
pernah memakai sidebar. Menambahkan atau memindahkan berkas secara diam-diam
melanggar AGENT_RULES P-10.

## Keputusan

Perluas cakupan T-051 dengan batas berikut:

1. Tambahkan `app/qa/sidebar/page.tsx` ke daftar **Buat** lane UI.
2. Pindahkan implementasi beranda sementara dari `app/page.tsx` ke
   `app/(dashboard)/page.tsx`, sehingga URL tetap `/` tetapi dibungkus oleh
   layout dashboard. Perpindahan dilakukan sebagai satu perubahan atomik;
   tidak boleh ada dua page yang menghasilkan URL `/` bersamaan.
3. Harness hanya tersedia saat `NODE_ENV !== 'production'`, memakai komponen
   `Sidebar` yang sama dengan aplikasi, dan menerima hanya kode role dari
   `lib/auth/permissions.ts`.
4. Role pada aplikasi sungguhan selalu berasal dari sesi server. Parameter
   query `role` hanya berlaku pada harness dan tidak boleh memengaruhi layout
   dashboard.
5. Atribut `data-testid` dan `data-mode` dalam kepala
   `e2e/sidebar-role.spec.ts` diterima sebagai kontrak pengujian T-051.
6. `data-testid="app-shell"` dan `data-testid="logout-submit"` dari gate login
   T-045 dipertahankan setelah beranda dipindahkan.

## Konsekuensi

- Delapan kombinasi role dapat dibuktikan tanpa menambah akun berprivilege.
- Test sesi sungguhan membuktikan bahwa sidebar produksi tidak mempercayai
  query string.
- `/` tetap menjadi beranda, tetapi kini konsisten berada di shell dashboard.
- T-052, T-075, dan T-077 memperoleh titik integrasi layout yang benar tanpa
  perlu memindahkan beranda lagi.

Keputusan ini diterima oleh pemilik proyek pada 2026-09-09.
