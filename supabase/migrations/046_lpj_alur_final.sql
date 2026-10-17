-- 046_lpj_alur_final — alur persetujuan LPJ ditegakkan database; FINAL beku (T-105).
--
-- ADR-015: DRAFT → DIAJUKAN → DISETUJUI_BENDUM → FINAL, "transisi ilegal
-- ditolak di server", dan "FINAL tidak dapat diubah". Migrasi 012 hanya
-- menjaga kelengkapan kolom persetujuan; urutan status dan kekekalan FINAL
-- belum dijaga sama sekali. Selain itu RLS 015b memberi UPDATE hanya kepada
-- Admin/Bendum — Ketua Himpunan, pemberi persetujuan tahap akhir, tidak dapat
-- menyetujui sama sekali.
--
--   transisi sah    DRAFT→DIAJUKAN · DIAJUKAN→DISETUJUI_BENDUM | DRAFT
--                   DISETUJUI_BENDUM→FINAL | DRAFT
--   isi (data_manual, analisis) hanya berubah selama DRAFT
--   FINAL           tidak dapat diubah maupun dihapus (oleh siapa pun)
--
-- Guard aplikasi: lib/lpj/generate.ts (aksiLpj).
--
-- Sumber: docs/ai/tasks/P7-nota-lpj.md T-105 · ADR-015 · migrasi 012, 015b

CREATE OR REPLACE FUNCTION fn_lpj_alur() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'FINAL' THEN
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

DROP TRIGGER IF EXISTS trg_lpj_alur ON lpj;
CREATE TRIGGER trg_lpj_alur
  BEFORE UPDATE OR DELETE ON lpj
  FOR EACH ROW EXECUTE FUNCTION fn_lpj_alur();

-- Ketua Himpunan: persetujuan tahap akhir (FINAL) atau pengembalian ke DRAFT,
-- hanya untuk LPJ yang sudah disetujui Bendahara.
DROP POLICY IF EXISTS lpj_update_ketua ON lpj;
CREATE POLICY lpj_update_ketua ON lpj FOR UPDATE
  USING (has_role('KETUA') AND status = 'DISETUJUI_BENDUM')
  WITH CHECK (status IN ('FINAL', 'DRAFT'));
