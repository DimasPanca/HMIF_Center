-- 047_lpj_hapus_kaskade — LPJ FINAL tetap terhapus bila ACARANYA dihapus (T-105).
--
-- 046 menolak SETIAP DELETE pada LPJ FINAL, termasuk yang datang dari ON DELETE
-- CASCADE kepanitiaan — akibatnya acara yang LPJ-nya final tidak dapat dihapus
-- sama sekali, bahkan oleh Admin (dan data uji tidak dapat dibersihkan). Yang
-- dilindungi ADR-015 adalah ISI dokumen final; menghapus acara utuh adalah
-- tindakan lain yang tercatat audit di tabel kepanitiaan. Di sini DELETE langsung
-- (pg_trigger_depth() = 1) tetap ditolak; DELETE berantai dari FK diizinkan.
--
-- Sumber: docs/ai/tasks/P7-nota-lpj.md T-105 · ADR-015 · migrasi 046

CREATE OR REPLACE FUNCTION fn_lpj_alur() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'FINAL' AND pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'LPJ FINAL tidak dapat dihapus (ADR-015).' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'FINAL' THEN
    RAISE EXCEPTION 'LPJ FINAL tidak dapat diubah (ADR-015).' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'DRAFT'            AND NEW.status = 'DIAJUKAN')
    OR (OLD.status = 'DIAJUKAN'         AND NEW.status IN ('DISETUJUI_BENDUM', 'DRAFT'))
    OR (OLD.status = 'DISETUJUI_BENDUM' AND NEW.status IN ('FINAL', 'DRAFT'))
  ) THEN
    RAISE EXCEPTION 'Transisi LPJ % → % tidak sah (ADR-015).', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status <> 'DRAFT' AND NEW.status = OLD.status
     AND (NEW.data_manual IS DISTINCT FROM OLD.data_manual OR NEW.analisis IS DISTINCT FROM OLD.analisis) THEN
    RAISE EXCEPTION 'Isi LPJ hanya dapat diubah selama DRAFT.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;
