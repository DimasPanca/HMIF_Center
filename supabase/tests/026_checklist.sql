-- T-081 — RLS checklist_item & template checklist mengikuti lingkup kartu induk.
-- Runner membungkus berkas dalam transaksi yang selalu di-ROLLBACK.
-- Mutasi wajib SET LOCAL ROLE authenticated: koneksi owner melewati RLS.
DO $$
DECLARE
  v_periode UUID;
  v_arsip UUID;
  v_dept_a UUID;
  v_dept_b UUID;
  v_proker_a UUID;
  v_proker_b UUID;
  v_admin UUID := gen_random_uuid();
  v_anggota_a UUID := gen_random_uuid();
  v_lintas_b UUID := gen_random_uuid();
  v_bph UUID := gen_random_uuid();
  v_ganda UUID := gen_random_uuid();      -- ANGGOTA A + BPH B
  v_dua_dept UUID := gen_random_uuid();   -- ANGGOTA A + KADEPT B
  v_kadept_a UUID := gen_random_uuid();
  v_card_a UUID;
  v_card_b UUID;
  v_card_konflik UUID;   -- departemen A tetapi proker B (bertentangan)
  v_item_a UUID;
  v_item_b UUID;
  v_item_konflik UUID;
  v_uid UUID;
  v_i INT := 0;
  v_n INT;
  v_kasus RECORD;
  v_ditolak BOOLEAN;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Checklist aktif', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Checklist arsip', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_arsip;
  INSERT INTO departemen (kode, nama, warna) VALUES ('Z81A', 'Checklist A', '#111111') RETURNING id INTO v_dept_a;
  INSERT INTO departemen (kode, nama, warna) VALUES ('Z81B', 'Checklist B', '#222222') RETURNING id INTO v_dept_b;

  FOREACH v_uid IN ARRAY ARRAY[v_admin,v_anggota_a,v_lintas_b,v_bph,v_ganda,v_dua_dept,v_kadept_a] LOOP
    v_i := v_i + 1;
    INSERT INTO app_user (id, nama_lengkap, nim, email, is_active)
      VALUES (v_uid, 'Checklist ' || v_i, '33372481' || lpad(v_i::text, 2, '0'),
              'checklist-' || v_i || '@uji.test', true);
  END LOOP;
  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_admin, v_periode, 'ADMIN', NULL),
    (v_anggota_a, v_periode, 'ANGGOTA', v_dept_a),
    (v_lintas_b, v_periode, 'ANGGOTA', v_dept_b),
    -- BPH dengan departemen: kolom itu tidak boleh memberi hak tulis.
    (v_bph, v_periode, 'BPH', v_dept_a),
    (v_ganda, v_periode, 'ANGGOTA', v_dept_a),
    (v_ganda, v_periode, 'BPH', v_dept_b),
    (v_dua_dept, v_periode, 'ANGGOTA', v_dept_a),
    (v_dua_dept, v_periode, 'KADEPT', v_dept_b),
    (v_kadept_a, v_periode, 'KADEPT', v_dept_a);

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, dibuat_oleh)
    VALUES (v_periode, v_dept_a, 'Checklist proker A', 'BERKALA', 'DISETUJUI', v_admin) RETURNING id INTO v_proker_a;
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, dibuat_oleh)
    VALUES (v_periode, v_dept_b, 'Checklist proker B', 'BERKALA', 'DISETUJUI', v_admin) RETURNING id INTO v_proker_b;

  INSERT INTO kanban_card (departemen_id, judul, created_by) VALUES (v_dept_a, 'Kartu A', v_admin) RETURNING id INTO v_card_a;
  INSERT INTO kanban_card (departemen_id, judul, created_by) VALUES (v_dept_b, 'Kartu B', v_admin) RETURNING id INTO v_card_b;
  -- Konteks bertentangan: departemen A + proker milik departemen B.
  INSERT INTO kanban_card (departemen_id, proker_id, judul, created_by)
    VALUES (v_dept_a, v_proker_b, 'Kartu konflik', v_admin) RETURNING id INTO v_card_konflik;
  INSERT INTO checklist_item (card_id, teks) VALUES (v_card_a, 'Item A') RETURNING id INTO v_item_a;
  INSERT INTO checklist_item (card_id, teks) VALUES (v_card_b, 'Item B') RETURNING id INTO v_item_b;
  INSERT INTO checklist_item (card_id, teks) VALUES (v_card_konflik, 'Item konflik') RETURNING id INTO v_item_konflik;

  -- UPDATE: USING menyaring baris yang tak berlingkup → ROW_COUNT membedakan izin.
  FOR v_kasus IN SELECT * FROM (VALUES
    ('Anggota A pada kartu A', v_anggota_a, 'v_item_a', true),
    ('Anggota A lintas ke kartu B', v_anggota_a, 'v_item_b', false),
    ('Anggota B lintas ke kartu A', v_lintas_b, 'v_item_a', false),
    ('BPH pada kartu departemennya', v_bph, 'v_item_a', false),
    ('Kadept A pada kartu A', v_kadept_a, 'v_item_a', true),
    ('Admin pada kartu A', v_admin, 'v_item_a', true),
    ('Admin menolak kartu konflik', v_admin, 'v_item_konflik', false),
    ('Anggota A menolak kartu konflik', v_anggota_a, 'v_item_konflik', false),
    ('Multi-role A+B pada kartu A', v_dua_dept, 'v_item_a', true),
    ('Multi-role A+B pada kartu B', v_dua_dept, 'v_item_b', true),
    ('BPH+Anggota pada kartu A (via Anggota)', v_ganda, 'v_item_a', true),
    ('BPH+Anggota pada kartu B (BPH tak memberi hak)', v_ganda, 'v_item_b', false)
  ) AS kasus(nama, pengguna, item_var, boleh) LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_kasus.pengguna::text, 'role', 'ADMIN')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    ASSERT current_user = 'authenticated', 'Test tidak benar-benar memakai RLS';
    EXECUTE format('UPDATE checklist_item SET selesai = true WHERE id = %L::uuid',
      CASE v_kasus.item_var WHEN 'v_item_a' THEN v_item_a WHEN 'v_item_b' THEN v_item_b ELSE v_item_konflik END);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    ASSERT v_n = v_kasus.boleh::int, format('%s: expected %s baris, actual %s', v_kasus.nama, v_kasus.boleh::int, v_n);
    -- Pulihkan supaya kasus berikutnya bebas dari status sebelumnya.
    UPDATE checklist_item SET selesai = false
      WHERE id = CASE v_kasus.item_var WHEN 'v_item_a' THEN v_item_a WHEN 'v_item_b' THEN v_item_b ELSE v_item_konflik END;
  END LOOP;

  -- INSERT: WITH CHECK menolak dengan insufficient_privilege bila di luar lingkup.
  FOR v_kasus IN SELECT * FROM (VALUES
    ('INSERT Anggota A kartu A', v_anggota_a, 'v_card_a', true),
    ('INSERT Anggota A kartu B', v_anggota_a, 'v_card_b', false),
    ('INSERT BPH kartu A', v_bph, 'v_card_a', false),
    ('INSERT Anggota A kartu konflik', v_anggota_a, 'v_card_konflik', false)
  ) AS kasus(nama, pengguna, card_var, boleh) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_kasus.pengguna::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_ditolak := false;
    BEGIN
      EXECUTE format('INSERT INTO checklist_item (card_id, teks) VALUES (%L::uuid, %L)',
        CASE v_kasus.card_var WHEN 'v_card_a' THEN v_card_a WHEN 'v_card_b' THEN v_card_b ELSE v_card_konflik END,
        v_kasus.nama);
    EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
    END;
    EXECUTE 'RESET ROLE';
    ASSERT v_ditolak = NOT v_kasus.boleh, format('%s: penolakan tidak sesuai (ditolak=%s)', v_kasus.nama, v_ditolak);
  END LOOP;

  -- DELETE: pengelola kartu (termasuk ANGGOTA departemennya) boleh; lintas & BPH tidak.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_lintas_b::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM checklist_item WHERE id = v_item_a;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 0, 'Anggota departemen lain dapat menghapus item asing';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bph::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM checklist_item WHERE id = v_item_a;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- BPH tetap boleh MEMBACA.
  SELECT count(*) INTO v_i FROM checklist_item WHERE id = v_item_a;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 0, 'BPH memperoleh hak hapus checklist';
  ASSERT v_i = 1, 'BPH kehilangan hak baca checklist';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_anggota_a::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM checklist_item WHERE id = v_item_a;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 1, 'Anggota departemennya tidak dapat menghapus itemnya';

  -- TEMPLATE: menulis mengikuti lingkup departemen kartu.
  FOR v_kasus IN SELECT * FROM (VALUES
    ('Template Anggota A di dept A', v_anggota_a, 'a', true),
    ('Template Anggota A di dept B', v_anggota_a, 'b', false),
    ('Template BPH di dept A', v_bph, 'a', false),
    ('Template Kadept A di dept A', v_kadept_a, 'a', true)
  ) AS kasus(nama, pengguna, dept, boleh) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_kasus.pengguna::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_ditolak := false;
    BEGIN
      EXECUTE format('INSERT INTO checklist_template (departemen_id, nama, dibuat_oleh) VALUES (%L::uuid, %L, %L::uuid)',
        CASE v_kasus.dept WHEN 'a' THEN v_dept_a ELSE v_dept_b END, v_kasus.nama, v_kasus.pengguna);
    EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
    END;
    EXECUTE 'RESET ROLE';
    ASSERT v_ditolak = NOT v_kasus.boleh, format('%s: penolakan template tidak sesuai (ditolak=%s)', v_kasus.nama, v_ditolak);
  END LOOP;

  RAISE NOTICE 'OK: 12 UPDATE, 4 INSERT, hak hapus/baca BPH & lintas, 4 template';
END $$;
