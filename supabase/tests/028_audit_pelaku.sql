-- 028 — konteks_user_id(): auth.uid() > app.user_id > NULL.
-- Runner membungkus berkas dalam transaksi yang selalu di-ROLLBACK.
DO $$
DECLARE
  v_periode UUID;
  v_dept UUID;
  v_pelaku UUID := gen_random_uuid();
  v_jwt UUID := gen_random_uuid();
  v_proker UUID;
  v_uid UUID;
BEGIN
  INSERT INTO app_user (id, nama_lengkap, nim, email)
    VALUES (v_pelaku, 'Pelaku Audit 028', '9902800001', 'pelaku-028@uji.test'),
           (v_jwt,    'Pemegang JWT 028', '9902800002', 'jwt-028@uji.test');
  SELECT id INTO v_periode FROM periode WHERE status = 'AKTIF' LIMIT 1;
  IF v_periode IS NULL THEN
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
      VALUES ('Periode 028', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  END IF;
  INSERT INTO departemen (kode, nama, warna) VALUES ('Z028', 'Audit 028', '#123456') RETURNING id INTO v_dept;

  -- 1. Tanpa JWT dan tanpa app.user_id: pelaku sistem (NULL).
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.user_id', '', true);
  IF konteks_user_id() IS NOT NULL THEN
    RAISE EXCEPTION '028: tanpa konteks, pelaku harus NULL';
  END IF;

  -- 2. Koneksi aplikasi: app.user_id menjadi pelaku di baris audit trigger.
  PERFORM set_config('app.user_id', v_pelaku::text, true);
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_periode, v_dept, 'Proker 028', 'BERKALA', v_pelaku) RETURNING id INTO v_proker;
  SELECT user_id INTO v_uid FROM audit_log
    WHERE entitas = 'proker' AND entitas_id = v_proker::text AND aksi = 'CREATE';
  IF v_uid IS DISTINCT FROM v_pelaku THEN
    RAISE EXCEPTION '028: audit_log.user_id = %, seharusnya app.user_id %', v_uid, v_pelaku;
  END IF;

  -- 3. JWT menang atas app.user_id: identitas bertanda tangan paling dipercaya.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_jwt, 'role', 'authenticated')::text, true);
  IF konteks_user_id() IS DISTINCT FROM v_jwt THEN
    RAISE EXCEPTION '028: auth.uid() harus didahulukan atas app.user_id';
  END IF;

  -- 4. Klaim rusak tidak menjatuhkan audit; jatuh ke app.user_id.
  PERFORM set_config('request.jwt.claims', 'bukan-json', true);
  IF konteks_user_id() IS DISTINCT FROM v_pelaku THEN
    RAISE EXCEPTION '028: klaim rusak harus jatuh ke app.user_id';
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.user_id', '', true);
END $$;
