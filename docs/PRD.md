# PRD — HMIF Center

**Sistem E-Administrasi Himpunan Mahasiswa Informatika FT UNTIRTA**

| | |
|---|---|
| **Versi** | 1.0 |
| **Tanggal** | 1 September 2026 |
| **Status** | Approved for Development |
| **Pemilik Produk** | Dimas Panca Pamungkas |
| **Dokumen Terkait** | [USER_FLOW.md](USER_FLOW.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Latar Belakang & Masalah](#2-latar-belakang--masalah)
3. [Tujuan & Metrik Keberhasilan](#3-tujuan--metrik-keberhasilan)
4. [Persona & Role](#4-persona--role)
5. [Permission Matrix](#5-permission-matrix)
6. [Ruang Lingkup](#6-ruang-lingkup)
7. [Spesifikasi Fungsional](#7-spesifikasi-fungsional)
8. [Requirement Non-Fungsional](#8-requirement-non-fungsional)
9. [Bahasa Desain](#9-bahasa-desain)
10. [Roadmap & Milestone](#10-roadmap--milestone)
11. [Risiko & Mitigasi](#11-risiko--mitigasi)
12. [Open Questions](#12-open-questions)
13. [Lampiran](#13-lampiran)

---

## 1. Ringkasan Eksekutif

**HMIF Center** adalah platform e-administrasi terpadu untuk Himpunan Mahasiswa Informatika FT UNTIRTA. Sistem ini menggantikan alur kerja manual berbasis Word/Excel/Google Drive yang tersebar, menjadi satu sumber kebenaran (*single source of truth*) untuk:

- **Perencanaan program kerja** dengan pencegahan bentrok jadwal antar-departemen secara otomatis
- **Visualisasi timeline** melalui Gantt chart profesional — termasuk *Master Gantt* rekap seluruh himpunan di halaman utama
- **Administrasi persuratan** dengan penomoran otomatis anti-duplikat dan generate dokumen dari template resmi
- **Manajemen kepanitiaan acara besar** (RAB, TOR, Proposal, Job Desk, Gantt per divisi)
- **Pelaporan keuangan** dengan RAB terstruktur, upload nota ter-scan, dan kalkulasi LPJ otomatis

**Prinsip desain:** mengadopsi kualitas visual dan kecepatan interaksi [Linear](https://linear.app) — bersih, padat informasi, minim animasi, respons instan — dengan identitas visual HMIF (Deep Navy / HMIF Blue / Tech Blue).

**Target rilis MVP:** 8 minggu, dibangun oleh tim internal HMIF.

---

## 2. Latar Belakang & Masalah

### 2.1 Kondisi Saat Ini

| Area | Masalah | Dampak |
|---|---|---|
| **Penjadwalan proker** | Setiap departemen menyusun proker terpisah tanpa kalender bersama | Bentrok jadwal baru ketahuan H-7, panitia rebutan SDM & venue |
| **Persuratan** | Nomor surat dicatat manual di grup WhatsApp / spreadsheet | Nomor ganda, nomor lompat, surat sulit dilacak saat audit |
| **Template surat** | Copy-paste dari surat lama, ubah manual | Format tidak konsisten, salah tanggal/nama, kop surat hilang |
| **RAB & LPJ** | Excel per acara dengan format berbeda-beda tiap kepanitiaan | Bendahara harus rekap manual, rawan salah hitung, LPJ molor berbulan-bulan |
| **Nota belanja** | Foto di galeri HP panitia, dikirim via WhatsApp | Nota hilang, gambar blur, tidak jelas nota untuk item apa |
| **Progres & kendala** | Dilaporkan lisan saat rapat | Tidak terdokumentasi, kendala berulang tiap periode |
| **Arsip** | Google Drive tanpa struktur baku | Pergantian pengurus = kehilangan konteks & dokumen |
| **Pertanggungjawaban** | Tidak ada jejak audit | Sulit menelusuri siapa mengubah/menyetujui apa |

### 2.2 Peluang

Seluruh proses di atas memiliki **struktur data yang dapat dibakukan**. Dengan membakukan struktur (terutama RAB dan nomor surat), sistem dapat:
- Mendeteksi konflik jadwal secara otomatis sebelum proker disetujui
- Menghasilkan dokumen resmi tanpa intervensi manual
- Mengagregasi data keuangan lintas divisi untuk LPJ
- Menyediakan backup terstruktur yang dapat di-*restore* utuh saat pergantian kepengurusan

---

## 3. Tujuan & Metrik Keberhasilan

### 3.1 Tujuan Produk

| # | Tujuan | Metrik | Target |
|---|---|---|---|
| G1 | Menghilangkan bentrok proker terjadwal | Jumlah bentrok yang lolos ke kalender | **0** |
| G2 | Mempercepat pembuatan surat | Waktu dari mulai isi form → dokumen jadi | **< 3 menit** |
| G3 | Menghilangkan duplikasi nomor surat | Nomor ganda per periode | **0** |
| G4 | Mempercepat penyusunan LPJ | Waktu dari acara selesai → draft LPJ siap | **< 3 hari** (dari sebelumnya berminggu-minggu) |
| G5 | Menjamin kualitas arsip nota | Nota terbaca jelas saat dicetak di Word | **100%** nota memenuhi standar master image |
| G6 | Transparansi progres | Departemen yang meng-update progres mingguan | **≥ 80%** |
| G7 | Kontinuitas antar kepengurusan | Waktu restore data dari backup | **< 1 jam** |

### 3.2 Metrik Adopsi

- **Minggu 4:** 100% pengurus inti (Ketua, Wakil, Sekum, Bendum, 6 Kadept) aktif
- **Minggu 8:** ≥ 80% anggota departemen pernah login dan melakukan minimal 1 aksi
- **Bulan 3:** 100% surat resmi HMIF diterbitkan melalui sistem

---

## 4. Persona & Role

### 4.1 Hierarki Organisasi

```
                        ┌─────────────┐
                        │    ADMIN    │  (teknis, di luar struktur)
                        └──────┬──────┘
                               │ mengelola akun & konfigurasi
                        ┌──────┴──────────────┐
                        │  KETUA HIMPUNAN     │
                        └──────┬──────────────┘
                               │
                        ┌──────┴──────────────┐
                        │  WAKIL KETUA        │
                        └──────┬──────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
      ┌───────┴──────┐  ┌──────┴───────┐       │
      │ SEKRETARIS   │  │ BENDAHARA    │       │
      │ UMUM         │  │ UMUM         │       │
      └──────────────┘  └──────────────┘       │
                                                │
              ┌─────────────────────────────────┴───┐
              │        KEPALA DEPARTEMEN (×6)       │
              └─────────────────┬───────────────────┘
                                │
                        ┌───────┴────────┐
                        │ ANGGOTA DEPT   │
                        └────────────────┘

              ┌──────────────────────────────┐
              │  BPH — PENGAWAS (view-only)  │  ← lintas semua modul
              └──────────────────────────────┘
```

### 4.2 Departemen (Seed Data)

| Kode | Nama Departemen |
|---|---|
| `KAD` | Kaderisasi |
| `MIKAT` | Minat dan Bakat |
| `INT` | Internal |
| `EKS` | Eksternal |
| `KOMINFO` | Komunikasi dan Informasi |
| `RND` | Riset and Development |

### 4.3 Deskripsi Persona

#### P1 — Admin (Teknis)
- **Siapa:** Anggota tim IT / pengembang sistem
- **Kebutuhan:** Mengelola user, role, periode kepengurusan, konfigurasi sistem, backup/restore
- **Frustasi utama:** Onboarding pengurus baru tiap periode memakan waktu
- **Catatan:** Admin **bukan** jabatan struktural. Satu-satunya role yang dapat membuat akun baru.

#### P2 — Ketua Himpunan
- **Kebutuhan:** Melihat kondisi seluruh himpunan dalam satu layar; menyetujui proker & surat; tanda tangan dokumen resmi
- **Frustasi utama:** Tidak tahu progres riil tiap departemen sampai rapat bulanan
- **Fitur andalan:** Master Gantt di homepage, antrian approval, ringkasan kendala

#### P3 — Wakil Ketua Himpunan
- **Kebutuhan:** Sama dengan Ketua (kewenangan setara untuk approval)
- **Catatan:** Approval oleh Wakil **valid penuh** tanpa menunggu Ketua. Tidak ada mekanisme eskalasi/timeout.

#### P4 — Sekretaris Umum
- **Kebutuhan:** Menerbitkan surat, mengelola arsip, notulensi, data keaktifan pengurus
- **Frustasi utama:** Diminta surat mendadak, harus cari template & cek nomor terakhir
- **Fitur andalan:** Modul Surat, Notulensi, Data Pengurus, Arsip

#### P5 — Bendahara Umum
- **Kebutuhan:** Memantau RAB seluruh acara, verifikasi nota, menyusun LPJ
- **Frustasi utama:** Nota berserakan, format RAB tiap panitia berbeda
- **Fitur andalan:** Dashboard Keuangan, Verifikasi Nota, Generator LPJ

#### P6 — Kepala Departemen
- **Kebutuhan:** Menyusun proker, memilih tanggal yang tidak bentrok, membuat Gantt, membentuk kepanitiaan, memantau anggota
- **Frustasi utama:** Tidak tahu tanggal mana yang masih kosong
- **Fitur andalan:** Kalender Ketersediaan, Wizard Tambah Proker, Kanban Departemen

#### P7 — Anggota Departemen
- **Kebutuhan:** Melihat tugas, update progres, lapor kendala, upload nota jika jadi panitia
- **Frustasi utama:** Tidak jelas siapa mengerjakan apa
- **Fitur andalan:** Kanban, Checklist, Kamera Nota

#### P8 — BPH (Badan Pengawas Himpunan)
- **Kebutuhan:** Mengawasi seluruh aktivitas tanpa mengubah apa pun
- **Sifat:** **Read-only mutlak** di semua modul. Tidak dapat approve, tidak dapat edit, tidak dapat generate dokumen. Dapat melihat audit log.

#### P9 — Ketua Pelaksana / Koordinator Divisi (Role Kontekstual)
- **Siapa:** Pengurus mana pun yang ditunjuk saat pembentukan kepanitiaan — **tidak harus** dari departemen PIC
- **Kebutuhan:** Menyusun RAB divisi, Gantt divisi, job desk, memantau progres divisi
- **Catatan:** Ini adalah **role kontekstual** yang melekat pada satu kepanitiaan, bukan role global. Berakhir saat acara ditutup.

### 4.4 Multi-Role

Satu user **dapat memiliki lebih dari satu role secara bersamaan**. Contoh nyata:

> Rani adalah **Anggota Departemen Kominfo**, sekaligus **Koordinator Divisi PDD** di kepanitiaan SYNCHRONIZE, sekaligus **Ketua Pelaksana** MUSMAIF.

**Aturan resolusi permission:** sistem menggunakan **union of permissions** (gabungan hak akses paling permisif dari seluruh role yang dimiliki), **kecuali** role `BPH` yang bersifat *restrictive* — jika user memiliki role BPH, ia tetap dapat menggunakan hak dari role lain, namun akses BPH-nya sendiri tidak menambah hak tulis apa pun.

---

## 5. Permission Matrix

Legenda: **C** = Create · **R** = Read · **U** = Update · **D** = Delete · **A** = Approve · **—** = Tidak ada akses · **R\*** = Read terbatas (scope sendiri)

### 5.1 Matrix Global

| Modul / Aksi | Admin | Ketua | Wakil | Sekum | Bendum | Kadept | Anggota | BPH |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **User & Role** | CRUD | R | R | R | R | R\* | R\* | R |
| **Periode Kepengurusan** | CRUD | R | R | R | R | R | R | R |
| **Departemen** | CRUD | CRUD | CRUD | R | R | RU\* | R\* | R |
| **Proker — buat** | CRU | CRU | CRU | R | R | **CRU\*** | R\* | R |
| **Proker — approve** | — | **A** | **A** | — | — | — | — | — |
| **Proker — edit setelah lock** | U | U | U | — | — | U\* (perlu approval ulang) | — | R |
| **Proker — hapus** | D | D | D | — | — | — | — | — |
| **Gantt Chart** | CRUD | CRUD | CRUD | R | R | CRU\* | RU\* | R |
| **Master Gantt (homepage)** | R | R | R | R | R | R | R | R |
| **Kanban & Checklist** | CRUD | R | R | R | R | CRUD\* | CRU\* | R |
| **Kendala Departemen** | CRUD | CRU | CRU | R | R | CRUD\* | CRU\* | R |
| **Surat — buat draft** | C | C | C | **C** | C | C\* | — | — |
| **Surat — approve & generate** | — | **A** | **A** | **A** | — | — | — | — |
| **Surat — arsip** | RUD | R | R | RUD | R | R\* | — | R |
| **Kepanitiaan — bentuk** | C | C | C | — | — | **C\*** | — | R |
| **Kepanitiaan — kelola** | CRUD | RU | RU | R | R | RU\* | R\* | R |
| **RAB — input** | CRUD | R | R | R | **RU** | R\* | C\*\* | R |
| **RAB — kunci/finalisasi** | U | U | U | — | **U** | — | — | R |
| **Nota — upload** | C | R | R | R | R | C\* | **C\*\*** | R |
| **Nota — verifikasi** | U | R | R | R | **U** | — | — | R |
| **LPJ — generate** | C | R | R | R | **C** | R\* | — | R |
| **Notulensi** | CRUD | CRU | CRU | **CRUD** | R | CRU\* | R\* | R |
| **Data Pengurus** | CRUD | R | R | **CRUD** | R | R\* | R\* | R |
| **Peminjaman Ruangan** | CRUD | R | R | **CRUD** | R | C\* | — | R |
| **Backup & Restore** | **CRUD** | R | — | — | — | — | — | R |
| **Audit Log** | R | R | R | R | R | R\* | — | **R** |

\* = terbatas pada departemen sendiri
\*\* = terbatas pada divisi kepanitiaan tempat ia ditugaskan

### 5.2 Aturan Kunci

1. **Hanya Ketua atau Wakil** yang dapat menyetujui proker. Salah satu saja cukup — tidak ada hierarki menunggu.
2. **Surat dapat disetujui oleh Ketua, Wakil, atau Sekum.** Salah satu cukup.
3. **BPH tidak pernah muncul sebagai approver** di antrian mana pun.
4. **Kepala Departemen dapat mengedit proker yang sudah terkunci**, tetapi perubahan tanggal memicu **re-approval otomatis** dan pengecekan konflik ulang.
5. **Anggota Departemen dapat mengupload nota** hanya untuk item RAB divisi tempat ia terdaftar sebagai panitia.
6. **Semua role dapat melihat Master Gantt** di homepage — ini adalah informasi publik internal.
7. **Cross-division visibility:** panitia divisi A dapat melihat **RAB, progres, Gantt, dan dokumen** divisi B dalam acara yang sama, tetapi **read-only**.

---

## 6. Ruang Lingkup

### 6.1 In Scope (MVP — 8 Minggu)

| Kode | Modul | Fase |
|---|---|---|
| M1 | Autentikasi, User & Role Management | 1 |
| M2 | Periode Kepengurusan | 1 |
| M3 | Dashboard + Master Gantt | 1–3 |
| M4 | Persuratan (9 jenis surat) | 2 |
| M5 | Program Kerja + Kalender Anti-Bentrok | 3 |
| M6 | Gantt Chart (Departemen, Proker, Divisi) | 3 |
| M7 | Kanban, Checklist, Kendala Departemen | 4 |
| M8 | Kepanitiaan Acara Besar | 5 |
| M9 | RAB Terstruktur + Export Excel | 5 |
| M10 | TOR & Proposal Generator | 6 |
| M11 | Nota Scanner + Pipeline Gambar | 6 |
| M12 | LPJ Otomatis | 7 |
| M13 | Notulensi | 7 |
| M14 | Data Pengurus & Peminjaman Ruangan | 7 |
| M15 | Audit Log | 1 (berjalan sejak awal) |
| M16 | Backup & Restore | 8 |

### 6.2 Out of Scope (Fase Berikutnya)

| Fitur | Alasan Ditunda |
|---|---|
| Notifikasi Email / WhatsApp | Batasan kuota Supabase pada tahap testing; akan diaktifkan setelah hosting proper |
| Integrasi Google Drive | Menunggu ketersediaan Service Account HMIF |
| Tanda tangan digital kriptografis (PKI) | MVP menggunakan *image overlay* TTD + stempel; upgrade jika ada kebutuhan legal |
| Mobile app native | PWA responsif dinilai cukup |
| SSO SIAKAD UNTIRTA | Belum ada akses ke API kampus |
| Voting / Musyawarah online | Bukan kebutuhan administratif inti |
| Manajemen inventaris barang HMIF | Tidak disebutkan dalam kebutuhan awal |
| Public-facing website HMIF | Sistem ini murni internal |

---

## 7. Spesifikasi Fungsional

> Format: setiap fitur memiliki **User Story**, **Aturan Bisnis**, dan **Acceptance Criteria** yang dapat diuji.

---

### M1 — Autentikasi & Manajemen User

#### F-1.1 Login
**User Story:** Sebagai pengurus, saya ingin masuk ke sistem dengan email dan password agar dapat mengakses fitur sesuai jabatan saya.

**Aturan Bisnis:**
- Autentikasi email + password (tanpa OAuth pada MVP)
- Password minimal 8 karakter, wajib mengandung huruf dan angka
- Sesi berlaku 7 hari, diperpanjang otomatis saat aktif
- Maksimal 5 percobaan gagal dalam 15 menit → akun terkunci 15 menit
- Tidak ada pendaftaran mandiri — akun **hanya** dibuat oleh Admin

**Acceptance Criteria:**
- [ ] User dengan kredensial benar diarahkan ke dashboard sesuai role
- [ ] User dengan kredensial salah melihat pesan generik ("Email atau password salah") — tidak membocorkan apakah email terdaftar
- [ ] Setelah 5 kegagalan, percobaan ke-6 ditolak dengan pesan waktu tunggu
- [ ] User nonaktif (`is_active = false`) ditolak meski password benar
- [ ] Setiap login sukses & gagal tercatat di audit log

#### F-1.2 Undang & Kelola User
**User Story:** Sebagai Admin, saya ingin mengundang pengurus baru dan menetapkan role mereka agar mereka dapat mulai bekerja.

**Aturan Bisnis:**
- Admin memasukkan: Nama Lengkap, NIM, Email, Angkatan, Role (dapat lebih dari satu), Departemen (jika role Kadept/Anggota)
- Sistem mengirim *invite link* berisi token sekali pakai (berlaku 7 hari)
- User menetapkan password sendiri saat pertama kali membuka link
- Admin dapat menonaktifkan user tanpa menghapus (menjaga integritas riwayat)
- Admin dapat melakukan *bulk import* dari CSV/XLSX

**Acceptance Criteria:**
- [ ] Undangan gagal jika email atau NIM sudah terdaftar pada periode aktif
- [ ] Token kedaluwarsa menampilkan halaman "Undangan kedaluwarsa, hubungi Admin"
- [ ] Satu user dapat memiliki role `Anggota Dept` + `Koordinator Divisi` bersamaan
- [ ] Menonaktifkan user tidak menghapus proker/surat/nota yang pernah ia buat
- [ ] Bulk import menampilkan pratinjau + daftar baris bermasalah sebelum dikonfirmasi

#### F-1.3 Profil & Tanda Tangan
**User Story:** Sebagai Ketua Himpunan, saya ingin mengunggah gambar tanda tangan saya agar dokumen resmi dapat ditandatangani otomatis.

**Aturan Bisnis:**
- User dengan role Ketua / Wakil / Sekum dapat mengunggah gambar TTD (PNG transparan, maks 2 MB)
- Gambar TTD disimpan di bucket privat, **tidak** dapat diakses via URL publik
- Hanya digunakan saat generate dokumen oleh proses server-side

**Acceptance Criteria:**
- [ ] TTD hanya dapat diunggah oleh pemilik akun sendiri (bukan Admin)
- [ ] File non-PNG ditolak
- [ ] URL gambar TTD tidak pernah muncul di response API mana pun

---

### M2 — Periode Kepengurusan

#### F-2.1 Kelola Periode
**User Story:** Sebagai Admin, saya ingin mendefinisikan periode kepengurusan agar penomoran surat dan data organisasi ter-scope dengan benar.

**Aturan Bisnis:**
- Field: Nama Periode (mis. "HMIF 3.0 2025/2026"), Tanggal Mulai, Tanggal Selesai, Status
- **Tepat satu** periode berstatus `AKTIF` pada satu waktu
- Mengaktifkan periode baru → periode lama otomatis menjadi `ARSIP`
- Counter nomor surat **direset ke 001** untuk periode baru
- Data periode lama tetap dapat dibaca (read-only) oleh semua role

**Acceptance Criteria:**
- [ ] Mencoba membuat periode kedua yang aktif menghasilkan error
- [ ] Setelah ganti periode, surat pertama yang dibuat bernomor urut `001`
- [ ] Proker & surat periode lama tidak dapat diedit, tetap dapat dilihat & diunduh
- [ ] Selector periode tersedia di header untuk berpindah tampilan arsip

---

### M3 — Dashboard & Master Gantt

#### F-3.1 Master Gantt (Fitur Unggulan)
**User Story:** Sebagai pengurus (role apa pun), saya ingin melihat **seluruh timeline program kerja HMIF dalam satu layar** agar langsung paham kondisi himpunan tanpa membuka halaman lain.

**Aturan Bisnis:**
- Ditampilkan di **halaman utama untuk semua role tanpa kecuali**
- Sumber data: seluruh proker berstatus `DISETUJUI` dan `BERJALAN` dari **6 departemen**
- Struktur baris: **Departemen** (baris grup) → **Proker** (baris anak)
- Setiap departemen memiliki warna identitas tetap
- Rentang bar: `tanggal_mulai_persiapan` → `tanggal_selesai` (bukan hanya hari-H)
- **Marker Hari-H** ditampilkan sebagai penanda vertikal tebal di dalam bar
- Skala waktu: **Minggu** (default), dapat diubah ke Bulan / Kuartal
- Rentang tampilan default: 3 bulan sebelum → 6 bulan setelah hari ini
- Garis "hari ini" vertikal selalu terlihat
- **Live update:** perubahan proker oleh departemen mana pun langsung terlihat tanpa refresh (Supabase Realtime)
- Klik bar → panel samping berisi detail proker
- Filter: departemen, kategori proker, status
- Baris grup dapat dilipat (collapse) agar seluruh himpunan muat dalam satu layar

**Acceptance Criteria:**
- [ ] Semua role melihat Master Gantt yang identik (BPH pun melihatnya)
- [ ] Bar proker dua departemen berbeda dengan tanggal beririsan terlihat pada baris berbeda
- [ ] Menambah proker di tab lain memunculkan bar baru dalam < 3 detik tanpa refresh manual
- [ ] Dengan 6 departemen × 8 proker (48 bar), render awal < 500 ms
- [ ] Dalam mode "Bulan" dengan semua grup terlipat, seluruh himpunan muat di layar 1366×768 tanpa scroll vertikal
- [ ] Marker hari-H terlihat jelas berbeda dari badan bar persiapan

#### F-3.2 Dashboard Kontekstual per Role
Di bawah Master Gantt, setiap role melihat panel berbeda:

| Role | Panel yang Ditampilkan |
|---|---|
| **Ketua / Wakil** | Antrian Approval (proker + surat) · Ringkasan Kendala Kritis · Ringkasan Keuangan Seluruh Acara · Aktivitas Terbaru |
| **Sekum** | Antrian Approval Surat · Surat Terbit Bulan Ini · Notulensi Terakhir · Nomor Surat Terakhir Digunakan |
| **Bendum** | Rekap RAB Seluruh Acara Aktif · Nota Menunggu Verifikasi · Sisa Anggaran per Acara · Progres LPJ |
| **Kadept** | Proker Departemen Sendiri · Kanban Ringkas · Kendala Terbuka · Deadline Terdekat |
| **Anggota** | Tugas Saya · Deadline Terdekat · Kendala yang Ditugaskan ke Saya |
| **BPH** | Ringkasan Seluruh Departemen · Kendala Terbuka Lintas Departemen · Statistik Kepatuhan (proker on-track/telat) |
| **Admin** | Kesehatan Sistem · Statistik User · Status Backup Terakhir · Audit Log Terbaru |

**Acceptance Criteria:**
- [ ] Dashboard dimuat penuh (termasuk Master Gantt) dalam < 1,5 detik pada koneksi 4G
- [ ] Panel approval menampilkan jumlah item menunggu sebagai badge angka
- [ ] Klik item di antrian approval langsung membuka detail beserta tombol Setujui/Tolak

---

### M4 — Persuratan

#### F-4.1 Penomoran Surat Otomatis

**Format:**
```
{KODE_SURAT}/{NOMOR_URUT}/{KODE_ADMINISTRASI}/{KEGIATAN}/{BULAN_ROMAWI}/{TAHUN}
```

**Contoh nyata dari arsip HMIF:**
```
02/274/UN43.3.7/HMIF/VII/2025      ← Surat Keterangan Aktif Organisasi
05/379/UN43.3.7/KT2HMIF/VIII/2025  ← Peminjaman Tandu (kegiatan AKSARA/KT2)
05/491/UN43.3.7/MUSMAIF/IX/2025    ← Peminjaman Auditorium (kegiatan MUSMAIF)
04/492/UN43.3.7/MUSMAIF/X/2025     ← Undangan Menghadiri MUSMAIF
08/376/UN43.3.7/KT2HMIF/VIII/2025  ← Permohonan Kerja Sama Rumah Sakit
03/018/UN43.3.7/HMIF/VIII/2026     ← Surat Aspirasi
```

**Daftar Kode Surat:**

| Kode | Jenis Surat | Template Tersedia |
|:---:|---|:---:|
| `01` | Surat Pengajuan | — (form generik) |
| `02` | Surat Keterangan | ✅ Surat Aktif Organisasi |
| `03` | Surat Pemberitahuan | ✅ Surat Aspirasi |
| `04` | Surat Undangan | ✅ Undangan Pemateri, Undangan & Sambutan |
| `05` | Surat Peminjaman | ✅ Peminjaman Barang, Peminjaman Ruangan |
| `06` | Surat Peringatan | — (form generik) |
| `07` | Surat Keputusan | — (form generik) |
| `08` | Surat Kerja Sama | ✅ Permohonan Kerja Sama |
| `09` | Piagam Penghargaan | — (form generik) |

**Aturan Bisnis:**
- `KODE_SURAT` — dipilih user dari dropdown (menentukan template yang dipakai)
- `NOMOR_URUT` — **counter global lintas semua jenis surat**, di-*pad* 3 digit (`001`, `274`, `502`), **reset ke 001 setiap periode kepengurusan baru**
- `KODE_ADMINISTRASI` — konstanta `UN43.3.7`, dapat dikonfigurasi Admin
- `KEGIATAN` — **variabel, diinput user**. Default `HMIF`. Untuk surat kepanitiaan diisi kode acara (mis. `KT2HMIF`, `MUSMAIF`, `SYNCHRONIZE`)
- `BULAN_ROMAWI` — otomatis dari tanggal surat (I–XII)
- `TAHUN` — otomatis dari tanggal surat
- **Nomor urut dialokasikan saat surat DISETUJUI**, bukan saat draft dibuat — mencegah nomor terbuang jika draft dibatalkan
- Alokasi nomor bersifat **atomik** — dua approval bersamaan tidak akan mendapat nomor sama

**Acceptance Criteria:**
- [ ] Dua Sekum menyetujui surat berbeda pada detik yang sama → mendapat nomor berbeda dan berurutan
- [ ] Draft yang dibatalkan tidak menghabiskan nomor urut
- [ ] Nomor pertama pada periode baru adalah `001`
- [ ] Preview nomor pada form draft ditandai jelas sebagai *"nomor sementara — akan ditetapkan saat disetujui"*
- [ ] Bulan Oktober menghasilkan `X`, bukan `10`

#### F-4.2 Pembuatan Surat

**Alur:** Pilih Jenis → Isi Form Dinamis → Preview Langsung → Ajukan → Disetujui → Generate

**Field Umum (semua jenis surat):**

| Field | Tipe | Wajib | Keterangan |
|---|---|:---:|---|
| Jenis Surat | Dropdown (9 kode) | ✅ | Menentukan template |
| Kegiatan | Text | ✅ | Default `HMIF` |
| Tanggal Surat | Date | ✅ | Default hari ini |
| Kota | Text | ✅ | Default `Cilegon` |
| Lampiran | Text | — | Mis. "1 (satu) Lembar", default `-` |
| Perihal | Text | ✅ | |
| Tujuan — Preset | Dropdown | ✅ | BEM FT UNTIRTA · DPM FT UNTIRTA · Kepala Bagian Sekretariat FT · Ketua Jurusan · Wakil Dekan III · **Lainnya (isi manual)** |
| Tujuan — Nama/Jabatan | Text | ✅ | Terisi otomatis dari preset, dapat diedit |
| Tujuan — Alamat | Text | ✅ | Mis. "di Cilegon", "di Tempat" |
| Isi Surat | Rich Text | ✅ | Terisi otomatis dari template, dapat diedit |
| Penandatangan Utama | Auto | ✅ | **Ketua Himpunan** (TTD + stempel otomatis) |
| Penandatangan Tambahan | Repeatable | — | Jabatan + Nama + NIM (mis. Ketua Pelaksana, Sekretaris Acara) |
| Format Output | Radio | ✅ | DOCX · PDF · Keduanya |

**Field Khusus per Jenis Surat:**

| Jenis | Field Tambahan |
|---|---|
| **02 — Keterangan Aktif Organisasi** | Nama Mahasiswa, NIM, Jabatan, Keperluan (mis. "Kelengkapan Persyaratan Administrasi Beasiswa"). Dapat dipilih dari **Data Pengurus** untuk auto-fill. Mendukung **generate massal** (banyak mahasiswa sekaligus). |
| **05 — Peminjaman Barang** | Nama Kegiatan, Hari & Tanggal Kegiatan, Tempat, **Tabel Kebutuhan** (No, Kebutuhan, Banyaknya) |
| **05 — Peminjaman Ruangan** | Nama Kegiatan, Hari & Tanggal, Pukul, Nama Ruangan, Nama Instansi Tujuan |
| **04 — Undangan Pemateri** | Nama Pemateri, Jabatan/Instansi, Topik Materi, Hari & Tanggal, Waktu, Tempat, **Lampiran TOR** (opsional, otomatis dari modul TOR) |
| **04 — Undangan & Sambutan** | Nama Kegiatan, Hari & Tanggal, Waktu, Tempat, **Lampiran Susunan Acara** (tabel: Hari/Tanggal, Waktu, Acara, Keterangan) |
| **08 — Kerja Sama** | Nama Instansi, Nama Kegiatan, Hari & Tanggal, Tempat, Bentuk Kerja Sama |
| **03 — Pemberitahuan / Aspirasi** | **Lampiran Poin Aspirasi** (repeatable: Judul Poin + Uraian multi-paragraf) |

**Acceptance Criteria:**
- [ ] Memilih jenis surat mengubah field form secara dinamis tanpa reload halaman
- [ ] Preview di panel kanan memperbarui teks < 300 ms setelah user berhenti mengetik
- [ ] Field wajib kosong → tombol "Ajukan" nonaktif dengan indikator field mana yang kurang
- [ ] Preset "BEM FT UNTIRTA" mengisi nama & alamat tujuan otomatis
- [ ] Draft tersimpan otomatis setiap 10 detik
- [ ] Surat Aktif Organisasi dapat di-generate untuk 30 mahasiswa sekaligus, menghasilkan 30 nomor urut berbeda

#### F-4.3 Approval & Generate

**Aturan Bisnis:**
- Status: `DRAFT` → `MENUNGGU_APPROVAL` → `DISETUJUI` → `TERBIT` (atau `DITOLAK` → kembali `DRAFT`)
- Approver: **Ketua ATAU Wakil ATAU Sekum** (salah satu cukup)
- Penolakan **wajib** disertai catatan alasan
- Saat disetujui: alokasi nomor → render dokumen → sisipkan TTD & stempel → simpan ke arsip
- Dokumen final **tidak dapat diedit**. Perubahan memerlukan pembatalan + surat baru
- Dokumen dibatalkan ditandai `DIBATALKAN`, nomor **tidak** didaur ulang (jejak audit tetap utuh)

**Penandatangan & Stempel:**
- **Ketua Himpunan** — TTD wajib pada semua surat mengatasnamakan himpunan
- **Sekretaris Umum** — TTD pada surat administratif (opsional per jenis)
- **Stempel HMIF** — otomatis di-overlay pada posisi TTD Ketua, menggunakan `Stempel Digital HMIF.jpeg`
- **Kop surat** — sudah menyatu dalam template DOCX, wajib ada

**Acceptance Criteria:**
- [ ] Kadept mengajukan surat → muncul di antrian Ketua, Wakil, DAN Sekum
- [ ] Setelah salah satu menyetujui, item hilang dari antrian dua lainnya
- [ ] Dokumen hasil generate memiliki kop surat, nomor benar, TTD, dan stempel pada posisi yang tepat
- [ ] Format DOCX dapat dibuka di Microsoft Word tanpa peringatan korupsi
- [ ] Format PDF memiliki teks yang dapat diseleksi (bukan hasil rasterisasi)
- [ ] Surat dibatalkan tetap terlihat di arsip dengan badge "DIBATALKAN"

#### F-4.4 Arsip Surat
- Tabel dengan kolom: Nomor · Jenis · Perihal · Tujuan · Tanggal · Pembuat · Approver · Status · Aksi
- Filter: periode, jenis surat, bulan, status, departemen, kegiatan
- Pencarian teks penuh pada perihal, tujuan, dan isi
- Unduh ulang DOCX/PDF kapan saja
- Export daftar ke Excel untuk keperluan laporan

---

### M5 — Program Kerja & Anti-Bentrok

#### F-5.1 Kategori Proker

| Kategori | Karakteristik | Kunci Kalender | Wajib Gantt | Perlu Approval |
|---|---|:---:|:---:|:---:|
| **TERJADWAL** | Acara besar dengan tanggal pasti & persiapan panjang | ✅ **Ya** | ✅ **Ya** | ✅ Ketua/Wakil |
| **BERKALA** | Rutin berulang (rapat mingguan, kajian bulanan) | ❌ Tidak | ❌ Opsional | ❌ Tidak |
| **RESPONSIF** | Insidental menanggapi situasi | ❌ Tidak | ❌ Opsional | ✅ Ketua/Wakil |

#### F-5.2 Aturan Anti-Bentrok

**Aturan inti:**
> Dua proker berkategori **TERJADWAL** dari departemen mana pun **tidak boleh memiliki irisan tanggal sedikit pun** dalam rentang `[tanggal_mulai_persiapan, tanggal_selesai]`.

**Detail aturan:**

| # | Aturan |
|---|---|
| R1 | Rentang yang dikunci adalah **seluruh masa persiapan hingga hari terakhir acara** — bukan hanya hari-H |
| R2 | Durasi persiapan: **minimal 15 hari, maksimal 45 hari** sebelum hari-H |
| R3 | Konflik dicek terhadap proker TERJADWAL berstatus `DISETUJUI` dan `BERJALAN` **saja**. Draft & yang ditolak tidak mengunci |
| R4 | **BERKALA** bebas bentrok dengan apa pun (termasuk sesama BERKALA dan TERJADWAL) |
| R5 | **RESPONSIF** boleh bentrok dengan TERJADWAL dan BERKALA, tetapi tetap memerlukan approval Ketua/Wakil |
| R6 | Pengecekan bersifat **lintas departemen** — Kaderisasi memblokir Kominfo dan sebaliknya |
| R7 | Konflik ditegakkan di **level database** (bukan hanya validasi aplikasi) agar tidak dapat ditembus oleh *race condition* |
| R8 | Mengubah tanggal proker terkunci memicu **pengecekan ulang + re-approval** |

**Contoh kasus:**
```
Proker A — Kaderisasi "SYNCHRONIZE"
  Persiapan : 1 Nov 2026
  Hari-H    : 6–7 Des 2026
  RENTANG TERKUNCI: 1 Nov – 7 Des 2026

Proker B — Kominfo "IT Festival" (TERJADWAL)
  Usulan Hari-H: 20 Nov 2026   →  ❌ DITOLAK (beririsan)
  Usulan Hari-H: 15 Jan 2027   →  ✅ DITERIMA

Proker C — Minat & Bakat "Latihan Rutin" (BERKALA)
  Setiap Sabtu, termasuk 20 Nov  →  ✅ DITERIMA (berkala bebas)

Proker D — Eksternal "Aksi Solidaritas" (RESPONSIF)
  Hari-H: 22 Nov 2026  →  ✅ DITERIMA, menunggu approval Ketua/Wakil
```

**Acceptance Criteria:**
- [ ] Kadept memilih tanggal yang beririsan → sistem menampilkan peringatan **sebelum submit**, menyebutkan proker & departemen yang bentrok
- [ ] Kalender ketersediaan menandai tanggal terkunci dengan warna berbeda dan tooltip pemilik
- [ ] Persiapan < 15 hari atau > 45 hari ditolak dengan pesan jelas
- [ ] Dua Kadept submit proker bentrok pada detik yang sama → hanya satu berhasil, satunya mendapat pesan konflik
- [ ] Mengubah kategori dari BERKALA ke TERJADWAL memicu pengecekan konflik
- [ ] Proker BERKALA di rentang terkunci tersimpan tanpa peringatan

#### F-5.3 Wizard Tambah Proker

**Langkah 1 — Informasi Dasar**
Nama Proker · Kategori (dropdown) · Deskripsi · Tujuan · Sasaran Peserta · Estimasi Jumlah Peserta · Penanggung Jawab

**Langkah 2 — Penjadwalan**
- Kalender ketersediaan **interaktif** menampilkan seluruh rentang terkunci milik departemen lain
- Pilih Hari-H (dapat rentang untuk acara multi-hari)
- Pilih Tanggal Mulai Persiapan → sistem menghitung durasi & memvalidasi 15–45 hari
- **Validasi konflik real-time** saat tanggal dipilih (< 500 ms)
- Untuk BERKALA: pola pengulangan (Mingguan/Bulanan) + hari + rentang periode

**Langkah 3 — Anggaran & Kebutuhan**
Estimasi Anggaran · Sumber Dana (Kas Himpunan / Iuran Peserta / Sponsor / Dana Fakultas) · Kebutuhan Ruangan · Kebutuhan Barang

**Langkah 4 — Kepanitiaan** *(wajib untuk TERJADWAL)*
- Ketua Pelaksana — dipilih dari daftar **seluruh pengurus** (bebas departemen)
- Daftar Divisi — dari preset (Acara · Konsumsi · Humas · Peralatan · PDD · P3K · Sekretaris · Bendahara · Komdis) atau tambah manual
- Koordinator per Divisi — dipilih dari daftar pengurus
- Anggota per Divisi — multi-select

**Langkah 5 — Gantt Chart** *(wajib untuk TERJADWAL)*
- Editor Gantt untuk timeline tingkat proker
- Minimal 1 task wajib diisi
- Task dapat dikelompokkan per fase (Persiapan / Pelaksanaan / Evaluasi)

**Langkah 6 — Tinjau & Ajukan**
Ringkasan seluruh input · Pemeriksaan konflik final · Submit untuk approval

**Acceptance Criteria:**
- [ ] Wizard menyimpan progres tiap langkah (dapat ditinggal & dilanjutkan)
- [ ] Langkah 5 tidak dapat dilewati untuk kategori TERJADWAL
- [ ] Peringatan konflik muncul di Langkah 2 sebelum user melanjutkan
- [ ] Ketua Pelaksana dari departemen berbeda dapat dipilih tanpa batasan
- [ ] Setelah submit, proker berstatus `MENUNGGU_APPROVAL` dan **belum** mengunci kalender

#### F-5.4 Approval Proker
- Antrian di dashboard Ketua & Wakil
- Tampilan detail: seluruh data proker + preview Gantt + peta konflik
- Aksi: **Setujui** · **Tolak** (wajib alasan) · **Minta Revisi** (dengan catatan)
- Setelah disetujui → kalender terkunci, proker muncul di Master Gantt

---

### M6 — Gantt Chart

#### F-6.1 Level Gantt

| Level | Pemilik | Cakupan |
|---|---|---|
| **Master Gantt** | Sistem (agregat) | Seluruh proker seluruh departemen — halaman utama |
| **Gantt Departemen** | Kepala Departemen | Seluruh proker satu departemen |
| **Gantt Proker** | Kepala Departemen | Task dalam satu proker |
| **Gantt Ketua Pelaksana** | Ketua Pelaksana | Timeline keseluruhan acara besar |
| **Gantt Divisi** | Koordinator Divisi | Task internal satu divisi |

#### F-6.2 Spesifikasi Visual

Mengacu pada referensi visual yang disepakati:

- **Latar:** Deep Navy (`#111C44`) dengan garis grid halus
- **Header:** Bulan (baris atas) + Minggu W1–W4 (baris bawah)
- **Kolom kiri:** Nama grup (tebal, ukuran lebih besar) + nama task (kecil, rata kanan, indentasi)
- **Bar:** Sudut membulat penuh (*pill shape*), tinggi 10–14 px
- **Warna:** Satu warna per grup/departemen — palet: Tech Blue, Teal, Amber, Coral, Lime, Violet
- **Label penanggung jawab:** teks kecil di atas bar grup
- **Konektor:** garis siku tipis dari bar induk ke bar anak (menunjukkan urutan)
- **Marker Hari-H:** segmen vertikal tebal berwarna kontras di dalam bar
- **Garis "Hari Ini":** garis vertikal tipis melintas seluruh chart
- **Interaksi:** hover → tooltip; klik → panel detail; drag → geser tanggal (jika punya izin)

#### F-6.3 Fungsionalitas
- Skala waktu: Minggu · Bulan · Kuartal
- Scroll horizontal dengan kolom nama task tetap (*sticky*)
- Collapse/expand baris grup
- Filter: departemen, status, penanggung jawab
- Export: PNG (untuk dokumen) & PDF (untuk cetak)
- Dependensi antar task (Finish-to-Start) — opsional pada MVP
- Persentase progres ditampilkan sebagai isian gelap di dalam bar

**Acceptance Criteria:**
- [ ] Chart dengan 100 task ter-render < 500 ms
- [ ] Scroll horizontal berjalan mulus (60 fps) tanpa lag
- [ ] Export PNG menghasilkan gambar tajam yang terbaca saat dimasukkan ke Word
- [ ] Kolom nama task tetap terlihat saat scroll horizontal
- [ ] Perubahan tanggal oleh user lain tercermin secara live

---

### M7 — Progres, Checklist & Kendala Departemen

#### F-7.1 Kanban Board
- Kolom: **To Do** · **In Progress** · **Review** · **Done**
- Kartu berisi: judul, penanggung jawab (avatar), deadline, label prioritas, jumlah checklist
- Drag-and-drop antar kolom
- Persentase progres proker dihitung otomatis: `(task Done / total task) × 100`
- Filter: penanggung jawab, proker, prioritas, deadline

#### F-7.2 Checklist Proker
- Checklist bersarang di dalam kartu Kanban
- Item: teks, status centang, penanggung jawab opsional, deadline opsional
- Progres checklist tampil sebagai `3/8` + bar tipis
- Template checklist dapat disimpan & dipakai ulang untuk proker sejenis

#### F-7.3 Kendala Departemen
- **Threaded discussion** dengan status: `TERBUKA` · `SEDANG_DITANGANI` · `SELESAI`
- Field: Judul, Deskripsi, Prioritas (Rendah/Sedang/Tinggi/Kritis), Assignee, Proker terkait, Lampiran
- Balasan berulir (nested reply)
- Kendala berprioritas **Kritis** muncul di dashboard Ketua/Wakil/BPH
- Mention `@nama` untuk menandai pengurus lain

**Acceptance Criteria:**
- [ ] Memindahkan kartu ke "Done" memperbarui persentase progres proker seketika
- [ ] Kendala Kritis muncul di dashboard Ketua dalam < 3 detik
- [ ] Anggota Departemen hanya melihat Kanban departemennya sendiri
- [ ] BPH dapat melihat semua Kanban tetapi tidak dapat menggeser kartu

#### F-7.4 Sistem Peringatan Deadline

| Kondisi | Label | Warna |
|---|---|---|
| Sisa > 7 hari | Normal | Steel Gray |
| Sisa ≤ 7 hari | **Peringatan** | Amber |
| Sisa ≤ 3 hari | **Kritis** | Coral/Merah |
| Lewat deadline | **Terlambat** | Merah tebal + ikon |

---

### M8 — Kepanitiaan Acara Besar

#### F-8.1 Pembentukan Kepanitiaan
- Otomatis terbentuk saat proker TERJADWAL disetujui (dari data Langkah 4 wizard)
- **Departemen PIC** = departemen pengusul proker
- **Ketua Pelaksana & anggota panitia bebas lintas departemen**
- Divisi standar: Acara · Konsumsi · Humas · Peralatan · PDD · P3K · Sekretaris · Bendahara · Komdis (dapat ditambah/dikurangi)

#### F-8.2 Ruang Kerja Divisi
Setiap divisi memiliki ruang kerja berisi:
- **Job Desk** — daftar tugas divisi (editor rich text + checklist)
- **Gantt Divisi** — timeline internal divisi
- **RAB Divisi** — anggaran divisi (lihat M9)
- **Progres** — Kanban internal divisi
- **Dokumen** — file yang diunggah divisi
- **Nota** — nota belanja divisi (lihat M11)

#### F-8.3 Visibilitas Antar Divisi

| Peran | Divisi Sendiri | Divisi Lain |
|---|---|---|
| Koordinator Divisi | **Baca + Tulis** | **Baca saja** (RAB, Progres, Gantt, Dokumen, Job Desk) |
| Anggota Divisi | **Baca + Tulis terbatas** | **Baca saja** |
| Ketua Pelaksana | **Baca + Tulis** semua divisi | — |
| Bendum | **Baca + Tulis** RAB & Nota semua divisi | — |

**Acceptance Criteria:**
- [ ] Panitia Divisi Konsumsi dapat membuka RAB Divisi PDD dan melihat seluruh itemnya
- [ ] Tombol edit/hapus tidak muncul (bukan sekadar dinonaktifkan) pada tampilan divisi lain
- [ ] Percobaan API langsung untuk mengubah data divisi lain ditolak dengan 403
- [ ] Ketua Pelaksana dapat mengedit seluruh divisi

---

### M9 — RAB Terstruktur

#### F-9.1 Struktur Data RAB

Berdasarkan analisis `RAB_Template.xlsx`, RAB memiliki **3 level hierarki**:

```
ACARA (mis. SYNCHRONIZE)
 └── DIVISI (mis. DIVISI KONSUMSI)
      └── SUB-SECTION (mis. KONSUMSI PANITIA)
           └── ITEM (mis. Galon — 10 × Rp5.000 = Rp50.000)
```

**Kolom Item (baku, tidak dapat diubah):**

| Kolom | Tipe | Keterangan |
|---|---|---|
| `no` | Integer | Nomor urut dalam divisi (otomatis) |
| `jenis_barang` | Text | Nama item |
| `jumlah` | Text | **Bebas** — mendukung "10", "16 Unit", "2 pack (12 pcs/pack)", "2 Hari 1 Malam" |
| `jumlah_numerik` | Decimal | Hasil parsing dari `jumlah` untuk perhitungan |
| `harga_satuan` | Decimal | Rupiah |
| `total` | Decimal | `jumlah_numerik × harga_satuan`, dapat di-override manual |
| `keterangan` | Text | **Field tambahan** (tidak ada di Excel asli) |

> **Catatan penting:** kolom `jumlah` di template asli berisi teks bebas. Sistem menyimpan **dua kolom**: teks asli (untuk tampilan/export identik) dan nilai numerik (untuk kalkulasi). Jika parsing gagal, user diminta memasukkan nilai numerik secara eksplisit.

#### F-9.2 Empat Sheet Output

| Sheet | Isi | Sumber Data |
|---|---|---|
| **RAB** | Rencana anggaran per divisi + ringkasan divisi | Input Koordinator Divisi |
| **PEMASUKAN** | Sumber dana + rincian pembayaran peserta | Input Bendahara Acara |
| **PENGELUARAN** | Buku kas: tanggal, uraian, divisi, pengeluaran, saldo berjalan | Otomatis dari nota terverifikasi |
| **RAB AKTUAL** | Realisasi aktual per item + ringkasan divisi aktual | Otomatis dari nota + penyesuaian manual |

#### F-9.3 Input Berbasis Web (Bukan Excel)

> **Prinsip:** user **tidak pernah** menyentuh file Excel. Semua input melalui form web; Excel hanya sebagai **output**.

**Antarmuka:**
- Tabel *inline-editable* mirip spreadsheet, tetapi dengan validasi
- Tambah/hapus divisi & sub-section melalui tombol
- Kolom `total` terhitung otomatis, ditandai sebagai *read-only* (dengan opsi override manual bertanda)
- Ringkasan per divisi terhitung otomatis (kolom H:J pada template asli)
- Format Rupiah otomatis saat mengetik (`50000` → `Rp50.000`)
- Total keseluruhan tampil sticky di bagian bawah

**Acceptance Criteria:**
- [ ] Mengubah `harga_satuan` memperbarui `total` item, total divisi, dan total acara seketika
- [ ] Input "16 Unit" tersimpan apa adanya untuk tampilan, dan terparsing sebagai 16 untuk perhitungan
- [ ] Input "2 Hari 1 Malam" memicu prompt untuk memasukkan nilai numerik secara manual
- [ ] Export Excel menghasilkan file dengan struktur kolom & baris **identik** dengan template asli
- [ ] Import Excel dari template dapat memuat RAB yang sudah ada ke dalam sistem
- [ ] Total pada sheet ringkasan (kolom J) sama dengan jumlah total tiap divisi

#### F-9.4 Sheet PEMASUKAN — Data Peserta
- Daftar peserta: No, Nama Lengkap, Status Bayar (checkbox), Tanggal Bayar, Jumlah
- Import massal dari CSV/XLSX
- Ringkasan otomatis: total terkumpul, jumlah sudah bayar, jumlah belum bayar
- Sumber dana lain: Kas Himpunan, Sponsor, Dana Fakultas (input manual)

#### F-9.5 Penguncian RAB
- Status: `DRAFT` → `DIAJUKAN` → `DISETUJUI` (dikunci) → `REALISASI` → `SELESAI`
- Bendum atau Ketua/Wakil mengunci RAB setelah disetujui
- RAB terkunci tidak dapat diubah item-nya; perubahan memerlukan pembukaan kunci dengan catatan alasan (tercatat di audit log)

---

### M10 — TOR & Proposal Generator

#### F-10.1 TOR (Term of Reference)

Berdasarkan `TOR_KT1_2025.docx`, struktur TOR:

| # | Bagian | Tipe Input |
|---|---|---|
| 1 | Nama Kegiatan | Text |
| 2 | Tema Kegiatan | Text |
| 3 | Gambaran Umum Kegiatan | Rich Text |
| 4 | Tujuan Kegiatan | Daftar berulang |
| 5 | Bentuk Acara | Rich Text + sub-bagian berulang |
| 6 | Waktu & Tempat Pelaksanaan | **Repeatable**: Nama Sesi, Hari/Tanggal, Waktu, Tempat |
| 7 | Sasaran Peserta | Rich Text + estimasi jumlah + jumlah kelompok |
| 8 | Kondisi Pelaksanaan | Repeatable: Sesi + Ketentuan |
| 9 | Parameter Kelulusan | Repeatable: Kriteria + Bobot (%) + KKM |
| 10 | Rangkaian Acara | Repeatable per sesi: Nama + Uraian |
| 11 | Susunan Acara (Rundown) | Tabel: Hari/Tanggal, Waktu, Acara, Keterangan/PIC |
| 12 | Anggaran | **Otomatis dari RAB** — ringkasan per divisi + total |
| 13 | Penutup | Rich Text |
| 14 | Penandatangan | Ketua Pelaksana + Ketua Himpunan |

#### F-10.2 Proposal Kegiatan

Berdasarkan `Proposal KT1 IF25.docx`:

| # | Bagian |
|---|---|
| 1 | Halaman Sampul (nama kegiatan, prodi, himpunan, fakultas, universitas, tahun) |
| 2 | Lembar Pengesahan |
| 3 | **Pendahuluan** — Latar Belakang · Landasan Kegiatan · Asas Pelaksanaan · Tujuan Kegiatan |
| 4 | **Realisasi Kegiatan** — Sasaran · Bentuk Acara · Waktu & Tempat · Pengisi Acara · Gambaran Umum · Rangkaian Acara |
| 5 | **Susunan Kepanitiaan** — otomatis dari data kepanitiaan |
| 6 | **Anggaran** — otomatis dari RAB |
| 7 | **Penutup** |
| 8 | **Lampiran** — Susunan Acara, Rincian RAB |

**Aturan Bisnis:**
- Bagian yang beririsan dengan TOR **terisi otomatis** dari TOR yang sudah dibuat
- Anggaran **selalu** ditarik langsung dari RAB — tidak diinput ulang
- Susunan kepanitiaan ditarik dari data kepanitiaan
- Output: DOCX & PDF

**Acceptance Criteria:**
- [ ] Membuat Proposal setelah TOR mengisi otomatis ≥ 60% field
- [ ] Perubahan RAB tercermin pada Proposal saat di-generate ulang
- [ ] Rundown yang sama muncul konsisten di TOR, Proposal, dan Surat Undangan

---

### M11 — Nota Belanja & Pipeline Gambar

#### F-11.1 Alur Upload Nota

```
Panitia membuka menu "Upload Nota"
        ↓
Pilih Divisi (otomatis jika hanya satu)
        ↓
Pilih Item RAB  ← dropdown berisi jenis_barang dari RAB divisi tersebut
        ↓
Ambil Foto / Pilih dari Galeri
        ↓
Auto-Scan (deteksi tepi + koreksi perspektif)
        ↓
PREVIEW  →  [Ambil Ulang]  atau  [Gunakan]
        ↓
Isi: Tanggal Belanja · Jumlah Aktual · Harga Aktual · Keterangan
        ↓
Upload  →  Status: MENUNGGU_VERIFIKASI
        ↓
Bendahara memverifikasi  →  Masuk ke sheet PENGELUARAN & RAB AKTUAL
```

**Aturan Bisnis:**
- **Dropdown item RAB wajib dipilih sebelum kamera terbuka** — memaksa penamaan terstruktur
- **Satu nota dapat mencakup beberapa item RAB** dengan alokasi nominal per item
  Contoh: struk Indomaret Rp75.000 → Snack Rp50.000 + Galon Rp25.000
- Jumlah alokasi **wajib sama** dengan total nota
- Panitia hanya melihat item RAB dari divisi tempat ia terdaftar
- Nota ditolak Bendahara → kembali ke panitia dengan catatan, dapat diunggah ulang

#### F-11.2 Pipeline Pemrosesan Gambar

**Prinsip utama:**
> **TAMPILAN WEBSITE ≠ FILE UNDUHAN.**
> Website memakai file ringan. Unduhan **selalu** memakai MASTER berkualitas tinggi.

**Tiga turunan, dibuat paralel dari satu sumber:**

```
                    ORIGINAL UPLOAD
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         ┌────────┐  ┌─────────┐  ┌────────┐
         │ MASTER │  │ PREVIEW │  │ THUMB  │
         │ JPEG   │  │ WebP    │  │ WebP   │
         │ Q90    │  │ Q78     │  │ Q70    │
         │ ≤3000px│  │ ≤1280px │  │ ≤400px │
         └────────┘  └─────────┘  └────────┘
```

**Spesifikasi lengkap:**

| Aspek | MASTER | PREVIEW | THUMBNAIL |
|---|---|---|---|
| Format | JPEG (progressive) | WebP | WebP |
| Kualitas | **90** (foto) / **93** (dokumen-teks) | 78 | 70 |
| Dimensi maks | 3000 × 3000 | 1280 × 1280 | 400 × 400 |
| Aspect ratio | Dipertahankan | Dipertahankan | Dipertahankan |
| Upscale | **Tidak pernah** | Tidak | Tidak |
| Ukuran tipikal | 500 KB – 2 MB | 100–400 KB | 20–80 KB |
| Digunakan untuk | **Unduhan, Word, cetak, LPJ** | Tampilan detail | Grid, tabel, kartu |

**Aturan wajib (tidak boleh dilanggar):**

| # | Aturan |
|---|---|
| I1 | Setiap turunan dibuat **langsung dari sumber asli**, tidak berantai (`ORIGINAL → MASTER → PREVIEW` ❌) |
| I2 | Unduhan **selalu** mengambil `master_path`, tidak pernah preview/thumbnail |
| I3 | **Tidak ada rekompresi** saat unduh — file master dikirim apa adanya |
| I4 | Baca EXIF orientation → auto-rotate **sebelum** resize. Jangan hapus data orientasi sebelum rotasi diterapkan |
| I5 | Setelah rotasi benar, hapus metadata sensitif (GPS, info perangkat, serial kamera) — tanpa menurunkan kualitas piksel |
| I6 | Validasi MIME dengan *magic bytes*, bukan ekstensi file |
| I7 | Nama file storage memakai **UUID**, bukan nama asli dari user |
| I8 | Gambar dengan transparansi tidak dipaksa ke JPEG; gunakan WebP lossless / PNG |
| I9 | Gambar dokumen/teks memakai kualitas **93** dan resize lebih konservatif |
| I10 | Setelah pemrosesan: decode ulang master untuk verifikasi tidak korup, dimensi valid, ukuran > 0 — baru simpan record DB |
| I11 | Jika pemrosesan gagal: **hapus file parsial**, jangan buat record DB |
| I12 | Aspect ratio **tidak pernah** dipaksa (tidak ada crop paksa ke 1:1) |

**Deteksi tipe konten:**
Sistem mendeteksi apakah gambar adalah **dokumen/teks** (nota, surat, formulir) atau **foto biasa**, lalu menyesuaikan kualitas master (93 vs 90). Deteksi menggunakan heuristik: rasio kontras tinggi + dominasi area terang + tepi tajam.

**Nama file unduhan:**
Menggunakan nama asli dari user (mis. `IMG_20260901_153021.jpg`), sementara nama internal server tetap UUID.

**Acceptance Criteria:**
- [ ] Foto 4032×3024 (5,2 MB) menghasilkan master 3000×2250 JPEG, ukuran 800 KB–2 MB
- [ ] Foto 1600×1200 **tidak** di-upscale — master tetap 1600×1200
- [ ] Foto portrait dari iPhone tidak miring setelah diproses
- [ ] Master yang diunduh dapat dimasukkan ke Word dan **teks pada nota terbaca jelas saat dicetak**
- [ ] Data GPS tidak ada pada file master
- [ ] File PNG bertransparansi tidak berubah menjadi latar hitam
- [ ] Halaman galeri nota (30 gambar) dimuat < 2 detik menggunakan thumbnail
- [ ] Endpoint unduh mengembalikan `Content-Type: image/jpeg` dan `Content-Disposition: attachment`
- [ ] Upload file bernama `foto.jpg` yang sebenarnya PDF → ditolak
- [ ] Jika pembuatan master gagal, tidak ada record nota yang tersisa di database

#### F-11.3 Auto-Scan Dokumen
- Deteksi tepi otomatis pada kamera menggunakan **jscanify** (OpenCV.js, sisi klien, gratis)
- Koreksi perspektif → nota tampak lurus seolah dipindai
- Peningkatan kontras opsional untuk keterbacaan teks
- **Preview wajib** sebelum upload dengan tombol **Ambil Ulang**
- Fallback: jika deteksi tepi gagal, gunakan foto apa adanya (setelah auto-rotate)

#### F-11.4 Verifikasi Nota (Bendahara)
- Antrian nota menunggu verifikasi
- Tampilan berdampingan: gambar nota (preview) vs data yang diinput
- Klik gambar → tampilan penuh; tombol unduh → master
- Aksi: **Setujui** · **Tolak** (wajib alasan) · **Minta Perbaikan**
- Nota disetujui → otomatis masuk ke sheet PENGELUARAN dan memperbarui RAB AKTUAL

---

### M12 — LPJ Otomatis

#### F-12.1 Sumber Data LPJ

| Bagian LPJ | Sumber |
|---|---|
| Identitas Kegiatan | Data Proker & Kepanitiaan |
| Pendahuluan & Tujuan | TOR / Proposal |
| Susunan Kepanitiaan | Data Kepanitiaan |
| Realisasi Kegiatan | Input manual (laporan pelaksanaan) |
| **Laporan Keuangan** | **Otomatis:** RAB (rencana) + Nota terverifikasi (realisasi) |
| Rincian Pemasukan | Sheet PEMASUKAN |
| Rincian Pengeluaran | Sheet PENGELUARAN (dari nota) |
| Perbandingan RAB vs Aktual | **Otomatis dihitung** |
| Sisa Dana | **Otomatis:** Total Pemasukan − Total Pengeluaran |
| Lampiran Nota | **Otomatis:** semua nota master image, dikelompokkan per divisi |
| Dokumentasi | Upload foto kegiatan |
| Evaluasi & Saran | Input manual |
| Lembar Pengesahan | Template + TTD |

#### F-12.2 Analisis Otomatis

Sistem menghitung dan menampilkan:
- **Selisih per item** — rencana vs aktual (nominal & persentase)
- **Selisih per divisi** — total rencana vs total aktual
- **Item over-budget** — ditandai merah dengan besaran kelebihan
- **Item under-budget** — ditandai hijau
- **Item tanpa realisasi** — item RAB yang tidak memiliki nota (ditandai untuk ditindaklanjuti)
- **Nota tanpa item RAB** — pengeluaran di luar rencana (ditandai sebagai temuan)
- **Dana Tak Terduga** — perhitungan otomatis penggunaan
- **Sisa dana akhir**

**Acceptance Criteria:**
- [ ] LPJ dapat di-generate setelah minimal 1 nota terverifikasi
- [ ] Total pengeluaran pada LPJ sama persis dengan jumlah nota terverifikasi
- [ ] Item RAB tanpa nota muncul dalam daftar "Belum Direalisasikan"
- [ ] Semua nota terlampir sebagai gambar master berkualitas cetak
- [ ] Output DOCX mengikuti struktur `Template LPJ HMIF.docx`
- [ ] Lembar Pengesahan tersertakan dengan TTD yang benar

---

### M13 — Notulensi Rapat

**Fitur:**
- Editor rich text (heading, list, tabel, checklist, blok kutipan)
- Metadata: Judul Rapat, Tanggal, Waktu Mulai–Selesai, Tempat, Pemimpin Rapat, Notulis
- **Daftar hadir** — checklist dari daftar pengurus, dengan status Hadir / Izin / Sakit / Alfa
- **Poin keputusan** — daftar terpisah yang dapat ditandai
- **Action item** — dengan penanggung jawab & deadline, dapat dikonversi menjadi kartu Kanban
- Lampiran file
- Generate DOCX mengikuti `Template Notulensi.docx`
- Arsip dengan pencarian teks penuh

---

### M14 — Data Pengurus & Peminjaman Ruangan

#### F-14.1 Data Pengurus
- Field: Nama Lengkap, NIM, Jabatan, Departemen, Angkatan, Periode, Status Keaktifan
- **Import massal** dari CSV/XLSX hasil form pendataan
- Digunakan untuk auto-fill **Surat Keterangan Aktif Organisasi**
- Generate massal Surat Aktif Organisasi untuk banyak mahasiswa sekaligus
- Export daftar pengurus ke Excel

**Acceptance Criteria:**
- [ ] Import 100 baris data pengurus menampilkan pratinjau + validasi sebelum disimpan
- [ ] Baris dengan NIM duplikat ditandai dan dapat dilewati
- [ ] Memilih 30 pengurus → generate 30 Surat Aktif Organisasi dengan 30 nomor berbeda

#### F-14.2 Peminjaman Ruangan
- **Daftar ruangan dikelola sendiri oleh Sekretaris** (form input bebas) — karena ketersediaan bergantung pada Dekanat
- Field ruangan: Nama, Lokasi, Kapasitas, Instansi Pengelola, Catatan
- Form peminjaman: Ruangan, Kegiatan, Hari & Tanggal, Waktu, Jumlah Peserta, Keperluan
- **Kalender booking** menampilkan jadwal peminjaman yang sudah tercatat
- Peringatan (bukan blokir) jika ada bentrok — karena keputusan final ada di Dekanat
- Terhubung langsung ke pembuatan **Surat Peminjaman Ruangan (kode 05)**

---

### M15 — Audit Log

**Aturan Bisnis:**
- **Setiap** operasi tulis (create/update/delete/approve) tercatat
- Data tercatat: siapa, kapan, aksi apa, entitas apa, ID entitas, nilai sebelum, nilai sesudah, alamat IP, user agent
- Log **tidak dapat diubah atau dihapus** oleh siapa pun (termasuk Admin)
- Retensi: seumur hidup sistem
- Dapat difilter: user, jenis entitas, rentang tanggal, jenis aksi
- Export ke CSV untuk keperluan audit organisasi

**Aksi yang wajib tercatat:**
Login/logout · Pembuatan & perubahan user · Perubahan role · Approval/penolakan proker · Alokasi nomor surat · Generate dokumen · Perubahan RAB · Buka kunci RAB · Verifikasi/penolakan nota · Generate LPJ · Backup & restore · Perubahan periode

---

### M16 — Backup & Restore

#### F-16.1 Strategi Backup Tiga Lapis

| Lapis | Format | Isi | Kegunaan |
|---|---|---|---|
| **1. Database Dump** | `.sql.gz` | Dump PostgreSQL lengkap | Restore penuh ke Postgres mana pun (Supabase, Neon, self-hosted) |
| **2. Export Modul** | `.json` per modul | Data terstruktur & terbaca manusia | Restore parsial, migrasi, inspeksi manual |
| **3. Arsip File** | `.zip` | Seluruh file dari storage (nota, dokumen, TTD) | Pemulihan aset |

**Struktur bundel backup:**
```
backup-2026-09-01/
├── manifest.json              ← versi skema, jumlah record, checksum
├── database/
│   └── full-dump.sql.gz
├── modules/
│   ├── users.json
│   ├── periode.json
│   ├── departemen.json
│   ├── prokers.json
│   ├── gantt.json
│   ├── kepanitiaan.json
│   ├── rab.json
│   ├── nota.json
│   ├── surat.json
│   ├── notulensi.json
│   ├── pengurus.json
│   └── audit-log.json
├── exports/
│   ├── rab-{acara}.xlsx       ← format template asli
│   └── daftar-surat.xlsx
└── files/
    └── storage-archive.zip
```

#### F-16.2 Jadwal & Pemicu
- **Otomatis:** tanggal 1 setiap bulan, pukul 02:00 WIB (Vercel Cron)
- **Manual:** tombol "Backup Sekarang" untuk Admin
- **Sebelum restore:** backup otomatis kondisi saat ini (safety net)
- Tujuan penyimpanan: Supabase Storage (sekarang) → Google Drive `Backup/YYYY-MM/` (setelah Service Account tersedia)
- Retensi: 12 backup bulanan terakhir + backup manual (tidak dihapus otomatis)

#### F-16.3 Import per Modul
Setiap modul memiliki fungsi **Import** yang menerima JSON hasil export:
- Pratinjau perubahan sebelum diterapkan
- Mode: **Tambah** (skip duplikat) · **Timpa** (ganti yang ada) · **Gabung** (update field yang berbeda)
- Validasi skema sebelum import
- Laporan hasil: berhasil / gagal / dilewati

**Acceptance Criteria:**
- [ ] Backup bulanan menghasilkan bundel lengkap dengan manifest berisi checksum
- [ ] Restore dari `.sql.gz` mengembalikan seluruh data dalam < 1 jam
- [ ] Import `prokers.json` ke database kosong menghasilkan proker yang identik
- [ ] Import dengan skema versi berbeda ditolak dengan pesan jelas
- [ ] File yang direstore dapat dibuka dan tidak korup

---

## 8. Requirement Non-Fungsional

### 8.1 Performa

| Metrik | Target |
|---|---|
| First Contentful Paint | < 1,0 detik |
| Dashboard + Master Gantt siap interaksi | < 1,5 detik (4G) |
| Render Master Gantt (48 bar) | < 500 ms |
| Render Gantt (100 task) | < 500 ms |
| Validasi konflik proker | < 500 ms |
| Preview surat memperbarui | < 300 ms |
| Pemrosesan gambar (3 turunan) | < 5 detik |
| Perhitungan ulang RAB | < 100 ms |
| Galeri nota 30 gambar | < 2 detik |
| Scroll Gantt | 60 fps |

### 8.2 Skalabilitas (Estimasi Beban)

| Entitas | Volume per Periode |
|---|---|
| User aktif | 80–120 |
| Proker | 40–60 |
| Surat | 300–600 |
| Acara besar | 5–10 |
| Item RAB per acara | 60–100 |
| Nota per acara | 40–80 |
| Storage gambar per acara | ~150 MB |
| **Total storage per periode** | **~1,5 GB** |

### 8.3 Ketersediaan & Keandalan
- Uptime target: **99%** (dapat diterima untuk sistem internal)
- Backup bulanan otomatis + backup sebelum operasi berisiko
- Graceful degradation: jika Realtime terputus, Master Gantt tetap tampil (mode statis) dengan indikator "koneksi live terputus"

### 8.4 Keamanan

| # | Requirement |
|---|---|
| S1 | Password di-*hash* dengan bcrypt/argon2 (ditangani Supabase Auth) |
| S2 | **Row Level Security (RLS)** aktif pada seluruh tabel — otorisasi ditegakkan di level database, bukan hanya aplikasi |
| S3 | Seluruh endpoint API memvalidasi sesi & permission di sisi server |
| S4 | File nota & TTD di bucket **privat** — diakses melalui *signed URL* berdurasi pendek |
| S5 | Rate limiting pada endpoint login & generate dokumen |
| S6 | Validasi upload: MIME sniffing, batas ukuran, batas resolusi, nama file UUID |
| S7 | Proteksi CSRF pada seluruh mutasi |
| S8 | Sanitasi input rich text (mencegah XSS) |
| S9 | Audit log tidak dapat dimodifikasi |
| S10 | Tidak ada data sensitif di URL query string |
| S11 | Secrets hanya di environment variable, tidak pernah di repository |

### 8.5 Kompatibilitas
- **Browser:** Chrome/Edge 100+, Firefox 100+, Safari 15+
- **Perangkat:** Desktop (1366×768 ke atas) & Mobile (375 px ke atas)
- **Mobile:** modul Nota dan Kanban wajib nyaman di ponsel (panitia memakai HP di lapangan)
- **Dokumen:** DOCX terbuka sempurna di Microsoft Word 2016+, PDF di semua reader
- **Gambar unduhan:** terbuka di Android, iOS, Windows tanpa aplikasi tambahan

### 8.6 Aksesibilitas
- Kontras teks minimal WCAG AA (4.5:1)
- Seluruh aksi utama dapat dijangkau keyboard
- Focus indicator jelas
- Label form eksplisit
- Status tidak disampaikan hanya melalui warna (selalu ada teks/ikon pendamping)

### 8.7 Bahasa
- **Bahasa Indonesia** untuk seluruh antarmuka
- Format tanggal: `Senin, 06 Oktober 2025`
- Format mata uang: `Rp1.740.000` (titik sebagai pemisah ribuan, tanpa spasi setelah "Rp")
- Format angka: pemisah ribuan titik, desimal koma

---

## 9. Bahasa Desain

> Spesifikasi lengkap ada di **[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)**. Ringkasan prinsip:

### 9.1 Prinsip

| # | Prinsip | Penerapan |
|---|---|---|
| D1 | **Kepadatan informasi tinggi** | Tabel padat, spacing efisien, minim ruang kosong berlebihan — seperti Linear |
| D2 | **Animasi minimal & bertujuan** | Hanya transisi 120–180 ms untuk hover, focus, dan perubahan state. **Tidak ada** animasi dekoratif, parallax, atau scroll-triggered |
| D3 | **Respons instan** | Optimistic UI pada aksi ringan; skeleton loader pada pemuatan data |
| D4 | **Hierarki melalui warna & ukuran, bukan garis** | Border tipis, andalkan kontras latar dan bobot huruf |
| D5 | **Konsistensi mutlak** | Satu komponen = satu perilaku di seluruh aplikasi |
| D6 | **Dark mode setara** | Bukan sekadar inversi — palet dirancang untuk keduanya |

### 9.2 Palet Warna (dari Brand Guideline HMIF)

**Primary**
| Warna | Hex | Nama | Penggunaan |
|---|---|---|---|
| ⬛ | `#111C44` | Deep Navy | Teks penting, header, latar gelap |
| 🟦 | `#0066A9` | HMIF Blue | Identitas utama, tombol, brand |
| 🔵 | `#1E90FF` | Tech Blue | Aksen, ikon, tautan, elemen interaktif |
| ⬜ | `#FFFFFF` | White | Latar terang |
| ⬜ | `#E6EAF2` | Light Gray | Netral, pendukung |

**Secondary**
| Warna | Hex | Nama | Penggunaan |
|---|---|---|---|
| 🟦 | `#00B4D8` | Teal | Aksen sekunder, elemen informasi |
| 🔷 | `#3D5A80` | Slate Blue | Teks sekunder, elemen tenang |
| ⬜ | `#6C757D` | Steel Gray | Teks sekunder, ikon netral |
| ⬜ | `#DCE6F1` | Soft Blue | Latar section, card, panel |
| ⬛ | `#0A0F1F` | Dark Blue | Latar utama dark mode |

**Gradien**
- Primary: `#111C44 → #0066A9` (header, hero)
- Blue: `#0066A9 → #1E90FF` (tombol, highlight)
- Teal: `#00B4D8 → #1E90FF` (aksen, notifikasi)

### 9.3 Kebijakan Animasi (Eksplisit)

| Diizinkan | Dilarang |
|---|---|
| Hover state (120 ms) | Animasi masuk halaman |
| Focus ring (instan) | Parallax scrolling |
| Expand/collapse (180 ms ease-out) | Efek ketik / counter berjalan |
| Skeleton shimmer saat loading | Bounce, elastic, spring berlebihan |
| Toast masuk/keluar (150 ms) | Animasi latar belakang |
| Drag & drop feedback | Transisi > 250 ms |
| Perubahan angka pada counter (fade, 150 ms) | Loading spinner berputar terus-menerus |

**Alasan:** performa dan kejelasan. Halaman harus terasa **instan**, bukan "hidup".

---

## 10. Roadmap & Milestone

### Fase 1 — Fondasi (Minggu 1)
**Deliverable:** Sistem dapat login, Admin dapat mengelola user & periode, seluruh aksi tercatat.

- [x] Setup project Next.js 15 + TypeScript + Tailwind + shadcn/ui
- [ ] Setup Supabase (Postgres, Auth, Storage) + koneksi Prisma
- [ ] Skema database lengkap + migrasi awal
- [ ] Seed: 6 departemen, definisi role, konfigurasi sistem
- [ ] M1 — Autentikasi, invite user, multi-role
- [ ] M2 — Periode kepengurusan
- [ ] M15 — Audit log middleware
- [ ] Design system: token warna, tipografi, komponen dasar
- [ ] Layout dashboard + sidebar dinamis per role

### Fase 2 — Persuratan (Minggu 2)
**Deliverable:** Seluruh 9 jenis surat dapat dibuat, disetujui, dan di-generate.

- [ ] Persiapan template DOCX (penyisipan placeholder)
- [ ] Generator nomor surat (atomik, anti-duplikat)
- [ ] Form dinamis per jenis surat + preview langsung
- [ ] Alur approval
- [ ] Generator DOCX & PDF + TTD + stempel
- [ ] Arsip surat + pencarian + export

### Fase 3 — Proker & Gantt (Minggu 3–4)
**Deliverable:** Proker dapat dibuat dengan anti-bentrok; Master Gantt tampil live di homepage.

- [ ] Skema proker + constraint anti-bentrok di level database
- [ ] Wizard tambah proker 6 langkah
- [ ] Kalender ketersediaan interaktif
- [ ] Approval proker
- [ ] **Komponen Gantt kustom (SVG)** — 5 level
- [ ] **Master Gantt + Supabase Realtime**
- [ ] Dashboard kontekstual per role
- [ ] M7 — Kanban, checklist, kendala

### Fase 4 — Kepanitiaan & RAB (Minggu 5–6)
**Deliverable:** Acara besar dapat dikelola penuh dengan RAB terstruktur.

- [ ] Kepanitiaan & ruang kerja divisi
- [ ] Visibilitas cross-divisi (read-only)
- [ ] RAB berbasis form web (3 level hierarki)
- [ ] Export/Import Excel 4-sheet
- [ ] Job Desk & Gantt divisi
- [ ] TOR generator
- [ ] Proposal generator

### Fase 5 — Keuangan & Dokumentasi (Minggu 7)
**Deliverable:** Nota dapat diunggah dengan kualitas cetak; LPJ ter-generate otomatis.

- [ ] Pipeline gambar (master/preview/thumb)
- [ ] Auto-scan dokumen (jscanify)
- [ ] Alur upload nota + verifikasi bendahara
- [ ] Sheet PENGELUARAN & RAB AKTUAL otomatis
- [ ] Generator LPJ + analisis selisih
- [ ] M13 — Notulensi
- [ ] M14 — Data pengurus & peminjaman ruangan

### Fase 6 — Backup & Pemantapan (Minggu 8)
**Deliverable:** Sistem siap produksi dengan jaminan pemulihan data.

- [ ] Sistem backup 3 lapis + Vercel Cron
- [ ] Import per modul
- [ ] Uji restore end-to-end
- [ ] Optimasi performa
- [ ] Uji keamanan (RLS, rate limit, upload)
- [ ] Dokumentasi pengguna
- [ ] UAT bersama pengurus

---

## 11. Risiko & Mitigasi

| # | Risiko | Dampak | Kemungkinan | Mitigasi |
|---|---|:---:|:---:|---|
| R1 | Timeline 8 minggu terlalu agresif untuk cakupan ini | Tinggi | **Tinggi** | Prioritas ketat per fase; M13/M14 dapat digeser ke pasca-MVP tanpa merusak inti |
| R2 | Race condition pada nomor surat menghasilkan duplikat | **Kritis** | Sedang | Alokasi nomor melalui fungsi database dengan advisory lock — bukan logika aplikasi |
| R3 | Race condition pada penguncian proker | Tinggi | Sedang | `EXCLUDE` constraint dengan `daterange` + GiST di level Postgres |
| R4 | Kualitas nota tidak layak cetak | Tinggi | Sedang | Spesifikasi pipeline gambar sangat ketat + acceptance criteria terukur + uji cetak nyata |
| R5 | Batas eksekusi fungsi Vercel Hobby (10 detik) | Sedang | **Tinggi** | Pemrosesan gambar di sisi klien (satu decode → 3 turunan); server hanya validasi |
| R6 | Generate DOCX tidak sesuai format asli | Tinggi | Sedang | Uji dengan template asli sejak Fase 2; sediakan fallback edit manual |
| R7 | Kuota Supabase free tier terlampaui | Sedang | Sedang | Pantau penggunaan; thumbnail agresif; siapkan jalur upgrade / pindah ke VPS |
| R8 | Service Account Google Drive tidak kunjung tersedia | Rendah | Sedang | `StorageAdapter` abstraksi — Supabase Storage sebagai default, Drive sebagai plugin |
| R9 | Adopsi rendah — pengurus kembali ke WhatsApp/Excel | Tinggi | Sedang | Onboarding + pelatihan; buat sistem **lebih cepat** dari cara lama, bukan sekadar lebih rapi |
| R10 | Format RAB berubah di kepengurusan berikutnya | Sedang | Rendah | Skema RAB versioned; export tetap mengikuti template terdaftar |
| R11 | Kehilangan data akibat kesalahan operasional | **Kritis** | Rendah | Backup bulanan + backup pra-restore + audit log + soft delete |

---

## 12. Open Questions

Pertanyaan berikut **tidak memblokir** dimulainya pengembangan, tetapi perlu dijawab sebelum fase terkait:

| # | Pertanyaan | Dibutuhkan Sebelum | Asumsi Sementara |
|---|---|---|---|
| Q1 | Kode administrasi yang benar: `UN43.3.7` (dari template) atau `UN43.3.3.7` (dari brief)? | **Fase 2** | Menggunakan `UN43.3.7`, dibuat configurable |
| Q2 | Surat Aspirasi masuk kode `03` (Pemberitahuan) — apakah benar, atau perlu kode tersendiri? | **Fase 2** | Kode `03` |
| Q3 | Nomor urut apakah berlanjut dari nomor terakhir periode berjalan (mis. 502) atau benar-benar mulai dari 001? | **Fase 2** | Mulai dari 001; Admin dapat menyetel nomor awal saat membuat periode |
| Q4 | Apakah TTD Sekretaris Umum wajib pada semua surat atau hanya jenis tertentu? | Fase 2 | Opsional per jenis surat, dapat dikonfigurasi |
| Q5 | Untuk proker BERKALA berulang, apakah setiap kemunculan menjadi entri terpisah di Gantt? | Fase 3 | Satu entri dengan pola pengulangan; Gantt menampilkan sebagai marker berulang |
| Q6 | Apakah anggota panitia yang bukan pengurus HMIF (mis. mahasiswa umum) perlu akun? | Fase 4 | Tidak — hanya pengurus terdaftar |
| Q7 | Divisi RAB (P3K, Komdis, dll) apakah tetap sama untuk semua acara atau dapat dikustom per acara? | Fase 4 | Preset + dapat ditambah/kurangi per acara |
| Q8 | Batas maksimal ukuran file upload nota? | Fase 5 | 15 MB per file |
| Q9 | Apakah LPJ memerlukan approval sebelum final? | Fase 5 | Ya — approval Bendum + Ketua |
| Q10 | Retensi backup berapa lama? | Fase 6 | 12 bulan untuk otomatis; manual permanen |

---

## 13. Lampiran

### 13.1 Inventaris Template

| File | Jenis | Digunakan Untuk | Status |
|---|---|---|---|
| `Contoh Surat Aktif Organisasi.docx` | Surat 02 | Keterangan Aktif Organisasi | ✅ Siap dipetakan |
| `018_Surat Aspirasi Keorganisasian Mahasiswa Fakultas Teknik.docx` | Surat 03 | Aspirasi | ✅ Siap dipetakan |
| `Contoh Surat Undangan Pemateri.docx` | Surat 04 | Undangan Pemateri | ✅ Siap dipetakan |
| `Contoh Surat Undangan dan Sambutan.docx` | Surat 04 | Undangan & Sambutan | ✅ Siap dipetakan |
| `Contoh Surat Peminjaman Barang.docx` | Surat 05 | Peminjaman Barang | ✅ Siap dipetakan |
| `Contoh Surat Peminjaman Ruangan.docx` | Surat 05 | Peminjaman Ruangan | ✅ Siap dipetakan |
| `Contoh Surat Permohonan Kerja Sama.docx` | Surat 08 | Kerja Sama | ✅ Siap dipetakan |
| `TOR_KT1_2025.docx` | TOR | Generator TOR | ✅ Struktur teridentifikasi |
| `Proposal KT1 IF25.docx` | Proposal | Generator Proposal | ✅ Struktur teridentifikasi |
| `RAB_Template.xlsx` | RAB | Struktur RAB 4 sheet | ✅ Dibedah lengkap |
| `Template LPJ HMIF.docx` | LPJ | Generator LPJ acara | ✅ Tersedia |
| `Template LPJ_Departemen.docx` | LPJ | Generator LPJ departemen | ✅ Tersedia |
| `Template Notulensi.docx` | Notulensi | Generator notulensi | ✅ Tersedia |
| `Template Haluan Kerja Dasar Departemen.docx` | Haluan Kerja | Generator haluan kerja dept | ✅ Tersedia |
| `Lembar Pengesahan LPJ.pdf` | Referensi | Format lembar pengesahan | ✅ Tersedia |
| `SURAT KOMITMEN.pdf` | Referensi | — | ℹ️ Belum terpetakan ke fitur |
| `Stempel Digital HMIF.jpeg` | Aset | Overlay stempel | ✅ Siap dipakai |
| `LOGO HMIF - SHADOW@3x.png` | Aset | Logo aplikasi | ✅ Siap dipakai |

### 13.2 Glosarium

| Istilah | Arti |
|---|---|
| **BPH** | Badan Pengawas Himpunan — pengawas dengan akses baca saja |
| **Kadept** | Kepala Departemen |
| **Ketuplak** | Ketua Pelaksana |
| **Koor Divisi** | Koordinator Divisi |
| **LPJ** | Laporan Pertanggungjawaban |
| **Master Gantt** | Gantt chart agregat seluruh proker seluruh departemen di halaman utama |
| **Master Image** | Turunan gambar berkualitas tertinggi, dipakai untuk unduhan & cetak |
| **PIC** | Person In Charge — departemen penanggung jawab acara |
| **Proker** | Program Kerja |
| **RAB** | Rencana Anggaran Biaya |
| **RAB Aktual** | Realisasi anggaran berdasarkan nota terverifikasi |
| **Rentang Terkunci** | Periode dari mulai persiapan hingga akhir acara, tidak boleh dipakai proker terjadwal lain |
| **Sekum** | Sekretaris Umum |
| **Bendum** | Bendahara Umum |
| **TOR** | Term of Reference / Kerangka Acuan Kerja |

---

*Dokumen ini adalah acuan tunggal untuk pengembangan HMIF Center. Perubahan cakupan harus melalui persetujuan Pemilik Produk dan tercatat sebagai revisi versi.*
