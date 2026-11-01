# ADR-039 — Ruang kerja acara per fase, jalur dokumen, dan beranda "tugas dulu"

|                     |                                                         |
| ------------------- | ------------------------------------------------------- |
| **Status**          | Diterima                                                |
| **Tanggal**         | 2026-11-01                                              |
| **Diputuskan oleh** | Pemilik produk (sesi tanya-jawab 2026-11-01)            |
| **Melengkapi**      | ADR-037 (navigasi per peran, HP tanpa geser), ADR-038   |

## Konteks

Pemilik meminta tampilan dirombak berdasarkan psikologi pengguna: letak fitur dan
isi halaman acara harus jelas, alurnya benar, dan mudah diakses. Temuan saat
membuka aplikasi dengan data dummy (Sekum, lebar desktop dan 375 px):

1. **Halaman acara** memiliki sembilan tab sejajar yang diurutkan per modul
   (Ringkasan, Gantt, Divisi, RAB, TOR, …), bukan per urutan kerja. Tab Ringkasan
   hanya berisi empat angka; tidak ada petunjuk apa yang harus dikerjakan
   berikutnya. Peran pengguna tampil sebagai kotak terpisah, sedangkan "Buat
   Surat" (jarang dipakai) adalah tombol paling menonjol.
2. **Daftar acara** mengurutkan acara Selesai/Dibatalkan sejajar dengan yang
   sedang Berjalan; kode kegiatan yang panjang tampil terpotong sebagai lencana.
3. **Beranda** menyambut semua peran dengan kalender proker besar, baru di
   bawahnya panel "yang perlu saya kerjakan". Kartu kosong tetap memakan satu
   kotak penuh ("Belum ada data untuk ditampilkan").
4. **Gantt** yang dibuka dari acara memiliki remah roti ke indeks Gantt umum,
   bukan kembali ke acaranya.

## Keputusan

### Ruang kerja acara

- **Empat fase** menggantikan sembilan tab sejajar (`components/acara/TabNav.tsx`):

  | Fase        | Bagian                     |
  | ----------- | -------------------------- |
  | Ikhtisar    | —                          |
  | Persiapan   | TOR · RAB · Proposal       |
  | Pelaksanaan | Divisi · Gantt · Formulir  |
  | Laporan     | Nota · LPJ                 |

  Bagian di dalam fase tampil sebagai baris kedua (pil). `?tab=` menerima slug
  bagian lama (`tor`, `rab`, …) maupun slug fase (`persiapan` → bagian
  pertamanya), sehingga semua tautan lama tetap berlaku. HP: empat fase sebagai
  tombol (2×2 di bawah 400 px), bagian sebagai kisi 2–3 kolom; tidak ada yang
  digeser (ADR-037).
- **Jalur dokumen** di Ikhtisar (`lib/acara/jalur.ts`, murni dan diuji unit):
  TOR → RAB → Proposal → Hari-H → Nota → LPJ dengan status nyata dari DB
  (`lib/acara/jalur-data.ts`). Tepat satu langkah ditandai *berikutnya* — yang
  pertama belum selesai dan boleh dibaca — dan mendapat satu tombol utama.
  Langkah yang tidak boleh dibaca pengguna (RAB/Nota/LPJ) ditandai **Terbatas**
  tanpa membocorkan statusnya. Status dibedakan ikon + teks, bukan warna saja.
- **Tugas saya** di Ikhtisar: kartu kanban acara ini yang ditugaskan ke pengguna
  dan belum selesai, tenggat terdekat dulu, yang terlambat bertanda merah. Hanya
  untuk panitia acara itu. Form yang sedang dibuka tampil beserta jumlah respons.
- **Kepala acara**: hitung mundur ke hari-H, tema, dan kalimat peran ("Anda
  Koordinator Divisi …") menyatu di kepala; "Buat surat" menjadi tombol ghost.
  Di HP masa persiapan disembunyikan agar tab tidak terdorong ke bawah layar.

### Daftar acara

- Dua bagian: **Berjalan dan mendatang** (acara yang pengguna menjadi panitianya
  didahulukan) dan **Sudah lewat** (Selesai, Dibatalkan, Ditolak, atau hari-H
  terlewat) yang terlipat dalam `<details>`.
- Seluruh kartu dapat diklik; hitung mundur tampil di baris tanggal; lencana
  kode kegiatan dihapus dari kartu (tetap ada di kepala acara).

### Beranda

- Urutan: sapaan + tanggal → panel peran → kalender bersama. Kalender tetap utuh,
  hanya pindah ke bawah.
- Kartu panel yang kosong diringkas menjadi satu baris "Tidak ada yang perlu
  ditindak di …" berisi nama kartunya. Kartu itu tetap memakai test id
  `dashboard-card-{kunci}` dan berubah menjadi kartu penuh begitu datanya ada
  (mis. kendala Kritis lewat realtime).

### Gantt

- Chart milik acara/divisi: remah roti `Acara Besar / {acara} / Divisi … / Gantt`
  kembali ke tab Gantt acara. Chart lain tetap ke indeks Gantt.

## Konsekuensi

- Data dan izin akses tidak berubah; seluruh perubahan di lapisan tampilan, kecuali
  pembacaan ringan baru (status TOR/Proposal/LPJ, kartu kanban milik pengguna).
- Gate e2e `ruang-acara` membuka setiap bagian lewat fase lalu bagiannya.
  Test id lama (`acara-tab-{bagian}`, `acara-panel-{bagian}`, `acara-peran-saya`,
  `acara-kode-kegiatan`, `acara-buat-surat`, `ringkasan-*`) dipertahankan.
- USER_FLOW §6.2 (beku) tidak diubah; susunan di atas yang berlaku.
