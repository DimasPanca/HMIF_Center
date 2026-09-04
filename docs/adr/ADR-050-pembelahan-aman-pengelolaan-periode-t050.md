# ADR-050 — Pembelahan aman pengelolaan periode T-050

|                    |                                                        |
| ------------------ | ------------------------------------------------------ |
| **Status**         | **Usulan**                                             |
| **Tanggal**        | 2026-09-04                                             |
| **Ditemukan oleh** | T-050 setelah gate lintas-lane `periode` tersedia      |
| **Task terkait**   | T-050, T-051                                           |

## Konteks

Kontrak T-050 meminta CRUD periode, tetapi daftar **Buat** hanya memuat halaman,
route koleksi `app/api/periode/route.ts`, dan route aktivasi
`app/api/periode/[id]/activate/route.ts`. Gate yang telah disediakan memanggil
`PATCH` dan `DELETE /api/periode/{id}`. Next.js hanya dapat melayani URL itu
melalui `app/api/periode/[id]/route.ts`, yang tidak tercantum dalam **Buat** atau
**Ubah**. Dua route yang terdaftar tidak dapat menangani segmen tersebut.

Gate juga membaca hasil `POST` dari `body.id` dan `body.status`, serta galat dari
`body.isu` atau `body.pesan`. Bentuk itu bertentangan dengan K-02, yang
mewajibkan sukses berbentuk `{ ok: true, data }` dan gagal berbentuk
`{ ok: false, error: { code, message, details? } }`. Menambahkan field duplikat
hanya demi gate akan membuat dua kontrak respons hidup bersamaan.

Belum ada service atau kontrak domain periode. Menulis query, aturan status,
otorisasi, penghapusan, dan aktivasi langsung di route milik lane `ui` akan
menggandakan aturan bisnis dan memindahkan tanggung jawab data ke lane yang
salah. Jalur Prisma yang ada memakai koneksi `postgres` ber-`BYPASSRLS`,
sedangkan jalur Supabase pengguna tidak menyediakan transaksi yang sekaligus
mengisi konteks audit IP dan user-agent. Route saat ini tidak dapat membuktikan
RLS independen dan konteks audit dalam satu jalur mutasi.

Aktivasi juga mengganti periode aktif sementara role disimpan per periode.
Kontrak belum menetapkan prasyarat agar target memiliki Admin, sehingga aktivasi
dapat membuat pengelola yang sedang masuk langsung kehilangan hak mengelola
periode berikutnya. Sebaliknya, guard normal menolak semua aksi saat tidak ada
periode aktif, sehingga bootstrap periode pertama juga belum punya jalur yang
jelas.

## Keputusan

T-050 diusulkan dibelah menjadi kontrak data dan adapter UI:

1. Lane `data` menyediakan schema, service periode, dan kontrak lintas-lane yang
   menetapkan operasi daftar, buat, ubah, hapus, dan aktivasi beserta kode gagal
   serta bentuk respons K-02.
2. Service menjadi satu-satunya tempat yang memanggil `aktifkan_periode`,
   menerapkan transaksi, konteks audit, RLS/otorisasi baris, larangan mengubah
   arsip, dan larangan menghapus periode yang memiliki surat terbit.
3. Aktivasi hanya menerima periode `PERSIAPAN`, membandingkan konfirmasi dengan
   nama kanonis di server dalam transaksi yang sama, dan menolak target yang
   belum memiliki sedikitnya satu role `ADMIN`.
4. Kontrak menetapkan jalur bootstrap terautentikasi untuk periode pertama tanpa
   melonggarkan akses CRUD periode bagi role selain Admin.
5. Lane `ui` membuat halaman dan route adapter setelah
   `app/api/periode/[id]/route.ts` ditambahkan resmi ke cakupan T-050.
6. Gate `periode` diperbarui agar membaca `body.data.*` dan
   `body.error.message`, bukan bentuk respons top-level khusus test.
7. T-050 tetap `BLOCKED` sampai usulan ini diterima atau kontrak diperbaiki
   dengan keputusan lain di `main`.

## Konsekuensi implementasi

- Lane `ui` tidak menulis SQL periode, tidak memasukkan `DATABASE_URL`, dan
  tidak memilih antara RLS atau audit secara diam-diam.
- Route handler tetap tipis dan semua pemanggil memperoleh aturan periode yang
  sama.
- T-051 masih menunggu T-050, tetapi task UI lain yang sudah READY dapat tetap
  dikerjakan selama sync perbaikannya berlangsung.
- Gate API berautentikasi dijalankan lane `data` setelah hasil kedua lane
  digabung; lane `ui` tetap menjalankan typecheck, lint, unit test, build, dan
  pengujian tampilan yang tidak memerlukan database.
