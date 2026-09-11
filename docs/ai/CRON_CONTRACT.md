# Kontrak Cron Harian — T-079

Batas lane `data` ↔ `ui` untuk cron harian. Lane data memiliki logika lifecycle
(`lib/cron/**`) dan jadwalnya (`vercel.json`); lane ui merakit route handler tipis.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-079` (pemilik `lib/cron/**`, `vercel.json`) |
| **Dibaca oleh** | lane `ui` — `T-079-UI` (`app/api/cron/harian/route.ts`) |
| **Gate** | `npm run test -- cron-harian` (unit, milik lane data) |
| **Sumber** | SYSTEM_DESIGN §15.2, §6.5 · ADR-009 |

---

## 1. Route handler (lane ui) — tipis, terotorisasi

Satu-satunya cron (ADR-009 / batas Vercel Hobby). `vercel.json` (lane data) sudah
memuat entrinya:

```json
{ "crons": [ { "path": "/api/cron/harian", "schedule": "0 1 * * *" } ] }
```

`app/api/cron/harian/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { withServiceContext } from '@/lib/db/with-audit-context';
import { jalankanCronHarian, cronTerotorisasi } from '@/lib/cron/harian';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Verifikasi rahasia LEBIH DULU — endpoint cron publik tanpa penjaga berbahaya.
  if (!cronTerotorisasi(req.headers.get('authorization'))) {
    return NextResponse.json({ ok: false, error: { code: 'TIDAK_BERHAK', message: 'Cron tidak sah.' } }, { status: 401 });
  }
  const ringkasan = await withServiceContext((tx) => jalankanCronHarian(tx));
  return NextResponse.json({ ok: true, data: ringkasan });
}
```

- **Auth:** `cronTerotorisasi(header)` mencocokkan `Authorization: Bearer
  ${CRON_SECRET}`. Bila `CRON_SECRET` tak diset → SELALU tolak (fail-closed).
  Vercel Cron mengirim header ini otomatis bila env `CRON_SECRET` ada. Tanpa
  rahasia yang benar → **401** ("Selesai bila" #3).
- **Konteks:** `withServiceContext` (bukan `withAuditContext`) — cron tak punya
  pengguna; audit tercatat sebagai 'sistem'.
- **Metode:** GET (Vercel Cron memanggil GET). Boleh menambah guard method.

---

## 2. Yang dijalankan `jalankanCronHarian(tx)`

Dalam SATU transaksi:

1. `lepasKunciSelesai(tx)` → fungsi SQL `lepas_kunci_selesai()`:
   - proker BERJALAN yang hari-H terakhirnya lewat → **SELESAI**;
   - `proker_lock` proker SELESAI/DIBATALKAN **dilepas**;
   - proker DISETUJUI yang masa persiapannya tiba → **BERJALAN** (kunci tetap).
2. `cekDeadline(tx)` → meringkas urgensi deadline kartu Kanban (read-only) memakai
   ambang `app_config.deadline_warning_hari` / `deadline_critical_hari`.
3. INSERT `audit_log` (aksi **CRON**, entitas 'proker', user 'sistem', periode
   aktif) berisi ringkasan — jumlah proker yang berubah status ("Selesai bila" #4).

Mengembalikan `RingkasanCron`:

```ts
{ tanggal, tanggal_1, lepas: { jadi_selesai, kunci_dilepas, jadi_berjalan },
  deadline: { mendekati, kritis, terlambat } }
```

**Idempoten (ADR-009):** `lepas_kunci_selesai` dijaga status (dua kali jalan tak
menggandakan transisi), `cekDeadline` read-only. Aman dipanggil berulang.

**Backup bulanan (tanggal 1):** `ringkasan.tanggal_1` menandai tanggal 1 supaya
backup bulanan menyusul di **T-111** — backup-nya BELUM dijalankan di sini
(cabang tanggal-1 sengaja disiapkan tanpa menambah cron kedua).

---

## 3. Env

- `CRON_SECRET` — rahasia bearer untuk memanggil `/api/cron/harian`. Set di Vercel
  Project Settings (Production) dan `.env.local` untuk uji manual. Tanpa ini,
  endpoint menolak semua permintaan.

## 4. Verifikasi yang sudah dijalankan lane data

```
npm run test -- cron-harian     (6 lulus: lepas/deadline/orkestrasi/otorisasi)
smoke DB (ROLLBACK): proker lewat → SELESAI + kunci lepas; persiapan tiba →
  BERJALAN + kunci tetap; audit CRON tercatat.
```
