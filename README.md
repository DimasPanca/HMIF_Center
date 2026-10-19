# HMIF Center

**Sistem E-Administrasi Himpunan Mahasiswa Informatika FT UNTIRTA**

HMIF Center adalah platform e-administrasi terpadu yang menggantikan alur kerja manual berbasis Word, Excel, dan Google Drive yang tersebar menjadi satu sumber kebenaran: perencanaan program kerja dengan pencegahan bentrok jadwal antar-departemen secara otomatis, visualisasi timeline lewat Master Gantt di halaman utama, administrasi persuratan dengan penomoran otomatis anti-duplikat dan generate dokumen dari template resmi, manajemen kepanitiaan acara besar, serta pelaporan keuangan dengan RAB terstruktur, nota ter-scan berkualitas cetak, dan kalkulasi LPJ otomatis.

| | |
|---|---|
| **Status** | Fase 9 — rilis: fitur lengkap, menunggu UAT bersama pengurus ([UAT_SKENARIO](docs/ai/UAT_SKENARIO.md)) |
| **Stack** | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, Storage, Realtime) · Prisma |
| **Hosting** | Vercel region `sin1` + Supabase Singapura |

---

## Panduan pengguna

Satu panduan per peran, dengan langkah bernomor dan tangkapan layar:

| Peran | Panduan |
|---|---|
| Admin | [docs/panduan/admin.md](docs/panduan/admin.md) |
| Ketua Umum | [docs/panduan/ketua.md](docs/panduan/ketua.md) |
| Wakil Ketua | [docs/panduan/wakil.md](docs/panduan/wakil.md) |
| Sekretaris Umum | [docs/panduan/sekum.md](docs/panduan/sekum.md) |
| Bendahara Umum | [docs/panduan/bendum.md](docs/panduan/bendum.md) |
| Kepala Departemen | [docs/panduan/kadept.md](docs/panduan/kadept.md) |
| Anggota & panitia | [docs/panduan/anggota.md](docs/panduan/anggota.md) |
| BPH | [docs/panduan/bph.md](docs/panduan/bph.md) |

Tangkapan layarnya dibuat ulang dengan `npx tsx scripts/tangkap-panduan.ts`
(menyemai data demo, memotret, lalu membersihkannya).

---

## Menjalankan secara lokal

### Prasyarat

- **Node.js 22** (`.nvmrc`; di Node 20 sebagian test storage gagal palsu)
- Project Supabase dengan schema `extensions` berisi `uuid-ossp`, `btree_gist`,
  `pg_trgm`, serta bucket storage `private` (privat) dan `public`
- Berkas `.env.local` — salin dari [`.env.example`](.env.example), isi mengikuti
  [docs/ai/ENV_SETUP.md](docs/ai/ENV_SETUP.md)

### Langkah

```bash
npm install
npm run check:env                    # semua variabel wajib terisi?
npm run db:ping                      # database terjangkau?
npm run db:reset                     # seluruh migrasi dari kosong + seed referensi (HAPUS isi DB dev)
npm run seed:e2e-auth                # akun uji per peran (wajib setelah db:reset)
npx tsx scripts/upload-templates.ts  # template DOCX/XLSX ke storage (wajib setelah db:reset)
npm run dev                          # http://localhost:3000
```

Akun uji dan kata sandinya dicetak oleh `seed:e2e-auth`. Data pengurus contoh
untuk mencoba surat massal dan notulensi: `npx tsx scripts/seed-pengurus-contoh.ts`.

### Pemeriksaan

```bash
npm run verify                # typecheck + lint + scan rahasia + unit test (wajib hijau sebelum commit)
npm run db:test               # test SQL & RLS
npm run test:e2e -- <fitur>   # gate Playwright (desktop + ponsel 375 px)
npx tsx scripts/bench-all.ts  # 10 metrik performa pada build produksi (npm run build && npm start dulu)
```

---

## Deploy

1. **Vercel** — hubungkan repositori; region `sin1` dan cron harian
   (`/api/cron/harian`, 01.00 UTC) sudah ditetapkan di [`vercel.json`](vercel.json).
   Isi environment variable Production & Preview sesuai
   [ENV_SETUP §7](docs/ai/ENV_SETUP.md) (`DATABASE_URL` lewat transaction pooler
   port 6543, `CRON_SECRET`, kunci Supabase, `NEXT_PUBLIC_APP_URL`, …).
2. **Migrasi** dijalankan manual dari mesin pengembang, bukan saat build:
   `npm run db:migrate` dengan `DIRECT_URL` produksi.
3. **Template** diunggah sekali per lingkungan: `npx tsx scripts/upload-templates.ts`.
4. **PDF surat (opsional)** — DOCX selalu tersedia; PDF butuh Gotenberg
   ([GOTENBERG_SETUP](docs/ai/GOTENBERG_SETUP.md)), lalu `PDF_ENABLED=true`.
5. **Backup** otomatis bulanan berjalan dari cron yang sama; backup manual dan
   restore ada di menu Administrasi.
6. Setelah deploy: siapkan periode pertama dan akun Admin pertama lewat jalur
   bootstrap yang dijalankan pemegang kredensial database (tidak ada pendaftaran
   in-app — lihat [PERIODE_CONTRACT §7](docs/ai/PERIODE_CONTRACT.md)), lalu
   Admin mengundang pengurus ([admin.md](docs/panduan/admin.md)).

---

## Dokumentasi

### Dokumen produk (sumber kebenaran)

| Dokumen | Isi |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Ruang lingkup, persona, permission matrix, spesifikasi fungsional 16 modul, acceptance criteria |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Arsitektur, skema database, RLS, algoritma anti-bentrok, penomoran surat, pipeline gambar, API |
| [docs/USER_FLOW.md](docs/USER_FLOW.md) | Peta navigasi, alur tiap peran, matriks state transition, peta rute |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Token warna, tipografi, spacing, komponen, spesifikasi Gantt, aksesibilitas |

### Dokumen eksekusi & operasional

| Dokumen | Isi |
|---|---|
| [docs/AI_EXECUTION_PLAN.md](docs/AI_EXECUTION_PLAN.md) | Protokol eksekusi, keputusan terkunci, peta fase, gerbang antar-fase |
| [docs/ai/HANDOFF.md](docs/ai/HANDOFF.md) | Keadaan terakhir project, blocker aktif, jebakan lingkungan |
| [docs/ai/ARCHITECTURE.md](docs/ai/ARCHITECTURE.md) | Peta direktori dan pola per lapisan |
| [docs/ai/AGENT_RULES.md](docs/ai/AGENT_RULES.md) | Aturan proses, invariant domain, konvensi kode |
| [docs/ai/ENV_SETUP.md](docs/ai/ENV_SETUP.md) | Mengisi `.env.local` dan environment Vercel |
| [docs/ai/tasks.json](docs/ai/tasks.json) · [docs/ai/tasks/](docs/ai/tasks/) | Status dan kontrak 116 task per fase P0–P9 |
| [docs/adr/](docs/adr/) | Architecture Decision Record |
| [docs/ai/SECURITY_AUDIT.md](docs/ai/SECURITY_AUDIT.md) | Uji penetrasi internal, temuan, mitigasi |
| [docs/ai/A11Y_REPORT.md](docs/ai/A11Y_REPORT.md) | Audit kontras WCAG AA dan aksesibilitas |
| [docs/ai/PERFORMANCE_REPORT.md](docs/ai/PERFORMANCE_REPORT.md) | 10 metrik performa, sebelum/sesudah optimasi |
| [docs/ai/UAT_SKENARIO.md](docs/ai/UAT_SKENARIO.md) · [docs/ai/UAT_HASIL.md](docs/ai/UAT_HASIL.md) | Skenario dan hasil UAT pengurus |
| [docs/ai/GOTENBERG_SETUP.md](docs/ai/GOTENBERG_SETUP.md) · [docs/ai/UJI_CETAK.md](docs/ai/UJI_CETAK.md) | Menyalakan PDF; prosedur uji cetak nota |
| [docs/ai/README.md](docs/ai/README.md) | Indeks lengkap dokumen di `docs/ai/` (kontrak fitur, matriks uji) |

---

## Struktur repositori

```
HMIF_Center/
├── app/             Rute Next.js (halaman + API route handler)
├── components/      Komponen React per fitur
├── lib/             Service, aturan domain, akses data, utilitas
├── supabase/        Migrasi SQL berurutan dan test SQL/RLS
├── prisma/          Skema Prisma dan seed referensi
├── scripts/         Tooling CLI (migrasi, seed, benchmark, backup, tangkapan panduan)
├── e2e/             Gate Playwright per fitur
├── templates/       Template ber-placeholder siap generate
├── public/          Aset statis (logo, kop)
├── docs/            Dokumen produk, panduan pengguna, dokumen eksekusi, ADR
├── Design/          Aset brand sumber (logo)
└── Template/        Template dokumen resmi HMIF asli (.docx, .xlsx, .pdf)
```

---

## Konvensi kontribusi

- Satu task = satu commit, format pesan `T-0XX: <judul task>`
- Perubahan skema database selalu lewat berkas migrasi di `supabase/migrations/`, tidak pernah lewat `prisma db push`
- Setiap mutasi lewat `withAuditContext`; respons API `{ ok, data | error }` lewat `lib/http/respond.ts`
- Rahasia hanya di `.env.local`; berkas `.env*` tidak pernah masuk version control
- Perubahan keputusan arsitektur dicatat sebagai ADR di [docs/adr/](docs/adr/)
