-- Migrasi 036 — pemelihara kolom baru kendala (lanjutan 035, T-082).
--
-- 1. `updated_at` dipelihara `fn_set_updated_at` seperti seluruh tabel lain
--    (test 017 menolak tabel ber-updated_at tanpa pemelihara — kolom yang
--    hanya menunjukkan waktu dibuat sambil berpura-pura "terakhir diubah").
-- 2. `periode_id` diisi otomatis bila penulis lupa: dari periode proker
--    terkait, lalu periode AKTIF. Service T-082 selalu mengisinya eksplisit;
--    trigger ini menjaga penulis lain (test SQL lama, skrip) supaya tidak
--    pernah menghasilkan kendala tanpa periode (INV-08).
--
-- Idempoten: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
--
-- Sumber: T-082 · migrasi 017 (fn_set_updated_at), 035

DROP TRIGGER IF EXISTS trg_kendala_updated_at ON kendala;
CREATE TRIGGER trg_kendala_updated_at
  BEFORE UPDATE ON kendala
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE FUNCTION fn_kendala_periode_otomatis() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.periode_id IS NULL AND NEW.proker_id IS NOT NULL THEN
    SELECT periode_id INTO NEW.periode_id FROM proker WHERE id = NEW.proker_id;
  END IF;
  IF NEW.periode_id IS NULL THEN
    SELECT id INTO NEW.periode_id FROM periode WHERE status = 'AKTIF' LIMIT 1;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kendala_periode_otomatis ON kendala;
CREATE TRIGGER trg_kendala_periode_otomatis
  BEFORE INSERT ON kendala
  FOR EACH ROW EXECUTE FUNCTION fn_kendala_periode_otomatis();
