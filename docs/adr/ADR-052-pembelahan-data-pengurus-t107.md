# ADR-052 — Pembelahan aman data pengurus T-107

|                    |                                                        |
| ------------------ | ------------------------------------------------------ |
| **Status**         | **Usulan**                                             |
| **Tanggal**        | 2026-09-04                                             |
| **Ditemukan oleh** | T-107 saat memeriksa prasyarat implementasi            |
| **Task terkait**   | T-048, T-064, T-107                                   |

## Konteks

T-107 menggabungkan halaman dan komponen UI dengan CRUD, import massal,
deteksi NIM duplikat, export Excel, serta generate massal surat bernomor unik.
Repository belum menyediakan schema, service, atau kontrak domain pengurus yang
dapat dipanggil route handler. Menulis seluruh keputusan itu langsung di
`app/api/pengurus/**` akan memindahkan logika data ke lane UI, menggandakan
validasi `parse-tabel.ts`, dan membuat transaksi nomor surat massal tidak punya
satu pemilik.

Field **Ubah** juga menunjuk
`app/(dashboard)/surat/massal/page.tsx`, tetapi berkas tersebut belum ada.
Halaman itu merupakan keluaran T-064, sedangkan T-107 hanya menyatakan
dependency T-048. Task dapat berstatus READY sebelum target yang wajib diubah
tersedia.

Gate `e2e/data-pengurus.spec.ts` yang disebut pada field **Verifikasi** juga
belum ada. Tanpa gate dan kontrak data, lane UI tidak dapat membuktikan import
100 baris, penanganan NIM duplikat, baris tanpa akun, atau alokasi 30 nomor
surat tanpa memakai database bersama secara tidak terkoordinasi.

## Keputusan

T-107 diusulkan dibelah menjadi kontrak data dan adapter UI:

1. Lane data menyediakan schema dan service pengurus untuk daftar, CRUD,
   validasi/import, serta export, lengkap dengan tipe hasil dan kode gagal.
2. Operasi import 100 baris dan generate 30 surat berjalan atomik melalui
   service dengan konteks audit; route UI hanya menerjemahkan HTTP ke kontrak
   K-02.
3. Kontrak menetapkan bahwa `user_id` boleh `null`, NIM unik per periode, dan
   baris duplikat dapat dilewati tanpa membuat akun otomatis.
4. Dependency T-107 ditambah T-064 (target Surat Massal) dan separuh UI T-048
   yang menyediakan alur pemetaan/pratinjau import.
5. Lane data menyediakan `e2e/data-pengurus.spec.ts`; skenario database
   dijalankan setelah hasil kedua lane digabung.
6. T-107 tetap `BLOCKED` sampai service, kontrak, target T-064, dan gate
   tersedia atau cakupan task diperbaiki dengan keputusan lain.

## Konsekuensi implementasi

- Lane UI tidak menulis SQL pengurus atau logika alokasi nomor surat di route.
- Import pengguna T-048 dan import data pengurus T-107 dapat memakai parser
  yang sama tanpa menyamakan dua domain yang berbeda.
- Baris pengurus tanpa akun tetap menjadi kasus utama yang diuji, bukan kasus
  yang hilang karena route menganggap setiap pengurus harus punya `user_id`.

## Status nyata (2026-10-15)

**Tidak diperlukan lagi — dikerjakan utuh oleh agen tunggal.** Pembelahan
lane data/UI yang diusulkan di atas lahir dari mode dua-lane; sejak
konsolidasi single-agent (HANDOFF 2026-09-27) T-107 dikerjakan sebagai satu
task. Prinsip teknisnya tetap dipakai: service (`lib/pengurus/service.ts`)
menyimpan import dalam SATU transaksi beraudit, route hanya menerjemahkan
HTTP ↔ K-02, dan generate massal surat memakai `lib/surat/batch.ts` (T-064).
