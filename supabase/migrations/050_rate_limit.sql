-- 050_rate_limit — penghitung jendela tetap untuk rate limit (T-113, SYSTEM_DESIGN §18.3).
--
-- Aplikasi berjalan sebagai fungsi serverless: penghitung di memori hanya
-- membatasi satu instance (lihat lib/auth/rate-limit.ts). Login, upload, dan
-- backup sudah dihitung dari tabel domainnya sendiri; yang tidak punya jejak
-- per permintaan — persetujuan surat per user dan batas umum per IP — dihitung
-- di sini dengan SATU pernyataan atomik per permintaan.
--
-- Tabel tertutup total bagi pengguna (policy USING false); hanya fungsi
-- SECURITY DEFINER `rate_limit_cek` yang menulisnya, dan fungsinya hanya
-- dapat dipanggil service role (middleware lewat PostgREST) atau pemilik
-- (route handler lewat Prisma). Baris kedaluwarsa dibersihkan cron harian.
-- Tidak ikut backup (ephemeral): lib/backup/export-modul.ts TABEL_DIKECUALIKAN.
--
-- Sumber: docs/ai/tasks/P9-rilis.md T-113 kontrak 2

CREATE TABLE IF NOT EXISTS rate_limit (
  kunci          TEXT        NOT NULL,
  jendela_mulai  TIMESTAMPTZ NOT NULL,
  jumlah         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (kunci, jendela_mulai)
);
CREATE INDEX IF NOT EXISTS rate_limit_jendela ON rate_limit (jendela_mulai);

ALTER TABLE rate_limit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON rate_limit TO authenticated;
DROP POLICY IF EXISTS rate_limit_tertutup ON rate_limit;
CREATE POLICY rate_limit_tertutup ON rate_limit FOR SELECT USING (false);

-- { ok, jumlah, batas, sisa_detik }. Jendela tetap: floor(epoch / jendela).
CREATE OR REPLACE FUNCTION public.rate_limit_cek(p_kunci TEXT, p_batas INTEGER, p_jendela_detik INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mulai TIMESTAMPTZ;
  v_n     INTEGER;
BEGIN
  IF p_kunci IS NULL OR length(p_kunci) = 0 OR length(p_kunci) > 200 THEN
    RAISE EXCEPTION 'kunci rate limit tidak sah';
  END IF;
  IF p_batas < 1 OR p_jendela_detik < 1 THEN
    RAISE EXCEPTION 'batas/jendela rate limit tidak sah';
  END IF;
  v_mulai := to_timestamp(floor(extract(epoch FROM now()) / p_jendela_detik) * p_jendela_detik);
  INSERT INTO rate_limit AS r (kunci, jendela_mulai, jumlah)
  VALUES (p_kunci, v_mulai, 1)
  ON CONFLICT (kunci, jendela_mulai) DO UPDATE SET jumlah = r.jumlah + 1
  RETURNING r.jumlah INTO v_n;
  RETURN jsonb_build_object(
    'ok', v_n <= p_batas,
    'jumlah', v_n,
    'batas', p_batas,
    'sisa_detik', GREATEST(1, ceil(extract(epoch FROM (v_mulai + make_interval(secs => p_jendela_detik) - now()))))::int
  );
END $$;

REVOKE ALL ON FUNCTION public.rate_limit_cek(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_cek(TEXT, INTEGER, INTEGER) TO service_role;

-- Pembersih untuk cron harian: jendela terpanjang yang dipakai 1 hari.
CREATE OR REPLACE FUNCTION public.rate_limit_bersihkan() RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH h AS (DELETE FROM rate_limit WHERE jendela_mulai < now() - interval '2 days' RETURNING 1)
  SELECT count(*)::int FROM h;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_bersihkan() FROM PUBLIC, anon, authenticated;
