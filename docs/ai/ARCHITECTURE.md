# ARCHITECTURE.md — Peta kode HMIF Center

Panduan **di mana kode apa** dan **pola per lapisan**. Baca ini sebelum mulai
menulis di area yang belum kamu sentuh.

Sumber otoritatif untuk **kenapa** = `docs/SYSTEM_DESIGN.md`. Berkas ini hanya
peta dari kode yang sudah ada.

---

## 1. Peta direktori (top-level)

```
app/                Next.js App Router — halaman & route API
  (auth)/           halaman login (public)
  (dashboard)/      halaman terautentikasi (layout + sidebar + header)
  api/              route handler HTTP (tipis; delegasi ke lib/*)
  qa/               harness manual (bench, Gantt, dsb.)
  layout.tsx        root layout (font, tema, error boundary)
  globals.css       Tailwind v4 + variabel tema

components/         React components (client + server, dibagi per fitur)
  audit/            viewer audit log
  dashboard/        widget ringkasan role-aware
  gantt/            editor & tampilan Gantt SVG
  kanban/           board, kartu, modal (schema Zod bareng service)
  layout/           sidebar, header, breadcrumb
  proker/           form wizard, kalender, detail
  shared/           komponen lintas fitur (toast, dialog, empty state)
  ui/               primitif tak-berkonteks (button, input, dsb.)

lib/                Kode server & shared — inti aplikasi
  auth/             guard, permissions matrix, session, rate-limit
  backup/           backup tiga lapis (manifest+checksum, modul JSON & dump, arsip ber-volume), retensi, restore bertahap
  cron/             scheduler tugas berkala
  db/               Prisma client + withAuditContext (WAJIB semua mutasi)
  documents/        renderer DOCX generik (dipakai lpj/proposal/tor/surat)
  gantt/            geometri & agregasi (pure functions)
  http/             respond.ts — satu-satunya perakit K-02
  images/           pipeline gambar sisi klien (magic-byte, EXIF, resize)
  import/           import CSV/Excel
  kanban/           service Kanban
  kepanitiaan/      service Kepanitiaan
  lpj/              service LPJ
  notulensi/        service Notulensi (sanitasi TipTap, DOCX, action item)
  periode/          service Periode
  proker/           service Proker (anti-bentrok, approval)
  proposal/         service Proposal
  rab/              service RAB (kalkulasi + import Excel)
  security/         rate-limit (tabel batas §18.3, edge-safe) + sanitize (pintu tunggal)
  realtime/         hook Supabase realtime (setAuth JWT wajib)
  storage/          adapter Supabase Storage
  surat/            service Surat + penomoran (advisory lock)
  tor/              service TOR
  utils/            format tanggal, rupiah, bulan romawi (K-12)
  utils.ts          helper micro (cn, dsb.)
  theme.ts          token warna (jangan hex mentah di komponen — K-05)

supabase/
  migrations/       001..027 — SQL biasa, sequential, checksum, idempotent
  tests/            001..027 SQL test (SET LOCAL ROLE authenticated + RLS)

prisma/
  schema.prisma     ditarik dari DB via `npm run db:pull`
  seed.ts           seed dasar (departemen, role, contoh proker)

scripts/            tooling CLI (tsx)
  db.ts             migrate / reset / status
  db-test.ts        runner test SQL
  db-ping.ts        cek koneksi
  check-env.ts      validasi .env lengkap
  check-secrets.ts  scan file client tak boleh impor secret
  seed-e2e-auth.ts  buat akun test e2e (WAJIB setelah db:reset)
  bench-gantt.ts    benchmark render Gantt
  rls-coverage.ts   ringkas coverage RLS
  verify-backup.ts  periksa ulang bundel backup (`--jalankan` = buat dulu)
  e2e-restore.ts    uji restore penuh/per modul di transaksi yang di-rollback
  security-scan.ts  uji penetrasi internal T-113 (butuh server berjalan) — docs/ai/SECURITY_AUDIT.md

e2e/                Playwright — satu file per fitur
  fixtures/         akun + helper setup/reset
  *.spec.ts         gate integrasi
  playwright.config.ts (di root)

templates/          template DOCX (`{...}` docxtemplater; jangan edit)

docs/
  PRD.md, SYSTEM_DESIGN.md, USER_FLOW.md, DESIGN_SYSTEM.md   BEKU
  AI_EXECUTION_PLAN.md, ai/AGENT_RULES.md                    BEKU
  ai/tasks.json, ai/tasks/**                                 BEKU
  ai/*_CONTRACT.md                                            kontrak fitur
  ai/HANDOFF.md                                               state terakhir
  ai/ARCHITECTURE.md                                          berkas ini
  ai/BACKLOG.md                                               ide out-of-scope
  ai/ENV_SETUP.md                                             daftar env var
  adr/ADR-*.md                                                keputusan
```

---

## 2. Lapisan & pola

Data mengalir **DB → service → route → komponen**. Setiap lapisan punya tugas
yang jelas — jangan campur.

### 2.1 Database (`supabase/migrations/*.sql`)

- **Sequential + checksum.** File baru urut nomor (027 → 028); jangan sisipkan
  di tengah. `scripts/db.ts` menyimpan checksum; migrasi yang berubah setelah
  applied = error.
- **Idempotent dari kosong.** Setiap migrasi baru wajib jalan dari `db:reset`.
  Uji: `npm run db:reset && npm run seed:e2e-auth`.
- **RLS dua lapis.** Setiap tabel yang menyimpan data pengguna wajib punya
  policy INSERT/UPDATE/DELETE/SELECT dengan SECURITY DEFINER helper
  (`has_role`, `my_departemen`, `periode_aktif`, `kanban_boleh_tulis`,
  `notulensi_boleh_tulis`, dsb.).
- **Uji negatif wajib.** File `supabase/tests/NNN_*.sql` dengan
  `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)`
  membuktikan RLS menolak akses yang tidak berwenang.

### 2.2 Service (`lib/<fitur>/`)

Satu fitur = satu folder di `lib/`. Isinya:

- **`service.ts`** — fungsi bisnis. Signature standar:

  ```ts
  export async function <verb><Entitas>(
    tx: TxKlien,           // dari withAuditContext
    konteks: Konteks,      // dari guard (userId, roles, periodeId, departemenIds)
    input: <SkemaInput>,   // Zod-validated di dalam fungsi
  ): Promise<Hasil<T>>;    // { ok: true, nilai } | { ok: false, kode, pesan, details? }
  ```

- **Skema Zod di-export** — dipakai ulang oleh route handler + form klien (K-04).
- **Kode gagal + peta HTTP** — `STATUS_GAGAL_<fitur> = { TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403, TIDAK_VALID: 422, KONFLIK: 409 }`, di-export.
- **Lingkup dipaksakan di JS**, karena koneksi app (`withAuditContext`) bypass
  RLS. RLS hanya menjaga akses langsung/authenticated.
- **Raw SQL untuk query berat** — `tx.$queryRaw` / `$executeRaw` (K-07).
- **`__tests__/*.test.ts`** — unit test service dengan Prisma tiruan.

Contoh: `lib/notulensi/service.ts` + `lib/notulensi/__tests__/notulensi.test.ts`.

### 2.3 Route (`app/api/<fitur>/route.ts`)

Route handler **tipis** — hanya perakit HTTP. Pola wajib:

```ts
import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { <verb><Entitas>, STATUS_GAGAL_<FITUR> } from '@/lib/<fitur>/service';

export async function POST(request: Request) {
  const guard = await requirePermission('<fitur>.<aksi>');
  if (!guard.ok) return responsGuard(guard.nilai);

  const body = await request.json();
  const hasil = await withAuditContext(request, (tx) =>
    <verb><Entitas>(tx, guard.konteks, body),
  );

  return hasil.ok
    ? sukses(hasil.nilai, { status: 201 })
    : gagal(hasil.kode, hasil.pesan, {
        status: STATUS_GAGAL_<FITUR>[hasil.kode],
        details: hasil.details,
      });
}
```

**Jangan** menaruh logika bisnis di route. Kalau tergoda, extract ke service.

### 2.4 Komponen (`components/<fitur>/`, `app/(dashboard)/…/page.tsx`)

- **Default Server Component.** Tambah `"use client"` hanya bila butuh state,
  effect, event handler, atau hook (K-06).
- **Skema Zod dari service.** Import skema dari `lib/<fitur>/service.ts`; jangan
  redefine (K-04).
- **`data-testid` wajib** untuk elemen yang dites e2e — daftarnya di kontrak
  fitur (`docs/ai/*_CONTRACT.md`).
- **Warna via token Tailwind / CSS variable.** Nol hex mentah (K-05).
- **Dimensi standar** — tombol/input 34px, baris tabel 36px, radius 6px (K-14).

---

## 3. Menambah fitur baru — checklist

1. **Migrasi** — `supabase/migrations/NNN_<fitur>.sql` (nomor berikutnya).
   Tabel + RLS + helper SECURITY DEFINER + trigger audit.
2. **Test SQL** — `supabase/tests/NNN_<fitur>.sql`. Kasus positif + negatif.
3. **Service** — `lib/<fitur>/service.ts` (skema Zod, kode gagal, lingkup di JS).
4. **Unit test service** — `lib/<fitur>/__tests__/<fitur>.test.ts`.
5. **Guard permission** — tambah entry di `lib/auth/permissions.ts` +
   `lingkupUntuk` bila lingkup beda per role.
6. **Route** — `app/api/<fitur>/route.ts` (dan sub-path). Tipis, delegasi.
7. **Kontrak fitur** — `docs/ai/<FITUR>_CONTRACT.md`: bentuk data, kode→HTTP,
   izin per role, data-testid wajib.
8. **Halaman + komponen** — `app/(dashboard)/…` + `components/<fitur>/`.
9. **Gate e2e** — `e2e/<fitur>.spec.ts`. Skip-until-UI (fs.existsSync) selama
   route/komponen belum ada.
10. **Verifikasi lengkap**:
    ```bash
    npm run db:reset && npm run seed:e2e-auth
    npm run db:test
    npm run verify
    npm run test:e2e -- <fitur>
    ```
11. **Update `docs/ai/tasks.json`** (status DONE + completed_at) dan
    `docs/ai/HANDOFF.md` (bila ada keputusan baru).

---

## 4. Kontrak K-02 (bentuk respons API)

Satu-satunya bentuk. Dirakit **hanya** oleh `lib/http/respond.ts`.

```ts
// Sukses
{ ok: true, data: <apa pun> }

// Gagal
{ ok: false, error: { code: 'SCREAMING_SNAKE', message: 'Bahasa Indonesia', details?: unknown } }
```

Kode error standar: `TIDAK_DITEMUKAN` (404), `TIDAK_BERWENANG` (403),
`TIDAK_VALID` (422), `KONFLIK` (409), `RAB_TERKUNCI`, `NOMOR_TERPAKAI`,
`KONFLIK_JADWAL`, `FILE_TIDAK_VALID`, `ALOKASI_TIDAK_SEIMBANG`, `VALIDASI_GAGAL`.

---

## 5. Kontrak audit (K-09)

Setiap mutasi wajib lewat `withAuditContext(request, (tx) => …)`. Fungsi ini:

1. Membuka transaksi Prisma.
2. Set config `app.ip`, `app.user_agent`, `app.periode_id` di sesi Postgres.
3. Trigger `audit_log` (per tabel) membaca config itu untuk mengisi baris.
4. Rollback otomatis bila `tx` throw.

Bila lupa `withAuditContext`, `audit_log` menyimpan `NULL` di kolom-kolom itu →
INV-07 dilanggar → task GAGAL.

---

## 6. Cara membaca task

```
docs/ai/tasks.json                  daftar semua task, status, dependency
docs/ai/tasks/P{fase}-*.md          kontrak per task (Baca / Buat / Ubah /
                                     Kontrak / Verifikasi)
```

Kolom **Baca** menyebut persis bagian dokumen produk yang perlu dibaca — jangan
baca lebih. Kolom **Kontrak** = definition of done. Kolom **Verifikasi** =
perintah wajib jalan sebelum menandai DONE.

---

## 7. ADR — kapan menulisnya

Tulis ADR baru di `docs/adr/ADR-0XX-<judul-kebab>.md` bila:

- Menemukan pertentangan antar dokumen produk.
- Membuat keputusan yang menyimpang dari PRD/SYSTEM_DESIGN yang masuk akal.
- Menambah dependency baru.
- Mengubah pola arsitektur yang berdampak di banyak file.

Rentang nomor ADR-020 s.d. ADR-059 tersedia. **Jangan** sentuh
`docs/adr/README.md` (indeks disusun manusia).

Sertakan: **Status** (Usulan / Diterima / Ditolak / Digantikan),
**Konteks**, **Keputusan**, **Konsekuensi**.
