# ENV_SETUP — Cara mengisi `.env.local`

Panduan langkah demi langkah untuk mendapatkan setiap nilai environment variable.
Dibuat oleh **T-003**, dipakai oleh **T-004** (provisioning) dan setiap orang yang menyiapkan mesin baru.

```bash
cp .env.example .env.local
# isi nilainya mengikuti panduan di bawah
npx tsx scripts/check-env.ts     # sebelum scaffold selesai
npm run check:env                # setelah T-010
```

> `.env.local` **tidak pernah** masuk version control. Bila nilainya bocor, ganti (rotate) di dashboard, jangan hanya menghapus berkasnya.

---

## 1. Supabase

Project MVP: **`hmif-center-dev`** · region **Southeast Asia (Singapore)** `ap-southeast-1`.

### 1.1 URL dan API key

Dashboard Supabase → **Project Settings → API Keys**

| Variable | Diambil dari | Catatan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Bentuknya `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Publishable key** | Boleh terekspos ke browser |
| `SUPABASE_SECRET_KEY` | **Secret key** | **RAHASIA.** Melewati seluruh RLS |

> **Format kunci baru.** Project Supabase yang dibuat sejak 2025 menerbitkan kunci berformat
> `sb_publishable_...` dan `sb_secret_...`, menggantikan anon/service_role JWT lama yang diawali `eyJ...`.
> Nama variable-nya sengaja dipertahankan sesuai SYSTEM_DESIGN §20.1 agar tidak ada perubahan kode;
> yang berubah hanya bentuk nilainya. Keduanya diterima `@supabase/supabase-js`.

**Peran kunci — jangan tertukar:**

| Kunci | Menghormati RLS? | Boleh di browser? | Dipakai untuk |
|---|:---:|:---:|---|
| Publishable | Ya | Ya | Auth, Realtime, Storage dari sisi klien |
| Secret | **Tidak** | **Tidak pernah** | Operasi server yang memang harus melewati RLS: seed, backup, cron |

Memakai secret key untuk operasi yang seharusnya lewat RLS adalah pelanggaran AGENT_RULES §4 no.3.

### 1.2 Connection string database

Dashboard Supabase → **Project Settings → Database → Connection string**

Dibutuhkan **dua** nilai berbeda. Menyamakannya membuat migrasi gagal dengan cara yang membingungkan.

| Variable | Mode | Port | Dipakai |
|---|---|:---:|---|
| `DATABASE_URL` | Transaction pooler | **6543** | Runtime aplikasi — banyak koneksi pendek dari serverless |
| `DIRECT_URL` | Session pooler / koneksi langsung | **5432** | Migrasi, `prisma db pull`, skrip administratif |

Bentuknya:

```
# DATABASE_URL — transaction pooler
postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# DIRECT_URL — session pooler
postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

**`<PASSWORD>`** adalah database password yang diketik saat project dibuat — **bukan** API key.
Bila lupa: **Project Settings → Database → Reset database password**. Mereset akan memutus koneksi yang sedang berjalan.

Bila password memuat karakter khusus (`@ : / ? # & %`), lakukan URL-encode. Contoh: `p@ss:1` → `p%40ss%3A1`.

### 1.3 Extension database

Ketiga extension ini **wajib** dan diaktifkan lewat SQL Editor sebelum migrasi pertama.
Tanpa `btree_gist`, seluruh sistem anti-bentrok proker gagal (INV-09).

```sql
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists btree_gist  with schema extensions;
create extension if not exists pg_trgm     with schema extensions;
```

Schema `extensions`, bukan `public` — lihat [ADR-020](../adr/ADR-020-schema-extension.md).

Verifikasi:

```sql
select extname from pg_extension order by extname;
```

### 1.4 Bucket storage

Dashboard Supabase → **Storage → New bucket**

| Bucket | Public? | Isi |
|---|:---:|---|
| `private` | **Tidak** | Seluruh turunan nota (master, preview, thumbnail), TTD, dokumen, template, backup |
| `public` | Ya | Hanya logo, stempel, dan avatar |

> **Turunan nota semuanya privat** — lihat [ADR-011](../adr/ADR-011-privasi-turunan-nota.md).
> Ini menyimpang dari SYSTEM_DESIGN §12.2 yang menaruh preview/thumb di bucket publik.
> Preview dan thumbnail disajikan lewat signed URL berumur 5 menit, bukan URL publik.

---

## 2. Aplikasi

| Variable | Nilai | Cara mendapatkan |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` saat pengembangan | Di produksi: URL deployment Vercel |
| `SCHEMA_VERSION` | `1` | Dinaikkan manual saat skema berubah tidak kompatibel |
| `MAX_UPLOAD_BYTES` | `15728640` | 15 MB, ditetapkan [ADR-014](../adr/ADR-014-batas-upload-nota.md) |

### `CRON_SECRET`

Rahasia acak untuk memverifikasi bahwa request cron benar-benar datang dari Vercel ([ADR-009](../adr/ADR-009-strategi-cron.md)).

```bash
openssl rand -base64 32
```

Nilai yang sama dipasang di **Vercel → Project Settings → Environment Variables**.

---

## 3. Konversi PDF — `PDF_ENABLED`

Diatur [ADR-010](../adr/ADR-010-strategi-pdf.md). **Nilai awal `false`.**

| Nilai | Perilaku sistem |
|---|---|
| `false` | DOCX-only. Opsi PDF tidak dirender di UI, server menolak permintaan PDF dengan pesan jelas |
| `true` | PDF tersedia. Wajib mengisi `GOTENBERG_URL` **atau** `SOFFICE_PATH` |

Jangan mengubah ke `true` sebelum terbukti bahwa teks pada PDF hasil **dapat diseleksi** — bukan hasil rasterisasi.

`GOTENBERG_URL` diperoleh setelah men-deploy Gotenberg sebagai layanan terpisah (Railway atau Fly.io).
Vercel serverless tidak dapat menjalankan LibreOffice, sehingga `SOFFICE_PATH` hanya relevan saat pindah ke VPS.

---

## 4. Google Drive — fase berikutnya

`GDRIVE_ENABLED=false` sampai Service Account HMIF tersedia.
Selama `false`, `GDRIVE_SERVICE_ACCOUNT_JSON` dan `GDRIVE_BACKUP_FOLDER_ID` boleh kosong dan backup tetap tersimpan di Supabase Storage.

---

## 5. Daftar periksa

Sebelum menjalankan migrasi pertama:

- [ ] `.env.local` ada dan **tidak** muncul di `git status`
- [ ] `npx tsx scripts/check-env.ts` melaporkan **LULUS**
- [ ] `DATABASE_URL` dan `DIRECT_URL` **berbeda** (port 6543 vs 5432)
- [ ] Tiga extension terpasang, terverifikasi lewat `select extname from pg_extension`
- [ ] Bucket `private` benar-benar tidak publik — coba buka URL objeknya tanpa token, harus ditolak
- [ ] `SUPABASE_SECRET_KEY` tidak pernah muncul di berkas ber-`"use client"`

## 6. Bila kredensial bocor

1. Dashboard Supabase → **API Keys → Roll** untuk kunci yang bocor.
2. **Database → Reset database password**, lalu perbarui `DATABASE_URL` dan `DIRECT_URL`.
3. Bangkitkan ulang `CRON_SECRET` dan perbarui di Vercel.
4. Periksa `audit_log` untuk aktivitas yang tidak dikenali selama rentang kebocoran.
