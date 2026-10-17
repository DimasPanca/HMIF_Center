-- 049_restore_job_updated_at — restore_job (048) punya updated_at; pasang
-- pemelihara yang sama dengan 18 tabel lain (017_triggers, fn_set_updated_at).
-- Kode restore tetap menulis updated_at sendiri; trigger menjamin nilainya
-- bergerak untuk penulis mana pun — deteksi job terputus (BATAS_DIAM_MS)
-- bergantung padanya.
--
-- Sumber: docs/ai/tasks/P9-rilis.md T-112 · supabase/tests/017_triggers.sql

CREATE OR REPLACE TRIGGER trg_updated_at_restore_job
  BEFORE UPDATE ON restore_job
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
