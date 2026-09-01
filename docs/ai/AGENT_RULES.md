# AGENT RULES — HMIF Center

**Aturan tetap untuk AI Agent yang mengerjakan project ini.**
Dokumen ini **wajib dibaca di awal setiap sesi**, sebelum task apa pun dikerjakan.

| | |
|---|---|
| **Versi** | 1.0 |
| **Sifat** | Mengikat. Melanggar aturan di sini = task dianggap GAGAL walaupun kodenya jalan. |
| **Induk** | [PRD.md](../PRD.md) · [SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md) · [USER_FLOW.md](../USER_FLOW.md) · [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) |
| **Eksekusi** | [AI_EXECUTION_PLAN.md](../AI_EXECUTION_PLAN.md) · [tasks.json](tasks.json) |

---

## 0. Hierarki Kebenaran

Bila dua sumber bertentangan, urutan yang menang:

```
1. AGENT_RULES.md            (dokumen ini — aturan proses & invariant)
2. AI_EXECUTION_PLAN.md §2   (Keputusan Terkunci)
3. PRD.md                    (kebenaran produk)
4. SYSTEM_DESIGN.md          (kebenaran teknis)
5. USER_FLOW.md              (kebenaran alur layar)
6. DESIGN_SYSTEM.md          (kebenaran visual)
7. Kode yang sudah ada
```

**Jangan pernah** mengubah PRD / SYSTEM_DESIGN / USER_FLOW / DESIGN_SYSTEM tanpa diminta manusia.
Bila menemukan pertentangan baru: tulis ADR di `docs/adr/`, jangan diam-diam memilih sendiri.

---

## 1. Aturan Proses (P)

| ID | Aturan |
|---|---|
| **P-01** | Kerjakan **satu task ID** per sesi kerja. Jangan menggabung dua task. Jangan mengerjakan task yang `depends_on`-nya belum `DONE`. |
| **P-02** | Sebelum menulis kode: baca bagian dokumen yang tertulis di field **Baca** pada task itu. Jangan menebak isi dokumen. |
| **P-03** | Setelah kode ditulis: jalankan **seluruh** perintah di field **Verifikasi**. Task tidak boleh ditandai selesai bila ada perintah yang gagal. |
| **P-04** | Bila verifikasi gagal 2x berturut-turut dengan penyebab yang sama, **berhenti**, tulis laporan kegagalan, jangan menambal dengan cara yang tidak ada di dokumen. |
| **P-05** | Update `docs/ai/tasks.json`: ubah `status` menjadi `DONE` dan isi `completed_at`. Ini satu-satunya sumber kebenaran progres. |
| **P-06** | Satu task = satu commit. Format pesan: `T-0XX: <judul task>`. Jangan commit pekerjaan setengah jadi ke `main`. |
| **P-07** | **Jangan menambah fitur** yang tidak tertulis di task. Ide bagus yang tidak diminta ditulis di `docs/ai/BACKLOG.md`, bukan di kode. |
| **P-08** | **Jangan menambah dependency** di luar daftar SYSTEM_DESIGN §2. Butuh library baru, hentikan task, tulis ADR, minta persetujuan. |
| **P-09** | Bila task terasa ambigu, cari jawabannya berurutan di (1) Keputusan Terkunci, (2) PRD, (3) SYSTEM_DESIGN. Bila tetap tidak ada, **berhenti dan tanya**, jangan mengarang default baru. |
| **P-10** | Jangan menyentuh file di luar daftar **Buat/Ubah** milik task, kecuali file konfigurasi yang memang wajib (mis. menambah script ke `package.json`), dan sebutkan di ringkasan hasil. |
| **P-11** | Jangan menghapus atau melonggarkan test/constraint yang sudah ada supaya build lolos. Constraint yang menghalangi adalah sinyal ada yang salah di kode, bukan di constraint. |
| **P-12** | Laporan akhir tiap task berformat tetap: `Task · File yang berubah · Hasil verifikasi (output nyata) · Catatan/penyimpangan`. Jangan melaporkan sukses tanpa output verifikasi. |

---

## 2. Invariant Domain (INV) — tidak boleh dilanggar oleh kode mana pun

Aturan bisnis yang bila dilanggar merusak nilai inti sistem.

### 2.1 Otorisasi & Data

| ID | Invariant | Sumber |
|---|---|---|
| **INV-01** | Otorisasi ditegakkan di **dua lapis independen**: RLS PostgreSQL + guard aplikasi. Menambah endpoint baru tanpa policy RLS adalah pelanggaran. | SYSTEM_DESIGN §5.1 |
| **INV-02** | Klien **tidak pernah** menentukan role/permission. Role selalu dibaca server-side dari `user_role` pada periode `AKTIF`. | SYSTEM_DESIGN §18.1 |
| **INV-03** | Role `BPH` **tidak pernah** memberi hak tulis. Multi-role memakai *union of permissions*, tetapi BPH restriktif (tidak menambah apa pun). | PRD §4.4 |
| **INV-04** | `BPH` tidak boleh muncul sebagai approver di antrian mana pun. | PRD §5.2 |
| **INV-05** | Approver proker = **Ketua ATAU Wakil** (satu cukup). Approver surat = **Ketua ATAU Wakil ATAU Sekum** (satu cukup). Tidak ada eskalasi/timeout. | PRD §5.2 |
| **INV-06** | `audit_log` bersifat **append-only**. Tidak ada kode yang boleh UPDATE/DELETE baris audit, termasuk milik Admin. | PRD M15 |
| **INV-07** | Setiap operasi tulis (create/update/delete/approve) menghasilkan baris `audit_log` berisi user, IP, user agent, nilai lama, nilai baru. | PRD M15 |
| **INV-08** | Semua data ber-scope **periode**. Query lintas periode hanya untuk mode arsip (read-only). | PRD F-2.1 |

### 2.2 Anti-Bentrok Proker

| ID | Invariant | Sumber |
|---|---|---|
| **INV-09** | Pencegahan bentrok ditegakkan oleh `EXCLUDE USING gist` pada `proker_lock`, **bukan** oleh logika aplikasi. Pengecekan di aplikasi hanya untuk UX. | SYSTEM_DESIGN §6.1 |
| **INV-10** | Hanya proker `TERJADWAL` berstatus `DISETUJUI`/`BERJALAN` yang mengunci kalender. Draft dan yang ditolak tidak mengunci. | PRD F-5.2 R3 |
| **INV-11** | Rentang terkunci = `[tanggal_mulai_persiapan, tanggal_hari_h_selesai]` **inklusif**. Implementasi: `daterange(mulai, selesai + 1, '[)')`. | SYSTEM_DESIGN §6.3 |
| **INV-12** | Durasi persiapan wajib **15–45 hari**, ditegakkan sebagai CHECK constraint di database. Angka ini **tidak** dibuat configurable (ADR-007). | PRD F-5.2 R2 |
| **INV-13** | Perubahan tanggal proker terkunci memicu re-approval + pengecekan konflik ulang; kunci lama dipertahankan sampai revisi diputuskan. | PRD §5.2 no.4 |

### 2.3 Penomoran Surat

| ID | Invariant | Sumber |
|---|---|---|
| **INV-14** | Nomor urut dialokasikan **saat approval**, bukan saat draft dibuat. | PRD F-4.1 |
| **INV-15** | Alokasi nomor **hanya** lewat fungsi database `alokasi_nomor_surat` / `alokasi_nomor_batch` (advisory lock per periode). Dilarang menghitung nomor di TypeScript. | SYSTEM_DESIGN §7.2 |
| **INV-16** | Nomor surat yang dibatalkan **tidak** didaur ulang. Counter tidak pernah mundur. | PRD F-4.3 |
| **INV-17** | Counter reset ke `nomor_surat_awal` (default 1) pada periode baru. | PRD F-4.1 |

### 2.4 Pipeline Gambar (aturan I1–I12 PRD F-11.2)

| ID | Invariant | Sumber |
|---|---|---|
| **INV-18** | Tiga turunan (master/preview/thumb) dibuat **paralel dari satu sumber decode**, tidak berantai. | I1 |
| **INV-19** | Unduhan **selalu** `master_path`, tidak pernah preview/thumbnail, dan **tanpa rekompresi**. | I2, I3 |
| **INV-20** | EXIF orientation dibaca dan dirotasi **sebelum** resize; metadata sensitif (GPS/perangkat) dihapus **setelah** rotasi. | I4, I5 |
| **INV-21** | Validasi MIME memakai **magic bytes**, bukan ekstensi. Nama file storage memakai **UUID**, bukan nama dari user. | I6, I7 |
| **INV-22** | **Tidak pernah upscale**; aspect ratio tidak pernah dipaksa (tidak ada crop 1:1). | I12 |
| **INV-23** | Bila pemrosesan gagal: hapus file parsial, **jangan** buat record DB. | I11 |
| **INV-24** | Komponen tampilan `NotaImage` **tidak boleh punya** varian `master`. Master hanya lewat endpoint unduh. | SYSTEM_DESIGN §9.5 |

### 2.5 RAB & Keuangan

| ID | Invariant | Sumber |
|---|---|---|
| **INV-25** | User **tidak pernah** menyentuh file Excel sebagai input utama. Excel adalah output (import hanya jalur tambahan). | PRD F-9.3 |
| **INV-26** | Kolom `jumlah` disimpan **dua kali**: `jumlah_teks` (tampilan/export identik) dan `jumlah_numerik` (kalkulasi). | PRD F-9.1 |
| **INV-27** | Kalkulasi RAB dijalankan di klien untuk kecepatan, tetapi **wajib diverifikasi ulang di server** sebelum disimpan. | SYSTEM_DESIGN §11.2 |
| **INV-28** | Total alokasi nota **harus sama** dengan total nota saat submit dan verifikasi (trigger DB menjaga batas atas, service menjaga kesamaan). | ADR-006 |
| **INV-29** | RAB terkunci menolak perubahan item **di level RLS**, bukan hanya di UI. Buka kunci wajib beralasan dan tercatat di audit. | PRD F-9.5 |
| **INV-30** | Visibilitas cross-divisi: baca **boleh**, tulis **tidak**. Tombol edit untuk divisi lain **tidak dirender** (bukan sekadar disabled). | PRD F-8.3 |

---

## 3. Konvensi Kode (K)

| ID | Konvensi |
|---|---|
| **K-01** | Bahasa antarmuka dan pesan error ke user: **Bahasa Indonesia**. Nama variabel/fungsi mengikuti nama domain di skema DB (`proker`, `kepanitiaan`, `nomorUrut`). |
| **K-02** | Bentuk respons API **selalu** `{ ok: true, data }` atau `{ ok: false, error: { code, message, details? } }`. Tidak ada bentuk lain. |
| **K-03** | Kode error SCREAMING_SNAKE: `KONFLIK_JADWAL`, `NOMOR_TERPAKAI`, `RAB_TERKUNCI`, `TIDAK_BERWENANG`, `VALIDASI_GAGAL`, `FILE_TIDAK_VALID`, `ALOKASI_TIDAK_SEIMBANG`. |
| **K-04** | Satu skema Zod dipakai bersama form klien **dan** validasi server. Dilarang menulis dua skema untuk entitas yang sama. |
| **K-05** | **Tidak ada nilai hex mentah** di komponen. Semua warna lewat CSS variable / token Tailwind dari DESIGN_SYSTEM §2. |
| **K-06** | Default halaman adalah **React Server Component**. Tambahkan `"use client"` hanya bila butuh state/efek/event. |
| **K-07** | Query berat atau kritis (anti-bentrok, penomoran, agregasi Gantt) memakai **raw SQL / fungsi DB**, bukan ORM chaining. |
| **K-08** | Secret hanya di environment variable. `SUPABASE_SERVICE_ROLE_KEY` **tidak boleh** diimpor di file client component. |
| **K-09** | Setiap mutasi lewat `withAuditContext()` agar `app.ip`, `app.user_agent`, `app.periode_id` terisi. |
| **K-10** | Import path memakai alias `@/`. Tidak ada `../../../`. |
| **K-11** | Komentar kode seperlunya dan dalam Bahasa Indonesia; jelaskan **kenapa**, bukan **apa**. |
| **K-12** | Format tanggal `Senin, 06 Oktober 2025`; rupiah `Rp1.740.000`; bulan romawi `X`. Selalu lewat `lib/utils/*`, tidak pernah inline. |
| **K-13** | Animasi hanya yang diizinkan DESIGN_SYSTEM §6.2 (durasi 120–180 ms). Dilarang animasi dekoratif, parallax, transisi lebih dari 250 ms. |
| **K-14** | Dimensi komponen: tinggi tombol/input **34px**, baris tabel **36px**, radius **6px** (DESIGN_SYSTEM §8). |
| **K-15** | Status **tidak boleh** disampaikan hanya lewat warna. Selalu ada teks atau ikon pendamping (WCAG). |

---

## 4. Larangan Keras

1. Jangan menulis logika permission di komponen klien sebagai satu-satunya penjaga.
2. Jangan membuat endpoint yang menerima `role` atau `departemen_id` dari body request untuk menentukan hak akses.
3. Jangan memakai `service_role` key untuk operasi yang seharusnya lewat RLS user.
4. Jangan menyimpan file gambar/dokumen dengan nama asli dari user di storage.
5. Jangan meng-hardcode `UN43.3.7`, `HMIF`, `Cilegon` di komponen. Ambil dari `app_config`.
6. Jangan mengubah urutan atau isi kolom Excel export. Harus identik dengan `Template/RAB_Template.xlsx`.
7. Jangan menonaktifkan RLS "sementara" untuk debugging. Bila perlu, pakai koneksi admin terpisah di script test.
8. Jangan commit `.env*`, dump database, atau file hasil generate ke repo.

---

## 5. Definisi "Selesai" Global

Sebuah task hanya boleh berstatus `DONE` bila **semua** ini benar:

- [ ] Seluruh item di field **Kontrak** task terimplementasi.
- [ ] Seluruh perintah di field **Verifikasi** dijalankan dan **lulus**, dengan output nyata (bukan asumsi).
- [ ] `npm run verify` lulus (typecheck + lint + unit test).
- [ ] Tidak ada invariant §2 yang dilanggar.
- [ ] `docs/ai/tasks.json` sudah diperbarui.
- [ ] Commit dibuat dengan format `T-0XX: <judul>`.
