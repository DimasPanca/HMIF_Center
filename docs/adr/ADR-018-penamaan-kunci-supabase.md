# ADR-018 — Penamaan environment variable kunci Supabase

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-02 |
| **Sumber** | Instruksi pemilik produk, 2 September 2026 |
| **Menggantikan** | SYSTEM_DESIGN.md §20.1 (bagian penamaan kunci Supabase) |
| **Task terkait** | T-003, T-004, T-009, T-044, T-045 |

## Konteks

SYSTEM_DESIGN §20.1 menetapkan dua nama variable untuk kunci Supabase:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
```

Penamaan itu berasal dari sistem kunci lama Supabase, yang menerbitkan JWT berawalan `eyJ` dengan nama peran `anon` dan `service_role`.

Project `hmif-center-dev` yang dibuat pada 1 September 2026 menerbitkan kunci berformat baru:

```
sb_publishable_QoVcRx7UWPej1EYjg-JiKw_MRzHJFg1
sb_secret_...
```

Dashboard, dokumentasi, dan contoh kode Supabase saat ini memakai istilah **publishable key** dan **secret key**. Pemilik produk mengonfirmasi bahwa penamaan yang berlaku sekarang adalah:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Mempertahankan nama `ANON_KEY` untuk nilai yang di dashboard tertulis "Publishable key" memaksa setiap orang menerjemahkan dua istilah di kepala setiap kali menyalin nilai — sumber kesalahan yang tidak perlu, terutama karena tertukarnya kunci publik dan kunci rahasia adalah kesalahan yang konsekuensinya berat.

## Keputusan

Pakai penamaan Supabase yang berlaku sekarang:

| Nama lama (SYSTEM_DESIGN §20.1) | **Nama yang dipakai** | Nilai |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** | `sb_publishable_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | **`SUPABASE_SECRET_KEY`** | `sb_secret_…` |

`NEXT_PUBLIC_SUPABASE_URL` tidak berubah.

Tidak ada alias mundur. Rename dilakukan sekarang, saat belum ada kode aplikasi yang membacanya — menundanya berarti mengubah puluhan berkas kemudian.

## Konsekuensi implementasi

- `.env.example`, `.env.local`, `scripts/check-env.ts`, `scripts/db-ping.ts`, `docs/ai/ENV_SETUP.md`, dan `docs/ai/PROVISIONING_CHECKLIST.md` memakai nama baru.
- Aturan **K-08** pada AGENT_RULES sekarang berbunyi: `SUPABASE_SECRET_KEY` tidak boleh diimpor di berkas ber-`"use client"`. Larangannya tidak berubah, hanya namanya.
- Aturan ESLint pada T-010 melarang import `SUPABASE_SECRET_KEY` di client component.
- SYSTEM_DESIGN §20.1 **tidak diedit**. Dokumen produk tetap utuh sebagai catatan sejarah; ADR inilah yang berlaku bila keduanya berbeda, sesuai hierarki kebenaran AGENT_RULES §0.
- Pembagian peran kunci **tidak berubah sedikit pun**: publishable menghormati RLS dan boleh sampai ke browser; secret melewati RLS dan hanya boleh di server.

### Catatan tambahan: endpoint verifikasi berbeda per jenis kunci

Publishable key **ditolak HTTP 401 di `/rest/v1/`** dengan pesan *"Only secret API keys can be used for this endpoint"*. Itu perilaku by design endpoint spec OpenAPI, bukan tanda kunci salah.

`scripts/db-ping.ts` karena itu menguji:

| Kunci | Endpoint uji | Alasan |
|---|---|---|
| Publishable | `/auth/v1/settings` | Jalur yang memang dipakai dari browser |
| Secret | `/rest/v1/` | Endpoint yang memang mensyaratkan secret key |
