-- 053_formulir_peran_positif — policy tulis formulir tanpa menyebut BPH (INV-03).
--
-- 052 menulis `NOT has_role('BPH')`; rls-coverage menolak policy tulis yang
-- menyebut BPH dalam bentuk apa pun, supaya tidak ada satu ekspresi pun yang
-- bergantung pada pengecualian BPH. Diganti daftar peran PENULIS yang positif:
-- panitia acara hanya berhak bila ia juga memegang peran penulis.

CREATE OR REPLACE FUNCTION public.form_kelola(p_form UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM form f
    WHERE f.id = p_form
      AND (f.dibuat_oleh = auth.uid()
           OR has_role('ADMIN','KETUA','WAKIL','SEKUM')
           OR (f.kepanitiaan_id IS NOT NULL
               AND f.kepanitiaan_id = ANY (my_kepanitiaan())
               AND has_role('BENDUM','KADEPT','ANGGOTA')))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

DROP POLICY IF EXISTS form_insert ON form;
CREATE POLICY form_insert ON form FOR INSERT WITH CHECK (
  dibuat_oleh = auth.uid() AND (
    has_role('ADMIN','KETUA','WAKIL','SEKUM')
    OR (kepanitiaan_id IS NOT NULL
        AND kepanitiaan_id = ANY (my_kepanitiaan())
        AND has_role('BENDUM','KADEPT','ANGGOTA'))
  )
);
