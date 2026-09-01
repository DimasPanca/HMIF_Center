# docs/ai — Berkas Kerja untuk AI Agent

Folder ini berisi semua yang dibutuhkan AI Agent untuk membangun HMIF Center tanpa menebak.
Dokumen produk aslinya (PRD, System Design, User Flow, Design System) tetap ada di `docs/` dan **tidak diubah**.

## Urutan baca saat memulai sesi

| # | Berkas | Kapan dibaca |
|---|---|---|
| 1 | [AGENT_RULES.md](AGENT_RULES.md) | **Selalu**, di awal setiap sesi. Aturan proses (P), invariant domain (INV), konvensi kode (K). |
| 2 | [tasks.json](tasks.json) | **Selalu**. Cari task berstatus `READY` berikutnya. Ini satu-satunya sumber kebenaran progres. |
| 3 | [../AI_EXECUTION_PLAN.md](../AI_EXECUTION_PLAN.md) | Sekali di awal, lalu saat pindah fase. Protokol, keputusan terkunci, gerbang antar-fase. |
| 4 | `tasks/P{n}-*.md` | Hanya fase yang sedang dikerjakan. |
| 5 | Dokumen di field **Baca** milik task | Hanya bagian yang ditunjuk, bukan dokumen utuh. |

## Isi folder

```
docs/ai/
├── README.md              ← berkas ini
├── AGENT_RULES.md         ← aturan mengikat (P, INV, K)
├── tasks.json             ← 116 task + dependensi + status + gerbang
└── tasks/
    ├── P0-prasyarat.md          8 task   repo, ADR, aset, template
    ├── P1-fondasi.md           45 task   DB, RLS, audit, auth, design system, shell
    ├── P2-persuratan.md        11 task   9 jenis surat, penomoran atomik, DOCX
    ├── P3-proker-gantt.md      15 task   anti-bentrok, wizard, Master Gantt live
    ├── P4-kanban.md             4 task   kanban, checklist, kendala, deadline
    ├── P5-kepanitiaan-rab.md   10 task   ruang acara, RAB web, export Excel
    ├── P6-tor-proposal.md       3 task   TOR & Proposal generator
    ├── P7-nota-lpj.md           9 task   pipeline gambar, nota, LPJ otomatis
    ├── P8-kesekretariatan.md    4 task   notulensi, pengurus, ruangan
    └── P9-rilis.md              7 task   backup, restore, hardening, UAT
```

## Berkas yang akan dibuat oleh task (belum ada sekarang)

Berkas berikut **dihasilkan** oleh task tertentu dan menjadi rujukan task berikutnya:

| Berkas | Dibuat oleh | Dipakai oleh |
|---|---|---|
| `ENV_SETUP.md` | T-003 | T-004 |
| `PROVISIONING_CHECKLIST.md` | T-004 | manusia |
| `TEMPLATE_MAPPING.md` | T-006 | T-055, T-061, T-095 |
| `RAB_CELL_MAP.md` | T-007 | **T-090** (export Excel) |
| `SEED_DATA.md` | T-008 | **T-042** (seed) |
| `DB_TEST_MATRIX.md` | T-036 | T-113 |
| `RLS_TEST_MATRIX.md` | T-039 | T-113 |
| `UJI_CETAK.md` | T-099 | gerbang P7 → P9 |
| `SECURITY_AUDIT.md` | T-113 | rilis |
| `PERFORMANCE_REPORT.md` | T-114 | rilis |
| `A11Y_REPORT.md` | T-115 | rilis |
| `UAT_SKENARIO.md`, `UAT_HASIL.md` | T-116 | rilis |
| `BACKLOG.md` | T-109 (dan kapan pun ada ide di luar cakupan) | perencanaan pasca-MVP |

## Aturan singkat yang paling sering dilanggar

1. **Satu task per sesi.** Jangan menggabung dua task karena "sekalian".
2. **Verifikasi dijalankan, bukan diasumsikan.** Lampirkan output nyata di laporan.
3. **Jangan menambah dependency** di luar SYSTEM_DESIGN §2.
4. **Jangan melonggarkan constraint** supaya build lolos.
5. **Ambiguitas → cek Keputusan Terkunci dulu** (AI_EXECUTION_PLAN §2), baru bertanya. Jangan mengarang default.
