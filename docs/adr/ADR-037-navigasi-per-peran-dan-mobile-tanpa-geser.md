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

## Keputusan — tampilan HP (lebar < 768 px)

Prinsip: **tidak ada yang digeser ke samping, dan huruf tidak dikecilkan.**
Konten yang lebar disusun ulang ke bawah, bukan diperkecil.

| Pola | Penerapan |
|---|---|
| Tabel → kartu | `Table` (`components/ui/table.tsx`) memasang `data-kartu-hp`; di HP setiap baris menjadi kartu, sel menjadi pasangan *label : nilai*. Label diambil otomatis dari judul kolom (`LabelKolomOtomatis`), jadi semua tabel berbasis `Table` ikut tanpa diubah satu per satu. `kartuDiHp={false}` untuk tabel yang memang harus tetap tabel. |
| RAB | Baris RAB (`RabRow`) menjadi kartu berlabel (`.rab-kartu-hp`); Peserta dan RAB Aktual memakai pola tabel → kartu yang sama. |
| Tab | Tab halaman acara dan divisi menjadi grid tombol (4 / 3 kolom) yang terbungkus, bukan satu baris yang bergulir. |
| Gantt | Di HP tampil **Daftar** (`GanttDaftarHp`): grup → kartu tugas berisi tanggal, status, progres, dan bilah mini posisi tugas dalam rentang timeline. Tombol **Grafik** tetap tersedia untuk yang ingin melihat bagan aslinya. |
| Kanban | Di HP satu kolom per layar dengan tab status (jumlah kartu di tiap tab); kartu dipindah lewat pilihan status, bukan seret. Tombol **Papan** untuk tampilan asli. |
| Filter | Panel filter dilipat di balik tombol **Filter** (menampilkan jumlah filter aktif). |
| Grid | Anak grid di HP `min-width: 0` sehingga konten panjang membungkus, bukan melebarkan halaman. |

Pilihan Daftar/Grafik, Tab/Papan, dan filter terbuka disimpan per perangkat
(`localStorage`: `hmif-gantt-tampilan`, `hmif-kanban-tampilan`, `hmif-filter-hp`).
Desktop tidak berubah.

Gate e2e `mobile-tanpa-geser` (project `mobile`, Pixel 7) memeriksa halaman
utama tidak lebih lebar dari layar, Gantt membuka Daftar, dan hanya satu butir
sidebar yang menyala. Project `mobile` lain memakai tampilan Grafik/Papan
(`storageState` di `playwright.config.ts`) supaya gate lama Gantt/Kanban tetap
menguji komponen yang sama.

## Konsekuensi

- USER_FLOW §1.1/§1.2 (beku) tidak diubah; tabel di atas yang berlaku.
- Admin tidak lagi melihat menu modul lain di sidebar; tetap dapat membuka
  halamannya lewat pencarian (⌘K) atau tautan.
- Komponen tabel baru cukup memakai `Table`; tabel HTML mentah yang lebar harus
  diberi `data-kartu-hp` + `<LabelKolomOtomatis />` atau dibungkus `overflow-x-auto`
  hanya di `md:` ke atas.
