-- Sinyal invalidasi Master Gantt lintas sesi. Bukan sumber progres: view
-- v_master_gantt tetap menghitung progres langsung dari kanban_card.
-- Jangan mem-publish kartu atau menyentuh proker hanya untuk notifikasi:
-- payload kartu bisa berisi data internal, UPDATE proker memicu audit palsu.

CREATE TABLE public.proker_progress_signal (
  proker_id uuid PRIMARY KEY REFERENCES public.proker(id) ON DELETE CASCADE,
  periode_id uuid NOT NULL REFERENCES public.periode(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.proker_progress_signal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proker_progress_signal REPLICA IDENTITY FULL;

-- 015c memberi default privilege luas pada tabel baru: batasi secara eksplisit.
REVOKE ALL ON public.proker_progress_signal FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.proker_progress_signal TO authenticated;

CREATE POLICY proker_progress_signal_select ON public.proker_progress_signal
  FOR SELECT TO authenticated
  USING (
    periode_id = periode_aktif()
    AND EXISTS (
      SELECT 1 FROM public.app_user u
      WHERE u.id = auth.uid() AND u.is_active
    )
    AND has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM','KADEPT','ANGGOTA','BPH')
  );

CREATE FUNCTION public.fn_sinyal_progres_kanban() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_proker_id uuid;
BEGIN
  -- Perubahan non-progres (judul/urutan) tidak menginvalidasi chart.
  IF TG_OP = 'UPDATE'
     AND NEW.kolom IS NOT DISTINCT FROM OLD.kolom
     AND NEW.proker_id IS NOT DISTINCT FROM OLD.proker_id THEN
    RETURN NEW;
  END IF;

  -- Perpindahan lintas proker menginvalidasi keduanya. INSERT/DELETE hanya
  -- menginvalidasi satu proker; kartu tanpa proker tak memengaruhi Gantt.
  FOR v_proker_id IN
    SELECT DISTINCT id FROM (
      SELECT CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.proker_id END AS id
      UNION ALL
      SELECT CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN NEW.proker_id END AS id
    ) sumber WHERE id IS NOT NULL
  LOOP
    INSERT INTO public.proker_progress_signal (proker_id, periode_id)
      SELECT p.id, p.periode_id FROM public.proker p WHERE p.id = v_proker_id
    ON CONFLICT (proker_id) DO UPDATE
      SET periode_id = EXCLUDED.periode_id,
          revision = public.proker_progress_signal.revision + 1,
          changed_at = clock_timestamp();
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.fn_sinyal_progres_kanban() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sinyal_progres_kanban
  AFTER INSERT OR UPDATE OR DELETE ON public.kanban_card
  FOR EACH ROW EXECUTE FUNCTION public.fn_sinyal_progres_kanban();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'proker_progress_signal'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proker_progress_signal;
  END IF;
END $$;
