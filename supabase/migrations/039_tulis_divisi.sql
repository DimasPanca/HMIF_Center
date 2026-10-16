-- 039_tulis_divisi — hak TULIS per divisi kepanitiaan (T-085, PRD F-8.3, INV-30).
--
-- ===========================================================================
-- TIGA CELAH YANG DITUTUP
-- ===========================================================================
-- 1. KETUA PELAKSANA TIDAK BISA MENULIS RAB/JOB DESK/NOTA DIVISI.
--    Policy 015b memakai `divisi_id = ANY(my_divisi_aktif())` — keanggotaan
--    divisi saja. Ketua Pelaksana memimpin seluruh divisi tetapi biasanya
--    bukan anggota satu pun, sehingga AC PRD F-8.3 "Ketua Pelaksana dapat
--    mengedit seluruh divisi" ditolak database.
--
-- 2. ANGGOTA SEMBARANG DAPAT MENGUBAH GANTT DIVISI MANA PUN.
--    `gantt_task_update` = `has_role(..., 'ANGGOTA')` tanpa syarat baris:
--    panitia Konsumsi dapat menggeser timeline Divisi PDD lewat PostgREST
--    dengan JWT-nya sendiri. Policy tulis Gantt kini memeriksa divisi chart.
--
-- 3. ANGGOTA YANG HANYA BPH TETAP MENULIS LEWAT KEANGGOTAAN DIVISI.
--    `my_divisi_aktif()` tidak melihat role; BPH yang tercatat sebagai
--    panitia mendapat hak tulis RAB (INV-03). Helper baru mensyaratkan role
--    non-BPH, sama dengan `kanban_boleh_tulis` (024).
--
-- Siapa yang menulis di sebuah divisi (cermin lib/kepanitiaan/akses.ts):
--   panitia_tulis_divisi  koordinator, anggota divisi, atau Ketua Pelaksana
--                         acaranya — pada periode AKTIF, role non-BPH
--   tulis_divisi          + Admin dan Bendum (RAB & nota seluruh divisi)
--
-- Idempoten: CREATE OR REPLACE dan DROP POLICY IF EXISTS.
--
-- Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-085 · PRD F-8.3 · INV-03, INV-08, INV-29, INV-30

CREATE OR REPLACE FUNCTION public.panitia_tulis_divisi(p_divisi UUID) RETURNS BOOLEAN AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_divisi IS NOT NULL
     AND public.has_role('KETUA','WAKIL','SEKUM','BENDUM','KADEPT','ANGGOTA','ADMIN')
     AND EXISTS (
       SELECT 1
         FROM public.divisi d
         JOIN public.kepanitiaan k ON k.id = d.kepanitiaan_id
         JOIN public.proker p      ON p.id = k.proker_id
        WHERE d.id = p_divisi
          AND p.periode_id = public.periode_aktif()
          AND (k.ketua_pelaksana = auth.uid()
               OR d.koordinator_id = auth.uid()
               OR EXISTS (SELECT 1 FROM public.divisi_member dm
                           WHERE dm.divisi_id = d.id AND dm.user_id = auth.uid())));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.panitia_tulis_divisi(UUID) IS
  'Koordinator/anggota divisi atau Ketua Pelaksana acaranya, periode AKTIF, role non-BPH (INV-03, INV-30).';

CREATE OR REPLACE FUNCTION public.tulis_divisi(p_divisi UUID) RETURNS BOOLEAN AS $$
  SELECT public.has_role('ADMIN','BENDUM') OR public.panitia_tulis_divisi(p_divisi);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.tulis_divisi(UUID) IS
  'Hak tulis data divisi (RAB, job desk): panitia_tulis_divisi + Admin & Bendum. Cermin bisaTulisDivisi().';

-- Chart Gantt: chart DIVISI hanya ditulis panitia divisinya, Kadept departemen
-- PIC, atau Admin/Ketua/Wakil (matriks "Gantt Chart" CRUD tanpa lingkup).
-- Chart level lain tidak berubah aturannya.
CREATE OR REPLACE FUNCTION public.gantt_divisi_boleh(p_chart UUID) RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT CASE
             WHEN c.divisi_id IS NULL THEN true
             ELSE public.has_role('ADMIN','KETUA','WAKIL')
                  OR public.panitia_tulis_divisi(c.divisi_id)
                  OR EXISTS (
                       SELECT 1
                         FROM public.divisi d
                         JOIN public.kepanitiaan k ON k.id = d.kepanitiaan_id
                         JOIN public.proker p      ON p.id = k.proker_id
                         JOIN public.user_role ur  ON ur.departemen_id = p.departemen_id
                        WHERE d.id = c.divisi_id
                          AND ur.user_id = auth.uid()
                          AND ur.role = 'KADEPT'
                          AND ur.periode_id = public.periode_aktif())
           END
      FROM public.gantt_chart c
     WHERE c.id = p_chart), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.gantt_divisi_boleh(UUID) IS
  'true untuk chart non-divisi; chart DIVISI hanya panitia divisinya, Kadept PIC, atau Admin/Ketua/Wakil (INV-30).';

REVOKE ALL ON FUNCTION public.panitia_tulis_divisi(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tulis_divisi(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gantt_divisi_boleh(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.panitia_tulis_divisi(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tulis_divisi(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gantt_divisi_boleh(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RAB — tulis divisi sendiri (atau Ketua Pelaksana/Admin/Bendum), dan hanya
-- selama RAB terbuka (INV-29 tetap).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rab_section_insert ON rab_section;
DROP POLICY IF EXISTS rab_section_update ON rab_section;
DROP POLICY IF EXISTS rab_section_delete ON rab_section;
CREATE POLICY rab_section_insert ON rab_section FOR INSERT
  WITH CHECK (public.tulis_divisi(divisi_id) AND public.rab_terbuka(divisi_id));
CREATE POLICY rab_section_update ON rab_section FOR UPDATE
  USING (public.tulis_divisi(divisi_id) AND public.rab_terbuka(divisi_id));
CREATE POLICY rab_section_delete ON rab_section FOR DELETE
  USING (public.tulis_divisi(divisi_id) AND public.rab_terbuka(divisi_id));

DROP POLICY IF EXISTS rab_item_insert ON rab_item;
DROP POLICY IF EXISTS rab_item_update ON rab_item;
DROP POLICY IF EXISTS rab_item_delete ON rab_item;
CREATE POLICY rab_item_insert ON rab_item FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM rab_section s WHERE s.id = section_id
                        AND public.tulis_divisi(s.divisi_id) AND public.rab_terbuka(s.divisi_id)));
CREATE POLICY rab_item_update ON rab_item FOR UPDATE
  USING (EXISTS (SELECT 1 FROM rab_section s WHERE s.id = section_id
                   AND public.tulis_divisi(s.divisi_id) AND public.rab_terbuka(s.divisi_id)));
CREATE POLICY rab_item_delete ON rab_item FOR DELETE
  USING (EXISTS (SELECT 1 FROM rab_section s WHERE s.id = section_id
                   AND public.tulis_divisi(s.divisi_id) AND public.rab_terbuka(s.divisi_id)));

-- ---------------------------------------------------------------------------
-- JOB DESK — hak pimpinan/Kadept 015b dipertahankan; panitia lewat helper.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS job_desk_insert ON job_desk;
DROP POLICY IF EXISTS job_desk_update ON job_desk;
CREATE POLICY job_desk_insert ON job_desk FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT') OR public.tulis_divisi(divisi_id));
CREATE POLICY job_desk_update ON job_desk FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT') OR public.tulis_divisi(divisi_id));

-- ---------------------------------------------------------------------------
-- NOTA — unggah: Admin atau panitia divisi itu (termasuk Ketua Pelaksana).
-- Bendum memverifikasi (nota_update 015b), tidak mengunggah atas nama divisi.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS nota_insert ON nota;
CREATE POLICY nota_insert ON nota FOR INSERT
  WITH CHECK (has_role('ADMIN') OR public.panitia_tulis_divisi(divisi_id));

-- ---------------------------------------------------------------------------
-- GANTT — syarat 015b dipertahankan, ditambah syarat divisi chart.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS gantt_group_insert ON gantt_group;
DROP POLICY IF EXISTS gantt_group_update ON gantt_group;
DROP POLICY IF EXISTS gantt_group_delete ON gantt_group;
CREATE POLICY gantt_group_insert ON gantt_group FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gantt_chart c WHERE c.id = chart_id
                        AND (has_role('ADMIN','KETUA','WAKIL','KADEPT')
                             OR c.kepanitiaan_id = ANY(my_kepanitiaan())))
              AND public.gantt_divisi_boleh(chart_id));
CREATE POLICY gantt_group_update ON gantt_group FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gantt_chart c WHERE c.id = chart_id
                   AND (has_role('ADMIN','KETUA','WAKIL','KADEPT')
                        OR c.kepanitiaan_id = ANY(my_kepanitiaan())))
         AND public.gantt_divisi_boleh(chart_id));
CREATE POLICY gantt_group_delete ON gantt_group FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT') AND public.gantt_divisi_boleh(chart_id));

DROP POLICY IF EXISTS gantt_task_insert ON gantt_task;
DROP POLICY IF EXISTS gantt_task_update ON gantt_task;
DROP POLICY IF EXISTS gantt_task_delete ON gantt_task;
CREATE POLICY gantt_task_insert ON gantt_task FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA') AND public.gantt_divisi_boleh(chart_id));
CREATE POLICY gantt_task_update ON gantt_task FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA') AND public.gantt_divisi_boleh(chart_id));
CREATE POLICY gantt_task_delete ON gantt_task FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT') AND public.gantt_divisi_boleh(chart_id));

DROP POLICY IF EXISTS gantt_dependency_insert ON gantt_dependency;
DROP POLICY IF EXISTS gantt_dependency_update ON gantt_dependency;
DROP POLICY IF EXISTS gantt_dependency_delete ON gantt_dependency;
CREATE POLICY gantt_dependency_insert ON gantt_dependency FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA')
              AND EXISTS (SELECT 1 FROM gantt_task t WHERE t.id = from_task AND public.gantt_divisi_boleh(t.chart_id)));
CREATE POLICY gantt_dependency_update ON gantt_dependency FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA')
         AND EXISTS (SELECT 1 FROM gantt_task t WHERE t.id = from_task AND public.gantt_divisi_boleh(t.chart_id)));
CREATE POLICY gantt_dependency_delete ON gantt_dependency FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT')
         AND EXISTS (SELECT 1 FROM gantt_task t WHERE t.id = from_task AND public.gantt_divisi_boleh(t.chart_id)));
