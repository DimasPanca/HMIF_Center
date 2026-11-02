# ADR-060 — Rombak desain v2: gaya Linear, Guide, Dhana, dan Lapor Bug

|                     |                                                             |
| ------------------- | ----------------------------------------------------------- |
| **Status**          | Diterima                                                    |
| **Tanggal**         | 2026-11-02                                                  |
| **Diputuskan oleh** | Pemilik produk (tanya-jawab 2026-11-02)                     |
| **Checkpoint**      | `docs/ai/CHECKPOINT_REDESAIN.md`                            |
| **Melengkapi**      | ADR-037 (sidebar per peran), ADR-039 (acara per fase), ADR-040 (tema) |

## Konteks

Pemilik meminta tampilan yang lebih bersih dan tidak monoton, panduan lengkap dalam satu fitur
yang mudah dicari, asisten AI bernama **Dhana**, dan saluran lapor bug ke Admin. Referensi yang
diminta: Taste Skill, Web Interface Guidelines (Vercel), Awesome DESIGN.md, playwright-cli —
dipasang di `.claude/skills/`. DESIGN_SYSTEM.md beku; perubahan arah visual dicatat di sini.

## Keputusan

### 1. Arah visual: gaya Linear dengan warna HMIF

- Skill `hmif-design-linear` memetakan DESIGN.md Linear ke HMIF: satu aksen (biru HMIF
  `--primary`), hierarki lewat tangga permukaan + garis 1px, tanpa bayangan pada elemen diam,
  warna hanya untuk status & data, judul rapat (tracking negatif), Inter.
- Token netral `app/globals.css` dibuat kurang kebiruan dan lebih tenang; mode gelap navy yang
  lebih dalam. Kontras WCAG AA tetap dijaga gate `a11y-kontras`.
- Tema bawaan tetap **ikut sistem** (sudah demikian sejak T-014/ADR-040).

### 2. Bagian Bantuan di sidebar

Di bawah menu peran (yang untuk sebagian besar peran diakhiri **Surat Keterangan Aktif**), untuk
**semua peran**: **Guide** (`/guide`) dan **Lapor bug** (`/bantuan/lapor-bug`). Bagian ini berada di
luar susunan per peran ADR-037, sehingga susunan dan gate `sidebar-role` tidak berubah. Admin
mendapat butir **Laporan Bug** di grup Administrasi.

### 3. Guide

- Sumber tunggal: `docs/panduan/*.md` (panduan per peran yang sudah ada) + `umum.md` (baru:
  tentang HMIF Center & Kabinet Vardhana, navigasi, acara per fase, Formulir, Dhana, lapor bug).
  Dibaca server, diurai oleh pengurai markdown kecil (`lib/guide/`), dirender tanpa
  `dangerouslySetInnerHTML`. Gambar disajikan lewat rute dengan nama berkas tervalidasi.
- Pencarian di browser atas seluruh bagian (judul berbobot lebih), tanpa dependency. Hasil
  menautkan langsung ke bagiannya. Panduan peran pengguna ditandai "untuk Anda".

### 4. Dhana — *Digital Helper and Network Assistant*

- Tombol di pojok kiri bawah (desktop: kaki sidebar; HP: tombol melayang). Panel chat.
- `/api/dhana`: hanya pengguna yang masuk; batas pesan per jam (`cekBatas`); memanggil Gemini
  lewat REST (`fetch`, tanpa SDK — SYSTEM_DESIGN §2) dengan `GEMINI_API_KEY` yang **hanya ada di
  server**. Konteks = identitas Dhana + bagian Guide paling relevan (pencarian yang sama).
- Pengetahuan fase ini: isi Guide saja; Dhana tahu website dibuat Kabinet Vardhana (2026–2027).
  Fase berikutnya: AD/ART, GBHK, GBHO (dokumen menyusul).
- Riwayat **tidak disimpan** di server.

### 5. Lapor bug

- Tabel `laporan_bug` (deskripsi, halaman asal, peramban, lampiran opsional di bucket privat,
  status `BARU → DITANGANI → SELESAI | DITOLAK`, catatan admin). Pelapor melihat laporannya sendiri;
  Admin melihat semua dan mengubah status. Mutasi lewat `withAuditContext`.
- Migrasi idempotent; diterapkan menambah tabel tanpa `db:reset` (keputusan pemilik).

## Konsekuensi

- Halaman lain mengikuti token baru secara otomatis; penataan ulang per halaman = Tahap 2.
- Biaya Gemini per pertanyaan; dibatasi batas pesan per jam per pengguna.
