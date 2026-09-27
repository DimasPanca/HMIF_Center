# ADR-054 — Kontrak penyimpanan import massal pengguna T-048

|                    |                                                        |
| ------------------ | ------------------------------------------------------ |
| **Status**         | **Usulan**                                             |
| **Tanggal**        | 2026-09-04                                             |
| **Ditemukan oleh** | T-048-UI saat memeriksa alur penyimpanan batch          |
| **Task terkait**   | T-047-UI, T-048, T-048-UI                             |

## Konteks

Separuh data T-048 menyediakan `lib/import/parse-tabel.ts`, sebuah parser murni
yang sengaja tidak memiliki akses database. Kontrak lintas-lane menjelaskan
bahwa route harus mengambil NIM yang sudah ada, menyuntikkan predikat
`sudahAda`, lalu menyimpan baris setelah konfirmasi. Namun belum ada service
atau tanda tangan fungsi untuk cek duplikat database dan penyimpanan batch.

Memanggil `undang()` berulang kali langsung dari route bukan pengganti kontrak
batch. Kegagalan pada baris ke-50 dapat meninggalkan 49 pengguna dan undangan
tersimpan tanpa laporan yang dapat dipulihkan. Setiap undangan juga menghasilkan
tautan rahasia yang hanya tersedia sekali; kontrak belum menetapkan bagaimana
daftar tautan itu ditampilkan, disalin, atau diunduh tanpa menyimpan token mentah.

Target **Ubah** T-048 adalah
`app/(dashboard)/admin/pengguna/page.tsx`. Berkas itu belum ada karena
T-047-UI masih menunggu penyelarasan ADR-053. Task turunan T-048-UI berstatus
READY berdasarkan separuh data T-047, bukan berdasarkan kesiapan halaman UI
yang wajib diubah.

Gate saat ini hanya `npm run test -- import`, yang membuktikan parser tetapi
tidak membuktikan alur pratinjau → pilih baris → konfirmasi → penyimpanan batch.

## Keputusan

T-048-UI diusulkan menunggu kontrak batch dengan ketentuan berikut:

1. Lane data menyediakan service pratinjau untuk mengambil identitas yang sudah
   ada pada periode aktif dan service penyimpanan batch yang menerima baris
   terpilih melalui transaksi berkonteks audit.
2. Kontrak menetapkan perilaku atomik atau parsial secara eksplisit beserta
   bentuk laporan berhasil, gagal, dan dilewati per nomor baris sumber.
3. Tautan undangan yang dihasilkan dikembalikan satu kali dalam hasil sukses
   K-02 dan disajikan untuk disalin/diunduh Admin; token mentah tetap tidak
   disimpan.
4. T-048-UI bergantung pada penyelesaian T-047-UI agar halaman target **Ubah**
   tersedia.
5. Gate lintas-lane ditambah untuk membuktikan tidak ada penulisan sebelum
   konfirmasi dan batch 100 baris menghasilkan laporan yang benar.
6. T-048-UI tetap `BLOCKED` sampai prasyarat tersebut tersedia atau kontrak
   diperbaiki dengan keputusan lain.

## Konsekuensi implementasi

- Route UI tidak menulis query duplikat dan transaksi batch sendiri.
- Parser generik tetap dapat dipakai T-092 dan T-107 tanpa mengenal domain
  pengguna.
- Kegagalan tengah batch serta tautan undangan sekali-tampil mempunyai perilaku
  yang dapat diuji dan tidak ditentukan secara kebetulan oleh loop di route.

## Catatan penerapan (2026-09-27, mode single-agent)

Status tetap *Usulan* sampai diterima pemilik produk; isinya diterapkan sebagai
berikut di `lib/auth/import-pengguna.ts` + `app/api/users/bulk-import/route.ts`:

1. **Service pratinjau & simpan** — `pratinjauImportPengguna` (hanya dua kueri
   SELECT: departemen dan NIM/email yang sudah ada) dan `simpanImportPengguna`.
2. **Parsial per baris, bukan atomik** — dipilih eksplisit: tiap undangan
   membuat akun Supabase Auth lewat HTTP yang tak dapat digulung balik oleh
   transaksi Postgres. Tiap baris = satu `withAuditContext` dengan kompensasi
   `undang()`. Laporan per nomor baris berkas: `berhasil` (+tautan), `gagal`
   (+alasan), `dilewati` (+alasan). Tiga kegagalan sistem beruntun menghentikan
   percobaan sisa baris. Batas 200 baris/berkas (`maxDuration` 60 dtk).
3. **Tautan sekali-tampil** — dikembalikan hanya di respons simpan
   (`Cache-Control: no-store`); disalin/diunduh sebagai CSV yang dibuat di
   browser. Token mentah tidak disimpan.
4. Halaman target `admin/pengguna` tersedia sejak T-047 UI.
5. **Gate** — unit test `lib/auth/__tests__/import-pengguna.test.ts`: pratinjau
   hanya menjalankan SELECT dan tidak memanggil `undang()`; batch 100 baris
   menghasilkan laporan tepat (94/4/2) dengan satu transaksi per baris.
   Konfirmasi mengirim ulang BERKAS, bukan data baris, sehingga server mem-parse
   ulang dengan aturan yang sama.
