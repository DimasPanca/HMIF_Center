# ADR-037 — Sidebar disusun per peran; tampilan HP tanpa geser ke samping

|                    |                                           |
| ------------------ | ----------------------------------------- |
| **Status**         | Diterima                                  |
| **Tanggal**        | 2026-10-19                                |
| **Task terkait**   | T-051 (sidebar), T-115 (responsif)        |
| **Diputuskan oleh**| Pemilik produk                            |

## Konteks

Setelah mencoba aplikasi berisi data demo di HP, pemilik produk menemukan:

1. **Sidebar sama padatnya untuk semua peran.** USER_FLOW §1.2 menampilkan hampir
   semua modul ke semua peran (sebagian sebagai "Baca"). Ketua melihat RAB, LPJ,
   Audit; Bendum melihat Notulensi dan Kanban — padahal bukan pekerjaannya.
2. **Menu dobel.** RAB, LPJ, TOR, Proposal, dan Ruang Kerja Divisi ada di sidebar
   (sebagai pemilih acara `?buka=`) DAN sebagai tab di halaman acara.
3. **Penanda aktif ganda.** Membuka "Kalender Ketersediaan" (`/proker/kalender`)
   ikut menyalakan "Daftar Proker" (`/proker`) karena pencocokan awalan.
4. **HP harus digeser ke samping** di banyak halaman (diukur di lebar 390 px:
   4 halaman melebar keluar layar; tabel, tab acara, Kanban, dan Gantt bergulir
   ke samping).

## Keputusan — navigasi

Susunan menu per peran (disetujui pemilik):

| Peran | Menu |
|---|---|
| Ketua / Wakil | Beranda · Program Kerja (Daftar, Kalender, Gantt, Approval) · Acara Besar · Persuratan (Approval, Arsip, SK Aktif) · Departemen (Kanban, Kendala) · Notulensi |
| Sekum | Beranda · Persuratan (Buat Surat, Surat Massal, Approval, Arsip) · Kesekretariatan (Notulensi, Data Pengurus, Peminjaman Ruangan) · Program Kerja (Daftar, Kalender) · Acara Besar |
| Bendum | Beranda · Keuangan (Verifikasi Nota, Semua Nota) · Acara Besar · Surat Keterangan Aktif |
| Kadept | Beranda · Departemen Saya (Kanban, Kendala, Gantt) · Program Kerja (Daftar, Buat, Kalender) · Acara Besar · Kesekretariatan (Notulensi, Peminjaman Ruangan) · Surat Keterangan Aktif |
| Anggota | Beranda · Departemen Saya (Tugas Saya, Kendala) · Acara Saya (+ Upload Nota bila panitia) · Surat Keterangan Aktif |
| BPH | Beranda · Program Kerja · Acara Besar · Arsip Surat · Audit Log (semua "lihat saja") |
| Admin | Beranda · Administrasi (Pengguna, Periode, Backup, Audit) |

- Susunan di `lib/navigasi/menu.ts` (`susunMenu`), modul murni yang tetap memakai
  `can()` untuk setiap butir (kontrak T-051 "Jangan"). Multi-peran = gabungan.
- Grup berisi satu butir tampil sebagai satu tautan bernama butir itu.
- Hanya **satu** butir yang menyala: yang jalurnya paling panjang dan cocok
  (`hrefAktif`). `/departemen/EKS/kanban` setara `/departemen/kanban`.
- RAB, LPJ, TOR, Proposal, Ruang Kerja Divisi, dan Nota per acara diakses dari
  tab halaman acara saja. Rute `/acara?buka=…` tetap ada untuk tautan lama.
- Halaman baru **Semua Nota** (`/keuangan/nota/semua`) untuk Bendum memantau nota
  lintas acara.
- Gate e2e `sidebar-role` disesuaikan: Ketua dan Wakil sengaja bersusunan sama
  (keduanya pimpinan dan approver), enam peran lain berbeda — menggantikan
  "8 susunan berbeda" T-051.

## Konsekuensi

- USER_FLOW §1.1/§1.2 (beku) tidak diubah; tabel di atas yang berlaku.
- Admin tidak lagi melihat menu modul lain di sidebar; tetap dapat membuka
  halamannya lewat pencarian (⌘K) atau tautan.
