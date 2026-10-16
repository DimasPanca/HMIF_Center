-- 041_rab_status — mesin status RAB ditegakkan database (T-089, PRD F-9.5, USER_FLOW §11.3).
--
--   DRAFT ──ajukan──▶ DIAJUKAN ──setujui & kunci──▶ DISETUJUI ──nota pertama──▶ REALISASI ──LPJ──▶ SELESAI
--     ▲                  │                            │
--     └── dikembalikan ──┘ (wajib catatan)            └── buka kunci (wajib alasan) ──▶ DRAFT
--
-- Kenapa di trigger, bukan hanya di service: `rab_meta_update` (015b) mengizinkan
-- Bendum/Ketua/Wakil/Admin mengubah baris ini lewat PostgREST dengan JWT-nya
-- sendiri. Tanpa trigger, `UPDATE rab_meta SET status = 'DRAFT'` langsung
-- membuka kunci TANPA alasan dan tanpa jejak alasan di audit — persis yang
-- dilarang PRD F-9.5. Trigger juga berlaku untuk koneksi aplikasi (BYPASSRLS
-- tidak melewati trigger), jadi tidak ada jalur "paksa edit" untuk siapa pun.
--
-- Alasan kembali ke DRAFT wajib BARU (berbeda dari alasan tersimpan) dan
-- minimal 10 karakter: alasan lama yang tertinggal tidak boleh dipakai ulang
-- diam-diam. Jejak lengkapnya ada di audit_log (rab_meta diaudit sejak 014c).
--
-- Idempoten: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION fn_rab_meta_transisi() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'DRAFT'     AND NEW.status = 'DIAJUKAN')
    OR (OLD.status = 'DIAJUKAN'  AND NEW.status IN ('DRAFT', 'DISETUJUI'))
    OR (OLD.status = 'DISETUJUI' AND NEW.status IN ('DRAFT', 'REALISASI'))
    OR (OLD.status = 'REALISASI' AND NEW.status = 'SELESAI')
  ) THEN
    RAISE EXCEPTION 'Transisi status RAB % -> % tidak diizinkan (USER_FLOW 11.3).', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'DRAFT' THEN
    IF length(btrim(COALESCE(NEW.alasan_buka_kunci, ''))) < 10
       OR NEW.alasan_buka_kunci IS NOT DISTINCT FROM OLD.alasan_buka_kunci THEN
      RAISE EXCEPTION 'Mengembalikan RAB ke DRAFT wajib disertai alasan baru minimal 10 karakter (PRD F-9.5).'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.disetujui_oleh := NULL;
    NEW.disetujui_at := NULL;
  END IF;

  IF NEW.status = 'DISETUJUI' THEN
    NEW.disetujui_at := COALESCE(NEW.disetujui_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_rab_meta_transisi() IS
  'Mesin status RAB (USER_FLOW 11.3): transisi ilegal ditolak; kembali ke DRAFT wajib alasan baru >= 10 karakter (PRD F-9.5).';

DROP TRIGGER IF EXISTS trg_rab_meta_transisi ON rab_meta;
CREATE TRIGGER trg_rab_meta_transisi
  BEFORE UPDATE OF status ON rab_meta
  FOR EACH ROW EXECUTE FUNCTION fn_rab_meta_transisi();
