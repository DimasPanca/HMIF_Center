-- T-106 — RLS notulensi/kehadiran/action_item mengikuti lingkup notulensi induk.
-- Runner membungkus berkas dalam transaksi yang selalu di-ROLLBACK.
-- Mutasi wajib SET LOCAL ROLE authenticated: koneksi owner melewati RLS.
DO $$
DECLARE
  v_aktif UUID;
  v_arsip UUID;
  v_dept_a UUID;
  v_dept_b UUID;
  v_admin UUID := gen_random_uuid();
  v_ketua UUID := gen_random_uuid();
  v_sekum UUID := gen_random_uuid();
  v_kadept_a UUID := gen_random_uuid();
  v_anggota_a UUID := gen_random_uuid();
  v_bph UUID := gen_random_uuid();
  v_dua UUID := gen_random_uuid();        -- KADEPT A + ANGGOTA B
  v_not_a UUID;
  v_not_b UUID;
  v_not_himp UUID;
  v_not_arsip UUID;
  v_att_a UUID;
  v_att_b UUID;
  v_att_himp UUID;
  v_att_arsip UUID;
  v_uid UUID;
  v_i INT := 0;
  v_n INT;
  v_kasus RECORD;
  v_ditolak BOOLEAN;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Notulensi aktif', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_aktif;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Notulensi arsip', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_arsip;
  INSERT INTO departemen (kode, nama, warna) VALUES ('Z106A', 'Notula A', '#111111') RETURNING id INTO v_dept_a;
  INSERT INTO departemen (kode, nama, warna) VALUES ('Z106B', 'Notula B', '#222222') RETURNING id INTO v_dept_b;

  FOREACH v_uid IN ARRAY ARRAY[v_admin,v_ketua,v_sekum,v_kadept_a,v_anggota_a,v_bph,v_dua] LOOP
    v_i := v_i + 1;
    INSERT INTO app_user (id, nama_lengkap, nim, email, is_active)
      VALUES (v_uid, 'Notula ' || v_i, '33372106' || lpad(v_i::text, 2, '0'), 'notula-' || v_i || '@uji.test', true);
  END LOOP;
  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_admin, v_aktif, 'ADMIN', NULL),
    (v_ketua, v_aktif, 'KETUA', NULL),
    (v_sekum, v_aktif, 'SEKUM', NULL),
    (v_kadept_a, v_aktif, 'KADEPT', v_dept_a),
    (v_anggota_a, v_aktif, 'ANGGOTA', v_dept_a),
    -- BPH dengan departemen: kolom itu tak boleh memberi hak tulis.
    (v_bph, v_aktif, 'BPH', v_dept_a),
    (v_dua, v_aktif, 'KADEPT', v_dept_a),
    (v_dua, v_aktif, 'ANGGOTA', v_dept_b);

  INSERT INTO notulensi (periode_id, departemen_id, judul, tanggal) VALUES (v_aktif, v_dept_a, 'Notula A', CURRENT_DATE) RETURNING id INTO v_not_a;
  INSERT INTO notulensi (periode_id, departemen_id, judul, tanggal) VALUES (v_aktif, v_dept_b, 'Notula B', CURRENT_DATE) RETURNING id INTO v_not_b;
  INSERT INTO notulensi (periode_id, departemen_id, judul, tanggal) VALUES (v_aktif, NULL, 'Notula Himpunan', CURRENT_DATE) RETURNING id INTO v_not_himp;
  INSERT INTO notulensi (periode_id, departemen_id, judul, tanggal) VALUES (v_arsip, v_dept_a, 'Notula Arsip', CURRENT_DATE) RETURNING id INTO v_not_arsip;
  INSERT INTO notulensi_attendance (notulensi_id, user_id, status) VALUES (v_not_a, v_admin, 'ALFA') RETURNING id INTO v_att_a;
  INSERT INTO notulensi_attendance (notulensi_id, user_id, status) VALUES (v_not_b, v_admin, 'ALFA') RETURNING id INTO v_att_b;
  INSERT INTO notulensi_attendance (notulensi_id, user_id, status) VALUES (v_not_himp, v_admin, 'ALFA') RETURNING id INTO v_att_himp;
  INSERT INTO notulensi_attendance (notulensi_id, user_id, status) VALUES (v_not_arsip, v_admin, 'ALFA') RETURNING id INTO v_att_arsip;

  -- UPDATE kehadiran: USING menyaring baris di luar lingkup → ROW_COUNT membedakan.
  FOR v_kasus IN SELECT * FROM (VALUES
    ('Kadept A kehadiran A', v_kadept_a, 'a', true),
    ('Kadept A kehadiran B (lintas)', v_kadept_a, 'b', false),
    ('Kadept A kehadiran himpunan', v_kadept_a, 'h', false),
    ('Ketua kehadiran A (global)', v_ketua, 'a', true),
    ('Ketua kehadiran himpunan (global)', v_ketua, 'h', true),
    ('Sekum kehadiran B (global)', v_sekum, 'b', true),
    ('Anggota A kehadiran A (baca saja)', v_anggota_a, 'a', false),
    ('BPH kehadiran A (baca saja)', v_bph, 'a', false),
    ('Multi-role kehadiran A (via Kadept A)', v_dua, 'a', true),
    ('Multi-role kehadiran B (Anggota B tak menulis)', v_dua, 'b', false),
    ('Kadept A kehadiran arsip (periode)', v_kadept_a, 'r', false),
    ('Admin kehadiran arsip (periode)', v_admin, 'r', false)
  ) AS kasus(nama, pengguna, att, boleh) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_kasus.pengguna::text, 'role', 'ADMIN')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    ASSERT current_user = 'authenticated', 'Test tidak benar-benar memakai RLS';
    EXECUTE format('UPDATE notulensi_attendance SET status = ''HADIR'' WHERE id = %L::uuid',
      CASE v_kasus.att WHEN 'a' THEN v_att_a WHEN 'b' THEN v_att_b WHEN 'h' THEN v_att_himp ELSE v_att_arsip END);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    ASSERT v_n = v_kasus.boleh::int, format('%s: expected %s, actual %s', v_kasus.nama, v_kasus.boleh::int, v_n);
    UPDATE notulensi_attendance SET status = 'ALFA'
      WHERE id = CASE v_kasus.att WHEN 'a' THEN v_att_a WHEN 'b' THEN v_att_b WHEN 'h' THEN v_att_himp ELSE v_att_arsip END;
  END LOOP;

  -- INSERT action_item: WITH CHECK menolak dengan insufficient_privilege.
  FOR v_kasus IN SELECT * FROM (VALUES
    ('AI Kadept A di notula A', v_kadept_a, 'a', true),
    ('AI Kadept A di notula B', v_kadept_a, 'b', false),
    ('AI BPH di notula A', v_bph, 'a', false),
    ('AI Ketua di himpunan', v_ketua, 'h', true),
    ('AI Kadept A di himpunan', v_kadept_a, 'h', false),
    ('AI Sekum di notula arsip (periode)', v_sekum, 'r', false)
  ) AS kasus(nama, pengguna, notula, boleh) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_kasus.pengguna::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_ditolak := false;
    BEGIN
      EXECUTE format('INSERT INTO action_item (notulensi_id, tugas) VALUES (%L::uuid, %L)',
        CASE v_kasus.notula WHEN 'a' THEN v_not_a WHEN 'b' THEN v_not_b WHEN 'h' THEN v_not_himp ELSE v_not_arsip END,
        v_kasus.nama);
    EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
    END;
    EXECUTE 'RESET ROLE';
    ASSERT v_ditolak = NOT v_kasus.boleh, format('%s: penolakan tidak sesuai (ditolak=%s)', v_kasus.nama, v_ditolak);
  END LOOP;

  -- INSERT notulensi: himpunan hanya pimpinan/Sekum; Kadept hanya departemennya.
  FOR v_kasus IN SELECT * FROM (VALUES
    ('Notulensi himpunan oleh Sekum', v_sekum, 'h', true),
    ('Notulensi himpunan oleh Kadept', v_kadept_a, 'h', false),
    ('Notulensi dept A oleh Kadept A', v_kadept_a, 'a', true),
    ('Notulensi dept B oleh Kadept A', v_kadept_a, 'b', false),
    ('Notulensi dept A oleh BPH', v_bph, 'a', false)
  ) AS kasus(nama, pengguna, dept, boleh) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_kasus.pengguna::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_ditolak := false;
    BEGIN
      EXECUTE format('INSERT INTO notulensi (periode_id, departemen_id, judul, tanggal) VALUES (%L::uuid, %s, %L, CURRENT_DATE)',
        v_aktif,
        CASE v_kasus.dept
          WHEN 'a' THEN quote_literal(v_dept_a::text) || '::uuid'
          WHEN 'b' THEN quote_literal(v_dept_b::text) || '::uuid'
          ELSE 'NULL' END,
        v_kasus.nama);
    EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
    END;
    EXECUTE 'RESET ROLE';
    ASSERT v_ditolak = NOT v_kasus.boleh, format('%s: penolakan notulensi tidak sesuai (ditolak=%s)', v_kasus.nama, v_ditolak);
  END LOOP;

  -- BPH tetap membaca kehadiran & action item.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bph::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM notulensi_attendance WHERE id = v_att_a;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 1, 'BPH kehilangan hak baca kehadiran';

  RAISE NOTICE 'OK: 12 UPDATE kehadiran, 6 INSERT action_item, 5 INSERT notulensi, baca BPH';
END $$;
