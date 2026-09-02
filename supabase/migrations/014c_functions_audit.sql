-- 014c_functions_audit — trigger audit generik.
--
-- Menyalin SYSTEM_DESIGN §14.1 dengan tiga koreksi. Setiap koreksi menutup
-- kegagalan yang akan terjadi di produksi, bukan preferensi gaya:
--
--   1. current_setting(..., true) mengembalikan STRING KOSONG, bukan NULL,
--      bila settingnya pernah diisi lalu dikosongkan. ''::UUID dan ''::INET
--      keduanya melempar invalid_text_representation. Aplikasi yang menulis
--      set_config('app.ip', '', true) saat IP tidak diketahui — hal yang
--      sangat wajar — akan menggagalkan SETIAP mutasi. Dibungkus NULLIF.
--
--   2. auth.uid() melempar bila request.jwt.claims berisi teks non-JSON, dan
--      undefined_function bila schema auth tidak ada sama sekali (Postgres
--      polos untuk CI). Dibungkus konteks_user_id() yang menelan keduanya.
--
--   3. SECURITY DEFINER tanpa SET search_path dapat dibajak: pemanggil
--      menyisipkan schema di depan search_path dan fungsi ini akan menjalankan
--      objek miliknya dengan hak pemilik. Dipatok eksplisit.
--
-- cek_total_alokasi() TIDAK ditulis di sini walau kontrak T-035 menyebutnya.
-- Fungsi itu sudah ada di migrasi 008 dan memang harus di sana: triggernya
-- dipasang pada nota_alokasi di migrasi yang sama, dan Postgres mensyaratkan
-- fungsi ada lebih dulu. Menulisnya dua kali melahirkan dua definisi yang
-- dapat berbeda diam-diam.
--
-- Sumber: SYSTEM_DESIGN §14.1, §14.2 · PRD M15 · INV-06

-- ---------------------------------------------------------------------------
-- PEMBACAAN KONTEKS
-- ---------------------------------------------------------------------------
-- Mutasi datang dari dua dunia: request pengguna yang membawa JWT, dan cron
-- serta skrip administratif yang tidak membawa apa pun. Keduanya WAJIB
-- tercatat. Yang kedua tercatat dengan user_id NULL — itu bukan kegagalan,
-- itu keterangan bahwa pelakunya sistem.

CREATE OR REPLACE FUNCTION konteks_user_id() RETURNS UUID AS $$
DECLARE
  v_uid UUID;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    -- Tidak ada JWT, klaimnya rusak, atau schema auth tidak tersedia.
    -- Ketiganya berarti hal yang sama bagi audit: pelakunya tidak diketahui.
    v_uid := NULL;
  END;
  RETURN v_uid;
END; $$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION konteks_user_id IS
  'auth.uid() yang tidak pernah melempar. NULL berarti mutasi dari cron atau skrip, bukan kesalahan.';

-- ---------------------------------------------------------------------------
-- TRIGGER AUDIT GENERIK
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_audit() RETURNS TRIGGER AS $$
DECLARE
  v_lama JSONB;
  v_baru JSONB;
  v_aksi TEXT;
BEGIN
  IF    TG_OP = 'INSERT' THEN v_aksi := 'CREATE'; v_baru := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN v_aksi := 'UPDATE'; v_lama := to_jsonb(OLD); v_baru := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN v_aksi := 'DELETE'; v_lama := to_jsonb(OLD);
  END IF;

  -- Tidak ada blok EXCEPTION di sini, dan itu disengaja. Bila INSERT ini
  -- gagal, mutasinya harus ikut gagal. Audit yang boleh diam-diam tidak
  -- tercatat lebih berbahaya daripada tidak punya audit sama sekali, karena
  -- memberi rasa aman yang keliru saat pemeriksaan.
  INSERT INTO audit_log (
    user_id, periode_id, aksi, entitas, entitas_id,
    nilai_lama, nilai_baru, ip_address, user_agent
  ) VALUES (
    konteks_user_id(),
    NULLIF(current_setting('app.periode_id', true), '')::UUID,
    v_aksi,
    TG_TABLE_NAME,
    COALESCE(v_baru->>'id', v_lama->>'id'),
    v_lama,
    v_baru,
    NULLIF(current_setting('app.ip', true), '')::INET,
    NULLIF(current_setting('app.user_agent', true), '')
  );

  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

COMMENT ON FUNCTION fn_audit IS
  'Trigger audit generik. SECURITY DEFINER agar tetap menulis walau RLS menutup audit_log bagi pemanggil.';

-- ---------------------------------------------------------------------------
-- PEMASANGAN
-- ---------------------------------------------------------------------------
-- Daftar tabel mengikuti SYSTEM_DESIGN §14.1 apa adanya. Tabel operasional
-- harian seperti kanban_card dan gantt_task sengaja TIDAK diaudit: volumenya
-- besar, perubahannya remeh, dan membanjiri jejak audit justru menyulitkan
-- menemukan yang penting.
--
-- audit_log sendiri tidak masuk daftar. Selain menimbulkan rekursi, tabel itu
-- sudah append-only lewat trigger di migrasi 013 (INV-06).

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proker','proker_lock','surat','rab_item','rab_meta','nota',
    'user_role','periode','kepanitiaan','divisi','lpj','app_user'
  ] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE EXCEPTION 'Tabel % tidak ada — daftar audit §14.1 tidak sinkron dengan skema', t;
    END IF;

    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_audit_%1$s
         AFTER INSERT OR UPDATE OR DELETE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION fn_audit()', t);
  END LOOP;
END $$;
