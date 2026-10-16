-- 040_panitia_koordinator — koordinator divisi termasuk panitia acaranya (T-085).
--
-- my_kepanitiaan() (015a) = keanggotaan divisi ∪ ketua pelaksana. Koordinator
-- yang tidak tercatat di divisi_member — divisi diubah koordinatornya setelah
-- pembentukan, atau dibuat tanpa bentuk_kepanitiaan() — tidak dianggap panitia,
-- sehingga policy BACA rab_*/nota menyaring baris divisinya sendiri dan
-- UPDATE-nya mengenai 0 baris walau tulis_divisi() (039) mengizinkan.
-- Terukur di 015c_rls_negatif skenario 12.
--
-- Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-085 · PRD F-8.1, F-8.3

CREATE OR REPLACE FUNCTION my_kepanitiaan() RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::UUID[])
  FROM (
    SELECT d.kepanitiaan_id AS id
    FROM divisi_member dm
    JOIN divisi d ON d.id = dm.divisi_id
    WHERE dm.user_id = auth.uid()

    UNION

    SELECT d.kepanitiaan_id
    FROM divisi d
    WHERE d.koordinator_id = auth.uid()

    UNION

    SELECT k.id
    FROM kepanitiaan k
    WHERE k.ketua_pelaksana = auth.uid()
  ) s;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION my_kepanitiaan IS
  'Gabungan keanggotaan divisi, koordinator divisi, dan ketua pelaksana. Tidak menyaring periode — jangan dipakai sendirian pada policy tulis.';
