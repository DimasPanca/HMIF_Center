# ADR-036 — Surat dibuat Sekretaris Umum; pengurus lain mengajukan Surat Keterangan Aktif untuk dirinya

|                    |                                           |
| ------------------ | ----------------------------------------- |
| **Status**         | Diterima                                  |
| **Tanggal**        | 2026-10-19                                |
| **Task terkait**   | — (permintaan pemilik produk, uji Vercel) |
| **Diputuskan oleh**| Pemilik produk                            |

## Konteks

PRD §5.1 baris "Surat — buat draft" memberi hak **C** kepada Admin, Ketua, Wakil, Sekum,
Bendum, dan Kadept (C\* departemennya). Setelah mencoba aplikasi berisi data demo,
pemilik produk menilai hal ini tidak sesuai praktik HMIF: penomoran, kop, dan isi
seluruh surat resmi adalah tanggung jawab **Sekretaris Umum**. Pengurus lain
hanya perlu satu jenis surat untuk keperluannya sendiri — **Surat Keterangan
Aktif Organisasi** (beasiswa, magang, lomba).

Menu "Buat Surat" yang tampil untuk enam peran membuat orang mengira mereka
harus menyusun surat sendiri, dan tombol "Buat Surat untuk acara ini" muncul di
halaman acara bagi Kadept.

## Keputusan

1. `surat.create` (seluruh 15 jenis, termasuk surat massal dan surat peminjaman
   ruangan dari booking) hanya untuk **SEKUM** dan **ADMIN** (pemeliharaan sistem).
2. Permission baru `surat.ajukan_aktif` (baris matriks `surat_aktif`): Ketua, Wakil,
   Sekum, Bendum, Kadept, dan **Anggota** boleh mengajukan Surat Keterangan Aktif
   **atas nama dirinya sendiri**. Nama, NIM, dan jabatan diambil server dari Data
   Pengurus periode aktif — tidak dapat diketik pemohon. BPH dan Admin tidak
   mengajukan (bukan pengurus yang membutuhkannya).
3. Pengajuan langsung berstatus *Menunggu approval* dan diproses seperti surat
   lain (Ketua/Wakil/Sekum menyetujui → bernomor → DOCX). Pemohon melihat status
   dan mengunduh dokumennya sendiri di halaman **Surat Keterangan Aktif**, walau
   ia tidak berhak membaca arsip surat.
4. Hak membaca arsip (`surat.read`) dan menyetujui (`surat.approve`) tidak berubah.
5. Dua lapis tetap sejalan (INV-01): guard API memakai permission di atas, dan
   migrasi `051_surat_hanya_sekum.sql` memperbarui policy `surat_insert` /
   `surat_select` dengan aturan yang sama.

## Konsekuensi

- Ketua Pelaksana dan Kadept yang butuh surat acara (undangan pemateri,
  peminjaman barang) memintanya kepada Sekum di luar aplikasi. Fitur "permintaan
  surat ke Sekum" di dalam aplikasi dapat diusulkan terpisah bila ternyata sering.
- Draft surat lama milik peran selain Sekum tetap ada, tetapi tidak dapat
  disunting lagi oleh pembuatnya (hak `surat.create` dicabut). Sekum dapat
  membuat ulang bila perlu.
- Tabel PRD §5.1 dan USER_FLOW §1.2 tidak diubah (dokumen beku); ADR ini yang
  berlaku bila berbeda.
