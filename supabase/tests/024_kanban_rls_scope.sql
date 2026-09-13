-- Runner membungkus seluruh berkas dalam transaksi yang selalu di-ROLLBACK.
-- Mutasi wajib SET LOCAL ROLE authenticated: koneksi owner melewati RLS.
DO $$
DECLARE
  v_periode UUID;
  v_arsip UUID;
  v_dept_a UUID;
  v_dept_b UUID;
  v_proker_a UUID;
  v_proker_a2 UUID;
  v_proker_b UUID;
  v_proker_lama UUID;
  v_kep_a UUID;
  v_kep_b UUID;
  v_kep_lama UUID;
  v_div_a UUID;
  v_div_a2 UUID;
  v_div_b UUID;
  v_div_lama UUID;
  v_admin UUID := gen_random_uuid();
  v_anggota UUID := gen_random_uuid();
  v_bph UUID := gen_random_uuid();
  v_ganda UUID := gen_random_uuid();
  v_dua_dept UUID := gen_random_uuid();
  v_kadept UUID := gen_random_uuid();
  v_ketua UUID := gen_random_uuid();
  v_lintas UUID := gen_random_uuid();
  v_ketuplak UUID := gen_random_uuid();
  v_koordinator UUID := gen_random_uuid();
  v_lama UUID := gen_random_uuid();
  v_nonaktif UUID := gen_random_uuid();
  v_uid UUID;
  v_i INT := 0;
  v_n INT;
  v_kasus RECORD;
  v_card UUID;
  v_ditolak BOOLEAN;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Kanban aktif', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Kanban arsip', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_arsip;
  INSERT INTO departemen (kode, nama, warna)
    VALUES ('Z80A', 'Kanban A', '#123456') RETURNING id INTO v_dept_a;
  INSERT INTO departemen (kode, nama, warna)
    VALUES ('Z80B', 'Kanban B', '#654321') RETURNING id INTO v_dept_b;

  FOREACH v_uid IN ARRAY ARRAY[v_admin,v_anggota,v_bph,v_ganda,v_dua_dept,v_kadept,
                               v_ketua,v_lintas,v_ketuplak,v_koordinator,v_lama,v_nonaktif] LOOP
    v_i := v_i + 1;
    INSERT INTO app_user (id, nama_lengkap, nim, email, is_active)
      VALUES (v_uid, 'Kanban RLS ' || v_i, '33372480' || lpad(v_i::text, 2, '0'),
              'kanban-rls-' || v_i || '@uji.test', v_uid <> v_nonaktif);
  END LOOP;
  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_admin, v_periode, 'ADMIN', NULL),
    (v_anggota, v_periode, 'ANGGOTA', v_dept_a),
    -- Skema menerima departemen pada BPH: kolom itu tidak boleh memberi hak.
    (v_bph, v_periode, 'BPH', v_dept_a),
    (v_ganda, v_periode, 'ANGGOTA', v_dept_a),
    (v_ganda, v_periode, 'BPH', v_dept_b),
    (v_dua_dept, v_periode, 'ANGGOTA', v_dept_a),
    (v_dua_dept, v_periode, 'KADEPT', v_dept_b),
    (v_kadept, v_periode, 'KADEPT', v_dept_a),
    (v_ketua, v_periode, 'KETUA', NULL),
    (v_lintas, v_periode, 'ANGGOTA', v_dept_b),
    (v_ketuplak, v_periode, 'SEKUM', NULL),
    (v_koordinator, v_periode, 'ANGGOTA', v_dept_b),
    (v_lama, v_arsip, 'ANGGOTA', v_dept_a),
    (v_nonaktif, v_periode, 'ANGGOTA', v_dept_a);

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, dibuat_oleh)
    VALUES (v_periode, v_dept_a, 'Kanban proker A', 'BERKALA', 'DISETUJUI', v_admin)
    RETURNING id INTO v_proker_a;
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_periode, v_dept_a, 'Kanban proker A2', 'BERKALA', v_admin)
    RETURNING id INTO v_proker_a2;
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_periode, v_dept_b, 'Kanban proker B', 'BERKALA', v_admin)
    RETURNING id INTO v_proker_b;
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_arsip, v_dept_a, 'Kanban proker lama', 'BERKALA', v_admin)
    RETURNING id INTO v_proker_lama;
  INSERT INTO kepanitiaan (proker_id, nama_acara, ketua_pelaksana)
    VALUES (v_proker_a, 'Kanban A', v_ketuplak) RETURNING id INTO v_kep_a;
  INSERT INTO kepanitiaan (proker_id, nama_acara, ketua_pelaksana)
    VALUES (v_proker_b, 'Kanban B', v_bph) RETURNING id INTO v_kep_b;
  INSERT INTO kepanitiaan (proker_id, nama_acara)
    VALUES (v_proker_lama, 'Kanban lama') RETURNING id INTO v_kep_lama;
  INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id)
    VALUES (v_kep_a, 'Acara', v_koordinator) RETURNING id INTO v_div_a;
  INSERT INTO divisi (kepanitiaan_id, nama)
    VALUES (v_kep_a, 'PDD') RETURNING id INTO v_div_a2;
  INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id)
    VALUES (v_kep_b, 'Acara', v_bph) RETURNING id INTO v_div_b;
  INSERT INTO divisi (kepanitiaan_id, nama)
    VALUES (v_kep_lama, 'Acara') RETURNING id INTO v_div_lama;
  INSERT INTO divisi_member (divisi_id, user_id) VALUES
    (v_div_a, v_anggota), (v_div_a, v_ganda), (v_div_a, v_lintas),
    (v_div_b, v_bph), (v_div_lama, v_anggota);

  -- Setiap kasus menguji baris lama (USING) dengan UPDATE nyata, hitungan
  -- row_count, dan pembacaan ulang oleh owner untuk membuktikan hasil simpan.
  FOR v_kasus IN SELECT * FROM (VALUES
    ('Anggota departemen sendiri', v_anggota, v_dept_a, NULL::uuid, NULL::uuid, true),
    ('Anggota departemen lain', v_anggota, v_dept_b, NULL, NULL, false),
    ('Proker sendiri tanpa departemen', v_anggota, NULL, v_proker_a, NULL, true),
    ('Proker lain tanpa departemen', v_anggota, NULL, v_proker_b, NULL, false),
    ('Divisi sendiri tanpa departemen/proker', v_anggota, NULL, NULL, v_div_a, true),
    ('Divisi lain pada departemen sendiri', v_anggota, NULL, NULL, v_div_a2, false),
    ('Divisi lain dengan departemen eksplisit', v_anggota, v_dept_a, v_proker_a, v_div_a2, false),
    ('Konteks lengkap sah', v_anggota, v_dept_a, v_proker_a, v_div_a, true),
    ('Departemen palsu pada proker asing', v_anggota, v_dept_a, v_proker_b, NULL, false),
    ('Departemen palsu pada divisi asing', v_anggota, v_dept_a, NULL, v_div_b, false),
    ('Proker palsu pada divisi satu departemen', v_anggota, NULL, v_proker_a2, v_div_a, false),
    ('BPH dengan departemen', v_bph, v_dept_a, NULL, NULL, false),
    ('BPH sekaligus member/koordinator/ketuplak', v_bph, NULL, NULL, v_div_b, false),
    ('BPH+Anggota sah', v_ganda, v_dept_a, NULL, NULL, true),
    ('BPH tidak menyumbang departemen kedua', v_ganda, v_dept_b, NULL, NULL, false),
    ('BPH+Anggota divisi sah', v_ganda, NULL, NULL, v_div_a, true),
    ('Multi-role departemen pertama', v_dua_dept, v_dept_a, NULL, NULL, true),
    ('Multi-role departemen kedua', v_dua_dept, v_dept_b, NULL, NULL, true),
    ('Kadept proker sendiri', v_kadept, NULL, v_proker_a, NULL, true),
    ('Kadept proker lain', v_kadept, NULL, v_proker_b, NULL, false),
    ('Kadept bukan anggota divisi', v_kadept, NULL, NULL, v_div_a, false),
    ('Ketua tanpa penugasan hanya baca', v_ketua, v_dept_a, NULL, NULL, false),
    ('Panitia lintas departemen sah', v_lintas, NULL, NULL, v_div_a, true),
    ('Panitia tidak menguasai board departemen PIC', v_lintas, v_dept_a, NULL, NULL, false),
    ('Koordinator lintas departemen sah', v_koordinator, NULL, NULL, v_div_a, true),
    ('Ketua pelaksana semua divisi acaranya', v_ketuplak, NULL, NULL, v_div_a2, true),
    ('Ketua pelaksana bukan acara lain', v_ketuplak, NULL, NULL, v_div_b, false),
    ('Role periode lama ditolak', v_lama, v_dept_a, NULL, NULL, false),
    ('Proker arsip ditolak', v_anggota, NULL, v_proker_lama, NULL, false),
    ('Divisi arsip ditolak', v_anggota, NULL, NULL, v_div_lama, false),
    ('Pengguna nonaktif ditolak', v_nonaktif, v_dept_a, NULL, NULL, false),
    ('Admin lintas departemen', v_admin, NULL, v_proker_b, NULL, true),
    ('Admin divisi', v_admin, NULL, NULL, v_div_b, true),
    ('Admin tetap tidak menulis arsip', v_admin, NULL, v_proker_lama, NULL, false),
    ('Admin menolak konteks bertentangan', v_admin, v_dept_a, v_proker_b, NULL, false)
  ) AS kasus(nama, pengguna, departemen, proker, divisi, boleh) LOOP
    INSERT INTO kanban_card (departemen_id, proker_id, divisi_id, judul, created_by)
      VALUES (v_kasus.departemen, v_kasus.proker, v_kasus.divisi, v_kasus.nama, v_admin)
      RETURNING id INTO v_card;
    -- Role/lingkup palsu di JWT tidak boleh menggantikan auth.uid + user_role.
    PERFORM set_config('request.jwt.claims', json_build_object(
      'sub', v_kasus.pengguna::text, 'role', 'ADMIN', 'departemen_id', v_dept_b)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    ASSERT current_user = 'authenticated', 'Test tidak benar-benar memakai RLS';
    UPDATE kanban_card SET kolom = 'REVIEW' WHERE id = v_card;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    ASSERT v_n = CASE WHEN v_kasus.boleh THEN 1 ELSE 0 END,
      format('%s: expected %s baris, actual %s', v_kasus.nama, v_kasus.boleh::int, v_n);
    ASSERT (SELECT kolom::text FROM kanban_card WHERE id = v_card)
      = CASE WHEN v_kasus.boleh THEN 'REVIEW' ELSE 'TODO' END,
      format('%s: keadaan tersimpan tidak sesuai', v_kasus.nama);
    DELETE FROM kanban_card WHERE id = v_card;
  END LOOP;

  INSERT INTO kanban_card (departemen_id, judul, created_by)
    VALUES (v_dept_a, 'Uji WITH CHECK', v_admin) RETURNING id INTO v_card;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_anggota::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ditolak := false;
  BEGIN
    UPDATE kanban_card SET departemen_id = v_dept_b WHERE id = v_card;
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'WITH CHECK membiarkan kartu dipindahkan ke departemen asing';
  v_ditolak := false;
  BEGIN
    UPDATE kanban_card SET proker_id = v_proker_b WHERE id = v_card;
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'WITH CHECK membiarkan proker asing disisipkan';
  v_ditolak := false;
  BEGIN
    UPDATE kanban_card SET divisi_id = v_div_a2 WHERE id = v_card;
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'WITH CHECK membiarkan pindah ke divisi tanpa penugasan';
  EXECUTE 'RESET ROLE';
  ASSERT (SELECT departemen_id = v_dept_a AND proker_id IS NULL AND divisi_id IS NULL
            FROM kanban_card WHERE id = v_card), 'Konteks berubah sesudah penolakan';

  FOR v_kasus IN SELECT * FROM (VALUES
    ('INSERT Anggota sendiri', v_anggota, v_dept_a, true),
    ('INSERT Anggota asing', v_anggota, v_dept_b, false),
    ('INSERT BPH', v_bph, v_dept_a, false),
    ('INSERT BPH+Anggota', v_ganda, v_dept_a, true)
  ) AS kasus(nama, pengguna, departemen, boleh) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_kasus.pengguna::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_ditolak := false;
    BEGIN
      INSERT INTO kanban_card (departemen_id, judul, created_by)
        VALUES (v_kasus.departemen, v_kasus.nama, v_kasus.pengguna);
    EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
    END;
    EXECUTE 'RESET ROLE';
    ASSERT v_ditolak = NOT v_kasus.boleh, format('%s: penolakan tidak sesuai', v_kasus.nama);
    ASSERT (SELECT count(*) FROM kanban_card WHERE judul = v_kasus.nama) = v_kasus.boleh::int,
      format('%s: jumlah tersimpan tidak sesuai', v_kasus.nama);
  END LOOP;

  -- Anggota tetap tidak mendapat D, dan BPH tetap bisa membaca.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_anggota::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM kanban_card WHERE id = v_card;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 0, 'Anggota memperoleh hak hapus';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bph::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM kanban_card WHERE id = v_card;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 1, 'BPH kehilangan hak baca';

  -- Progres agregat tetap dihitung dari kolom kartu dan terlihat lewat view
  -- security_invoker sesudah UPDATE menggunakan sesi RLS yang sah.
  INSERT INTO kanban_card (proker_id, judul, kolom, created_by)
    VALUES (v_proker_a, 'Progres selesai', 'DONE', v_admin);
  INSERT INTO kanban_card (proker_id, judul, kolom, created_by)
    VALUES (v_proker_a, 'Progres belum', 'TODO', v_admin) RETURNING id INTO v_card;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_anggota::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT (SELECT progres FROM v_master_gantt WHERE proker_id = v_proker_a) = 50,
    'Progres awal harus 50';
  UPDATE kanban_card SET kolom = 'DONE' WHERE id = v_card;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 1, 'Mutasi progres yang sah gagal';
  ASSERT (SELECT progres FROM v_master_gantt WHERE proker_id = v_proker_a) = 100,
    'Master Gantt tidak mencerminkan kartu Done';
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'OK: 35 kasus UPDATE, 3 WITH CHECK, 4 INSERT, hak baca/hapus, progres 50 -> 100';
END $$;
