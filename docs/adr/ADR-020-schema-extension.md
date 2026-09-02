# ADR-020 — Extension database berada di schema `extensions`

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-02 |
| **Ditemukan oleh** | T-019, saat `db:reset` menghasilkan database yang gagal smoke test |
| **Lane** | `data` |
| **Task terkait** | T-019, T-020, T-023 |

## Konteks

SYSTEM_DESIGN §4.1 menuliskan pembuatan extension tanpa menyebut schema:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

Tanpa klausa `WITH SCHEMA`, extension mendarat di schema pertama pada `search_path`, yaitu `public`. Pemeriksaan pada project `hmif-center-dev` memperlihatkan kondisi yang tidak konsisten:

| Extension | Schema |
|---|---|
| `btree_gist` | `public` |
| `pg_trgm` | `public` |
| `uuid-ossp` | **`extensions`** — dipasang Supabase saat project dibuat |

Masalahnya muncul pada `db:reset`, yang menjalankan `DROP SCHEMA public CASCADE`. Dua extension di `public` **ikut terhapus**, sehingga database hasil reset gagal `000_smoke.sql` dengan pesan:

```
Extension belum terpasang: btree_gist, pg_trgm
```

Selama migrasi `001_extensions.sql` belum ada, setiap `db:reset` meninggalkan database yang tidak dapat dipakai. Bahkan setelah migrasi itu ada, menaruh extension di `public` berarti ia dihapus lalu dibuat ulang pada setiap reset — pekerjaan sia-sia untuk objek yang sifatnya milik server, bukan milik skema aplikasi.

## Keputusan

Ketiga extension dibuat di schema **`extensions`**, bukan `public`.

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm      WITH SCHEMA extensions;
```

Ini juga menyeragamkan ketiganya dengan `uuid-ossp` yang memang sudah di sana, dan mengikuti pola yang dipakai Supabase sendiri.

## Alasan ini aman

`search_path` bawaan project sudah memuat `extensions`:

```
"$user", public, extensions
```

Klaim itu tidak diterima begitu saja — mekanismenya diuji langsung setelah pemindahan:

| Uji | Hasil |
|---|---|
| `CREATE TABLE … EXCLUDE USING gist (periode_id WITH =, rentang WITH &&)` | berhasil, walau `btree_gist` bukan di `public` |
| Sisipkan rentang beririsan | **ditolak, kode `23P01`** |
| `uuid_generate_v4()` | mengembalikan UUID |
| `similarity('kaderisasi','kaderisai')` | mengembalikan `0.615` |

Operator class dari schema lain tetap ditemukan karena `search_path`, dan penegakan `EXCLUDE` tidak berubah sedikit pun (INV-09 tetap utuh).

## Konsekuensi implementasi

- **T-020** menulis `001_extensions.sql` memakai `WITH SCHEMA extensions`, didahului `CREATE SCHEMA IF NOT EXISTS extensions`.
- `db:reset` kini menghasilkan database yang **langsung lolos smoke test**, di titik mana pun pada linimasa migrasi — tidak lagi bergantung pada migrasi 001 untuk sekadar bisa dipakai.
- `000_smoke.sql` tidak perlu diubah: ia memeriksa `pg_extension`, yang tidak peduli schema.
- Migrasi yang memakai tipe atau operator dari extension **tidak perlu** menyebut schema secara eksplisit, karena `search_path` sudah menanganinya.
- SYSTEM_DESIGN §4.1 **tidak diedit**; ADR ini yang berlaku sesuai hierarki AGENT_RULES §0.

## Yang tidak berubah

Daftar extension tetap tiga, tidak lebih. `btree_gist` tetap wajib dan tetap menjadi tumpuan seluruh sistem anti-bentrok proker.
