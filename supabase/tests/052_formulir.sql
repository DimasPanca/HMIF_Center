-- Test migrasi 052/053 — Formulir (ADR-038).
--   1. CHECK kategori ↔ acara, satu respons hanya INTERNAL, token acak 32 heksa.
--   2. RLS: siapa boleh membuat form organisasi / form acara.
--   3. RLS: siapa membaca struktur vs respons (BPH: struktur ya, respons TIDAK).
--   4. Tidak ada jalan INSERT respons lewat role authenticated (hanya server).
--   5. Satu respons per akun (responden_kunci unik per form).

DO $$
DECLARE
  v_periode UUID;
  v_dept UUID;
  v_proker UUID;
  v_kep UUID;
  v_divisi UUID;
  v_sekum UUID := gen_random_uuid();
  v_ketua UUID := gen_random_uuid();
  v_panitia UUID := gen_random_uuid();   -- ANGGOTA, anggota divisi acara
  v_luar UUID := gen_random_uuid();      -- ANGGOTA, bukan panitia
  v_bph UUID := gen_random_uuid();
  v_form_org UUID;
  v_form_acara UUID;
  v_bagian UUID;
  v_tanya UUID;
  v_respons UUID;
  v_uid UUID;
  v_i INT := 0;
  v_n INT;
  v_ditolak BOOLEAN;
  v_token TEXT;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Formulir uji', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO departemen (kode, nama, warna) VALUES ('Z052', 'Form Uji', '#123456') RETURNING id INTO v_dept;
  FOREACH v_uid IN ARRAY ARRAY[v_sekum, v_ketua, v_panitia, v_luar, v_bph] LOOP
    v_i := v_i + 1;
    INSERT INTO app_user (id, nama_lengkap, nim, email, is_active)
      VALUES (v_uid, 'Form ' || v_i, '77370520' || lpad(v_i::text, 2, '0'), 'form052-' || v_i || '@uji.test', true);
  END LOOP;
  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_sekum, v_periode, 'SEKUM', NULL), (v_ketua, v_periode, 'KETUA', NULL),
    (v_panitia, v_periode, 'ANGGOTA', v_dept), (v_luar, v_periode, 'ANGGOTA', v_dept),
    (v_bph, v_periode, 'BPH', v_dept);

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (v_periode, v_dept, 'Acara Form', 'TERJADWAL', 'BERJALAN', '{}'::text[],
            '2031-11-01', '2031-12-06', '2031-12-07', v_ketua) RETURNING id INTO v_proker;
  INSERT INTO kepanitiaan (proker_id, nama_acara, ketua_pelaksana) VALUES (v_proker, 'Acara Form', v_ketua) RETURNING id INTO v_kep;
  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep, 'Acara') RETURNING id INTO v_divisi;
  INSERT INTO divisi_member (divisi_id, user_id) VALUES (v_divisi, v_panitia);

  ---------------------------------------------------------------------------
  -- 1. CHECK
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO form (periode_id, kategori, judul, dibuat_oleh) VALUES (v_periode, 'PENDAFTARAN', 'Tanpa acara', v_sekum);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Form PENDAFTARAN tanpa acara DITERIMA (ADR-038 #2)';

  v_ditolak := false;
  BEGIN
    INSERT INTO form (periode_id, kepanitiaan_id, kategori, judul, dibuat_oleh) VALUES (v_periode, v_kep, 'OPEN_RECRUITMENT', 'Oprec acara', v_sekum);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Form OPEN_RECRUITMENT terikat acara DITERIMA (ADR-038 #2)';

  v_ditolak := false;
  BEGIN
    INSERT INTO form (periode_id, kategori, judul, akses, satu_respons, dibuat_oleh) VALUES (v_periode, 'LAINNYA', 'Satu respons publik', 'PUBLIK', true, v_sekum);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'satu_respons pada form PUBLIK DITERIMA — tidak dapat ditegakkan tanpa login';

  INSERT INTO form (periode_id, kategori, judul, dibuat_oleh) VALUES (v_periode, 'OPEN_RECRUITMENT', 'Oprec 2026', v_sekum)
    RETURNING id, token INTO v_form_org, v_token;
  ASSERT v_token ~ '^[0-9a-f]{32}$', format('Token tidak acak 32 heksa: %s', v_token);
  INSERT INTO form (periode_id, kepanitiaan_id, kategori, judul, dibuat_oleh) VALUES (v_periode, v_kep, 'EVALUASI', 'Evaluasi Acara', v_panitia)
    RETURNING id INTO v_form_acara;
  INSERT INTO form_bagian (form_id, urutan) VALUES (v_form_acara, 0) RETURNING id INTO v_bagian;
  INSERT INTO form_pertanyaan (form_id, bagian_id, urutan, tipe, judul) VALUES (v_form_acara, v_bagian, 0, 'SKALA', 'Kepuasan') RETURNING id INTO v_tanya;
  INSERT INTO form_respons (form_id) VALUES (v_form_acara) RETURNING id INTO v_respons;
  INSERT INTO form_jawaban (respons_id, pertanyaan_id, nilai_angka) VALUES (v_respons, v_tanya, 5);

  -- 5. Satu respons per akun.
  INSERT INTO form_respons (form_id, responden_kunci) VALUES (v_form_acara, 'kunci-a');
  v_ditolak := false;
  BEGIN
    INSERT INTO form_respons (form_id, responden_kunci) VALUES (v_form_acara, 'kunci-a');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Responden yang sama dapat merespons dua kali';

  ---------------------------------------------------------------------------
  -- 2–4. RLS
  ---------------------------------------------------------------------------
  -- Anggota bukan panitia: tidak melihat form acara, tidak boleh membuat form.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_luar::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*)::INT INTO v_n FROM form WHERE id IN (v_form_org, v_form_acara);
  ASSERT v_n = 0, format('Anggota bukan panitia melihat %s form', v_n);
  v_ditolak := false;
  BEGIN
    INSERT INTO form (periode_id, kepanitiaan_id, kategori, judul, dibuat_oleh) VALUES (v_periode, v_kep, 'EVALUASI', 'Serobot', v_luar);
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Anggota bukan panitia BERHASIL membuat form acara';
  EXECUTE 'RESET ROLE';

  -- Panitia: melihat & mengelola form acaranya, membaca respons, tidak boleh form organisasi.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_panitia::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*)::INT INTO v_n FROM form_jawaban;
  ASSERT v_n = 1, format('Panitia membaca %s jawaban form acaranya, seharusnya 1', v_n);
  v_ditolak := false;
  BEGIN
    INSERT INTO form (periode_id, kategori, judul, dibuat_oleh) VALUES (v_periode, 'OPEN_RECRUITMENT', 'Oprec liar', v_panitia);
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Anggota BERHASIL membuat form organisasi (hanya Sekum/pimpinan)';
  INSERT INTO form (periode_id, kepanitiaan_id, kategori, judul, dibuat_oleh) VALUES (v_periode, v_kep, 'PENDAFTARAN', 'Daftar Acara', v_panitia);
  v_ditolak := false;
  BEGIN
    INSERT INTO form_respons (form_id) VALUES (v_form_acara);
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Respons dapat ditulis lewat role authenticated — melewati validasi server';
  EXECUTE 'RESET ROLE';

  -- BPH: membaca struktur, TIDAK membaca respons, tidak menulis.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bph::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*)::INT INTO v_n FROM form WHERE id IN (v_form_org, v_form_acara);
  ASSERT v_n = 2, format('BPH melihat %s struktur form, seharusnya 2', v_n);
  SELECT count(*)::INT INTO v_n FROM form_respons;
  ASSERT v_n = 0, format('BPH membaca %s respons — data pribadi bocor (ADR-038 #6)', v_n);
  UPDATE form SET judul = 'Diubah BPH' WHERE id = v_form_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 0, 'BPH mengubah form (INV-03)';
  EXECUTE 'RESET ROLE';

  -- Sekum: membuat & mengelola form organisasi; template global.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sekum::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*)::INT INTO v_n FROM form_respons WHERE form_id = v_form_acara;
  ASSERT v_n = 2, format('Sekum membaca %s respons form acara, seharusnya 2', v_n);
  INSERT INTO form_template (nama, kategori) VALUES ('Template Uji 052', 'LAINNYA');
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_panitia::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ditolak := false;
  BEGIN
    INSERT INTO form_template (nama, kategori) VALUES ('Template Anggota', 'LAINNYA');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'Anggota BERHASIL menambah template global (hanya Sekum/Admin)';

  RAISE NOTICE 'OK 052_formulir — kategori↔acara, token acak, RLS pembuat/pembaca, BPH tanpa respons, respons hanya lewat server';
END $$;
