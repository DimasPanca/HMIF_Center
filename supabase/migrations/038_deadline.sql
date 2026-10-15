-- Migrasi 038 — peringatan deadline (T-083).
--
-- 1. `hari_ini_jakarta()` — tanggal kalender di Asia/Jakarta. Server Supabase
--    berjalan di UTC: `CURRENT_DATE` antara 00.00–07.00 WIB masih menunjuk
--    KEMARIN, sehingga kartu ber-deadline hari ini terbaca "besok" dan kartu
--    yang terlambat sejak semalam belum terhitung terlambat (PRD F-7.4,
--    kontrak T-083 #4).
-- 2. `deadline_ringkasan` — agregat per departemen yang disegarkan cron
--    harian (kontrak #5), dibaca dashboard tanpa menghitung ulang seluruh
--    kartu tiap kali dibuka. Ditulis hanya oleh cron (koneksi aplikasi);
--    tidak ada policy tulis untuk klien.
--
-- Idempoten.
--
-- Sumber: T-083 · PRD F-7.4 · migrasi 010 (kanban_card), 013 (app_config)

CREATE OR REPLACE FUNCTION hari_ini_jakarta() RETURNS DATE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION hari_ini_jakarta IS
  'Tanggal kalender Asia/Jakarta. Pakai ini, bukan CURRENT_DATE (server UTC), untuk semua batas hari.';

CREATE TABLE IF NOT EXISTS deadline_ringkasan (
  departemen_id UUID PRIMARY KEY REFERENCES departemen(id) ON DELETE CASCADE,
  tanggal       DATE NOT NULL,
  peringatan    INTEGER NOT NULL DEFAULT 0 CHECK (peringatan >= 0),
  kritis        INTEGER NOT NULL DEFAULT 0 CHECK (kritis >= 0),
  terlambat     INTEGER NOT NULL DEFAULT 0 CHECK (terlambat >= 0),
  dihitung_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE deadline_ringkasan ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON deadline_ringkasan TO authenticated;

DROP POLICY IF EXISTS deadline_ringkasan_select ON deadline_ringkasan;
CREATE POLICY deadline_ringkasan_select ON deadline_ringkasan FOR SELECT USING (true);
