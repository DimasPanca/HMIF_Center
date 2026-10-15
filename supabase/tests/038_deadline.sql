-- Test migrasi 038 — hari Jakarta & agregat deadline (T-083).
DO $$
BEGIN
  ASSERT hari_ini_jakarta() = (now() AT TIME ZONE 'Asia/Jakarta')::date,
    'hari_ini_jakarta() tidak mengikuti zona Asia/Jakarta';
  -- Jakarta = UTC+7 tanpa DST: selisih dengan tanggal UTC paling banyak satu hari ke depan.
  ASSERT hari_ini_jakarta() - (now() AT TIME ZONE 'UTC')::date BETWEEN 0 AND 1,
    'hari_ini_jakarta() menyimpang lebih dari satu hari dari UTC';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'deadline_ringkasan'),
    'deadline_ringkasan tanpa RLS';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deadline_ringkasan' AND cmd = 'SELECT'),
    'deadline_ringkasan tanpa policy baca';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deadline_ringkasan' AND cmd <> 'SELECT'),
    'deadline_ringkasan punya policy tulis — seharusnya hanya cron (koneksi aplikasi) yang menulis';
  RAISE NOTICE 'OK 038_deadline - hari Jakarta, ringkasan baca-saja';
END $$;
