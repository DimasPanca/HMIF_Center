# Panduan Umum — HMIF Center

HMIF Center adalah sistem e-administrasi Himpunan Mahasiswa Informatika FT UNTIRTA: program
kerja, acara besar, keuangan, persuratan, kesekretariatan, dan formulir dalam satu tempat.
Panduan ini menjelaskan hal yang berlaku untuk **semua peran**. Panduan khusus tiap peran ada di
daftar panduan di sebelah kiri.

## 1. Tentang HMIF Center

- Dibangun pada masa **Kabinet Vardhana (2026–2027)** Himpunan Mahasiswa Informatika FT UNTIRTA.
- Semua data berlaku per **periode kepengurusan**. Periode yang sedang berjalan disebut periode
  aktif; periode lama tetap bisa dibuka sebagai arsip (hanya baca) lewat pemilih periode di kanan
  atas.
- Setiap perubahan data tercatat di **audit log** (siapa, kapan, apa) dan tidak bisa dihapus.

## 2. Masuk, keluar, dan akun

1. Buka alamat HMIF Center, isi **Email** dan **Kata sandi**, lalu **Masuk**.
2. Akun dibuat oleh Admin lewat undangan. Buka tautan undangan dari email, lalu buat kata sandi
   sendiri untuk mengaktifkan akun.
3. Lupa kata sandi atau akun tidak bisa masuk: hubungi Admin himpunan. Admin dapat mengaktifkan
   ulang atau mengatur akun Anda.
4. Keluar lewat menu avatar di kanan atas. Selalu keluar bila memakai komputer bersama.

## 3. Peran dan menu

Menu di sidebar disusun **per peran**, jadi setiap orang hanya melihat yang ia perlukan.

| Peran | Yang utama di sidebar |
|---|---|
| Ketua & Wakil Ketua | Program Kerja (termasuk antrian approval), Acara Besar, Formulir, Persuratan (approval, arsip), Departemen, Notulensi |
| Sekretaris Umum | Persuratan (buat surat, SK aktif massal, approval, arsip), Kesekretariatan (notulensi, data pengurus, peminjaman ruangan), Formulir & Template Form, Program Kerja, Acara Besar |
| Bendahara Umum | Keuangan (verifikasi nota, semua nota), Acara Besar, Surat Keterangan Aktif |
| Kepala Departemen | Departemen Saya (Kanban, Kendala, Gantt), Program Kerja (termasuk Buat Proker), Acara Besar, Kesekretariatan, Surat Keterangan Aktif |
| Anggota | Departemen Saya (Tugas Saya, Kendala), Acara Saya (Upload Nota bila panitia), Surat Keterangan Aktif |
| BPH | Program Kerja, Acara Besar, Arsip Surat, Audit Log — hanya baca |
| Admin | Administrasi (pengguna & peran, periode, backup, audit log, laporan bug), Formulir |

**Formulir** muncul juga untuk Bendahara, Kadept, dan Anggota bila mereka duduk di kepanitiaan
sebuah acara.

Di bawah menu peran selalu ada bagian **Bantuan**: **Guide** (halaman ini) dan **Lapor bug**.
Tombol **Tanya Dhana** ada di pojok kiri bawah.

Tanda **Lihat saja** di samping menu berarti Anda dapat membuka dan membaca halaman itu, tetapi
tidak dapat mengubah isinya.

## 4. Navigasi dan tampilan

- **Pencarian cepat**: tekan **Ctrl K** (atau **⌘ K** di Mac), atau klik kotak **Cari** di atas.
  Dari sini Anda bisa membuka halaman yang tidak ada di sidebar Anda (selama Anda berhak).
- **Tema terang/gelap**: tombol matahari/bulan di kanan atas. Bawaannya mengikuti pengaturan
  laptop atau ponsel Anda.
- **Lipat sidebar**: tombol di bawah sidebar membuat sidebar menjadi deretan ikon supaya area kerja
  lebih lebar.
- **Di ponsel**: menu dibuka dengan tombol **☰** kiri atas. Tidak ada halaman yang perlu digeser ke
  samping; tabel lebar berubah menjadi kartu, Gantt tampil sebagai daftar (tombol **Grafik** untuk
  bagan aslinya), dan Kanban tampil satu kolom dengan tab status.

## 5. Beranda

Beranda menyapa Anda dan menampilkan **panel sesuai peran** terlebih dahulu — hal yang perlu Anda
tindak (tugas, antrian approval, nota yang menunggu, kendala). Kartu yang sedang kosong diringkas
menjadi satu baris "Tidak ada yang perlu ditindak". Di bawahnya ada **Kalender bersama**: timeline
seluruh program kerja yang disetujui pada periode aktif, bisa difilter per departemen dan kategori.

## 6. Acara besar

Acara besar (kepanitiaan) terbentuk otomatis saat proker terjadwal disetujui. Daftar acara
memisahkan **Berjalan dan mendatang** dari **Sudah lewat** (dilipat). Acara tempat Anda menjadi
panitia ditandai **Anda panitia**.

Halaman satu acara dibagi menjadi **empat fase**:

| Fase | Isi |
|---|---|
| Ikhtisar | Jalur dokumen, tugas saya, form yang sedang dibuka, keadaan acara |
| Persiapan | TOR · RAB · Proposal |
| Pelaksanaan | Divisi · Gantt · Formulir |
| Laporan | Nota · LPJ |

**Jalur dokumen** menunjukkan urutan TOR → RAB → Proposal → Hari-H → Nota → LPJ dengan statusnya
(Selesai, Berjalan, Belum, atau Terbatas bila Anda tidak berhak melihatnya). Satu langkah ditandai
sebagai **langkah berikutnya** beserta tombol untuk langsung membukanya.

**Tugas saya** berisi kartu Kanban acara itu yang ditugaskan kepada Anda dan belum selesai,
diurutkan dari tenggat terdekat; yang terlambat ditandai merah.

Kepala halaman acara menunjukkan hitung mundur ke hari-H dan peran Anda di acara itu.

## 7. Formulir (pengganti Google Form)

Formulir dibuat oleh Sekretaris Umum, panitia acara, dan pimpinan.

1. Buka **Formulir → Buat form**. Pilih **kategori**: Pendaftaran, Evaluasi, Open Recruitment,
   Pendataan Pengurus, atau Lainnya. Pendaftaran dan Evaluasi harus terikat ke sebuah acara.
2. Pilih **template** (mis. Form Pendaftaran Peserta, KT1) atau **Form kosong**, lalu isi judul dan
   deskripsi.
3. Susun pertanyaan. Tersedia 13 tipe: jawaban singkat, paragraf, pilihan ganda, kotak centang,
   dropdown, skala, tanggal, waktu, angka, email, unggah berkas, kisi pilihan ganda, dan kisi kotak
   centang. Pertanyaan dapat dibagi ke beberapa **bagian** dengan logika lompat ("setelah bagian ini
   ke bagian …").
4. Di **Pengaturan**, pilih akses **Publik** (siapa pun dengan tautan, tanpa akun) atau **Internal**
   (harus masuk), anonim, satu jawaban per orang, batas waktu, dan kuota. Perubahan tersimpan
   otomatis.
5. Klik **Buka form**, lalu **Salin tautan** dan bagikan.
6. Respons dibaca di **Respons**: ringkasan grafik, tabel lengkap, berkas unggahan, dan **unduh
   Excel**.

Integrasi otomatis: respons **Pendaftaran** langsung menjadi data peserta acara; **Pendataan
Pengurus** dapat diterapkan ke Data Pengurus oleh Sekum/Admin; **Open Recruitment** punya status
seleksi per pendaftar.

Berkas unggahan maksimal 4 MB per berkas; foto besar diperkecil otomatis di browser. Template
global dikelola Sekretaris Umum dan Admin di **Template Form**.

## 8. Surat Keterangan Aktif

Semua pengurus dapat mengajukan **Surat Keterangan Aktif** atas nama sendiri: buka menu **Surat
Keterangan Aktif**, isi keperluannya; nama, NIM, dan jabatan terisi dari Data Pengurus. Surat yang
sudah terbit dapat diunduh di halaman yang sama. Surat lain dibuat oleh Sekretaris Umum.

## 9. Guide dan pencarian panduan

Guide berisi seluruh panduan HMIF Center. Ketik di kotak **Cari di Guide** (atau tekan **/**) — hasil
muncul langsung dari semua panduan, judul bagian yang cocok diutamakan. Klik hasilnya untuk langsung
menuju bagian tersebut. Panduan untuk peran Anda ditandai **untuk Anda**.

Tips mencari: pakai kata kunci pendek, mis. "upload nota", "approval surat", "kuota form",
"backup".

## 10. Dhana — asisten HMIF Center

**DHANA — Digital Helper and Network Assistant.** *Your Knowledge Companion.*

Nama Dhana memiliki hubungan langsung dengan **Vardhana**, nama kabinet yang membangun HMIF Center.
Dalam bahasa Sanskerta, *dhana* berarti kekayaan atau harta. Filosofinya: **pengetahuan adalah
kekayaan yang dapat dibagikan kepada seluruh mahasiswa.**

- Buka lewat tombol **Tanya Dhana** di pojok kiri bawah, lalu ketik pertanyaan tentang cara memakai
  HMIF Center, mis. "bagaimana cara upload nota?".
- Dhana menjawab berdasarkan isi Guide ini. Dhana **tidak** melihat data Anda (tugas, nota, surat)
  dan tidak dapat mengubah apa pun.
- Percakapan tidak disimpan; menutup panel atau memuat ulang halaman memulai percakapan baru.
- Ada batas jumlah pertanyaan per jam supaya layanan tetap adil untuk semua.
- Jawaban AI bisa keliru. Untuk keputusan penting, cek kembali di Guide atau tanyakan ke pengurus
  terkait.

Ke depan, Dhana akan dibekali pemahaman AD/ART, GBHK, dan GBHO himpunan.

## 11. Lapor bug

Menemukan sesuatu yang tidak berjalan semestinya? Buka **Bantuan → Lapor bug**.

1. Tulis **apa yang terjadi** dan **apa yang Anda harapkan**, sejelas mungkin (halaman mana, apa yang
   diklik).
2. Lampirkan **tangkapan layar** bila ada (opsional; JPG, PNG, atau WebP, maksimal 4 MB).
3. Kirim. Halaman tempat Anda berada dan jenis peramban ikut tercatat untuk membantu Admin.

Status laporan Anda terlihat di halaman yang sama: **Baru** → **Ditangani** → **Selesai** atau
**Ditolak**, beserta catatan dari Admin. Admin meninjau semua laporan di **Administrasi → Laporan
Bug**.

## 12. Privasi dan keamanan

- Jangan membagikan kata sandi. Pengurus himpunan tidak akan pernah meminta kata sandi Anda.
- Foto nota dibersihkan dari data lokasi sebelum terkirim.
- Berkas unggahan form dan lampiran laporan bug disimpan privat; hanya yang berhak yang bisa
  membukanya.
