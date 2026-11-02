# Checkpoint — Rombak Desain v2, Guide, Dhana, Report Bug

> Dokumen kerja untuk melanjutkan sesi yang terjeda (pemilik mungkin melanjutkan dari
> rumah). Baca ini setelah `HANDOFF.md`. **Jangan pernah menulis API key di sini.**

| | |
|---|---|
| **Dimulai** | 2026-11-02 |
| **Branch** | `claude/sharp-gates-ngoq4i` (belum di-merge ke `main`) |
| **Commit terakhir sebelum tahap ini** | `1f5d926` |
| **Status** | Keputusan lengkap (2026-11-02). Berikutnya: pasang skill, lalu Tahap 1. |

## Permintaan pemilik (ringkas, 2026-11-02)

1. **Rombak visual** supaya lebih enak dan tidak monoton, memakai empat referensi:
   - Taste Skill — <https://github.com/leonxlnx/taste-skill> (mode app/dashboard: panel tenang,
     angka rata, warna hanya untuk data, navigasi HP dilipat; cek di browser 3 lebar).
   - Web Interface Guidelines (Vercel) — skill audit UI; aturan diambil dari
     `vercel-labs/web-interface-guidelines/main/command.md`.
   - Awesome DESIGN.md — <https://github.com/voltagent/awesome-design-md> (DESIGN.md merek
     sebagai referensi visual: Linear, Notion, Vercel, Supabase, dll.).
   - playwright-cli — <https://github.com/microsoft/playwright-cli> (otomasi browser untuk cek).
2. **Beranda**: visual enak, data sesuai akun/peran, Gantt yang enak dilihat, daftar tugas
   simple & minimalis.
3. **Aturan awal tetap berlaku**: peran dan susunan sidebar per peran (ADR-037), ADR-038/039.
   Visual **clean**.
4. **Guide** — satu fitur berisi panduan lengkap seluruh website (mekanisme & tata cara),
   **dengan pencarian yang mudah**. Letak: sidebar, **di bawah "Surat Keterangan Aktif"**.
5. **Dhana** — chat AI, tombol di **pojok kiri bawah**.
   - DHANA = *Digital Helper and Network Assistant*; berhubungan langsung dengan Vardhana;
     Sanskerta *dhana* = kekayaan/harta; filosofi: pengetahuan adalah kekayaan yang dapat
     dibagikan kepada seluruh mahasiswa. Tagline: **Your Knowledge Companion**.
   - Model: Gemini. Kunci disimpan di `.env.local` sebagai `GEMINI_API_KEY` (sudah diisi
     2026-11-02; file ini di-ignore git). Di rumah/Vercel: isi variabel yang sama secara manual.
6. **Report bug** — di bawah Guide; deskripsi + foto/screenshot (opsional); masuk ke tampilan
   **Admin** untuk diperbaiki.
7. **Cek lokal dulu sebelum push.** Tanya dulu sebelum generate.

## Batasan yang harus diingat

- Dokumen beku tidak diubah (PRD, SYSTEM_DESIGN, USER_FLOW, DESIGN_SYSTEM, …); perubahan
  arah visual dicatat lewat ADR baru.
- Dependency baru di luar SYSTEM_DESIGN §2 butuh ADR → Gemini dipanggil lewat REST `fetch`,
  tanpa SDK, kecuali pemilik memutuskan lain.
- Migrasi baru (report bug, dll.) harus idempotent; `db:reset` hanya dengan izin pemilik.
- Commit tanpa atribusi Claude; `npm run verify` hijau sebelum commit; jangan `git add -A`.

## Keputusan pemilik (2026-11-02, tanya-jawab)

| Topik | Keputusan |
|---|---|
| Arah visual | **Linear** (DESIGN.md Linear dari awesome-design-md) — sidebar tipis abu lembut, kartu tanpa bayangan dengan garis 1px, judul tegas, angka rata, warna hanya untuk status & data, ruang lega. Warna merek tetap biru-navy HMIF. |
| Tema bawaan | **Ikuti sistem** (prefers-color-scheme), tetap bisa diganti manual. |
| Dhana — pengetahuan | **Isi Guide dulu.** Fase berikutnya: Dhana memahami **AD/ART, GBHK, GBHO** (dokumen menyusul dari pemilik). Dhana juga tahu website ini dibuat pada **Kabinet Vardhana (2026–2027)**. |
| Dhana — riwayat | **Tidak disimpan**; percakapan hanya selama jendela chat terbuka. Tetap ada batas pesan per jam. |
| Report bug | **Pakai status**: Baru → Ditangani → Selesai/Ditolak + catatan admin; pelapor melihat status laporannya sendiri. Foto opsional. |
| Cakupan | **Bertahap.** Tahap 1: fondasi gaya Linear, sidebar, beranda (Gantt + tugas), Guide (dengan pencarian), Dhana, Report bug. Tahap 2: halaman lain satu per satu. |
| Skill | **Dipasang ke project** (`.claude/skills/`) + `@playwright/cli` global, supaya sesi lain (termasuk di rumah) ikut memakainya. |
| Database | **Jangan `db:reset`.** Migrasi baru hanya menambah tabel di DB dummy; uji migrasi dari kosong dilewati dulu. |

## Rencana kerja

**Tahap 0 — persiapan**
- [ ] Pasang skill: taste-skill (design-taste-frontend), web-design-guidelines, DESIGN.md Linear, playwright-cli.
- [ ] ADR baru: arah visual Linear (pertentangan dengan DESIGN_SYSTEM beku dicatat di ADR), Guide, Dhana (Gemini via REST, tanpa SDK), Report bug.

**Tahap 1**
- [ ] Token visual gaya Linear (warna, tipografi, radius, garis) di `app/globals.css`; tema ikut sistem.
- [ ] Sidebar: tetap susunan per peran (ADR-037); tambah **Guide** dan **Report bug** di bawah Surat Keterangan Aktif untuk semua peran.
- [ ] Beranda: data per peran, Gantt lebih enak dilihat, tugas simple & minimalis.
- [ ] Guide: halaman `/guide` berisi panduan per modul & per peran + pencarian cepat (client-side).
- [ ] Dhana: tombol pojok kiri bawah, panel chat, endpoint server `/api/dhana` → Gemini (REST), konteks = isi Guide + identitas Dhana + Kabinet Vardhana; rate limit; kunci hanya di server.
- [ ] Report bug: tabel + storage privat + RLS, form (deskripsi + screenshot opsional), halaman Admin dengan status, pelapor melihat statusnya.
- [ ] Cek lokal: verify, e2e terkait, cek visual 3 lebar (desktop/tablet/HP) — baru push.

**Tahap 2** — rapikan halaman lain (proker, acara, surat, keuangan, form, sekretariat, admin).

## Melanjutkan di komputer lain

1. `git pull` branch `claude/sharp-gates-ngoq4i`.
2. Salin `.env.local` dari laptop ini (berisi kredensial DB dan `GEMINI_API_KEY`) — tidak ada di git.
3. Node 22, `npm install`, `npm run dev`. Baca `HANDOFF.md` lalu dokumen ini; centang progres di atas.

## Progres

- 2026-11-02 — tanya-jawab selesai, `GEMINI_API_KEY` disimpan di `.env.local`.
