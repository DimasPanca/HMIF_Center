# HMIF Center

**Sistem E-Administrasi Himpunan Mahasiswa Informatika FT UNTIRTA**

HMIF Center adalah platform e-administrasi terpadu yang menggantikan alur kerja manual berbasis Word, Excel, dan Google Drive yang tersebar menjadi satu sumber kebenaran: perencanaan program kerja dengan pencegahan bentrok jadwal antar-departemen secara otomatis, visualisasi timeline lewat Master Gantt di halaman utama, administrasi persuratan dengan penomoran otomatis anti-duplikat dan generate dokumen dari template resmi, manajemen kepanitiaan acara besar, serta pelaporan keuangan dengan RAB terstruktur, nota ter-scan berkualitas cetak, dan kalkulasi LPJ otomatis.

| | |
|---|---|
| **Status** | Dalam pengembangan — Fase 0 (Prasyarat) |
| **Target MVP** | 8 minggu |
| **Stack** | Next.js 15 · TypeScript · Tailwind CSS 4 · PostgreSQL (Supabase) · Prisma |

---

## Dokumentasi

### Dokumen produk (sumber kebenaran)

| Dokumen | Isi |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Ruang lingkup, persona, permission matrix, spesifikasi fungsional 16 modul, acceptance criteria |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Arsitektur, skema database, RLS, algoritma anti-bentrok, penomoran surat, pipeline gambar, API |
| [docs/USER_FLOW.md](docs/USER_FLOW.md) | Peta navigasi, alur tiap peran, matriks state transition, peta rute |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Token warna, tipografi, spacing, komponen, spesifikasi Gantt, aksesibilitas |

### Dokumen eksekusi

| Dokumen | Isi |
|---|---|
| [docs/AI_EXECUTION_PLAN.md](docs/AI_EXECUTION_PLAN.md) | Protokol eksekusi, 17 keputusan terkunci, peta fase, gerbang antar-fase |
| [docs/ai/AGENT_RULES.md](docs/ai/AGENT_RULES.md) | Aturan proses, 30 invariant domain, konvensi kode |
| [docs/ai/tasks.json](docs/ai/tasks.json) | State progres 116 task — satu-satunya sumber kebenaran status |
| [docs/ai/tasks/](docs/ai/tasks/) | Kontrak implementasi tiap task, dikelompokkan per fase P0–P9 |
| [docs/adr/](docs/adr/) | Architecture Decision Record |

---

## Menjalankan project

> Perintah lengkap didefinisikan pada task **T-010**. Bagian ini akan dilengkapi setelah scaffold (T-009) selesai.

```bash
npm install
npm run check:env     # validasi environment variable
npm run db:reset      # jalankan seluruh migrasi dari database kosong
npm run seed          # data referensi (6 departemen, konfigurasi, template)
npm run dev           # server pengembangan
```

### Prasyarat

- Node.js 20 atau lebih baru
- Project Supabase (PostgreSQL 15) dengan extension `btree_gist` dan `pg_trgm` aktif
- Berkas `.env.local` — salin dari [`.env.example`](.env.example), lihat [docs/ai/ENV_SETUP.md](docs/ai/ENV_SETUP.md)

---

## Struktur repositori

```
HMIF_Center/
├── docs/            Dokumen produk, rencana eksekusi, ADR
├── Design/          Aset brand sumber (logo)
├── Template/        Template dokumen resmi HMIF (.docx, .xlsx, .pdf)
└── templates/       Template ber-placeholder siap generate (dibuat pada T-006)
```

---

## Konvensi kontribusi

- Satu task = satu commit, format pesan `T-0XX: <judul task>`
- Perubahan skema database selalu lewat berkas migrasi di `supabase/migrations/`, tidak pernah lewat `prisma db push`
- Rahasia hanya di `.env.local`; berkas `.env*` tidak pernah masuk version control
- Perubahan keputusan arsitektur dicatat sebagai ADR di [docs/adr/](docs/adr/)
