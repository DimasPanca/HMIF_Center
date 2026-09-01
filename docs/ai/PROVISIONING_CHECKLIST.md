# PROVISIONING_CHECKLIST — Layanan Eksternal

Dibuat oleh **T-004**. Mencatat apa yang sudah beres, apa yang masih perlu tindakan manusia, dan **cara memverifikasi** tiap langkah — bukan sekadar mengklaimnya beres.

Verifikator tunggal untuk seluruh berkas ini:

```bash
npx tsx scripts/db-ping.ts
```

---

## Ringkasan status

| # | Langkah | Status | Diverifikasi dengan |
|:-:|---|---|---|
| 1 | Project Supabase `hmif-center-dev` | **Selesai** | `db-ping` — secret key diterima HTTP 200 |
| 2 | API key masuk `.env.local` | **Selesai** | `db-ping` — publishable & secret key keduanya diterima |
| 3 | Bucket `private` + `public` | **Selesai** | uji unggah/baca: tanpa auth ditolak, signed URL berhasil |
| 4 | **Database password → `DATABASE_URL` / `DIRECT_URL`** | **MENUNGGU MANUSIA** | `db-ping` — pemeriksaan Postgres masih `DILEWATI` |
| 5 | **Extension `btree_gist`, `pg_trgm`, `uuid-ossp`** | **MENUNGGU** (butuh langkah 4) | `db-ping` — pemeriksaan extension |
| 6 | Project Vercel + hubungkan repo | Belum | Deployment preview hidup |
| 7 | Gotenberg (konversi PDF) | **Opsional** — dilewati | `PDF_ENABLED=false` ([ADR-010](../adr/ADR-010-strategi-pdf.md)) |

---

## 1. Project Supabase — **selesai**

| Item | Nilai |
|---|---|
| Nama | `hmif-center-dev` |
| Region | Southeast Asia (Singapore) · `ap-southeast-1` |
| Compute | Nano (tier gratis) |
| URL | `https://szashcqawyhpvlvdtskq.supabase.co` |

Pengaturan Security saat pembuatan project — ketiganya sesuai arsitektur sistem:

- **Enable Data API** — dibutuhkan `@supabase/supabase-js` untuk Auth, Realtime, dan Storage.
- **Enable automatic RLS** — jaring pengaman: tabel baru otomatis ber-RLS, sejalan dengan INV-01. Tidak bentrok dengan migrasi yang juga menjalankan `ENABLE ROW LEVEL SECURITY` (idempoten).
- **Automatically expose new tables** — aman, karena RLS adalah penjaga sebenarnya: tabel tanpa policy menolak seluruh akses (deny by default, kontrak T-038).

> **Project staging belum dibuat.** SYSTEM_DESIGN §20.2 meminta project terpisah untuk UAT. Ulangi seluruh langkah di berkas ini dengan nama `hmif-center-staging` saat memasuki fase P9.

---

## 2. API key — **selesai**

Tersimpan di `.env.local` (tidak masuk version control).

| Variable | Jenis kunci | Peran |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` | Menghormati RLS, boleh dipakai di browser |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…` | **Melewati RLS**, server-only |

**Catatan penting soal endpoint verifikasi.** Publishable key **ditolak 401 di `/rest/v1/`** dengan pesan *"Only secret API keys can be used for this endpoint"*. Itu perilaku by design untuk endpoint spec OpenAPI, **bukan** tanda kuncinya salah. `db-ping` karena itu menguji publishable key lewat `/auth/v1/settings`, jalur yang memang dipakai dari browser.

Jangan menyimpulkan kunci rusak sebelum menguji di endpoint yang tepat.

---

## 3. Bucket storage — **selesai**

| Bucket | Public | Isi |
|---|:---:|---|
| `private` | **tidak** | Seluruh turunan nota (master, preview, thumbnail), TTD, dokumen, template, backup |
| `public` | ya | Hanya logo, stempel, avatar |

Seluruh turunan nota berada di bucket privat sesuai [ADR-011](../adr/ADR-011-privasi-turunan-nota.md) — menyimpang dari SYSTEM_DESIGN §12.2 yang menaruh preview/thumb di bucket publik.

**Tidak ada batas ukuran di level bucket.** Batas 15 MB ([ADR-014](../adr/ADR-014-batas-upload-nota.md)) ditegakkan di lapisan aplikasi (T-098), karena bundel backup di bucket yang sama bisa jauh melebihi 15 MB.

### Hasil uji privasi

| Langkah | Hasil |
|---|---|
| Unggah objek ke `private` dengan secret key | HTTP 200 |
| Baca **tanpa** otorisasi | **HTTP 400 — ditolak** |
| Baca lewat signed URL (kedaluwarsa 300 detik) | HTTP 200, isi cocok |
| Objek uji dihapus | HTTP 200 |

### Membuat ulang bucket (untuk project staging)

```bash
node -e '
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, sec=process.env.SUPABASE_SERVICE_ROLE_KEY;
const H={apikey:sec,Authorization:"Bearer "+sec,"Content-Type":"application/json"};
(async()=>{ for (const b of [{name:"private",public:false},{name:"public",public:true}]) {
  const r=await fetch(url+"/storage/v1/bucket",{method:"POST",headers:H,
    body:JSON.stringify({id:b.name,name:b.name,public:b.public})});
  console.log(b.name, r.status, await r.text());
}})();'
```

---

## 4. Database password — **MENUNGGU MANUSIA**

Ini satu-satunya hal yang memblokir seluruh jalur database (**T-019 sampai T-043**).

API key **tidak bisa** dipakai untuk koneksi Postgres. Yang dibutuhkan adalah *database password* yang diketik saat project dibuat.

### Langkah

1. Buka **Project Settings → Database → Connection string**.
2. Salin dua bentuk berbeda — jangan disamakan:

   ```
   # DATABASE_URL — transaction pooler, runtime aplikasi
   postgresql://postgres.szashcqawyhpvlvdtskq:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

   # DIRECT_URL — session pooler, untuk migrasi
   postgresql://postgres.szashcqawyhpvlvdtskq:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```

3. Isi keduanya di `.env.local`.
4. Bila password memuat `@ : / ? # & %`, lakukan URL-encode (`p@ss` → `p%40ss`).
5. Lupa password? **Database → Reset database password.** Mereset memutus koneksi yang sedang berjalan.

### Verifikasi

```bash
npx tsx scripts/check-env.ts   # harus LULUS
npx tsx scripts/db-ping.ts     # "Koneksi Postgres" harus LULUS, bukan DILEWATI
```

---

## 5. Extension database — **MENUNGGU** (butuh langkah 4)

Tanpa `btree_gist`, `EXCLUDE` constraint pada `proker_lock` tidak dapat dibuat dan **seluruh sistem anti-bentrok proker gagal** (INV-09). Ini bukan detail opsional.

Jalankan di **SQL Editor** Supabase:

```sql
create extension if not exists "uuid-ossp";
create extension if not exists btree_gist;
create extension if not exists pg_trgm;
```

### Verifikasi

```sql
select extname from pg_extension
where extname in ('uuid-ossp','btree_gist','pg_trgm')
order by extname;
-- harus mengembalikan tepat 3 baris
```

Atau: `npx tsx scripts/db-ping.ts` → baris **"Extension wajib"** harus `LULUS`.

> Migrasi `001_extensions.sql` (T-020) juga menjalankan ketiga perintah ini. Menjalankannya lebih awal di SQL Editor mempercepat deteksi bila tier tidak mengizinkan salah satu extension.

---

## 6. Vercel — belum

1. **Add New → Project**, impor `DimasPanca/HMIF_Center`.
2. Framework preset: **Next.js**. Root directory: `./`.
3. Salin seluruh variable `.env.local` ke **Settings → Environment Variables**, dengan dua penyesuaian:
   - `NEXT_PUBLIC_APP_URL` → URL deployment, bukan `localhost:3000`
   - `CRON_SECRET` → nilai yang sama persis, karena dipakai memverifikasi request cron ([ADR-009](../adr/ADR-009-strategi-cron.md))
4. Jangan deploy sebelum T-009 selesai — belum ada aplikasi untuk di-build.

---

## 7. Gotenberg — opsional, dilewati

[ADR-010](../adr/ADR-010-strategi-pdf.md) menempatkan PDF di balik `PDF_ENABLED`, nilai awal `false`. Sistem rilis **DOCX-only** dan modul persuratan tidak terblokir.

Bila kelak PDF dibutuhkan: deploy Gotenberg di Railway atau Fly.io, isi `GOTENBERG_URL`, set `PDF_ENABLED=true`, lalu **verifikasi bahwa teks pada PDF hasil dapat diseleksi** (bukan rasterisasi) sebelum menganggapnya siap.

---

## Keamanan kredensial

Kunci API project ini pernah dikirim lewat percakapan. Sebelum sistem dipakai dengan data nyata pengurus:

1. **Roll** publishable dan secret key di **Project Settings → API Keys**.
2. **Reset** database password, lalu perbarui `DATABASE_URL` dan `DIRECT_URL`.
3. Perbarui nilai baru di `.env.local` dan di Environment Variables Vercel.

Selama masih memakai data dummy pengembangan, risikonya rendah. Yang tidak boleh terjadi adalah kunci ini masih berlaku saat data pengurus asli sudah masuk.
