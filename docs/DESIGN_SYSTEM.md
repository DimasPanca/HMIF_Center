# Design System — HMIF Center

**Bahasa Visual & Spesifikasi Komponen**

| | |
|---|---|
| **Versi** | 1.0 |
| **Tanggal** | 1 September 2026 |
| **Acuan Visual** | [Linear](https://linear.app) — kepadatan, kejelasan, kecepatan |
| **Identitas Warna** | Brand Guideline HMIF FT UNTIRTA |
| **Dokumen Terkait** | [PRD.md](PRD.md) · [USER_FLOW.md](USER_FLOW.md) · [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) |

---

## Daftar Isi

1. [Filosofi Desain](#1-filosofi-desain)
2. [Token Warna](#2-token-warna)
3. [Tipografi](#3-tipografi)
4. [Spacing & Layout](#4-spacing--layout)
5. [Elevasi, Border & Radius](#5-elevasi-border--radius)
6. [Kebijakan Animasi](#6-kebijakan-animasi)
7. [Ikonografi](#7-ikonografi)
8. [Komponen Dasar](#8-komponen-dasar)
9. [Komponen Kompleks](#9-komponen-kompleks)
10. [Spesifikasi Gantt Chart](#10-spesifikasi-gantt-chart)
11. [Pola Layout Halaman](#11-pola-layout-halaman)
12. [Status & Umpan Balik](#12-status--umpan-balik)
13. [Responsif](#13-responsif)
14. [Aksesibilitas](#14-aksesibilitas)
15. [Implementasi Teknis](#15-implementasi-teknis)

---

## 1. Filosofi Desain

### 1.1 Yang Kita Ambil dari Linear

| Aspek | Penerapan di HMIF Center |
|---|---|
| **Kepadatan informasi** | Baris tabel 36–40 px, bukan 56 px. Lebih banyak data terlihat tanpa scroll |
| **Hierarki tanpa garis** | Pembeda antar section memakai kontras latar dan bobot huruf, bukan border tebal |
| **Kecepatan sebagai fitur** | Setiap interaksi terasa instan. Optimistic update pada aksi ringan |
| **Keyboard-first** | ⌘K command palette, navigasi `G`+huruf, semua aksi dapat dijangkau tanpa mouse |
| **Konsistensi mutlak** | Satu jenis tombol = satu perilaku di seluruh aplikasi |
| **Detail yang halus** | Border 1px, radius kecil, shadow tipis — bukan efek berlebihan |

### 1.2 Yang Kita Tolak

| Ditolak | Alasan |
|---|---|
| Animasi masuk halaman | Menunda konten, terasa lambat |
| Parallax & scroll effect | Boros GPU, mengganggu pembacaan data |
| Gradient background besar | Menurunkan keterbacaan teks; gradient hanya untuk aksen kecil |
| Ilustrasi dekoratif | Sistem administratif, bukan landing page |
| Loading spinner berputar terus | Skeleton loader lebih informatif |
| Transisi > 250 ms | Terasa lamban |
| Shadow tebal / neumorphism | Bertentangan dengan estetika bersih |

### 1.3 Tiga Prinsip Utama

> **1. Objektif.** Antarmuka menyajikan data apa adanya. Tidak ada dekorasi yang tidak menyampaikan informasi.
>
> **2. Cepat.** Setiap elemen visual harus membayar ongkosnya dalam performa. Bila membuat halaman lebih lambat tanpa menambah kejelasan, buang.
>
> **3. Padat.** Pengurus HMIF butuh melihat banyak hal sekaligus — Master Gantt seluruh himpunan dalam satu layar. Ruang kosong adalah kemewahan yang harus dibenarkan.

---

## 2. Token Warna

### 2.1 Warna Brand (Sumber: Brand Guideline HMIF)

#### Primary

| Token | Hex | Nama | Peran |
|---|---|---|---|
| `--brand-navy` | `#111C44` | Deep Navy | Teks penting, header, latar gelap. Kekuatan, stabilitas, profesional |
| `--brand-blue` | `#0066A9` | HMIF Blue | Identitas utama, tombol primer, elemen brand. Teknologi, kepercayaan |
| `--brand-tech` | `#1E90FF` | Tech Blue | Aksen, ikon, tautan, elemen interaktif. Modern, komunikatif |
| `--brand-white` | `#FFFFFF` | White | Latar terang. Kejelasan, bersih |
| `--brand-gray` | `#E6EAF2` | Light Gray | Netral, seimbang, pendukung |

#### Secondary

| Token | Hex | Nama | Peran |
|---|---|---|---|
| `--brand-teal` | `#00B4D8` | Teal | Aksen sekunder, elemen informasi. Kreativitas, kolaborasi |
| `--brand-slate` | `#3D5A80` | Slate Blue | Teks sekunder, elemen tenang. Intelektual, terpercaya |
| `--brand-steel` | `#6C757D` | Steel Gray | Teks tersier, ikon netral. Profesional, fleksibel |
| `--brand-soft` | `#DCE6F1` | Soft Blue | Latar section, card, panel. Lembut, nyaman di mata |
| `--brand-dark` | `#0A0F1F` | Dark Blue | Latar utama dark mode. Elegan, fokus |

### 2.2 Token Semantik — Light Mode

```css
:root {
  /* Latar */
  --bg-base:        #FFFFFF;   /* Latar halaman */
  --bg-subtle:      #F7F9FC;   /* Latar sidebar, area sekunder */
  --bg-muted:       #E6EAF2;   /* Latar disabled, divider area */
  --bg-panel:       #FFFFFF;   /* Card, panel, modal */
  --bg-elevated:    #FFFFFF;   /* Dropdown, popover, tooltip */
  --bg-inset:       #DCE6F1;   /* Input, area tenggelam */

  /* Teks */
  --text-primary:   #111C44;   /* Judul, teks utama */
  --text-secondary: #3D5A80;   /* Deskripsi, label */
  --text-tertiary:  #6C757D;   /* Metadata, placeholder, timestamp */
  --text-disabled:  #A0AEC0;
  --text-inverse:   #FFFFFF;   /* Teks di atas latar gelap */
  --text-link:      #0066A9;

  /* Border */
  --border-subtle:  #EDF1F7;   /* Divider halus */
  --border-default: #DCE6F1;   /* Border card, input */
  --border-strong:  #B8C7DC;   /* Border fokus non-aktif */
  --border-focus:   #1E90FF;   /* Ring fokus */

  /* Brand */
  --primary:        #0066A9;
  --primary-hover:  #005490;
  --primary-active: #004372;
  --primary-subtle: #E8F1F9;   /* Latar badge/chip primer */
  --primary-text:   #FFFFFF;

  --accent:         #1E90FF;
  --accent-subtle:  #E9F3FF;

  /* Status */
  --success:        #0E9F6E;
  --success-subtle: #E6F6F0;
  --warning:        #D97706;
  --warning-subtle: #FEF3E2;
  --danger:         #DC2626;
  --danger-subtle:  #FEE9E9;
  --info:           #00B4D8;
  --info-subtle:    #E3F7FB;
  --neutral:        #6C757D;
  --neutral-subtle: #F1F3F5;
}
```

### 2.3 Token Semantik — Dark Mode

> Dark mode bukan inversi otomatis. Setiap nilai dipilih agar kontras dan hierarki tetap setara.

```css
[data-theme="dark"] {
  /* Latar */
  --bg-base:        #0A0F1F;   /* Dark Blue — latar utama */
  --bg-subtle:      #111C44;   /* Deep Navy — sidebar */
  --bg-muted:       #1A2749;
  --bg-panel:       #131D3D;   /* Card sedikit lebih terang dari base */
  --bg-elevated:    #1A2749;   /* Dropdown, popover */
  --bg-inset:       #0D1428;   /* Input — lebih gelap dari panel */

  /* Teks */
  --text-primary:   #F0F4FA;
  --text-secondary: #A8BBD6;
  --text-tertiary:  #6C757D;
  --text-disabled:  #4A5568;
  --text-inverse:   #111C44;
  --text-link:      #1E90FF;

  /* Border */
  --border-subtle:  #1A2749;
  --border-default: #23315C;
  --border-strong:  #34477A;
  --border-focus:   #1E90FF;

  /* Brand */
  --primary:        #1E90FF;   /* Tech Blue lebih terbaca di latar gelap */
  --primary-hover:  #3D9FFF;
  --primary-active: #0F7AE0;
  --primary-subtle: #14243F;
  --primary-text:   #FFFFFF;

  --accent:         #00B4D8;
  --accent-subtle:  #0D2A33;

  /* Status */
  --success:        #34D399;
  --success-subtle: #0F2E24;
  --warning:        #FBBF24;
  --warning-subtle: #2E2410;
  --danger:         #F87171;
  --danger-subtle:  #2E1515;
  --info:           #00B4D8;
  --info-subtle:    #0D2A33;
  --neutral:        #94A3B8;
  --neutral-subtle: #1A2038;
}
```

### 2.4 Palet Departemen (Gantt & Identitas)

Setiap departemen memiliki warna tetap agar mudah dikenali di Master Gantt.

| Departemen | Hex | Nama Warna | Preview |
|---|---|---|---|
| **Kaderisasi** | `#1E90FF` | Tech Blue | 🔵 |
| **Minat & Bakat** | `#00B4D8` | Teal | 🩵 |
| **Internal** | `#F59E0B` | Amber | 🟠 |
| **Eksternal** | `#F87171` | Coral | 🔴 |
| **Kominfo** | `#A3E635` | Lime | 🟢 |
| **R&D** | `#A78BFA` | Violet | 🟣 |

```css
:root {
  --dept-kaderisasi: #1E90FF;
  --dept-mikat:      #00B4D8;
  --dept-internal:   #F59E0B;
  --dept-eksternal:  #F87171;
  --dept-kominfo:    #A3E635;
  --dept-rnd:        #A78BFA;

  /* Varian untuk isian progres (lebih pekat) */
  --dept-kaderisasi-fill: #0F7AE0;
  --dept-mikat-fill:      #0092B0;
  --dept-internal-fill:   #D97706;
  --dept-eksternal-fill:  #EF4444;
  --dept-kominfo-fill:    #84CC16;
  --dept-rnd-fill:        #8B5CF6;
}
```

**Aturan penggunaan warna departemen:**
- Bar Gantt, dot indikator, badge departemen, garis tepi kartu
- **Tidak** digunakan sebagai latar besar (mengganggu keterbacaan)
- Selalu disertai teks nama departemen — warna bukan satu-satunya pembeda

### 2.5 Gradien (Terbatas)

Gradien hanya untuk **aksen kecil**, tidak pernah untuk latar halaman.

| Token | Nilai | Penggunaan |
|---|---|---|
| `--gradient-primary` | `linear-gradient(135deg, #111C44, #0066A9)` | Header hero halaman login, banner periode |
| `--gradient-blue` | `linear-gradient(135deg, #0066A9, #1E90FF)` | Tombol CTA utama (opsional), highlight |
| `--gradient-teal` | `linear-gradient(135deg, #00B4D8, #1E90FF)` | Badge notifikasi, aksen informasi |

> Gradien **dilarang** pada: latar halaman, latar card, latar tabel, latar sidebar.

---

## 3. Tipografi

### 3.1 Font Family

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
               system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
}
```

**Inter** dipilih karena: dirancang untuk antarmuka layar, x-height tinggi (terbaca pada ukuran kecil), tabular numerals untuk kolom angka, dan tersedia via Google Fonts.

**JetBrains Mono** untuk: nomor surat, NIM, kode, dan nilai Rupiah dalam tabel (agar digit sejajar).

### 3.2 Skala Tipografi

| Token | Ukuran | Line Height | Weight | Letter Spacing | Penggunaan |
|---|---|---|---|---|---|
| `--text-display` | 32px | 40px | 600 | -0.02em | Judul halaman utama (jarang) |
| `--text-h1` | 24px | 32px | 600 | -0.015em | Judul halaman |
| `--text-h2` | 20px | 28px | 600 | -0.01em | Judul section |
| `--text-h3` | 16px | 24px | 600 | -0.005em | Judul card, sub-section |
| `--text-body` | 14px | 20px | 400 | 0 | **Teks utama — default** |
| `--text-body-md` | 14px | 20px | 500 | 0 | Teks dengan penekanan |
| `--text-sm` | 13px | 18px | 400 | 0 | Teks sekunder, deskripsi |
| `--text-xs` | 12px | 16px | 400 | 0.01em | Metadata, timestamp, label tabel |
| `--text-2xs` | 11px | 14px | 500 | 0.02em | Badge, tag, label Gantt |

> **Catatan:** ukuran dasar **14px**, bukan 16px. Ini sengaja — mengikuti kepadatan Linear. Untuk teks panjang (isi surat, notulensi) naik ke 15px agar nyaman dibaca.

### 3.3 Font untuk Angka

```css
/* Semua kolom angka dalam tabel */
.tabular {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}

/* Nilai Rupiah, nomor surat, NIM */
.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  letter-spacing: -0.01em;
}
```

### 3.4 Format Lokal Indonesia

| Jenis | Format | Contoh |
|---|---|---|
| Tanggal lengkap | `EEEE, dd MMMM yyyy` | `Senin, 06 Oktober 2025` |
| Tanggal singkat | `dd MMM yyyy` | `06 Okt 2025` |
| Tanggal tabel | `dd/MM/yy` | `06/10/25` |
| Rentang tanggal | — | `1 Nov – 7 Des 2026` |
| Waktu | `HH.mm` | `16.00` |
| Rentang waktu | — | `16.00 – 18.00 WIB` |
| Rupiah | `Rp` + titik ribuan | `Rp1.740.000` |
| Rupiah ringkas | — | `Rp1,7 jt` (hanya di kartu ringkasan) |
| Persentase | — | `75%` |
| Nomor surat | mono | `05/379/UN43.3.7/KT2HMIF/VIII/2025` |

---

## 4. Spacing & Layout

### 4.1 Skala Spacing (basis 4px)

| Token | Nilai | Penggunaan Umum |
|---|---|---|
| `--space-0` | 0 | — |
| `--space-1` | 4px | Jarak ikon–teks |
| `--space-2` | 8px | Padding badge, gap antar chip |
| `--space-3` | 12px | Padding sel tabel, gap form kecil |
| `--space-4` | 16px | **Padding card, gap default** |
| `--space-5` | 20px | Padding panel |
| `--space-6` | 24px | Gap antar section |
| `--space-8` | 32px | Padding halaman (desktop) |
| `--space-10` | 40px | Gap antar blok besar |
| `--space-12` | 48px | Margin section utama |
| `--space-16` | 64px | Ruang kosong maksimum |

### 4.2 Dimensi Layout

| Elemen | Nilai |
|---|---|
| Lebar sidebar (expanded) | 240px |
| Lebar sidebar (collapsed) | 56px |
| Tinggi header | 52px |
| Padding konten (desktop) | 24px |
| Padding konten (mobile) | 16px |
| Lebar maksimum konten teks | 720px |
| Lebar panel samping (detail) | 400px |
| Tinggi baris tabel | **36px** (padat) |
| Tinggi baris tabel (nyaman) | 44px |
| Tinggi input | 34px |
| Tinggi tombol (default) | 34px |
| Tinggi tombol (kecil) | 28px |

### 4.3 Grid

```css
/* Grid dashboard — panel kontekstual */
.dashboard-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

/* Grid form dua kolom */
.form-grid {
  display: grid;
  gap: var(--space-4) var(--space-6);
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

/* Split view — form + preview (halaman surat) */
.split-view {
  display: grid;
  grid-template-columns: minmax(360px, 42%) 1fr;
  gap: var(--space-6);
  height: calc(100vh - 52px);
}
```

---

## 5. Elevasi, Border & Radius

### 5.1 Radius

| Token | Nilai | Penggunaan |
|---|---|---|
| `--radius-xs` | 4px | Badge, tag kecil |
| `--radius-sm` | 6px | **Tombol, input, chip — default** |
| `--radius-md` | 8px | Card, panel |
| `--radius-lg` | 12px | Modal, dropdown besar |
| `--radius-full` | 9999px | Avatar, bar Gantt, toggle |

> Radius sengaja **kecil**. Radius besar terasa playful; sistem administratif butuh kesan presisi.

### 5.2 Shadow

Shadow dipakai **hemat** — hanya untuk elemen yang benar-benar melayang.

| Token | Nilai | Penggunaan |
|---|---|---|
| `--shadow-none` | `none` | Card di dalam halaman (pakai border saja) |
| `--shadow-sm` | `0 1px 2px rgba(17,28,68,0.06)` | Card yang perlu sedikit pemisahan |
| `--shadow-md` | `0 4px 12px rgba(17,28,68,0.08)` | Dropdown, popover, tooltip |
| `--shadow-lg` | `0 12px 32px rgba(17,28,68,0.12)` | Modal, dialog |
| `--shadow-focus` | `0 0 0 3px rgba(30,144,255,0.25)` | Ring fokus |

**Dark mode:** shadow diganti border lebih terang, karena shadow tidak terlihat di latar gelap.

```css
[data-theme="dark"] {
  --shadow-sm: 0 0 0 1px rgba(255,255,255,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
}
```

### 5.3 Border

Semua border **1px**. Tidak ada border 2px kecuali indikator status aktif.

```css
.card       { border: 1px solid var(--border-default); }
.divider    { border-top: 1px solid var(--border-subtle); }
.input      { border: 1px solid var(--border-default); }
.input:focus{ border-color: var(--border-focus); box-shadow: var(--shadow-focus); }
```

---

## 6. Kebijakan Animasi

> **Prinsip:** animasi hanya untuk menjelaskan perubahan state atau posisi. Tidak pernah untuk dekorasi.

### 6.1 Durasi & Easing

```css
:root {
  --duration-instant: 0ms;
  --duration-fast:    120ms;   /* hover, focus, warna */
  --duration-normal:  180ms;   /* expand, collapse, slide */
  --duration-slow:    250ms;   /* modal, panel besar — MAKSIMUM */

  --ease-out:  cubic-bezier(0.16, 1, 0.3, 1);      /* masuk — cepat lalu melambat */
  --ease-in:   cubic-bezier(0.7, 0, 0.84, 0);      /* keluar */
  --ease-both: cubic-bezier(0.65, 0, 0.35, 1);     /* transisi posisi */
}
```

### 6.2 Daftar Animasi yang Diizinkan

| Interaksi | Properti | Durasi | Easing |
|---|---|---|---|
| Hover tombol/baris | `background-color`, `border-color` | 120ms | `ease-out` |
| Focus ring | `box-shadow` | 0ms (instan) | — |
| Expand/collapse | `height`, `opacity` | 180ms | `ease-out` |
| Panel samping masuk | `transform: translateX` | 180ms | `ease-out` |
| Modal masuk | `opacity`, `transform: scale(0.98→1)` | 180ms | `ease-out` |
| Toast masuk/keluar | `opacity`, `transform: translateY` | 150ms | `ease-out` |
| Dropdown buka | `opacity`, `transform: translateY(-4px→0)` | 120ms | `ease-out` |
| Drag & drop | `transform` mengikuti kursor | real-time | — |
| Skeleton shimmer | `background-position` | 1.5s loop | `linear` |
| Perubahan angka counter | `opacity` fade | 150ms | `ease-out` |
| Bar Gantt bergeser (live update) | `x`, `width` | 180ms | `ease-both` |
| Highlight item baru | `background-color` flash | 400ms sekali | `ease-out` |

### 6.3 Yang Dilarang

```
❌ Animasi masuk halaman (fade-in konten saat load)
❌ Parallax scrolling
❌ Scroll-triggered reveal
❌ Efek ketik (typewriter)
❌ Counter berjalan naik (0 → 1.740.000)
❌ Bounce, elastic, spring
❌ Animasi latar belakang (gradien bergerak, partikel)
❌ Loading spinner berputar (pakai skeleton)
❌ Hover lift dengan transform besar
❌ Transisi lebih dari 250 ms
❌ Animasi berulang tanpa henti (kecuali skeleton shimmer)
```

### 6.4 Menghormati Preferensi Pengguna

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 7. Ikonografi

**Library:** [Lucide React](https://lucide.dev) — konsisten, ringan, tree-shakeable.

| Ukuran | Nilai | Penggunaan |
|---|---|---|
| `xs` | 14px | Inline dalam teks, badge |
| `sm` | 16px | **Default — tombol, menu, tabel** |
| `md` | 20px | Header section, tombol besar |
| `lg` | 24px | Empty state, ilustrasi kecil |

**Aturan:**
- Stroke width **1.5px** (bukan 2px default) — lebih halus, cocok dengan Inter
- Warna mengikuti `currentColor`
- Ikon **selalu** disertai teks atau `aria-label`
- Tidak ada ikon berwarna-warni; warna hanya untuk status

### 7.1 Ikon per Modul

| Modul | Ikon Lucide |
|---|---|
| Beranda | `LayoutDashboard` |
| Program Kerja | `ClipboardList` |
| Acara Besar | `Target` |
| Persuratan | `Mail` |
| Keuangan | `Wallet` |
| Kesekretariatan | `FolderOpen` |
| Departemen | `Building2` |
| Administrasi | `Settings` |
| Gantt | `GanttChartSquare` |
| Kanban | `Columns3` |
| Kendala | `AlertTriangle` |
| Nota | `Receipt` |
| RAB | `Calculator` |
| Notulensi | `FileText` |
| Audit | `History` |
| Backup | `DatabaseBackup` |

---

## 8. Komponen Dasar

### 8.1 Tombol

| Varian | Latar | Teks | Border | Penggunaan |
|---|---|---|---|---|
| **Primary** | `--primary` | `--primary-text` | — | Aksi utama (Simpan, Ajukan, Setujui) |
| **Secondary** | `--bg-panel` | `--text-primary` | `--border-default` | Aksi sekunder (Batal, Kembali) |
| **Ghost** | transparan | `--text-secondary` | — | Aksi tersier, toolbar |
| **Danger** | `--danger` | putih | — | Hapus, Tolak |
| **Danger Ghost** | transparan | `--danger` | — | Hapus dalam daftar |
| **Link** | transparan | `--text-link` | — | Navigasi inline |

```
┌─────────────────────────────────────────────────────────────┐
│  UKURAN                                                      │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐             │
│  │  sm 28px │  │  md 34px   │  │   lg 40px    │             │
│  └──────────┘  └────────────┘  └──────────────┘             │
│  padding:       padding:         padding:                    │
│  0 10px         0 14px           0 18px                      │
│  font: 13px     font: 14px       font: 14px                  │
│                                                              │
│  STATE                                                       │
│  Default → Hover (bg gelap 8%) → Active (bg gelap 14%)       │
│  Focus: ring 3px --shadow-focus                              │
│  Disabled: opacity 0.5, cursor not-allowed                   │
│  Loading: teks diganti "Memproses...", ikon spinner 14px     │
└─────────────────────────────────────────────────────────────┘
```

```tsx
<Button variant="primary" size="md">Ajukan Proker</Button>
<Button variant="secondary">Batal</Button>
<Button variant="ghost" size="sm"><Filter size={16} /> Filter</Button>
<Button variant="danger">Tolak</Button>
```

### 8.2 Input

```
┌────────────────────────────────────────────────────────────┐
│  Label Field  *                              ← 13px, 500   │
│  ┌──────────────────────────────────────────┐              │
│  │ Placeholder atau nilai                   │  ← 34px      │
│  └──────────────────────────────────────────┘              │
│  Teks bantuan atau pesan error               ← 12px        │
└────────────────────────────────────────────────────────────┘

State:
  Default  border: --border-default
  Hover    border: --border-strong
  Focus    border: --border-focus + ring 3px
  Error    border: --danger + teks bantuan merah
  Disabled bg: --bg-muted, cursor not-allowed
```

**Varian khusus:**

| Varian | Perilaku |
|---|---|
| `CurrencyInput` | Format otomatis saat mengetik: `50000` → `Rp50.000`. Nilai internal tetap number |
| `DateInput` | Kalender popup, format tampilan `dd/MM/yyyy`, mendukung ketik manual |
| `SearchInput` | Ikon `Search` kiri, tombol clear kanan, debounce 300 ms |
| `JumlahInput` | Input teks bebas untuk RAB; menampilkan hasil parsing di bawah (`→ 16`) atau prompt manual |

### 8.3 Badge & Status Pill

| Status | Warna Teks | Latar | Contoh |
|---|---|---|---|
| Draft | `--neutral` | `--neutral-subtle` | `Draft` |
| Menunggu | `--warning` | `--warning-subtle` | `Menunggu Approval` |
| Disetujui | `--success` | `--success-subtle` | `Disetujui` |
| Berjalan | `--info` | `--info-subtle` | `Berjalan` |
| Selesai | `--neutral` | `--neutral-subtle` | `Selesai` |
| Ditolak | `--danger` | `--danger-subtle` | `Ditolak` |
| Terbit | `--primary` | `--primary-subtle` | `Terbit` |

```
Spesifikasi:
  height: 20px · padding: 0 8px · radius: --radius-xs
  font: 11px / 500 / letter-spacing 0.02em
  Dot indikator opsional: 6px lingkaran di kiri
```

### 8.4 Avatar

```
Ukuran:  xs 20px · sm 24px · md 32px · lg 40px
Bentuk:  lingkaran penuh
Fallback: inisial 2 huruf di atas latar warna deterministik dari NIM
Stack:   tumpang tindih -8px, maksimal 4 terlihat + "+N"
```

### 8.5 Tabel

```
┌───────────────────────────────────────────────────────────────────┐
│ HEADER — bg: --bg-subtle · font: 12px/600 · uppercase · sticky    │
├───────────────────────────────────────────────────────────────────┤
│ Baris 1                                    ← height 36px          │
│   hover: bg --bg-subtle                                           │
│   selected: bg --primary-subtle + border-left 2px --primary       │
├───────────────────────────────────────────────────────────────────┤
│ Baris 2                                                            │
├───────────────────────────────────────────────────────────────────┤
│ ...                                                                │
└───────────────────────────────────────────────────────────────────┘
  border antar baris: 1px --border-subtle
  Kolom angka: rata kanan + .tabular
  Kolom aksi: rata kanan, ikon ghost, muncul saat hover baris
```

**Fitur wajib:**
- Header sticky saat scroll vertikal
- Sortir kolom (ikon panah muncul saat hover header)
- Baris kosong: empty state dengan ikon + pesan + tombol aksi
- Loading: skeleton 5 baris
- Pagination di bawah, atau infinite scroll untuk daftar panjang

### 8.6 Card

```
┌─────────────────────────────────────────────────────────────┐
│  Judul Card                                    [•••]         │  ← 16px/600
│  Deskripsi singkat                                           │  ← 13px, --text-secondary
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Konten                                                      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Footer opsional                             [Aksi]          │
└─────────────────────────────────────────────────────────────┘

  padding: 16px · radius: --radius-md
  border: 1px --border-default · shadow: none (default)
  Card interaktif: hover → border-color --border-strong
```

---

## 9. Komponen Kompleks

### 9.1 Sidebar

```
┌────────────────────────────┐
│  [Logo]  HMIF Center       │  ← 52px, brand area
├────────────────────────────┤
│  Periode 2025/2026    [▾]  │  ← selector periode, 13px
├────────────────────────────┤
│                             │
│  🏠  Beranda                │  ← item aktif:
│  📋  Program Kerja      3   │     bg --primary-subtle
│  🎯  Acara Besar            │     border-left 2px --primary
│  ✉️  Persuratan         7   │     teks --primary
│  💰  Keuangan               │
│  📁  Kesekretariatan        │  ← item normal:
│  🏢  Departemen             │     teks --text-secondary
│  ⚙️  Administrasi           │     hover: bg --bg-subtle
│                             │
├────────────────────────────┤
│  [Avatar] Nama Pengguna     │  ← footer, klik → menu profil
│           Kepala Dept       │
└────────────────────────────┘

  Lebar: 240px (expanded) / 56px (collapsed)
  Item: height 34px · padding 0 12px · radius --radius-sm
  Badge angka: bg --primary, teks putih, 11px, radius-full
  Ikon: 16px, stroke 1.5
```

**Perilaku:**
- Menu difilter berdasarkan role (lihat [USER_FLOW.md §1.2](USER_FLOW.md))
- Collapse disimpan di localStorage
- Mobile: drawer overlay, dipicu tombol hamburger

### 9.2 Command Palette (⌘K)

```
┌─────────────────────────────────────────────────────────────┐
│  🔍  Cari proker, surat, orang...                            │
├─────────────────────────────────────────────────────────────┤
│  AKSI CEPAT                                                  │
│  ➕  Buat Proker Baru                                    N   │
│  ✉️  Buat Surat                                              │
│  📷  Upload Nota                                             │
├─────────────────────────────────────────────────────────────┤
│  NAVIGASI                                                    │
│  🏠  Beranda                                            G H  │
│  📋  Program Kerja                                      G P  │
├─────────────────────────────────────────────────────────────┤
│  HASIL PENCARIAN                                             │
│  📋  SYNCHRONIZE 2026            Kaderisasi · Berjalan       │
│  ✉️  05/379/UN43.3.7/...         Peminjaman Tandu            │
└─────────────────────────────────────────────────────────────┘

  Lebar: 560px · posisi: tengah atas (top 15vh)
  Backdrop: rgba(17,28,68,0.4) + blur 4px
  Muncul: opacity + scale(0.98→1), 180ms ease-out
```

### 9.3 Grid RAB (Inline-Editable)

```
┌──────────────────────────────────────────────────────────────────────┐
│  DIVISI KONSUMSI                                     Rp6.654.000  ▾  │  ← header divisi
├──────────────────────────────────────────────────────────────────────┤
│  ▾ KONSUMSI PANITIA                                                   │  ← sub-section
│  ┌────┬──────────────┬──────────┬──────────────┬───────────┬───────┐ │
│  │ No │ Jenis Barang │  Jumlah  │ Harga Satuan │   Total   │  Ket  │ │
│  ├────┼──────────────┼──────────┼──────────────┼───────────┼───────┤ │
│  │  1 │ Galon        │    10    │    Rp5.000   │  Rp50.000 │       │ │
│  │  2 │ Makan 3 kali │    58    │   Rp30.000   │Rp1.740.000│       │ │
│  └────┴──────────────┴──────────┴──────────────┴───────────┴───────┘ │
│  [+ Tambah Item]                                                      │
│                                                                        │
│  ▾ KONSUMSI PESERTA                                                   │
│  ...                                                                   │
│  [+ Tambah Sub-section]                                               │
├──────────────────────────────────────────────────────────────────────┤
│  TOTAL DIVISI                                        Rp6.654.000      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  TOTAL ANGGARAN                                     Rp26.000.000      │  ← sticky footer
└──────────────────────────────────────────────────────────────────────┘
```

**Spesifikasi interaksi:**
- Klik sel → mode edit (input inline, bukan modal)
- `Tab` → sel berikutnya · `Enter` → baris berikutnya · `Esc` → batal
- Kolom `Total`: read-only, latar `--bg-inset`. Ikon 🔓 untuk override manual
- Kolom `Jumlah`: teks bebas; hasil parsing muncul sebagai hint `→ 16` di bawah
- Bila parsing gagal: baris ditandai amber + prompt input numerik
- Perhitungan ulang < 100 ms, angka berubah dengan fade 150 ms
- Baris baru: highlight flash 400 ms

### 9.4 Kanban Board

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ TO DO      5 │ IN PROGRESS 3│ REVIEW     2 │ DONE      12 │  ← header kolom
├──────────────┼──────────────┼──────────────┼──────────────┤
│┌────────────┐│┌────────────┐│┌────────────┐│┌────────────┐│
││ ▌Desain    │││ ▌Konten IG │││ ▌Draft     │││ ▌Setup Web ││
││  Poster    │││            │││  Artikel   │││            ││
││            │││            │││            │││            ││
││ 👤 R  📅5/9│││👤 B 📅3/9⚠️│││👤 C  ☑6/6 │││👤 D    ✓  ││
││ ☑ 2/5      │││ ☑ 4/6      │││            │││            ││
│└────────────┘│└────────────┘│└────────────┘│└────────────┘│
│┌────────────┐│              │              │              │
││ ...        ││              │              │              │
│└────────────┘│              │              │              │
│              │              │              │              │
│ [+ Tambah]   │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘

  Kolom: lebar min 280px, gap 12px, scroll horizontal bila sempit
  Kartu: padding 12px, radius --radius-sm, border 1px
         border-left 3px berwarna sesuai prioritas
  Prioritas: Kritis=--danger · Tinggi=--warning · Sedang=--info · Rendah=--neutral
  Drag: kartu terangkat (shadow-md), kolom target highlight tipis
```

### 9.5 Form Surat — Split View

```
┌──────────────────────────────┬──────────────────────────────────────┐
│  FORM (42%)                  │  PREVIEW (58%)                       │
│  ──────────────────────────  │  ──────────────────────────────────  │
│                              │  ┌────────────────────────────────┐  │
│  Jenis Surat                 │  │                                │  │
│  [05 — Peminjaman      ▾]    │  │      [ KOP SURAT HMIF ]        │  │
│                              │  │                                │  │
│  Varian                      │  │  Nomor    : 05/XXX/UN43.3.7/   │  │
│  [Peminjaman Ruangan   ▾]    │  │             HMIF/IX/2026       │  │
│                              │  │             ⓘ nomor sementara  │  │
│  Kegiatan                    │  │  Lampiran : -                  │  │
│  [HMIF                  ]    │  │  Perihal  : Permohonan...      │  │
│                              │  │                                │  │
│  Tanggal Surat               │  │  Kepada Yth.                   │  │
│  [01/09/2026           📅]   │  │  Kepala Bagian Sekretariat     │  │
│                              │  │  Fakultas Teknik UNTIRTA       │  │
│  Tujuan                      │  │  di Cilegon                    │  │
│  [Kabag Sekretariat FT ▾]    │  │                                │  │
│                              │  │  Dengan hormat,                │  │
│  Alamat Tujuan               │  │  Sehubungan dengan akan...     │  │
│  [di Cilegon            ]    │  │                                │  │
│                              │  │                                │  │
│  ... field lainnya ...       │  │       [TTD]     [STEMPEL]      │  │
│                              │  │                                │  │
│  Format Output               │  └────────────────────────────────┘  │
│  ⦿ DOCX  ○ PDF  ○ Keduanya   │                                      │
│                              │  Preview diperbarui < 300 ms         │
│  Tersimpan ✓                 │                                      │
│  [Batal]  [Ajukan Surat]     │                                      │
└──────────────────────────────┴──────────────────────────────────────┘

  Preview: latar putih, shadow-sm, rasio A4, scroll independen
  Mobile: tab "Form" / "Preview" (bukan split)
```

### 9.6 Kamera Nota

```
┌────────────────────────────────────────────────────────────┐
│  ← Upload Nota                                              │
├────────────────────────────────────────────────────────────┤
│  Divisi                                                     │
│  [Konsumsi                                            ▾]    │
│                                                             │
│  Item RAB  *                                                │
│  [Pilih item...                                       ▾]    │
│   ⓘ Wajib dipilih sebelum mengambil foto                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │              ╔═══════════════════╗                     │ │
│  │              ║                   ║  ← overlay deteksi  │ │
│  │              ║   [ VIEWFINDER ]  ║     tepi (hijau)    │ │
│  │              ║                   ║                     │ │
│  │              ╚═══════════════════╝                     │ │
│  │                                                        │ │
│  │   Posisikan nota di dalam bingkai                      │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│              [🖼️ Galeri]    ( ⬤ )    [🔄 Kamera]           │
│                                                             │
└────────────────────────────────────────────────────────────┘

Setelah ambil foto:
┌────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────┐ │
│  │            [ HASIL SCAN — sudah lurus ]                │ │
│  └───────────────────────────────────────────────────────┘ │
│  Nota terbaca jelas?                                        │
│  [🔄 Ambil Ulang]              [✓ Gunakan Foto Ini]        │
└────────────────────────────────────────────────────────────┘
```

---

## 10. Spesifikasi Gantt Chart

### 10.1 Anatomi Visual

```
╔═══════════════════════════════════════════════════════════════════════════╗
║ TIMELINE PROGRAM KERJA HMIF          [Minggu ▾] [Filter ▾] [⬇ Ekspor]    ║ ← toolbar 44px
╠══════════════════╤════════════════════════════════════════════════════════╣
║                  │   Oktober    │   November   │   Desember   │  Januari   ║ ← bulan 28px
║  PROGRAM         │ W1 W2 W3 W4  │ W1 W2 W3 W4  │ W1 W2 W3 W4  │ W1 W2 W3 W4║ ← minggu 22px
║  KERJA           │              │              │              │            ║
╠══════════════════╪════════════════════════════════════════════════════════╣
║                  │                    Muhammad Zidan          ┊            ║ ← label PJ 11px
║ ▾ Kaderisasi     │              ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬█████▬     ┊            ║ ← grup 32px
║     SYNCHRONIZE  │              ├──▬▬▬▬▬▬▬▬▬▬▬                ┊            ║ ← task 26px
║     Upgrading    │                    └──▬▬▬▬▬▬▬▬▬█           ┊            ║
║                  │                                            ┊            ║
║                  │                        Rina Kartika        ┊            ║
║ ▾ Kominfo        │                    ▬▬▬▬▬▬▬▬▬▬▬▬▬▬█        ┊            ║
║     IT Festival  │                    ├──▬▬▬▬▬▬▬               ┊            ║
║                  │                                            ┊            ║
║ ▸ Minat & Bakat  │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  ┊  (3 proker) ║ ← terlipat
║                  │                                            ┊            ║
║                  │                                       hari ini          ║
╚══════════════════╧════════════════════════════════════════════════════════╝

  ▬ masa persiapan   █ hari-H   ├── konektor   ┊ garis hari ini
```

### 10.2 Dimensi

| Elemen | Nilai |
|---|---|
| Lebar kolom label (kiri) | 200px (desktop) / 140px (mobile) |
| Tinggi header bulan | 28px |
| Tinggi header minggu | 22px |
| Tinggi baris grup | 32px |
| Tinggi baris task | 26px |
| Tinggi bar grup | 14px |
| Tinggi bar task | 10px |
| Radius bar | `height / 2` (pill penuh) |
| Lebar per hari (skala Minggu) | 6px → 1 minggu = 42px |
| Lebar per hari (skala Bulan) | 2px → 1 bulan ≈ 60px |
| Lebar per hari (skala Kuartal) | 0.8px |
| Gap vertikal antar grup | 8px |

### 10.3 Token Warna Gantt

```css
:root {
  --gantt-bg:           var(--bg-panel);
  --gantt-grid-line:    rgba(17, 28, 68, 0.06);
  --gantt-grid-month:   rgba(17, 28, 68, 0.12);   /* pemisah bulan lebih tegas */
  --gantt-header-bg:    var(--bg-subtle);
  --gantt-today-line:   var(--brand-tech);
  --gantt-today-bg:     rgba(30, 144, 255, 0.04); /* highlight kolom hari ini */
  --gantt-hari-h:       #FFFFFF;                   /* marker hari-H di dalam bar */
  --gantt-hari-h-ring:  rgba(255, 255, 255, 0.9);
  --gantt-connector:    rgba(17, 28, 68, 0.25);
  --gantt-bar-opacity:  0.85;                      /* badan bar (persiapan) */
  --gantt-progress-opacity: 1;                     /* isian progres */
}

[data-theme="dark"] {
  --gantt-bg:         #111C44;                     /* Deep Navy — sesuai referensi */
  --gantt-grid-line:  rgba(255, 255, 255, 0.06);
  --gantt-grid-month: rgba(255, 255, 255, 0.12);
  --gantt-header-bg:  #0D1631;
  --gantt-today-bg:   rgba(30, 144, 255, 0.08);
  --gantt-hari-h:     #FFFFFF;
  --gantt-connector:  rgba(255, 255, 255, 0.25);
}
```

### 10.4 Anatomi Bar

```
        Muhammad Zidan                    ← label PJ: 11px/500, --text-tertiary
                                             posisi: 6px di atas bar, rata kiri bar
   ┌────────────────────────────────────┐
   │▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░████████░░░░│  ← tinggi 10–14px, radius penuh
   └────────────────────────────────────┘
    └─ progres ─┘└─ sisa ─┘└hari-H┘

  ▓ progres    : warna departemen, opacity 1
  ░ sisa       : warna departemen, opacity 0.85
  █ hari-H     : putih (--gantt-hari-h), radius penuh, di atas layer bar

  Hover  : opacity 1 + outline 1px putih 40%
  Aktif  : outline 2px --brand-tech
  Drag   : opacity 0.7 + shadow
```

### 10.5 Konektor

```
Bar induk (grup)
   ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
   │
   ├──▬▬▬▬▬▬▬▬          ← task anak 1
   │
   └──────▬▬▬▬▬▬▬       ← task anak 2

  Garis: stroke 1px --gantt-connector
  Bentuk: siku (horizontal → vertikal → horizontal), tanpa lengkung
  Sudut: tajam (bukan rounded) — konsisten dengan estetika presisi
```

### 10.6 Header Timeline

```
┌──────────────┬──────────────┬──────────────┐
│   Oktober    │   November   │   Desember   │  ← 13px/600, rata tengah
├──┬──┬──┬──┬──┼──┬──┬──┬──┬──┼──┬──┬──┬──┬──┤
│W1│W2│W3│W4│  │W1│W2│W3│W4│  │W1│W2│W3│W4│  │  ← 11px/400, --text-tertiary
└──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘

  Pemisah bulan: garis 1px --gantt-grid-month (lebih tegas)
  Pemisah minggu: garis 1px --gantt-grid-line
  Header sticky saat scroll vertikal
  Kolom label kiri sticky saat scroll horizontal
```

### 10.7 Interaksi

| Aksi | Respons |
|---|---|
| Hover bar | Opacity naik + tooltip setelah 400 ms |
| Klik bar | Panel samping meluncur dari kanan (180 ms) |
| Klik ▾ grup | Collapse/expand (180 ms), bar ringkas grup tetap terlihat |
| Drag bar (bila punya izin) | Geser tanggal, snap ke hari, preview real-time |
| Drag tepi bar | Ubah durasi |
| Scroll horizontal | Timeline bergeser, kolom label tetap |
| Ganti skala | Re-render dengan transisi width 180 ms |
| Live update dari user lain | Bar baru muncul + highlight flash 400 ms |

**Tooltip:**

```
┌──────────────────────────────┐
│ SYNCHRONIZE                  │  ← 13px/600
│ Kaderisasi · Terjadwal       │  ← 11px, --text-tertiary
├──────────────────────────────┤
│ Persiapan  1 Nov – 5 Des     │  ← 12px
│ Hari-H     6 – 7 Des 2026    │
│ Progres    75%               │
│ PJ         Muhammad Zidan    │
└──────────────────────────────┘
  bg: --bg-elevated · shadow-md · radius-sm · padding 10px
```

### 10.8 Master Gantt — Perbedaan

| Aspek | Master Gantt (Beranda) | Gantt Proker/Divisi |
|---|---|---|
| Baris grup | **Departemen** | Fase (Persiapan/Pelaksanaan/Evaluasi) |
| Baris task | **Proker** | Task individual |
| Warna | Warna departemen | Warna fase |
| Marker Hari-H | ✅ Selalu tampil | ➖ Opsional |
| Editable | ❌ Tidak (read-only) | ✅ Ya (sesuai izin) |
| Live update | ✅ Realtime | ✅ Realtime |
| Rentang default | 3 bulan lalu → 6 bulan depan | Sepanjang proker |
| Tinggi maksimum | `calc(100vh - 320px)`, scroll internal | Fleksibel |

---

## 11. Pola Layout Halaman

### 11.1 Layout Aplikasi

```
┌────────────────────────────────────────────────────────────────────┐
│ HEADER 52px    [☰] Breadcrumb            [🔍 ⌘K]  [🔔]  [🌓]  [👤] │
├──────────┬─────────────────────────────────────────────────────────┤
│          │                                                          │
│ SIDEBAR  │  KONTEN                                                  │
│  240px   │  padding 24px                                            │
│          │  max-width: none (kecuali halaman teks: 720px)           │
│          │                                                          │
│          │                                                          │
└──────────┴─────────────────────────────────────────────────────────┘
```

### 11.2 Beranda

```
┌────────────────────────────────────────────────────────────────────┐
│  Beranda                                    Periode 2025/2026      │
├────────────────────────────────────────────────────────────────────┤
│  ╔══════════════════════════════════════════════════════════════╗ │
│  ║  MASTER GANTT — tinggi max calc(100vh - 320px)               ║ │
│  ║  Selalu di atas, untuk SEMUA role                            ║ │
│  ╚══════════════════════════════════════════════════════════════╝ │
│                                                                     │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐   │
│  │ PANEL ROLE #1    │ │ PANEL ROLE #2    │ │ PANEL ROLE #3    │   │
│  │ (kontekstual)    │ │                  │ │                  │   │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### 11.3 Halaman Daftar

```
┌────────────────────────────────────────────────────────────────────┐
│  Program Kerja                              [+ Tambah Proker]      │  ← judul + aksi utama
│  48 proker · 12 berjalan                                            │  ← metadata
├────────────────────────────────────────────────────────────────────┤
│  [🔍 Cari...]  [Departemen ▾] [Kategori ▾] [Status ▾]   [⊞ ☰ 📅]  │  ← filter + view switch
├────────────────────────────────────────────────────────────────────┤
│  TABEL / KANBAN / KALENDER / GANTT                                  │
└────────────────────────────────────────────────────────────────────┘
```

### 11.4 Halaman Detail

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Program Kerja / SYNCHRONIZE 2026                                 │
│  SYNCHRONIZE 2026        [Kaderisasi] [Terjadwal] [Berjalan]        │
│  Persiapan 1 Nov – 5 Des · Hari-H 6–7 Des 2026     [Edit] [•••]    │
├────────────────────────────────────────────────────────────────────┤
│  [Ringkasan] [Gantt] [Divisi] [RAB] [TOR] [Nota] [LPJ]             │  ← tab
├────────────────────────────────────────────────────────────────────┤
│  Konten tab                                                         │
└────────────────────────────────────────────────────────────────────┘
```

### 11.5 Panel Samping

```
                              ┌─────────────────────────────┐
                              │  Detail Proker         [✕]  │  ← 400px
                              ├─────────────────────────────┤
                              │                              │
                              │  Konten detail               │
                              │                              │
                              ├─────────────────────────────┤
                              │  [Batal]      [Simpan]      │
                              └─────────────────────────────┘

  Masuk: translateX(100% → 0), 180ms ease-out
  Backdrop: rgba(17,28,68,0.2) — tanpa blur (performa)
  Mobile: full-screen sheet dari bawah
```

---

## 12. Status & Umpan Balik

### 12.1 Toast

```
┌──────────────────────────────────────────┐
│  ✓  Proker berhasil disetujui       [✕]  │
└──────────────────────────────────────────┘

  Posisi: kanan atas, 16px dari tepi
  Lebar: 360px maks
  Masuk: translateY(-8px → 0) + fade, 150ms
  Durasi: sukses 3s · error 6s · info 4s
  Tumpukan: maksimal 3, sisanya antre
```

| Jenis | Ikon | Warna aksen |
|---|---|---|
| Sukses | `CheckCircle2` | `--success` |
| Error | `XCircle` | `--danger` |
| Peringatan | `AlertTriangle` | `--warning` |
| Info | `Info` | `--info` |

### 12.2 Skeleton Loader

```css
.skeleton {
  background: linear-gradient(90deg,
    var(--bg-muted) 0%,
    var(--bg-subtle) 50%,
    var(--bg-muted) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s linear infinite;
  border-radius: var(--radius-sm);
}
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

Skeleton **harus menyerupai bentuk konten sebenarnya** — bukan kotak generik.

### 12.3 Empty State

```
┌────────────────────────────────────────────────────┐
│                                                     │
│                    [ ikon 40px ]                    │
│                                                     │
│              Belum ada program kerja                │  ← 16px/600
│      Mulai dengan menambahkan proker pertama        │  ← 13px, --text-secondary
│                                                     │
│              [+ Tambah Proker]                      │
│                                                     │
└────────────────────────────────────────────────────┘
```

### 12.4 Panel Konflik (Inline, Bukan Modal)

```
┌────────────────────────────────────────────────────────────────┐
│  ⚠  Tanggal bentrok dengan proker lain                          │
│  ─────────────────────────────────────────────────────────────  │
│  ● SYNCHRONIZE — Kaderisasi                                     │
│    Persiapan 1 Nov – 5 Des · Hari-H 6–7 Des 2026                │
│                                                                  │
│  Pilih tanggal di luar rentang tersebut untuk melanjutkan.      │
└────────────────────────────────────────────────────────────────┘

  bg: --danger-subtle · border-left 3px --danger · radius-sm · padding 12px
  Muncul di bawah field tanggal, bukan sebagai modal
```

### 12.5 Indikator Deadline

| Kondisi | Tampilan |
|---|---|
| Sisa > 7 hari | Teks `--text-tertiary` · `📅 12 Sep` |
| Sisa ≤ 7 hari | Teks `--warning` + ikon · `⚠️ 5 Sep (3 hari)` |
| Sisa ≤ 3 hari | Teks `--danger` + latar `--danger-subtle` · `🔴 3 Sep (besok)` |
| Lewat | Teks `--danger` bold + ikon · `⛔ 1 Sep (terlambat 2 hari)` |

---

## 13. Responsif

### 13.1 Breakpoint

| Nama | Lebar | Target |
|---|---|---|
| `sm` | 640px | Ponsel besar |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape / laptop kecil |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Desktop besar |

### 13.2 Adaptasi per Komponen

| Komponen | Mobile (< 768px) | Desktop |
|---|---|---|
| Sidebar | Drawer overlay | Tetap terlihat |
| Master Gantt | Skala Bulan default, label 140px, scroll horizontal | Skala Minggu, label 200px |
| Tabel | Card per baris (label di atas nilai) | Tabel penuh |
| Grid RAB | Scroll horizontal, kolom No+Nama sticky | Penuh |
| Form Surat | Tab Form / Preview | Split view |
| Kanban | Satu kolom, swipe antar kolom | Semua kolom |
| Panel samping | Bottom sheet full-screen | Panel kanan 400px |
| Command palette | Full-screen | Modal 560px |

### 13.3 Prioritas Mobile

Modul yang **wajib nyaman di ponsel** (panitia bekerja di lapangan):

1. **Upload Nota** — kamera, scan, preview, retake
2. **Kanban** — update status tugas
3. **Beranda** — melihat Master Gantt
4. **Kendala** — lapor & balas

Modul yang **diutamakan desktop** (tetap dapat diakses, tidak dioptimasi penuh):
RAB, Form Surat, Editor TOR/Proposal, Generator LPJ, Admin.

---

## 14. Aksesibilitas

### 14.1 Kontras (WCAG AA)

| Kombinasi | Rasio | Status |
|---|---|---|
| `--text-primary` (#111C44) di `--bg-base` (#FFF) | 15.8:1 | ✅ AAA |
| `--text-secondary` (#3D5A80) di `--bg-base` | 7.9:1 | ✅ AAA |
| `--text-tertiary` (#6C757D) di `--bg-base` | 4.7:1 | ✅ AA |
| `--primary-text` (#FFF) di `--primary` (#0066A9) | 6.4:1 | ✅ AA |
| `--text-primary` dark (#F0F4FA) di `--bg-base` dark (#0A0F1F) | 16.9:1 | ✅ AAA |

### 14.2 Keyboard

- Semua elemen interaktif dapat dijangkau `Tab`
- Focus ring **selalu terlihat** — tidak pernah `outline: none` tanpa pengganti
- `Esc` menutup modal, panel, dropdown
- Panah navigasi dalam menu, tabel, dan Kanban
- Skip link "Lompat ke konten utama" di awal halaman

### 14.3 Screen Reader

```tsx
// Status tidak boleh hanya lewat warna
<Badge status="danger">
  <span aria-hidden>●</span>
  <span>Ditolak</span>            {/* teks eksplisit, bukan hanya warna */}
</Badge>

// Bar Gantt
<g role="img" aria-label="SYNCHRONIZE, Kaderisasi, persiapan 1 November sampai 5 Desember, hari-H 6 sampai 7 Desember 2026, progres 75 persen">

// Live region untuk update realtime
<div aria-live="polite" aria-atomic="true" className="sr-only">
  Proker baru ditambahkan: IT Festival oleh Kominfo
</div>
```

### 14.4 Form

- Setiap input memiliki `<label>` eksplisit (bukan hanya placeholder)
- Pesan error terhubung via `aria-describedby`
- Field wajib ditandai `*` **dan** `aria-required`
- Error diumumkan ke screen reader saat muncul

---

## 15. Implementasi Teknis

### 15.1 Konfigurasi Tailwind

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantik — merujuk CSS variable agar dark mode otomatis
        bg: {
          base: 'var(--bg-base)',
          subtle: 'var(--bg-subtle)',
          muted: 'var(--bg-muted)',
          panel: 'var(--bg-panel)',
          elevated: 'var(--bg-elevated)',
          inset: 'var(--bg-inset)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          disabled: 'var(--text-disabled)',
          inverse: 'var(--text-inverse)',
          link: 'var(--text-link)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          focus: 'var(--border-focus)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          active: 'var(--primary-active)',
          subtle: 'var(--primary-subtle)',
          fg: 'var(--primary-text)',
        },
        accent: { DEFAULT: 'var(--accent)', subtle: 'var(--accent-subtle)' },
        success: { DEFAULT: 'var(--success)', subtle: 'var(--success-subtle)' },
        warning: { DEFAULT: 'var(--warning)', subtle: 'var(--warning-subtle)' },
        danger:  { DEFAULT: 'var(--danger)',  subtle: 'var(--danger-subtle)' },
        info:    { DEFAULT: 'var(--info)',    subtle: 'var(--info-subtle)' },

        // Brand mentah — untuk kebutuhan khusus
        brand: {
          navy:  '#111C44',
          blue:  '#0066A9',
          tech:  '#1E90FF',
          teal:  '#00B4D8',
          slate: '#3D5A80',
          steel: '#6C757D',
          soft:  '#DCE6F1',
          gray:  '#E6EAF2',
          dark:  '#0A0F1F',
        },

        // Departemen
        dept: {
          kaderisasi: '#1E90FF',
          mikat:      '#00B4D8',
          internal:   '#F59E0B',
          eksternal:  '#F87171',
          kominfo:    '#A3E635',
          rnd:        '#A78BFA',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
        xs:    ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        sm:    ['13px', { lineHeight: '18px' }],
        base:  ['14px', { lineHeight: '20px' }],
        lg:    ['16px', { lineHeight: '24px', letterSpacing: '-0.005em' }],
        xl:    ['20px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        '2xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.015em' }],
        '3xl': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        xs: '4px', sm: '6px', md: '8px', lg: '12px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },
      transitionDuration: {
        fast: '120ms', normal: '180ms', slow: '250ms',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        both: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
    },
  },
} satisfies Config;
```

### 15.2 Toggle Tema

```typescript
// lib/theme.ts
export type Theme = 'light' | 'dark' | 'system';

export function applyTheme(theme: Theme) {
  const resolved = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  document.documentElement.setAttribute('data-theme', resolved);
  localStorage.setItem('theme', theme);
}
```

Script anti-flash di `<head>`:

```html
<script>
  (function () {
    var t = localStorage.getItem('theme') || 'system';
    var d = t === 'dark' || (t === 'system' &&
      matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
  })();
</script>
```

### 15.3 Checklist Komponen

Setiap komponen baru harus memenuhi:

- [ ] Menggunakan token semantik, **bukan** nilai hex langsung
- [ ] Berfungsi benar di light **dan** dark mode
- [ ] Kontras memenuhi WCAG AA
- [ ] Dapat dioperasikan penuh dengan keyboard
- [ ] Focus ring terlihat jelas
- [ ] Memiliki state: default, hover, active, focus, disabled, loading
- [ ] Memiliki empty state (bila menampilkan koleksi)
- [ ] Memiliki skeleton loader (bila memuat data)
- [ ] Animasi ≤ 250 ms dan hanya untuk menjelaskan perubahan
- [ ] Menghormati `prefers-reduced-motion`
- [ ] Responsif hingga 375px
- [ ] Label & ARIA lengkap untuk screen reader
- [ ] Teks dalam Bahasa Indonesia
- [ ] Angka memakai `tabular-nums`
- [ ] Tanggal & Rupiah memakai format lokal Indonesia

---

## Lampiran — Referensi Cepat

### Warna yang Paling Sering Dipakai

```
Latar halaman        --bg-base       #FFFFFF / #0A0F1F
Latar card           --bg-panel      #FFFFFF / #131D3D
Latar sidebar        --bg-subtle     #F7F9FC / #111C44
Teks utama           --text-primary  #111C44 / #F0F4FA
Teks sekunder        --text-secondary #3D5A80 / #A8BBD6
Border               --border-default #DCE6F1 / #23315C
Tombol primer        --primary       #0066A9 / #1E90FF
Aksen / tautan       --accent        #1E90FF / #00B4D8
```

### Ukuran yang Paling Sering Dipakai

```
Teks default        14px / 20px
Teks kecil          13px / 18px
Metadata            12px / 16px
Tinggi tombol       34px
Tinggi input        34px
Tinggi baris tabel  36px
Padding card        16px
Gap default         16px
Radius default      6px
Border              1px
Durasi transisi     120ms (hover) / 180ms (posisi)
```

---

*Setiap penyimpangan dari design system ini harus dibenarkan dan didokumentasikan. Konsistensi lebih berharga daripada kreativitas lokal.*
