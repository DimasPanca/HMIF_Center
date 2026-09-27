# CLAUDE.md — Instruksi Agent untuk HMIF Center

Kamu satu-satunya agent yang mengerjakan project ini. Tidak ada pembagian lane
data/ui — semua file boleh kamu sentuh selama aturan di bawah ditepati.

| | |
|---|---|
| **Repo** | https://github.com/DimasPanca/HMIF_Center |
| **Branch kerja** | `main` (atau `feat/T-XXX` untuk task besar; merge sendiri) |
| **Direktori** | `J:\Software\Web_Project\HMIF_Center` |
| **Framework** | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 |
| **Database** | Supabase (Postgres 16) · Prisma · RLS ganda-lapis |

---

## Baca ini dulu, dalam urutan

1. **`docs/ai/HANDOFF.md`** — state terakhir project, apa yang baru saja selesai, blocker aktif, dan langkah berikutnya. **Selalu baca ini di awal sesi.**
2. **`docs/ai/ARCHITECTURE.md`** — di mana kode apa. Peta direktori + pola per lapisan (DB → service → route → komponen).
3. **`docs/ai/AGENT_RULES.md`** — 12 aturan proses, 30 invariant domain, 15 konvensi kode. **Wajib.**
4. Kontrak task di `docs/ai/tasks/P{fase}-*.md` — **hanya task yang sedang dikerjakan**.
5. Kontrak fitur di `docs/ai/*_CONTRACT.md` bila menyentuh area itu (mis. `AUTH_CONTRACT.md` saat menambah endpoint terautentikasi).

**Jangan** membaca PRD, SYSTEM_DESIGN, USER_FLOW, DESIGN_SYSTEM sekaligus. Setiap kontrak task menyebut bagian mana yang perlu dibaca di field **Baca**.

---

## Loop kerja satu task

```bash
# 1. Ambil task berikutnya dari HANDOFF.md atau docs/ai/tasks.json
# 2. Baca kontraknya di docs/ai/tasks/P{fase}-*.md
# 3. Kerjakan (kode + test + migrasi bila perlu)

# 4. Verifikasi — WAJIB, jangan pernah dilewati
npm run verify              # typecheck + lint + secret-scan + unit
npm run db:test             # bila menyentuh migrasi/RLS
npm run test:e2e -- <fitur> # bila ada gate e2e yang relevan

# 5. Update tasks.json — status -> DONE, isi completed_at

# 6. Commit + push
git add -A
git commit -m "T-0XX: <judul task>"
git push
```

**Satu task = satu commit.** Jangan menggabung dua task dalam satu commit.

Untuk task besar/berisiko, buat branch `feat/T-XXX`, buka PR, lalu merge sendiri
setelah CI hijau. Task kecil (bugfix, doc, refactor lokal) langsung ke `main`.

---

## Batas keras

**Boleh diubah:** semua kode di `app/**`, `components/**`, `lib/**`, `supabase/**`,
`prisma/**`, `scripts/**`, `e2e/**`, konfigurasi (`package.json`, `next.config.ts`,
dll.), dokumentasi di `docs/ai/**`.

**Tidak boleh diubah tanpa permintaan eksplisit** — dokumen produk beku:

```
docs/PRD.md              docs/SYSTEM_DESIGN.md    docs/USER_FLOW.md
docs/DESIGN_SYSTEM.md    docs/AI_EXECUTION_PLAN.md
docs/ai/AGENT_RULES.md   docs/ai/tasks.json       docs/ai/tasks/**
docs/adr/README.md
README.md   Design/**   Template/**
```

Bila menemukan pertentangan antar-dokumen produk → **tulis ADR baru di
`docs/adr/`** (nomor ADR-020…059 tersedia), jangan diam-diam memutuskan.

---

## Standing rules (jangan pernah dilanggar)

Ringkasan cepat; sumber otoritatif = `docs/ai/AGENT_RULES.md`.

- **K-02** — Semua respons API `{ok:true,data}` / `{ok:false,error:{code,message,details?}}`. Pakai `lib/http/respond.ts` (`sukses`, `gagal`).
- **K-04** — Satu skema Zod dipakai form + validasi server (skema di service, di-export, dipakai ulang route + form).
- **K-09** — Setiap mutasi lewat `withAuditContext(req, (tx) => …)`; kalau tidak, `app.ip`/`user_agent`/`periode_id` hilang di baris audit.
- **INV-01/02** — RLS + guard aplikasi, dua lapis. Klien tidak pernah menentukan role.
- **INV-06/07** — `audit_log` append-only. Semua mutasi meninggalkan jejak.
- **INV-08** — Semua data ber-scope periode. Query lintas periode hanya arsip (read-only).
- **Migrasi wajib idempotent dari kosong** — setelah migrasi baru: `npm run db:reset && npm run seed:e2e-auth` untuk verifikasi.
- **Jangan** menambah dependency di luar SYSTEM_DESIGN §2 tanpa ADR.
- **Jangan** commit `.env*`, dump DB, atau file generate ke repo.
- **Jangan** commit `main` yang gagal `npm run verify`. Kalau butuh WIP, pakai branch fitur.

---

## Environment

`.env.local` sudah tersedia di root (tidak di git). Berisi kredensial Supabase,
DB URL, secret sesi. **Jangan pernah cetak/echo isinya ke chat atau commit.**

Cek awal sebelum kerja berat:

```bash
npm run check:env    # variabel env lengkap?
npm run db:ping      # DB terjangkau?
```

Rincian per variabel: `docs/ai/ENV_SETUP.md`.

---

## Format laporan setiap task

```
Task      : T-0XX <judul>
File      : daftar file yang dibuat/diubah
Verifikasi: perintah + output NYATA (bukan asumsi)
Catatan   : penyimpangan, ADR baru, blocker
```

Jangan pernah melaporkan sukses tanpa output verifikasi nyata.

---

## Berhenti dan lapor bila

1. Verifikasi gagal 2× berturut-turut dengan penyebab sama (AGENT_RULES P-04).
2. Task yang mau dikerjakan `depends_on`-nya belum DONE — cek di tasks.json.
3. Butuh dependency di luar SYSTEM_DESIGN §2.
4. Menemukan pertentangan antar-dokumen produk → tulis ADR *Usulan* lalu lapor.
5. Kontrak task bertentangan dengan dirinya sendiri.
