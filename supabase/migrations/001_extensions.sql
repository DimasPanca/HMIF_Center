-- 001_extensions — extension PostgreSQL yang dibutuhkan sistem.
--
-- Ketiganya dibuat di schema `extensions`, bukan `public` (ADR-020).
-- Alasannya: `db:reset` menjalankan DROP SCHEMA public CASCADE, sehingga
-- extension yang tinggal di `public` ikut terhapus dan database hasil reset
-- tidak dapat dipakai. `search_path` project sudah memuat `extensions`,
-- jadi tipe dan operator tetap terjangkau tanpa perlu disebut schema-nya.
--
-- Sumber: SYSTEM_DESIGN §4.1 · ADR-020

CREATE SCHEMA IF NOT EXISTS extensions;

-- uuid_generate_v4() dipakai sebagai DEFAULT primary key hampir seluruh tabel.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- btree_gist WAJIB dan bukan pelengkap.
--
-- Ia memungkinkan satu index GiST menggabungkan tipe skalar (`periode_id UUID`
-- dengan operator `=`) dan tipe rentang (`rentang DATERANGE` dengan operator
-- `&&`) dalam SATU constraint:
--
--     EXCLUDE USING gist (periode_id WITH =, rentang WITH &&)
--
-- Itulah satu-satunya mekanisme yang menegakkan aturan anti-bentrok proker
-- (INV-09). Tanpa extension ini, tabel `proker_lock` pada migrasi 004 gagal
-- dibuat, dan mencegah bentrok jadwal terpaksa jatuh ke logika aplikasi —
-- yang bisa ditembus race condition saat dua Kepala Departemen menyetujui
-- proker beririsan pada detik yang sama (PRD §11 risiko R3).
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- pg_trgm untuk pencarian teks penuh pada arsip surat dan notulensi.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
