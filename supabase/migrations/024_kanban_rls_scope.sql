-- T-080 (prasyarat data) — hak tulis kartu mengikuti konteks tersimpan.
-- PRD §5.1, F-7.1, F-8.1–F-8.3 · INV-02, INV-03, INV-08, INV-30.
-- Migrasi lama tetap utuh. Helper kelola_dept terlalu luas untuk Kanban:
-- Ketua/Wakil hanya R, dan role ANGGOTA harus terikat departemennya.

CREATE FUNCTION public.kanban_boleh_tulis(
  p_departemen UUID, p_proker UUID, p_divisi UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_user UUID := auth.uid();
  v_periode UUID := public.periode_aktif();
  v_departemen UUID := p_departemen;
  v_proker_dept UUID;
  v_proker_periode UUID;
  v_divisi_proker UUID;
  v_divisi_dept UUID;
  v_divisi_periode UUID;
  v_koordinator UUID;
  v_ketua_pelaksana UUID;
BEGIN
  IF v_user IS NULL OR v_periode IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.app_user WHERE id = v_user AND is_active)
  THEN
    RETURN false;
  END IF;

  -- ID konteks bukan bukti izin. Departemen dan periode proker/divisi harus
  -- dibaca dari relasi database, bukan klaim JWT atau badan request.
  IF p_proker IS NOT NULL THEN
    SELECT p.departemen_id, p.periode_id
      INTO v_proker_dept, v_proker_periode
      FROM public.proker p WHERE p.id = p_proker;
    IF NOT FOUND OR v_proker_periode IS DISTINCT FROM v_periode THEN
      RETURN false;
    END IF;
    IF p_departemen IS NOT NULL AND p_departemen IS DISTINCT FROM v_proker_dept THEN
      RETURN false;
    END IF;
    v_departemen := v_proker_dept;
  END IF;

  IF p_divisi IS NOT NULL THEN
    SELECT k.proker_id, p.departemen_id, p.periode_id,
           d.koordinator_id, k.ketua_pelaksana
      INTO v_divisi_proker, v_divisi_dept, v_divisi_periode,
           v_koordinator, v_ketua_pelaksana
      FROM public.divisi d
      JOIN public.kepanitiaan k ON k.id = d.kepanitiaan_id
      JOIN public.proker p ON p.id = k.proker_id
     WHERE d.id = p_divisi;
    IF NOT FOUND OR v_divisi_periode IS DISTINCT FROM v_periode THEN
      RETURN false;
    END IF;
    -- Jangan memenangkan salah satu dari dua konteks yang bertentangan.
    IF (p_proker IS NOT NULL AND p_proker IS DISTINCT FROM v_divisi_proker)
       OR (v_departemen IS NOT NULL AND v_departemen IS DISTINCT FROM v_divisi_dept)
    THEN
      RETURN false;
    END IF;
    v_departemen := v_divisi_dept;
  END IF;

  IF v_departemen IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.departemen WHERE id = v_departemen)
  THEN
    RETURN false;
  END IF;

  IF public.has_role('ADMIN') THEN
    RETURN true;
  END IF;

  IF p_divisi IS NOT NULL THEN
    -- Divisi lebih sempit daripada departemen PIC. Anggota panitia bebas
    -- lintas departemen, tetapi hanya menulis di divisinya (PRD F-8.1/F-8.3).
    -- BPH-only tetap read-only walaupun ada penugasan kepanitiaan tersisa.
    RETURN public.has_role('KETUA','WAKIL','SEKUM','BENDUM','KADEPT','ANGGOTA')
      AND (v_user = v_koordinator OR v_user = v_ketua_pelaksana
           OR EXISTS (SELECT 1 FROM public.divisi_member dm
                       WHERE dm.divisi_id = p_divisi AND dm.user_id = v_user)) IS TRUE;
  END IF;

  -- Korelasikan role DAN departemen pada baris yang sama. ANGGOTA A + BPH B
  -- tidak boleh menghasilkan hak tulis B lewat gabungan my_departemen().
  -- Kartu departemen tanpa proker tidak punya periode sendiri pada skema;
  -- kewenangannya tetap berasal dari user_role periode AKTIF.
  RETURN EXISTS (
    SELECT 1 FROM public.user_role ur
     WHERE ur.user_id = v_user AND ur.periode_id = v_periode
       AND ur.role IN ('KADEPT','ANGGOTA') AND ur.departemen_id = v_departemen
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.kanban_boleh_tulis(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_boleh_tulis(UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.kanban_boleh_tulis(UUID, UUID, UUID) IS
  'Izin INSERT/UPDATE Kanban dari auth.uid dan role aktif. Konteks harus konsisten; divisi mengikuti penugasan, bukan hanya departemen PIC. BPH tidak menambah hak.';

DROP POLICY kanban_card_update ON public.kanban_card;
CREATE POLICY kanban_card_update ON public.kanban_card FOR UPDATE TO authenticated
  USING (public.kanban_boleh_tulis(departemen_id, proker_id, divisi_id))
  WITH CHECK (public.kanban_boleh_tulis(departemen_id, proker_id, divisi_id));

-- INSERT memiliki celah identik; tutup juga agar kartu tidak dapat dibuat
-- di lingkup asing atau diselundupkan lewat jalur upsert.
DROP POLICY kanban_card_insert ON public.kanban_card;
CREATE POLICY kanban_card_insert ON public.kanban_card FOR INSERT TO authenticated
  WITH CHECK (public.kanban_boleh_tulis(departemen_id, proker_id, divisi_id));
