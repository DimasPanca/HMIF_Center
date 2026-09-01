# User Flow — HMIF Center

**Dokumen Alur Pengguna & Interaksi Sistem**

| | |
|---|---|
| **Versi** | 1.0 |
| **Tanggal** | 1 September 2026 |
| **Dokumen Terkait** | [PRD.md](PRD.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) · [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |

---

## Daftar Isi

1. [Peta Navigasi Global](#1-peta-navigasi-global)
2. [Alur Autentikasi & Onboarding](#2-alur-autentikasi--onboarding)
3. [Alur Homepage & Master Gantt](#3-alur-homepage--master-gantt)
4. [Alur Program Kerja](#4-alur-program-kerja)
5. [Alur Persuratan](#5-alur-persuratan)
6. [Alur Kepanitiaan & RAB](#6-alur-kepanitiaan--rab)
7. [Alur Nota & LPJ](#7-alur-nota--lpj)
8. [Alur Progres & Kendala](#8-alur-progres--kendala)
9. [Alur Sekretaris](#9-alur-sekretaris)
10. [Alur Backup & Restore](#10-alur-backup--restore)
11. [Matriks State Transition](#11-matriks-state-transition)
12. [Peta Layar & Rute](#12-peta-layar--rute)

---

## 1. Peta Navigasi Global

### 1.1 Struktur Sidebar per Role

```mermaid
graph TD
    ROOT["🏠 Beranda<br/>(Master Gantt + Dashboard)"]

    ROOT --> PROKER["📋 Program Kerja"]
    ROOT --> ACARA["🎯 Acara Besar"]
    ROOT --> SURAT["✉️ Persuratan"]
    ROOT --> KEU["💰 Keuangan"]
    ROOT --> SEK["📁 Kesekretariatan"]
    ROOT --> DEPT["🏢 Departemen"]
    ROOT --> ADM["⚙️ Administrasi"]

    PROKER --> P1["Daftar Proker"]
    PROKER --> P2["Kalender Ketersediaan"]
    PROKER --> P3["Gantt Departemen"]
    PROKER --> P4["Antrian Approval"]

    ACARA --> A1["Daftar Acara"]
    ACARA --> A2["Ruang Kerja Divisi"]
    ACARA --> A3["TOR"]
    ACARA --> A4["Proposal"]

    SURAT --> S1["Buat Surat"]
    SURAT --> S2["Antrian Approval"]
    SURAT --> S3["Arsip Surat"]

    KEU --> K1["RAB"]
    KEU --> K2["Upload Nota"]
    KEU --> K3["Verifikasi Nota"]
    KEU --> K4["LPJ"]

    SEK --> E1["Notulensi"]
    SEK --> E2["Data Pengurus"]
    SEK --> E3["Peminjaman Ruangan"]
    SEK --> E4["Arsip Dokumen"]

    DEPT --> D1["Kanban"]
    DEPT --> D2["Kendala"]
    DEPT --> D3["Haluan Kerja"]

    ADM --> M1["Pengguna & Role"]
    ADM --> M2["Periode Kepengurusan"]
    ADM --> M3["Konfigurasi Sistem"]
    ADM --> M4["Backup & Restore"]
    ADM --> M5["Audit Log"]
```

### 1.2 Visibilitas Menu per Role

| Menu | Admin | Ketua | Wakil | Sekum | Bendum | Kadept | Anggota | BPH |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Beranda | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Program Kerja | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| ↳ Antrian Approval | — | ✅ | ✅ | — | — | — | — | — |
| Acara Besar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Persuratan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | 👁️ |
| ↳ Antrian Approval | — | ✅ | ✅ | ✅ | — | — | — | — |
| Keuangan | ✅ | 👁️ | 👁️ | 👁️ | ✅ | 👁️ | ✅¹ | 👁️ |
| Kesekretariatan | ✅ | 👁️ | 👁️ | ✅ | 👁️ | 👁️ | 👁️ | 👁️ |
| Departemen | ✅ | 👁️ | 👁️ | 👁️ | 👁️ | ✅² | ✅² | 👁️ |
| Administrasi | ✅ | 👁️³ | — | — | — | — | — | 👁️³ |

✅ = akses penuh · 👁️ = read-only · — = tersembunyi
¹ hanya Upload Nota untuk divisinya · ² hanya departemen sendiri · ³ hanya Audit Log

---

## 2. Alur Autentikasi & Onboarding

### 2.1 Admin Mengundang Pengurus Baru

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant W as Web App
    participant DB as Database
    participant M as Email

    A->>W: Buka Administrasi → Pengguna
    A->>W: Klik "Undang Pengurus"
    W-->>A: Tampilkan form undangan

    A->>W: Isi Nama, NIM, Email, Angkatan
    A->>W: Pilih Role (multi-select)
    A->>W: Pilih Departemen (jika Kadept/Anggota)
    A->>W: Klik "Kirim Undangan"

    W->>DB: Cek duplikasi email & NIM
    alt Sudah terdaftar
        DB-->>W: Konflik
        W-->>A: ⚠️ "Email/NIM sudah terdaftar pada periode aktif"
    else Belum terdaftar
        DB->>DB: Buat user (status: PENDING)
        DB->>DB: Buat token undangan (berlaku 7 hari)
        DB->>DB: Catat ke audit log
        W->>M: Kirim email undangan
        W-->>A: ✅ "Undangan terkirim ke {email}"
        Note over A,W: Link undangan juga ditampilkan<br/>agar Admin dapat menyalinnya manual
    end
```

### 2.2 Pengurus Mengaktifkan Akun

```mermaid
flowchart TD
    START([Pengurus menerima link undangan]) --> OPEN[Buka link]
    OPEN --> VALID{Token valid?}

    VALID -->|Kedaluwarsa| EXP[❌ Halaman: Undangan kedaluwarsa<br/>Hubungi Admin]
    VALID -->|Sudah dipakai| USED[❌ Halaman: Undangan sudah digunakan<br/>Silakan login]
    VALID -->|Valid| FORM[Form Aktivasi]

    FORM --> INPUT[Isi Password + Konfirmasi]
    INPUT --> CHECK{Password memenuhi<br/>syarat?}
    CHECK -->|Tidak| ERR[⚠️ Min 8 karakter,<br/>huruf + angka]
    ERR --> INPUT
    CHECK -->|Ya| SAVE[Simpan password<br/>Status → AKTIF<br/>Token → TERPAKAI]

    SAVE --> AUDIT[Catat audit log]
    AUDIT --> WELCOME[Halaman Selamat Datang<br/>+ ringkasan role & hak akses]
    WELCOME --> HOME([Beranda])

    style EXP fill:#7f1d1d,color:#fff
    style USED fill:#7f1d1d,color:#fff
    style HOME fill:#0066A9,color:#fff
```

### 2.3 Login Harian

```mermaid
flowchart TD
    START([Buka aplikasi]) --> SESS{Ada sesi aktif?}
    SESS -->|Ya| HOME([Beranda])
    SESS -->|Tidak| LOGIN[Halaman Login]

    LOGIN --> INPUT[Masukkan Email + Password]
    INPUT --> RATE{Percobaan gagal<br/>≥ 5 dalam 15 menit?}
    RATE -->|Ya| LOCK[🔒 Akun terkunci sementara<br/>Coba lagi dalam X menit]
    LOCK --> LOGIN

    RATE -->|Tidak| AUTH{Kredensial benar?}
    AUTH -->|Tidak| FAIL[⚠️ Email atau password salah]
    FAIL --> LOGCOUNT[Catat percobaan gagal]
    LOGCOUNT --> LOGIN

    AUTH -->|Ya| ACTIVE{Akun aktif?}
    ACTIVE -->|Tidak| INACTIVE[⚠️ Akun dinonaktifkan<br/>Hubungi Admin]
    INACTIVE --> LOGIN

    ACTIVE -->|Ya| PERIOD{Ada periode aktif?}
    PERIOD -->|Tidak| NOPERIOD[⚠️ Belum ada periode aktif<br/>Hubungi Admin]

    PERIOD -->|Ya| ROLES[Muat role & permission user]
    ROLES --> AUDITOK[Catat login sukses]
    AUDITOK --> HOME

    style HOME fill:#0066A9,color:#fff
    style LOCK fill:#92400e,color:#fff
```

---

## 3. Alur Homepage & Master Gantt

### 3.1 Struktur Halaman Beranda

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER   [Logo HMIF]  Beranda  Proker  Acara  Surat  ...   [🔍] [👤]│
├──────────┬───────────────────────────────────────────────────────────┤
│          │                                                            │
│ SIDEBAR  │   ╔══════════════════════════════════════════════════════╗ │
│          │   ║  TIMELINE PROGRAM KERJA HMIF                         ║ │
│  🏠      │   ║  Periode 2025/2026        [Minggu▾][Filter▾][Ekspor] ║ │
│  📋      │   ╠══════════════════════════════════════════════════════╣ │
│  🎯      │   ║           │  Okt   │  Nov   │  Des   │  Jan   │ Feb  ║ │
│  ✉️      │   ║           │W1 W2W3W4│W1W2W3W4│W1W2W3W4│W1W2W3W4│      ║ │
│  💰      │   ║ ▼ Kaderisasi ────────────────────────────────────────║ │
│  📁      │   ║   SYNCHRONIZE  ▬▬▬▬▬▬▬▬▬█▬                            ║ │
│  🏢      │   ║   Upgrading                    ▬▬▬▬▬█                 ║ │
│  ⚙️      │   ║ ▼ Kominfo   ─────────────────────────────────────────║ │
│          │   ║   IT Festival                        ▬▬▬▬▬▬▬█▬       ║ │
│          │   ║ ▶ Minat & Bakat (3)  ────────────────────────────────║ │
│          │   ║ ▼ Eksternal ─────────────────────────────────────────║ │
│          │   ║   Company Visit         ▬▬▬▬█                        ║ │
│          │   ║                          ┊ hari ini                  ║ │
│          │   ╚══════════════════════════════════════════════════════╝ │
│          │                                                            │
│          │   ┌────────────────┐ ┌────────────────┐ ┌───────────────┐ │
│          │   │ PANEL ROLE #1  │ │ PANEL ROLE #2  │ │ PANEL ROLE #3 │ │
│          │   └────────────────┘ └────────────────┘ └───────────────┘ │
└──────────┴───────────────────────────────────────────────────────────┘

Legenda:  ▬ = masa persiapan   █ = hari-H   ┊ = garis hari ini
```

### 3.2 Alur Pemuatan & Live Update

```mermaid
sequenceDiagram
    autonumber
    actor U as Pengguna (role apa pun)
    participant P as Halaman Beranda
    participant API as API Server
    participant DB as Database
    participant RT as Realtime Channel
    actor K as Kadept lain

    U->>P: Buka Beranda
    P->>P: Render skeleton Master Gantt
    P->>API: GET /api/gantt/master?periode=aktif
    API->>DB: Query proker DISETUJUI + BERJALAN<br/>seluruh departemen
    DB-->>API: Data proker + gantt task
    API-->>P: Struktur grup (departemen) + bar (proker)
    P->>P: Render SVG Gantt (< 500 ms)

    P->>RT: Subscribe channel "proker:periode-aktif"
    RT-->>P: ✅ Terhubung

    par Panel dashboard dimuat paralel
        P->>API: GET /api/dashboard/{role}
        API-->>P: Data panel kontekstual
    end

    Note over U,P: Halaman siap interaksi < 1,5 detik

    K->>DB: Menambah proker baru (disetujui)
    DB->>RT: Broadcast perubahan
    RT-->>P: Event: proker.created
    P->>P: Sisipkan bar baru + highlight singkat
    Note over P: Tanpa refresh halaman · < 3 detik

    U->>P: Klik bar proker
    P->>API: GET /api/proker/{id}
    API-->>P: Detail proker
    P-->>U: Panel samping meluncur (180 ms)
```

### 3.3 Interaksi Master Gantt

```mermaid
flowchart LR
    GANTT[Master Gantt] --> HOVER[Hover pada bar]
    GANTT --> CLICK[Klik pada bar]
    GANTT --> COLLAPSE[Klik ▼ pada grup]
    GANTT --> SCALE[Ubah skala waktu]
    GANTT --> FILTER[Buka filter]
    GANTT --> EXPORT[Klik Ekspor]

    HOVER --> TIP["Tooltip:<br/>Nama Proker<br/>Departemen<br/>Persiapan: 1 Nov – 5 Des<br/>Hari-H: 6–7 Des<br/>Status: Berjalan<br/>PJ: Nama"]

    CLICK --> PANEL["Panel samping:<br/>• Detail lengkap<br/>• Gantt internal proker<br/>• Kepanitiaan<br/>• Progres<br/>• Tautan ke RAB"]

    COLLAPSE --> FOLD[Sembunyikan proker,<br/>tampilkan bar ringkas grup]

    SCALE --> S1[Minggu]
    SCALE --> S2[Bulan]
    SCALE --> S3[Kuartal]

    FILTER --> F1[Departemen]
    FILTER --> F2[Kategori proker]
    FILTER --> F3[Status]

    EXPORT --> E1[PNG — untuk dokumen]
    EXPORT --> E2[PDF — untuk cetak]

    style PANEL fill:#111C44,color:#fff
    style TIP fill:#0A0F1F,color:#fff
```

---

## 4. Alur Program Kerja

### 4.1 Alur Utama Penambahan Proker Terjadwal

```mermaid
flowchart TD
    START([Kadept: Tambah Proker]) --> W1

    subgraph W1[" LANGKAH 1 — Informasi Dasar "]
        L1A[Nama Proker]
        L1B[Kategori: TERJADWAL / BERKALA / RESPONSIF]
        L1C[Deskripsi, Tujuan, Sasaran]
        L1D[Penanggung Jawab]
    end

    W1 --> KAT{Kategori?}

    KAT -->|BERKALA| WB[Langkah 2B:<br/>Pola Pengulangan]
    KAT -->|RESPONSIF| WR[Langkah 2C:<br/>Tanggal Bebas]
    KAT -->|TERJADWAL| W2

    subgraph W2[" LANGKAH 2 — Penjadwalan "]
        L2A[Tampilkan Kalender Ketersediaan]
        L2B[Pilih Hari-H]
        L2C[Pilih Tanggal Mulai Persiapan]
        L2D[Validasi durasi 15–45 hari]
        L2E[Cek konflik real-time]
    end

    W2 --> DUR{Durasi persiapan<br/>15–45 hari?}
    DUR -->|Tidak| ERRDUR[⚠️ Persiapan harus<br/>antara 15 dan 45 hari]
    ERRDUR --> W2

    DUR -->|Ya| CONF{Bentrok dengan<br/>proker TERJADWAL lain?}
    CONF -->|Ya| SHOWCONF["❌ Bentrok dengan:<br/>SYNCHRONIZE (Kaderisasi)<br/>1 Nov – 7 Des 2026<br/><br/>Pilih tanggal lain"]
    SHOWCONF --> W2

    CONF -->|Tidak| OK1[✅ Tanggal tersedia]
    OK1 --> W3

    subgraph W3[" LANGKAH 3 — Anggaran & Kebutuhan "]
        L3A[Estimasi Anggaran]
        L3B[Sumber Dana]
        L3C[Kebutuhan Ruangan & Barang]
    end

    W3 --> W4

    subgraph W4[" LANGKAH 4 — Kepanitiaan "]
        L4A[Pilih Ketua Pelaksana<br/>dari SELURUH pengurus]
        L4B[Tentukan Divisi]
        L4C[Pilih Koordinator per Divisi]
        L4D[Pilih Anggota per Divisi]
    end

    W4 --> W5

    subgraph W5[" LANGKAH 5 — Gantt Chart (WAJIB) "]
        L5A[Editor Gantt]
        L5B[Tambah task per fase]
        L5C[Minimal 1 task]
    end

    W5 --> GC{Ada minimal<br/>1 task?}
    GC -->|Tidak| ERRGC[⚠️ Proker terjadwal<br/>wajib memiliki Gantt]
    ERRGC --> W5

    GC -->|Ya| W6

    subgraph W6[" LANGKAH 6 — Tinjau & Ajukan "]
        L6A[Ringkasan seluruh input]
        L6B[Pemeriksaan konflik final]
    end

    W6 --> FINALCHK{Masih bebas konflik?}
    FINALCHK -->|Tidak| RACE["❌ Tanggal baru saja diambil<br/>departemen lain.<br/>Silakan pilih ulang"]
    RACE --> W2

    FINALCHK -->|Ya| SUBMIT[Ajukan]
    SUBMIT --> PENDING[Status: MENUNGGU_APPROVAL<br/>⚠️ Kalender BELUM terkunci]
    PENDING --> NOTIF[Muncul di antrian<br/>Ketua & Wakil]
    NOTIF --> END([Selesai — menunggu approval])

    style SHOWCONF fill:#7f1d1d,color:#fff
    style RACE fill:#7f1d1d,color:#fff
    style OK1 fill:#065f46,color:#fff
    style END fill:#0066A9,color:#fff
```

### 4.2 Kalender Ketersediaan — Tampilan

```
╔═══════════════════════════════════════════════════════════════════╗
║  KALENDER KETERSEDIAAN — November 2026        [◀]  [Hari Ini] [▶] ║
╠═══════════════════════════════════════════════════════════════════╣
║   Sen    Sel    Rab    Kam    Jum    Sab    Min                   ║
║ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐               ║
║ │      │      │  1   │  2   │  3   │  4   │  5   │               ║
║ │      │      │▓▓▓▓▓▓│▓▓▓▓▓▓│▓▓▓▓▓▓│▓▓▓▓▓▓│▓▓▓▓▓▓│               ║
║ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤               ║
║ │  6   │  7   │  8   │  9   │ 10   │ 11   │ 12   │               ║
║ │▓▓▓▓▓▓│▓▓▓▓▓▓│▓▓▓▓▓▓│▓▓▓▓▓▓│▓▓▓▓▓▓│▓▓▓▓▓▓│▓▓▓▓▓▓│               ║
║ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤               ║
║ │ 13   │ 14   │ 15   │ 16   │ 17   │ 18   │ 19   │               ║
║ │▓▓▓▓▓▓│▓▓▓▓▓▓│      │      │      │      │      │               ║
║ └──────┴──────┴──────┴──────┴──────┴──────┴──────┘               ║
║                                                                    ║
║  ▓▓ Terkunci — SYNCHRONIZE (Kaderisasi) · 1 Nov – 7 Des           ║
║  ░░ Proker Berkala (tidak memblokir)                              ║
║  ⬜ Tersedia                                                       ║
╚═══════════════════════════════════════════════════════════════════╝

Hover pada tanggal terkunci → tooltip:
  "SYNCHRONIZE
   Departemen Kaderisasi
   Persiapan 1 Nov – 5 Des · Hari-H 6–7 Des
   Ketua Pelaksana: Muhammad Zidan"
```

### 4.3 Alur Approval Proker

```mermaid
sequenceDiagram
    autonumber
    actor KD as Kepala Departemen
    participant SYS as Sistem
    actor KH as Ketua Himpunan
    actor WK as Wakil Ketua
    participant CAL as Kalender

    KD->>SYS: Ajukan proker
    SYS->>SYS: Status = MENUNGGU_APPROVAL
    SYS->>KH: Masuk antrian approval
    SYS->>WK: Masuk antrian approval
    Note over SYS,CAL: Kalender BELUM terkunci

    alt Wakil menyetujui lebih dulu
        WK->>SYS: Buka detail proker
        SYS-->>WK: Data lengkap + preview Gantt + peta konflik
        WK->>SYS: Klik "Setujui"
        SYS->>SYS: Cek ulang konflik (final)

        alt Masih bebas konflik
            SYS->>CAL: 🔒 Kunci rentang tanggal
            SYS->>SYS: Status = DISETUJUI
            SYS->>SYS: Buat entri kepanitiaan
            SYS->>SYS: Catat audit log
            SYS-->>KH: Hapus dari antrian
            SYS-->>KD: ✅ Proker disetujui
            SYS->>SYS: Muncul di Master Gantt (live)
        else Sudah bentrok (ada yang mendahului)
            SYS-->>WK: ❌ Konflik terdeteksi
            SYS-->>KD: ⚠️ Perlu revisi tanggal
            SYS->>SYS: Status = PERLU_REVISI
        end

    else Ketua menolak
        KH->>SYS: Klik "Tolak" + isi alasan (wajib)
        SYS->>SYS: Status = DITOLAK
        SYS-->>KD: ❌ Ditolak — {alasan}
        SYS-->>WK: Hapus dari antrian
        KD->>SYS: Revisi & ajukan ulang
    end
```

### 4.4 Alur Edit Proker yang Sudah Terkunci

```mermaid
flowchart TD
    START([Kadept membuka proker DISETUJUI]) --> EDIT[Klik Edit]
    EDIT --> WHAT{Field apa<br/>yang diubah?}

    WHAT -->|Deskripsi, PJ, anggota| MINOR[Perubahan Minor]
    MINOR --> SAVEMINOR[Simpan langsung<br/>+ catat audit log]
    SAVEMINOR --> DONE1([Selesai — tetap DISETUJUI])

    WHAT -->|Tanggal / Kategori| MAJOR[Perubahan Mayor]
    MAJOR --> WARN["⚠️ Mengubah tanggal akan:<br/>• Membuka kunci kalender lama<br/>• Memerlukan persetujuan ulang<br/><br/>Lanjutkan?"]

    WARN -->|Batal| CANCEL([Kembali])
    WARN -->|Lanjut| NEWDATE[Pilih tanggal baru<br/>di kalender]

    NEWDATE --> CONF{Bentrok?}
    CONF -->|Ya| ERR[❌ Tanggal tidak tersedia]
    ERR --> NEWDATE

    CONF -->|Tidak| SUBMIT[Ajukan Perubahan]
    SUBMIT --> HOLD["Status = MENUNGGU_APPROVAL_REVISI<br/>🔒 Kunci LAMA tetap aktif<br/>(mencegah orang lain mengambil)"]
    HOLD --> QUEUE[Masuk antrian Ketua/Wakil]

    QUEUE --> DEC{Keputusan}
    DEC -->|Setujui| RELEASE[Lepas kunci lama<br/>Kunci rentang baru<br/>Status = DISETUJUI]
    DEC -->|Tolak| REVERT[Kembali ke tanggal lama<br/>Status = DISETUJUI]

    RELEASE --> DONE2([Selesai])
    REVERT --> DONE2

    style ERR fill:#7f1d1d,color:#fff
    style WARN fill:#92400e,color:#fff
```

---

## 5. Alur Persuratan

### 5.1 Alur Lengkap Pembuatan Surat

```mermaid
flowchart TD
    START([Sekum: Buat Surat]) --> PICK[Pilih Jenis Surat]

    PICK --> TYPES{"Dropdown 9 jenis"}
    TYPES --> T01[01 — Pengajuan]
    TYPES --> T02[02 — Keterangan]
    TYPES --> T03[03 — Pemberitahuan]
    TYPES --> T04[04 — Undangan]
    TYPES --> T05[05 — Peminjaman]
    TYPES --> T06[06 — Peringatan]
    TYPES --> T07[07 — Keputusan]
    TYPES --> T08[08 — Kerja Sama]
    TYPES --> T09[09 — Piagam]

    T01 & T02 & T03 & T04 & T05 & T06 & T07 & T08 & T09 --> SUB{Ada sub-template?}

    SUB -->|Ya, mis. kode 05| PICKSUB["Pilih:<br/>• Peminjaman Barang<br/>• Peminjaman Ruangan"]
    SUB -->|Tidak| FORM
    PICKSUB --> FORM

    FORM[Form Dinamis + Preview Langsung]

    FORM --> SPLIT{{"Layar terbagi dua"}}
    SPLIT --> LEFT["KIRI — Form Input<br/>─────────────────<br/>Kegiatan: [HMIF____]<br/>Tanggal: [01/09/2026]<br/>Kota: [Cilegon]<br/>Lampiran: [-]<br/>Perihal: [__________]<br/>Tujuan: [Dropdown ▾]<br/>  → BEM FT UNTIRTA<br/>  → DPM FT UNTIRTA<br/>  → Kabag Sekretariat<br/>  → Lainnya...<br/>Alamat: [di Cilegon]<br/>Isi: [Rich Text]<br/>+ Field khusus jenis<br/>+ Penandatangan tambahan<br/>Format: (•)DOCX ( )PDF ( )Keduanya"]

    SPLIT --> RIGHT["KANAN — Preview Live<br/>─────────────────<br/>[KOP SURAT HMIF]<br/><br/>Nomor: 05/XXX/UN43.3.7/<br/>        HMIF/IX/2026<br/>        ⓘ nomor sementara<br/>Lampiran: -<br/>Perihal: ...<br/><br/>Kepada Yth.<br/>...<br/><br/>[isi surat]<br/><br/>[TTD + Stempel]"]

    LEFT --> AUTOSAVE[Auto-save tiap 10 detik]
    AUTOSAVE --> VALID{Semua field<br/>wajib terisi?}

    VALID -->|Tidak| DISABLED["Tombol 'Ajukan' nonaktif<br/>+ daftar field yang kurang"]
    DISABLED --> LEFT

    VALID -->|Ya| SUBMIT[Klik Ajukan]
    SUBMIT --> PENDING[Status: MENUNGGU_APPROVAL]
    PENDING --> QUEUE[Antrian: Ketua, Wakil, DAN Sekum]
    QUEUE --> END([Menunggu approval])

    style RIGHT fill:#111C44,color:#fff
    style DISABLED fill:#92400e,color:#fff
```

### 5.2 Alur Approval & Generate (Detail Penomoran)

```mermaid
sequenceDiagram
    autonumber
    actor AP as Approver<br/>(Ketua/Wakil/Sekum)
    participant W as Web App
    participant API as API Server
    participant DB as Database
    participant GEN as Document Engine
    participant ST as Storage

    AP->>W: Buka antrian approval surat
    W->>API: GET /api/surat/pending
    API-->>W: Daftar surat menunggu
    AP->>W: Klik salah satu surat
    W-->>AP: Preview dokumen + tombol aksi

    alt Menyetujui
        AP->>W: Klik "Setujui & Terbitkan"
        W->>API: POST /api/surat/{id}/approve

        rect rgb(20, 40, 70)
            Note over API,DB: TRANSAKSI ATOMIK
            API->>DB: BEGIN
            API->>DB: SELECT ... FOR UPDATE pada counter periode
            DB-->>API: nomor_terakhir = 274
            API->>DB: UPDATE counter → 275
            API->>DB: Simpan nomor_surat lengkap<br/>"02/275/UN43.3.7/HMIF/IX/2026"
            API->>DB: Status → DISETUJUI
            API->>DB: Catat audit log
            API->>DB: COMMIT
        end

        API->>GEN: Render dokumen
        GEN->>GEN: Muat template DOCX
        GEN->>GEN: Isi placeholder
        GEN->>GEN: Sisipkan TTD Ketua (PNG)
        GEN->>GEN: Overlay Stempel HMIF
        GEN->>GEN: Sisipkan TTD tambahan (jika ada)

        alt Format = DOCX
            GEN-->>API: file.docx
        else Format = PDF
            GEN->>GEN: Konversi ke PDF (teks tetap seleksi-able)
            GEN-->>API: file.pdf
        else Format = Keduanya
            GEN-->>API: file.docx + file.pdf
        end

        API->>ST: Simpan ke bucket arsip
        ST-->>API: path file
        API->>DB: Simpan path + status TERBIT
        API-->>W: ✅ Surat terbit — nomor 02/275/...
        W-->>AP: Tampilkan nomor final + tombol Unduh
        Note over W: Surat hilang dari antrian<br/>approver lain

    else Menolak
        AP->>W: Klik "Tolak" + isi alasan
        W->>API: POST /api/surat/{id}/reject
        API->>DB: Status → DITOLAK + alasan
        Note over DB: ⚠️ Nomor TIDAK dialokasikan
        API->>DB: Catat audit log
        API-->>W: Surat dikembalikan ke pembuat
    end
```

### 5.3 Alur Generate Massal — Surat Aktif Organisasi

```mermaid
flowchart TD
    START([Sekum: Surat Keterangan Aktif]) --> MODE{Mode?}

    MODE -->|Satuan| SINGLE[Isi manual:<br/>Nama, NIM, Jabatan, Keperluan]
    MODE -->|Massal| BULK[Pilih dari Data Pengurus]

    BULK --> LIST["Tabel Data Pengurus<br/>☑ Andi — 3337220001 — Kadept Kominfo<br/>☑ Budi — 3337220002 — Anggota Internal<br/>☐ Citra — 3337220003 — Sekum<br/>...<br/><br/>Terpilih: 30 orang"]

    LIST --> KEP[Isi Keperluan<br/>berlaku untuk semua]
    KEP --> PREVIEW[Preview daftar surat<br/>yang akan dibuat]

    PREVIEW --> CONFIRM{Konfirmasi<br/>generate 30 surat?}
    CONFIRM -->|Batal| LIST
    CONFIRM -->|Ya| SUBMIT[Ajukan 30 surat sekaligus]

    SUBMIT --> QUEUE[30 draft masuk antrian approval]
    QUEUE --> APPROVE[Approver menyetujui<br/>secara batch]

    APPROVE --> LOOP["Untuk setiap surat:<br/>alokasi nomor berurutan<br/>275, 276, 277, ... 304"]
    LOOP --> GEN[Generate 30 dokumen]
    GEN --> ZIP[Bundel jadi ZIP]
    ZIP --> DONE([Unduh: surat-aktif-organisasi.zip])

    SINGLE --> NORMALFLOW([Alur normal])

    style DONE fill:#0066A9,color:#fff
```

---

## 6. Alur Kepanitiaan & RAB

### 6.1 Pembentukan Kepanitiaan (Otomatis)

```mermaid
flowchart LR
    A[Proker TERJADWAL<br/>DISETUJUI] --> B[Sistem membuat<br/>entri Kepanitiaan]
    B --> C[Departemen PIC =<br/>departemen pengusul]
    B --> D[Ketua Pelaksana =<br/>dari Langkah 4 wizard]
    B --> E[Divisi + Koordinator +<br/>Anggota = dari Langkah 4]

    E --> F[Buat Ruang Kerja<br/>untuk setiap divisi]

    F --> G1[Job Desk kosong]
    F --> G2[Gantt Divisi kosong]
    F --> G3[RAB Divisi kosong]
    F --> G4[Kanban Divisi kosong]
    F --> G5[Folder Dokumen]
    F --> G6[Slot Nota]

    G1 & G2 & G3 & G4 & G5 & G6 --> H[Notifikasi ke<br/>seluruh panitia]

    style A fill:#065f46,color:#fff
    style H fill:#0066A9,color:#fff
```

### 6.2 Struktur Ruang Kerja Acara Besar

```
╔══════════════════════════════════════════════════════════════════════╗
║  SYNCHRONIZE 2026                          [Kaderisasi] [Berjalan]   ║
║  Ketua Pelaksana: Muhammad Zidan Heiqmatyar                          ║
║  Persiapan 1 Nov – 5 Des  ·  Hari-H 6–7 Des 2026                     ║
╠══════════════════════════════════════════════════════════════════════╣
║ [Ringkasan] [Gantt] [Divisi] [RAB] [TOR] [Proposal] [Nota] [LPJ]     ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  TAB: DIVISI                                                          ║
║  ┌───────────────┬───────────────┬───────────────┬────────────────┐  ║
║  │ 🎪 ACARA      │ 🍱 KONSUMSI   │ 📢 HUMAS      │ 🎨 PDD         │  ║
║  │ Koor: Rina    │ Koor: Dedi    │ Koor: Sinta   │ Koor: Fajar    │  ║
║  │ 8 anggota     │ 6 anggota     │ 5 anggota     │ 7 anggota      │  ║
║  │ RAB: 172.000  │ RAB: 6.654.000│ RAB: 8.600.000│ RAB: 8.212.000 │  ║
║  │ Progres ▓▓▓░ 75%│ ▓▓▓▓ 90%    │ ▓▓░░ 50%      │ ▓▓▓░ 70%       │  ║
║  │ [Buka]        │ [Buka]        │ [Buka]        │ [Buka]         │  ║
║  └───────────────┴───────────────┴───────────────┴────────────────┘  ║
║  ┌───────────────┬───────────────┬───────────────┬────────────────┐  ║
║  │ ⚕️ P3K        │ 🔧 PERALATAN  │ 📝 SEKRETARIS │ 💰 BENDAHARA   │  ║
║  │ ...           │ ...           │ ...           │ ...            │  ║
║  └───────────────┴───────────────┴───────────────┴────────────────┘  ║
║                                                                       ║
║  ⓘ Anda adalah Koordinator Divisi Konsumsi.                          ║
║    Divisi lain dapat dilihat namun tidak dapat diubah.               ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 6.3 Alur Visibilitas Cross-Divisi

```mermaid
flowchart TD
    USER([Panitia Divisi Konsumsi]) --> OPEN[Buka Ruang Kerja Acara]
    OPEN --> TABS[Lihat semua tab divisi]

    TABS --> OWN[Klik Divisi KONSUMSI<br/>= divisi sendiri]
    TABS --> OTHER[Klik Divisi PDD<br/>= divisi lain]

    OWN --> FULL["MODE PENUH<br/>─────────────<br/>✅ Lihat RAB<br/>✅ Edit RAB<br/>✅ Lihat Progres<br/>✅ Ubah Kanban<br/>✅ Edit Gantt<br/>✅ Edit Job Desk<br/>✅ Upload Nota<br/>✅ Upload Dokumen"]

    OTHER --> READ["MODE BACA SAJA<br/>─────────────<br/>✅ Lihat RAB<br/>❌ Edit RAB<br/>✅ Lihat Progres<br/>❌ Ubah Kanban<br/>✅ Lihat Gantt<br/>❌ Edit Gantt<br/>✅ Lihat Job Desk<br/>✅ Lihat Nota<br/>✅ Unduh Dokumen<br/><br/>ⓘ Banner: 'Tampilan baca saja'<br/>Tombol edit TIDAK DIRENDER"]

    READ --> APITRY{Coba akses API<br/>langsung?}
    APITRY --> BLOCK[❌ 403 Forbidden<br/>Ditolak RLS di database]

    style FULL fill:#065f46,color:#fff
    style READ fill:#1e3a5f,color:#fff
    style BLOCK fill:#7f1d1d,color:#fff
```

### 6.4 Alur Penyusunan RAB

```mermaid
flowchart TD
    START([Koordinator Divisi:<br/>Buka RAB Divisi]) --> UI[Tabel RAB Inline-Editable]

    UI --> STRUKTUR{{"Struktur 3 Level"}}
    STRUKTUR --> LVL1[DIVISI KONSUMSI]
    LVL1 --> LVL2A[Sub-section:<br/>KONSUMSI PANITIA]
    LVL1 --> LVL2B[Sub-section:<br/>KONSUMSI PESERTA]
    LVL1 --> LVL2C[Sub-section:<br/>KEBUTUHAN DIVISI]

    LVL2A --> ITEM["Item:<br/>┌───┬────────────┬─────────┬───────────┬──────────┬──────────┐<br/>│No │Jenis Barang│ Jumlah  │Harga Satuan│  Total  │Keterangan│<br/>├───┼────────────┼─────────┼───────────┼──────────┼──────────┤<br/>│ 1 │ Galon      │ 10      │ Rp5.000   │ Rp50.000 │          │<br/>│ 2 │ Makan 3kali│ 58      │ Rp30.000  │Rp1.740.000│         │<br/>└───┴────────────┴─────────┴───────────┴──────────┴──────────┘"]

    ITEM --> INPUT[User mengetik di sel]
    INPUT --> PARSE{Kolom 'Jumlah'<br/>dapat diparsing<br/>jadi angka?}

    PARSE -->|Ya: '10', '156'| AUTO[jumlah_numerik = 10<br/>total = 10 × harga]
    PARSE -->|Sebagian: '16 Unit'| EXTRACT[Ekstrak angka: 16<br/>Simpan teks asli: '16 Unit'<br/>total = 16 × harga]
    PARSE -->|Tidak: '2 Hari 1 Malam'| PROMPT["⚠️ Tidak dapat menghitung otomatis.<br/>Masukkan nilai numerik: [___]<br/>atau isi Total manual: [_______]"]

    AUTO --> RECALC
    EXTRACT --> RECALC
    PROMPT --> MANUAL[User isi manual]
    MANUAL --> RECALC

    RECALC[Hitung ulang:<br/>• Total item<br/>• Total sub-section<br/>• Total divisi<br/>• Ringkasan divisi kolom H:J<br/>• Total acara]

    RECALC --> LIVE["Update seketika < 100 ms<br/>Sticky footer: TOTAL Rp26.000.000"]

    LIVE --> DONE{Selesai?}
    DONE -->|Belum| INPUT
    DONE -->|Ya| SUBMIT[Ajukan RAB Divisi]

    SUBMIT --> KETUPLAK[Ketua Pelaksana meninjau<br/>seluruh RAB divisi]
    KETUPLAK --> BENDUM[Bendahara Umum meninjau]
    BENDUM --> APPROVE{Setuju?}
    APPROVE -->|Tidak| REVISE[Kembalikan dengan catatan]
    REVISE --> INPUT
    APPROVE -->|Ya| LOCK[🔒 RAB DIKUNCI<br/>Status: DISETUJUI]

    LOCK --> READY([Siap untuk realisasi])

    style PROMPT fill:#92400e,color:#fff
    style LOCK fill:#065f46,color:#fff
```

### 6.5 Alur Export RAB ke Excel

```mermaid
flowchart LR
    RAB[(Data RAB<br/>di Database)] --> EXPORT[Klik Ekspor Excel]

    EXPORT --> BUILD[Bangun 4 Sheet]

    BUILD --> S1["Sheet 'RAB'<br/>kolom B–F: item per divisi<br/>kolom H–J: ringkasan divisi<br/>+ merge cell header divisi<br/>+ formula =SUM()"]
    BUILD --> S2["Sheet 'PEMASUKAN'<br/>ringkasan sumber dana<br/>+ daftar peserta & pembayaran"]
    BUILD --> S3["Sheet 'PENGELUARAN'<br/>buku kas dari nota terverifikasi<br/>+ saldo berjalan"]
    BUILD --> S4["Sheet 'RAB AKTUAL'<br/>kolom C–G: realisasi per item<br/>kolom J–L: ringkasan aktual"]

    S1 & S2 & S3 & S4 --> STYLE[Terapkan styling:<br/>• Header biru #DCE6F1<br/>• Border seluruh sel<br/>• Format Rupiah<br/>• Lebar kolom sesuai template]

    STYLE --> FILE[RAB_SYNCHRONIZE_2026.xlsx]
    FILE --> DL([Unduh])

    style DL fill:#0066A9,color:#fff
```

---

## 7. Alur Nota & LPJ

### 7.1 Alur Upload Nota (Detail Penuh)

```mermaid
flowchart TD
    START([Panitia buka menu Upload Nota]) --> DIV{Terdaftar di<br/>berapa divisi?}

    DIV -->|Satu| AUTO[Divisi terpilih otomatis]
    DIV -->|Lebih dari satu| PICKDIV[Pilih Divisi]

    AUTO --> DROPDOWN
    PICKDIV --> DROPDOWN

    DROPDOWN["🔽 PILIH ITEM RAB<br/>─────────────────────<br/>Dropdown berisi item dari<br/>RAB divisi terpilih:<br/>• Galon<br/>• Makan 3 kali<br/>• Snack<br/>• Aqua Botol<br/>• Materai<br/>• Print MoU<br/>─────────────────────<br/>⚠️ WAJIB dipilih sebelum kamera aktif"]

    DROPDOWN --> MULTI{Nota mencakup<br/>lebih dari 1 item?}

    MULTI -->|Ya| ADDMORE["Tambah item lain:<br/>☑ Snack — Rp50.000<br/>☑ Galon — Rp25.000<br/>─────────────<br/>Total alokasi: Rp75.000"]
    MULTI -->|Tidak| SINGLE1[Satu item saja]

    ADDMORE --> CAM
    SINGLE1 --> CAM

    CAM[📷 Buka Kamera / Pilih Galeri]

    CAM --> CAPTURE[Ambil foto]
    CAPTURE --> SCAN["🔍 AUTO-SCAN (jscanify)<br/>• Deteksi tepi dokumen<br/>• Koreksi perspektif<br/>• Tingkatkan kontras"]

    SCAN --> DETECT{Tepi terdeteksi?}
    DETECT -->|Ya| CROPPED[Nota terlihat lurus<br/>seperti hasil pindai]
    DETECT -->|Tidak| ASIS[Gunakan foto apa adanya<br/>setelah auto-rotate EXIF]

    CROPPED --> PREVIEW
    ASIS --> PREVIEW

    PREVIEW["👁️ PREVIEW WAJIB<br/>────────────────<br/>[gambar hasil scan]<br/><br/>Apakah nota terbaca jelas?<br/><br/>[🔄 Ambil Ulang]  [✓ Gunakan]"]

    PREVIEW -->|Ambil Ulang| CAM
    PREVIEW -->|Gunakan| PROCESS

    PROCESS["⚙️ PIPELINE GAMBAR (sisi klien)<br/>Satu decode → tiga turunan paralel"]

    PROCESS --> M1[MASTER<br/>JPEG Q90/Q93<br/>≤3000px]
    PROCESS --> M2[PREVIEW<br/>WebP Q78<br/>≤1280px]
    PROCESS --> M3[THUMB<br/>WebP Q70<br/>≤400px]

    M1 & M2 & M3 --> META[Isi Metadata:<br/>• Tanggal Belanja<br/>• Jumlah Aktual<br/>• Harga Aktual<br/>• Alokasi per item<br/>• Keterangan]

    META --> CHECK{Total alokasi =<br/>total nota?}
    CHECK -->|Tidak| ERRALLOC["⚠️ Alokasi Rp70.000<br/>≠ Total nota Rp75.000<br/>Selisih Rp5.000"]
    ERRALLOC --> META

    CHECK -->|Ya| UPLOAD[Upload 3 file + metadata]

    UPLOAD --> VALIDATE["🛡️ VALIDASI SERVER<br/>• MIME sniffing (magic bytes)<br/>• Decode ulang master<br/>• Cek dimensi valid<br/>• Cek ukuran > 0<br/>• Batas ukuran 15 MB"]

    VALIDATE --> VOK{Semua valid?}
    VOK -->|Tidak| CLEANUP[🗑️ Hapus file parsial<br/>❌ TIDAK buat record DB]
    CLEANUP --> ERRUP[Tampilkan error ke user]
    ERRUP --> CAM

    VOK -->|Ya| SAVE[Simpan record + path]
    SAVE --> STATUS[Status: MENUNGGU_VERIFIKASI]
    STATUS --> NOTIFBEN[Muncul di antrian Bendahara]
    NOTIFBEN --> END([Selesai])

    style DROPDOWN fill:#111C44,color:#fff
    style PREVIEW fill:#111C44,color:#fff
    style CLEANUP fill:#7f1d1d,color:#fff
    style END fill:#0066A9,color:#fff
```

### 7.2 Alur Verifikasi Nota

```mermaid
sequenceDiagram
    autonumber
    actor B as Bendahara Umum
    participant W as Web App
    participant API as API
    participant DB as Database

    B->>W: Buka Keuangan → Verifikasi Nota
    W->>API: GET /api/nota?status=menunggu
    API-->>W: Daftar nota + thumbnail
    W-->>B: Grid nota (memakai THUMBNAIL — cepat)

    B->>W: Klik satu nota
    W->>API: GET /api/nota/{id}
    API-->>W: Detail + signed URL PREVIEW
    W-->>B: Tampilan berdampingan:<br/>gambar (preview) ⟷ data input

    opt Perlu lihat detail
        B->>W: Klik gambar
        W-->>B: Lightbox — masih PREVIEW
        B->>W: Klik "Unduh"
        W->>API: GET /api/nota/{id}/download
        Note over API: WAJIB ambil master_path
        API-->>B: MASTER JPEG, Content-Disposition: attachment
    end

    alt Setujui
        B->>W: Klik "Setujui"
        W->>API: POST /api/nota/{id}/verify
        API->>DB: Status → TERVERIFIKASI
        API->>DB: Sisipkan baris ke PENGELUARAN
        API->>DB: Perbarui RAB AKTUAL per item
        API->>DB: Hitung ulang saldo berjalan
        API->>DB: Catat audit log
        API-->>W: ✅ Terverifikasi
        W-->>B: Nota berikutnya

    else Tolak
        B->>W: Klik "Tolak" + alasan (wajib)
        API->>DB: Status → DITOLAK + alasan
        API-->>W: Dikembalikan ke pengunggah
        Note over W: Panitia dapat unggah ulang

    else Minta Perbaikan
        B->>W: "Minta Perbaikan" + catatan
        API->>DB: Status → PERLU_PERBAIKAN
        Note over W: Panitia dapat edit metadata<br/>tanpa foto ulang
    end
```

### 7.3 Aturan Unduhan Gambar (Kritis)

```mermaid
flowchart TD
    subgraph BENAR["✅ BENAR"]
        direction TB
        A1[Original Upload] --> B1[MASTER JPEG Q90]
        A1 --> B2[PREVIEW WebP Q78]
        A1 --> B3[THUMB WebP Q70]
        B1 --> C1[UNDUHAN]
        B2 --> C2[Tampilan detail web]
        B3 --> C3[Grid & tabel web]
        C1 --> D1[📄 Word / Cetak / LPJ]
    end

    subgraph SALAH["❌ SALAH — DILARANG"]
        direction TB
        X1[Original] --> X2[MASTER]
        X2 --> X3[PREVIEW]
        X3 --> X4[THUMB]
        X4 -.->|rekompresi berantai| X5[UNDUHAN blur]
        X3 -.->|convert| X6[UNDUHAN blur]
    end

    style BENAR fill:#065f46,color:#fff
    style SALAH fill:#7f1d1d,color:#fff
    style D1 fill:#0066A9,color:#fff
```

### 7.4 Alur Generate LPJ

```mermaid
flowchart TD
    START([Bendahara: Generate LPJ]) --> PICK[Pilih Acara]

    PICK --> CHECK{Prasyarat terpenuhi?}
    CHECK -->|Tidak| WARN["⚠️ Belum siap:<br/>• RAB belum dikunci<br/>• 12 item belum ada nota<br/>• 3 nota menunggu verifikasi"]
    WARN --> FIX[Tindaklanjuti dulu]
    FIX --> PICK

    CHECK -->|Ya| GATHER[Kumpulkan Data]

    GATHER --> AUTO["OTOMATIS<br/>─────────<br/>• Identitas kegiatan ← Proker<br/>• Pendahuluan & tujuan ← TOR<br/>• Susunan panitia ← Kepanitiaan<br/>• Pemasukan ← Sheet PEMASUKAN<br/>• Pengeluaran ← Nota terverifikasi<br/>• RAB rencana ← Sheet RAB<br/>• RAB aktual ← Sheet RAB AKTUAL<br/>• Lampiran nota ← Master images"]

    GATHER --> MANUAL["INPUT MANUAL<br/>─────────────<br/>• Realisasi kegiatan<br/>• Evaluasi & saran<br/>• Dokumentasi foto kegiatan<br/>• Kendala yang dihadapi"]

    AUTO --> ANALYZE
    MANUAL --> ANALYZE

    ANALYZE["📊 ANALISIS OTOMATIS"]

    ANALYZE --> R1["Selisih per item<br/>Rencana Rp50.000 → Aktual Rp48.000<br/>Hemat Rp2.000 (-4%)"]
    ANALYZE --> R2["Item OVER BUDGET 🔴<br/>Angkot: Rp4.800.000 → Rp5.600.000<br/>Lebih Rp800.000 (+17%)"]
    ANALYZE --> R3["Item BELUM DIREALISASI ⚠️<br/>• Cetak Sertifikat<br/>• Print MoU"]
    ANALYZE --> R4["Pengeluaran DI LUAR RAB ⚠️<br/>• Parkir Rp30.000<br/>• Reimburse Bensin Rp25.000"]
    ANALYZE --> R5["Dana Tak Terduga<br/>Dialokasi Rp749.300<br/>Terpakai Rp561.300"]
    ANALYZE --> R6["SISA DANA<br/>Rp26.000.000 − Rp24.942.110<br/>= Rp1.057.890"]

    R1 & R2 & R3 & R4 & R5 & R6 --> REVIEW[Tinjau di Web]

    REVIEW --> EDIT{Perlu penyesuaian?}
    EDIT -->|Ya| MANUAL
    EDIT -->|Tidak| GENERATE[Generate Dokumen]

    GENERATE --> DOC["Susun berdasarkan<br/>Template LPJ HMIF.docx<br/>+ Lembar Pengesahan<br/>+ Lampiran seluruh nota<br/>(gambar MASTER)"]

    DOC --> APPROVAL{Perlu approval?}
    APPROVAL -->|Ya| SIGN[Bendum + Ketua<br/>menandatangani]
    SIGN --> FINAL

    APPROVAL -->|Tidak| FINAL[LPJ Final]
    FINAL --> OUT([Unduh DOCX / PDF])

    style R2 fill:#7f1d1d,color:#fff
    style R3 fill:#92400e,color:#fff
    style R4 fill:#92400e,color:#fff
    style OUT fill:#0066A9,color:#fff
```

---

## 8. Alur Progres & Kendala

### 8.1 Kanban Departemen

```mermaid
flowchart LR
    subgraph BOARD["Kanban — Departemen Kominfo"]
        direction LR
        TODO["📋 TO DO (5)<br/>─────────────<br/>┌─────────────┐<br/>│ Desain Poster│<br/>│ 👤 Rina      │<br/>│ 📅 5 Sep     │<br/>│ 🔴 Tinggi    │<br/>│ ☑ 2/5        │<br/>└─────────────┘"]

        PROG["⚡ IN PROGRESS (3)<br/>─────────────<br/>┌─────────────┐<br/>│ Konten IG    │<br/>│ 👤 Budi      │<br/>│ 📅 3 Sep ⚠️  │<br/>│ 🟡 Sedang    │<br/>│ ☑ 4/6        │<br/>└─────────────┘"]

        REV["👁️ REVIEW (2)<br/>─────────────<br/>┌─────────────┐<br/>│ Draft Artikel│<br/>│ 👤 Citra     │<br/>│ 📅 8 Sep     │<br/>│ ☑ 6/6        │<br/>└─────────────┘"]

        DONE["✅ DONE (12)<br/>─────────────<br/>┌─────────────┐<br/>│ Setup Website│<br/>│ 👤 Dedi      │<br/>│ ✓ Selesai    │<br/>└─────────────┘"]
    end

    TODO -.drag.-> PROG
    PROG -.drag.-> REV
    REV -.drag.-> DONE

    DONE --> CALC["Progres Proker<br/>12 / 22 = 55%"]

    style DONE fill:#065f46,color:#fff
```

### 8.2 Alur Pelaporan Kendala

```mermaid
flowchart TD
    START([Anggota menemui kendala]) --> NEW[Klik 'Lapor Kendala']

    NEW --> FORM["Form Kendala<br/>────────────<br/>Judul: ______________<br/>Deskripsi: __________<br/>Prioritas: ( )Rendah<br/>           ( )Sedang<br/>           (•)Tinggi<br/>           ( )Kritis<br/>Assignee: [Dropdown ▾]<br/>Proker terkait: [▾]<br/>Lampiran: [+ File]"]

    FORM --> SUBMIT[Kirim]
    SUBMIT --> STATUS1[Status: TERBUKA]

    STATUS1 --> PRIO{Prioritas?}
    PRIO -->|Kritis| ESCALATE[🚨 Muncul di dashboard<br/>Ketua, Wakil, dan BPH]
    PRIO -->|Lainnya| DEPTONLY[Muncul di dashboard<br/>Kadept & assignee]

    ESCALATE --> THREAD
    DEPTONLY --> THREAD

    THREAD["💬 THREADED DISCUSSION<br/>─────────────────────<br/>Andi: Kendala di sini...<br/>  └ Rina: Sudah dicoba X?<br/>      └ Andi: Sudah, hasilnya...<br/>  └ @Kadept: Saya bantu koordinasi<br/><br/>[Tulis balasan...]"]

    THREAD --> WORK[Assignee menangani]
    WORK --> STATUS2[Status: SEDANG_DITANGANI]

    STATUS2 --> RESOLVE{Terselesaikan?}
    RESOLVE -->|Belum| THREAD
    RESOLVE -->|Ya| CLOSE[Tandai SELESAI<br/>+ catatan penyelesaian]

    CLOSE --> ARCHIVE[Masuk arsip kendala<br/>dapat dicari untuk<br/>referensi periode berikutnya]
    ARCHIVE --> END([Selesai])

    style ESCALATE fill:#7f1d1d,color:#fff
    style END fill:#065f46,color:#fff
```

---

## 9. Alur Sekretaris

### 9.1 Import Data Pengurus

```mermaid
flowchart TD
    START([Sekum: Data Pengurus]) --> METHOD{Metode input?}

    METHOD -->|Satuan| MANUAL[Form manual:<br/>Nama, NIM, Jabatan,<br/>Departemen, Angkatan]
    METHOD -->|Massal| IMPORT[Import CSV/XLSX]

    IMPORT --> UPLOAD[Unggah file hasil<br/>form pendataan]
    UPLOAD --> PARSE[Baca file]

    PARSE --> MAP["Pemetaan Kolom<br/>─────────────<br/>Kolom file    →  Field sistem<br/>'Nama'        →  nama_lengkap<br/>'NIM'         →  nim<br/>'Jabatan'     →  jabatan<br/>'Departemen'  →  departemen<br/>[Sesuaikan pemetaan ▾]"]

    MAP --> VALIDATE[Validasi setiap baris]

    VALIDATE --> PREVIEW["📋 PRATINJAU<br/>─────────────────────────────<br/>✅ 87 baris valid<br/>⚠️ 8 baris peringatan (NIM duplikat)<br/>❌ 5 baris error (NIM kosong)<br/><br/>[Lihat detail] [Lewati bermasalah]<br/>[Batal] [Import 87 baris]"]

    PREVIEW -->|Batal| END1([Batal])
    PREVIEW -->|Import| SAVE[Simpan ke database]

    SAVE --> AUDIT[Catat audit log]
    AUDIT --> RESULT["✅ 87 pengurus tersimpan<br/>⚠️ 13 dilewati<br/>[Unduh laporan]"]

    MANUAL --> SAVE

    RESULT --> USE([Siap dipakai untuk<br/>Surat Aktif Organisasi])

    style USE fill:#0066A9,color:#fff
```

### 9.2 Alur Notulensi

```mermaid
flowchart TD
    START([Sekum: Buat Notulensi]) --> META["Metadata Rapat<br/>─────────────<br/>Judul: Rapat Koordinasi Bulanan<br/>Tanggal: 1 Sep 2026<br/>Waktu: 16.00 – 18.00<br/>Tempat: Sekretariat HMIF<br/>Pemimpin: Ketua Himpunan<br/>Notulis: Sekum"]

    META --> ATT["👥 Daftar Hadir<br/>Checklist dari data pengurus:<br/>☑ Andi (Ketua) — Hadir<br/>☑ Budi (Wakil) — Hadir<br/>☐ Citra (Sekum) — Izin<br/>☑ Dedi (Bendum) — Hadir<br/>...<br/>Ringkasan: 18 Hadir · 2 Izin · 1 Sakit · 0 Alfa"]

    ATT --> EDITOR["📝 Editor Rich Text<br/>─────────────────<br/>Toolbar: B I U · H1 H2 · ≡ • 1. ·<br/>         ▦ Tabel · ☑ Checklist ·<br/>         ❝ Kutipan · 🔗 Tautan<br/><br/>[Area penulisan notulensi]"]

    EDITOR --> KEP["✅ Poin Keputusan<br/>1. Proker X disetujui dengan revisi anggaran<br/>2. Deadline LPJ diperpanjang 1 minggu<br/>3. ..."]

    KEP --> ACT["📌 Action Item<br/>┌────────────────┬─────────┬─────────┐<br/>│ Tugas          │ PIC     │Deadline │<br/>├────────────────┼─────────┼─────────┤<br/>│ Revisi RAB     │ Dedi    │ 5 Sep   │<br/>│ Susun TOR      │ Rina    │ 8 Sep   │<br/>└────────────────┴─────────┴─────────┘<br/><br/>[→ Konversi jadi kartu Kanban]"]

    ACT --> CONV{Konversi ke Kanban?}
    CONV -->|Ya| KANBAN[Buat kartu di<br/>Kanban departemen terkait]
    CONV -->|Tidak| ATTACH

    KANBAN --> ATTACH[📎 Lampiran file]

    ATTACH --> SAVE[Simpan]
    SAVE --> OUT{Generate dokumen?}
    OUT -->|Ya| DOCX[Generate DOCX<br/>mengikuti Template Notulensi]
    OUT -->|Tidak| ARCH

    DOCX --> ARCH[Masuk Arsip Notulensi<br/>dengan pencarian teks penuh]
    ARCH --> END([Selesai])

    style END fill:#0066A9,color:#fff
```

### 9.3 Alur Peminjaman Ruangan

```mermaid
flowchart TD
    START([Sekum: Peminjaman Ruangan]) --> SETUP{Ruangan sudah<br/>terdaftar?}

    SETUP -->|Belum| ADDROOM["Tambah Ruangan<br/>─────────────<br/>Nama: Auditorium FT<br/>Lokasi: Gedung FT Lt.1<br/>Kapasitas: 200<br/>Pengelola: Kabag Sekretariat FT<br/>Catatan: Perlu izin H-7"]
    ADDROOM --> ROOMLIST

    SETUP -->|Sudah| ROOMLIST[Daftar Ruangan]

    ROOMLIST --> BOOK[Buat Peminjaman]

    BOOK --> FORM["Form Peminjaman<br/>─────────────<br/>Ruangan: [Auditorium FT ▾]<br/>Kegiatan: MUSMAIF<br/>Hari, Tanggal: Kamis, 9 Okt 2026<br/>Pukul: 16.00 – selesai<br/>Jumlah Peserta: 150<br/>Keperluan: Musyawarah Mahasiswa"]

    FORM --> CALCHECK[Cek kalender booking]
    CALCHECK --> CLASH{Ada jadwal lain<br/>di tanggal & ruangan sama?}

    CLASH -->|Ya| WARNCLASH["⚠️ PERINGATAN (bukan blokir)<br/>Ruangan ini sudah tercatat dipinjam:<br/>'Seminar Nasional' 9 Okt 14.00–16.00<br/><br/>Keputusan akhir tetap di Dekanat.<br/>Lanjutkan?"]
    WARNCLASH -->|Batal| FORM
    WARNCLASH -->|Lanjut| SAVE

    CLASH -->|Tidak| SAVE[Simpan booking]

    SAVE --> SURAT{Buat surat sekarang?}
    SURAT -->|Ya| GENSURAT["Buka form Surat Peminjaman Ruangan (05)<br/>dengan field terisi otomatis dari booking"]
    GENSURAT --> LETTERFLOW([→ Alur Persuratan])

    SURAT -->|Nanti| CAL[Tampil di kalender booking]
    CAL --> END([Selesai])

    style WARNCLASH fill:#92400e,color:#fff
```

---

## 10. Alur Backup & Restore

### 10.1 Backup Otomatis Bulanan

```mermaid
sequenceDiagram
    autonumber
    participant CRON as Vercel Cron
    participant API as API Backup
    participant DB as PostgreSQL
    participant ST as Storage
    participant GD as Google Drive<br/>(setelah tersedia)

    Note over CRON: Tanggal 1, pukul 02:00 WIB
    CRON->>API: POST /api/cron/backup

    API->>API: Buat ID backup + folder

    rect rgb(20, 40, 70)
        Note over API,DB: LAPIS 1 — Database Dump
        API->>DB: pg_dump seluruh skema
        DB-->>API: dump SQL
        API->>API: Kompres → full-dump.sql.gz
    end

    rect rgb(20, 50, 60)
        Note over API,DB: LAPIS 2 — Export Modul JSON
        loop Setiap modul
            API->>DB: SELECT seluruh data modul
            DB-->>API: Rows
            API->>API: Serialisasi → {modul}.json
        end
        API->>API: Bangun rab-{acara}.xlsx
        API->>API: Bangun daftar-surat.xlsx
    end

    rect rgb(40, 40, 70)
        Note over API,ST: LAPIS 3 — Arsip File
        API->>ST: Daftar seluruh objek
        ST-->>API: Daftar file
        API->>API: Bundel → storage-archive.zip
    end

    API->>API: Hitung checksum tiap file
    API->>API: Susun manifest.json<br/>(versi skema, jumlah record, checksum)

    API->>ST: Simpan bundel ke bucket backup
    opt Service Account tersedia
        API->>GD: Unggah ke Backup/2026-09/
    end

    API->>DB: Catat record backup + status
    API->>DB: Catat audit log
    API->>API: Hapus backup > 12 bulan (kecuali manual)

    Note over API: ✅ Backup selesai
```

### 10.2 Alur Restore

```mermaid
flowchart TD
    START([Admin: Backup & Restore]) --> LIST["Daftar Backup<br/>─────────────────────────────<br/>📦 2026-09-01 · Otomatis · 1,2 GB ✅<br/>📦 2026-08-15 · Manual   · 1,1 GB ✅<br/>📦 2026-08-01 · Otomatis · 1,0 GB ✅<br/>..."]

    LIST --> SELECT[Pilih backup]
    SELECT --> VERIFY[Verifikasi checksum]

    VERIFY --> VOK{Integritas OK?}
    VOK -->|Tidak| CORRUPT[❌ Backup korup<br/>Pilih backup lain]
    CORRUPT --> LIST

    VOK -->|Ya| MODE{Mode restore?}

    MODE -->|Penuh| FULL["⚠️ RESTORE PENUH<br/>Seluruh data akan diganti<br/>dengan kondisi 1 Sep 2026.<br/><br/>Ketik 'RESTORE PENUH' untuk konfirmasi:<br/>[________________]"]

    MODE -->|Per Modul| PARTIAL["Pilih modul yang direstore:<br/>☑ Program Kerja<br/>☐ Persuratan<br/>☑ RAB & Nota<br/>☐ Pengguna<br/><br/>Mode: (•)Tambah ( )Timpa ( )Gabung"]

    FULL --> SAFETY
    PARTIAL --> SAFETY

    SAFETY["🛡️ SAFETY NET<br/>Sistem membuat backup<br/>kondisi SAAT INI terlebih dahulu"]

    SAFETY --> EXEC[Jalankan restore]
    EXEC --> PROGRESS["Progres restore:<br/>▓▓▓▓▓▓▓░░░ 70%<br/>Memulihkan: nota.json (450/640)"]

    PROGRESS --> RESULT{Berhasil?}
    RESULT -->|Ya| OK["✅ Restore berhasil<br/>• 640 nota<br/>• 312 surat<br/>• 48 proker<br/>• 1.240 file"]
    RESULT -->|Tidak| ROLLBACK["❌ Restore gagal pada langkah X<br/>Sistem dikembalikan ke<br/>kondisi sebelum restore"]

    OK --> AUDIT[Catat audit log]
    ROLLBACK --> AUDIT
    AUDIT --> END([Selesai])

    style FULL fill:#7f1d1d,color:#fff
    style SAFETY fill:#065f46,color:#fff
    style ROLLBACK fill:#7f1d1d,color:#fff
```

---

## 11. Matriks State Transition

### 11.1 Status Proker

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Kadept membuat
    DRAFT --> DRAFT: Simpan progres wizard
    DRAFT --> MENUNGGU_APPROVAL: Ajukan
    DRAFT --> [*]: Hapus draft

    MENUNGGU_APPROVAL --> DISETUJUI: Ketua/Wakil setujui<br/>🔒 kunci kalender
    MENUNGGU_APPROVAL --> DITOLAK: Ketua/Wakil tolak
    MENUNGGU_APPROVAL --> PERLU_REVISI: Minta revisi

    DITOLAK --> DRAFT: Kadept revisi
    PERLU_REVISI --> MENUNGGU_APPROVAL: Ajukan ulang

    DISETUJUI --> BERJALAN: Tanggal mulai persiapan tiba
    DISETUJUI --> MENUNGGU_APPROVAL_REVISI: Kadept ubah tanggal<br/>🔒 kunci lama dipertahankan
    DISETUJUI --> DIBATALKAN: Ketua/Wakil batalkan<br/>🔓 lepas kunci

    MENUNGGU_APPROVAL_REVISI --> DISETUJUI: Disetujui<br/>🔓🔒 pindah kunci
    MENUNGGU_APPROVAL_REVISI --> DISETUJUI: Ditolak<br/>kembali tanggal lama

    BERJALAN --> SELESAI: Hari-H terakhir lewat<br/>🔓 lepas kunci
    BERJALAN --> DIBATALKAN: Dibatalkan

    SELESAI --> [*]
    DIBATALKAN --> [*]
```

### 11.2 Status Surat

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Buat surat
    DRAFT --> DRAFT: Auto-save
    DRAFT --> MENUNGGU_APPROVAL: Ajukan
    DRAFT --> [*]: Hapus<br/>(nomor belum dialokasikan)

    MENUNGGU_APPROVAL --> DISETUJUI: Ketua/Wakil/Sekum setujui<br/>🔢 ALOKASI NOMOR (atomik)
    MENUNGGU_APPROVAL --> DITOLAK: Tolak + alasan

    DITOLAK --> DRAFT: Perbaiki

    DISETUJUI --> TERBIT: Dokumen ter-generate<br/>📄 DOCX/PDF tersimpan
    TERBIT --> DIBATALKAN: Batalkan<br/>⚠️ nomor TIDAK didaur ulang

    TERBIT --> [*]
    DIBATALKAN --> [*]
```

### 11.3 Status RAB

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Koordinator mulai isi
    DRAFT --> DRAFT: Edit item
    DRAFT --> DIAJUKAN: Ajukan ke Ketuplak

    DIAJUKAN --> DRAFT: Dikembalikan dengan catatan
    DIAJUKAN --> DISETUJUI: Ketuplak + Bendum setujui<br/>🔒 RAB dikunci

    DISETUJUI --> DRAFT: Buka kunci<br/>⚠️ wajib alasan, tercatat audit
    DISETUJUI --> REALISASI: Nota pertama terverifikasi

    REALISASI --> REALISASI: Nota masuk<br/>RAB AKTUAL diperbarui
    REALISASI --> SELESAI: LPJ di-generate

    SELESAI --> [*]
```

### 11.4 Status Nota

```mermaid
stateDiagram-v2
    [*] --> DIUNGGAH: Panitia upload
    DIUNGGAH --> MENUNGGU_VERIFIKASI: Validasi server lolos
    DIUNGGAH --> [*]: Validasi gagal<br/>🗑️ file parsial dihapus

    MENUNGGU_VERIFIKASI --> TERVERIFIKASI: Bendahara setujui<br/>→ PENGELUARAN & RAB AKTUAL
    MENUNGGU_VERIFIKASI --> DITOLAK: Bendahara tolak + alasan
    MENUNGGU_VERIFIKASI --> PERLU_PERBAIKAN: Minta perbaikan metadata

    DITOLAK --> DIUNGGAH: Unggah ulang
    PERLU_PERBAIKAN --> MENUNGGU_VERIFIKASI: Perbaiki metadata

    TERVERIFIKASI --> MENUNGGU_VERIFIKASI: Bendahara batalkan verifikasi<br/>⚠️ hitung ulang saldo

    TERVERIFIKASI --> [*]
```

---

## 12. Peta Layar & Rute

| Rute | Layar | Role yang Dapat Mengakses |
|---|---|---|
| `/login` | Halaman Login | Publik |
| `/undangan/[token]` | Aktivasi Akun | Publik (dengan token valid) |
| `/` | **Beranda + Master Gantt** | Semua |
| `/proker` | Daftar Program Kerja | Semua |
| `/proker/baru` | Wizard Tambah Proker | Kadept, Ketua, Wakil, Admin |
| `/proker/[id]` | Detail Proker | Semua (edit sesuai izin) |
| `/proker/kalender` | Kalender Ketersediaan | Semua |
| `/proker/approval` | Antrian Approval Proker | Ketua, Wakil |
| `/acara` | Daftar Acara Besar | Semua |
| `/acara/[id]` | Ruang Kerja Acara | Semua (edit sesuai izin) |
| `/acara/[id]/divisi/[divId]` | Ruang Kerja Divisi | Semua (edit hanya divisi sendiri) |
| `/acara/[id]/rab` | RAB Acara | Semua (edit: Koor, Ketuplak, Bendum) |
| `/acara/[id]/tor` | Editor TOR | Ketuplak, Sekretaris Acara |
| `/acara/[id]/proposal` | Editor Proposal | Ketuplak, Sekretaris Acara |
| `/acara/[id]/lpj` | Generator LPJ | Bendum, Ketuplak |
| `/surat` | Arsip Surat | Semua kecuali Anggota |
| `/surat/baru` | Buat Surat | Sekum, Ketua, Wakil, Bendum, Kadept |
| `/surat/[id]` | Detail Surat | Sesuai izin |
| `/surat/approval` | Antrian Approval Surat | Ketua, Wakil, Sekum |
| `/keuangan` | Dashboard Keuangan | Bendum, Ketua, Wakil, BPH |
| `/keuangan/nota/upload` | Upload Nota | Panitia divisi |
| `/keuangan/nota/verifikasi` | Verifikasi Nota | Bendum |
| `/departemen/[kode]` | Ruang Departemen | Anggota dept terkait + pimpinan |
| `/departemen/[kode]/kanban` | Kanban | Anggota dept terkait |
| `/departemen/[kode]/kendala` | Kendala | Anggota dept terkait |
| `/sekretariat/notulensi` | Arsip Notulensi | Semua (edit: Sekum) |
| `/sekretariat/notulensi/baru` | Buat Notulensi | Sekum, Kadept |
| `/sekretariat/pengurus` | Data Pengurus | Sekum, Admin |
| `/sekretariat/ruangan` | Peminjaman Ruangan | Sekum, Kadept |
| `/admin/pengguna` | Kelola Pengguna | Admin |
| `/admin/periode` | Periode Kepengurusan | Admin |
| `/admin/konfigurasi` | Konfigurasi Sistem | Admin |
| `/admin/backup` | Backup & Restore | Admin |
| `/admin/audit` | Audit Log | Admin, Ketua, Wakil, BPH |
| `/profil` | Profil & TTD | Semua (diri sendiri) |

---

## Lampiran — Prinsip Interaksi

### Umpan Balik Sistem

| Situasi | Respons Sistem | Durasi |
|---|---|---|
| Aksi berhasil | Toast hijau di kanan atas | 3 detik |
| Aksi gagal | Toast merah + penjelasan + saran tindakan | 6 detik |
| Sedang memuat data | Skeleton loader sesuai bentuk konten | — |
| Sedang memproses | Tombol berubah jadi "Memproses..." + nonaktif | — |
| Perubahan tersimpan otomatis | Teks halus "Tersimpan ✓" di dekat form | 2 detik |
| Konflik terdeteksi | Panel merah inline (bukan modal) dengan detail konflik | Menetap |
| Koneksi live terputus | Banner kuning tipis di atas Gantt | Menetap sampai pulih |

### Pola Konfirmasi

| Tingkat Risiko | Pola | Contoh |
|---|---|---|
| **Rendah** | Langsung eksekusi + undo | Pindah kartu Kanban |
| **Sedang** | Dialog konfirmasi sederhana | Hapus item RAB |
| **Tinggi** | Dialog + wajib isi alasan | Tolak proker, buka kunci RAB |
| **Kritis** | Dialog + ketik teks konfirmasi | Restore penuh, hapus periode |

### Pintasan Keyboard

| Pintasan | Aksi |
|---|---|
| `Ctrl/⌘ + K` | Command palette (pencarian global) |
| `G` lalu `H` | Ke Beranda |
| `G` lalu `P` | Ke Program Kerja |
| `G` lalu `S` | Ke Persuratan |
| `N` | Buat baru (kontekstual) |
| `Esc` | Tutup panel/modal |
| `?` | Tampilkan daftar pintasan |

---

*Seluruh alur dalam dokumen ini mengacu pada spesifikasi fungsional di [PRD.md](PRD.md) dan diimplementasikan sesuai arsitektur di [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md).*
