-- Migrasi 037 — Gantt editor empat level (T-078).
--
-- 1. `gantt_chart.periode_id` — chart ber-periode (INV-08). Chart PROKER,
--    KETUPLAK, dan DIVISI menurunkannya dari proker induknya; chart DEPARTEMEN
--    tidak punya induk ber-periode, jadi tanpa kolom ini "Gantt Kaderisasi"
--    2026 dan 2027 adalah baris yang sama dan periode baru menimpa timeline
--    periode lama. Diisi otomatis bila penulis lupa (pola migrasi 036).
-- 2. Satu chart DEPARTEMEN per departemen per periode — editor membuatnya
--    saat pertama dibuka; indeks unik membuat dua tab yang membuka bersamaan
--    tidak menghasilkan dua chart.
-- 3. `gantt_task.chart_id` — salinan chart dari grupnya, dijaga trigger.
--    Realtime hanya dapat menyaring kolom milik baris itu sendiri; tanpa
--    salinan ini pelanggan kanal `gantt:{chart_id}` harus menerima perubahan
--    task SELURUH chart lalu membuang yang bukan miliknya.
-- 4. gantt_task & gantt_group masuk publication `supabase_realtime`.
--
-- Idempoten dari kosong maupun diulang.
--
-- Sumber: T-078 · SYSTEM_DESIGN §4.4, §13.1 · INV-08

-- 1. periode chart -------------------------------------------------------------
ALTER TABLE gantt_chart ADD COLUMN IF NOT EXISTS periode_id UUID REFERENCES periode(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION fn_gantt_chart_periode(c gantt_chart) RETURNS UUID AS $$
  SELECT COALESCE(
    (SELECT p.periode_id FROM proker p WHERE p.id = c.proker_id),
    (SELECT p.periode_id FROM kepanitiaan k JOIN proker p ON p.id = k.proker_id WHERE k.id = c.kepanitiaan_id),
    (SELECT p.periode_id FROM divisi d JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
       JOIN proker p ON p.id = k.proker_id WHERE d.id = c.divisi_id),
    (SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1),
    (SELECT id FROM periode ORDER BY tanggal_mulai DESC LIMIT 1)
  );
$$ LANGUAGE sql STABLE;

UPDATE gantt_chart c SET periode_id = fn_gantt_chart_periode(c) WHERE c.periode_id IS NULL;

CREATE OR REPLACE FUNCTION fn_gantt_chart_periode_otomatis() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.periode_id IS NULL THEN
    NEW.periode_id := fn_gantt_chart_periode(NEW);
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gantt_chart_periode_otomatis ON gantt_chart;
CREATE TRIGGER trg_gantt_chart_periode_otomatis
  BEFORE INSERT ON gantt_chart
  FOR EACH ROW EXECUTE FUNCTION fn_gantt_chart_periode_otomatis();

-- Hanya bila tidak ada chart tanpa periode (basis data tanpa periode sama sekali).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM gantt_chart WHERE periode_id IS NULL) THEN
    ALTER TABLE gantt_chart ALTER COLUMN periode_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS gantt_chart_periode ON gantt_chart (periode_id, scope);

-- 2. satu chart departemen per periode ------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS gantt_chart_departemen_periode_unik
  ON gantt_chart (departemen_id, periode_id) WHERE scope = 'DEPARTEMEN';

-- 3. chart_id pada task ---------------------------------------------------------
ALTER TABLE gantt_task ADD COLUMN IF NOT EXISTS chart_id UUID REFERENCES gantt_chart(id) ON DELETE CASCADE;

UPDATE gantt_task t SET chart_id = g.chart_id FROM gantt_group g WHERE g.id = t.group_id AND t.chart_id IS DISTINCT FROM g.chart_id;

CREATE OR REPLACE FUNCTION fn_gantt_task_chart() RETURNS TRIGGER AS $$
BEGIN
  SELECT chart_id INTO NEW.chart_id FROM gantt_group WHERE id = NEW.group_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gantt_task_chart ON gantt_task;
CREATE TRIGGER trg_gantt_task_chart
  BEFORE INSERT OR UPDATE OF group_id, chart_id ON gantt_task
  FOR EACH ROW EXECUTE FUNCTION fn_gantt_task_chart();

ALTER TABLE gantt_task ALTER COLUMN chart_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS gantt_task_chart ON gantt_task (chart_id);

-- 4. realtime -------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY['gantt_task', 'gantt_group'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
