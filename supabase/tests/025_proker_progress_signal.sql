-- Runner membungkus berkas dalam transaksi ROLLBACK; owner membuat fixture,
-- SET LOCAL ROLE authenticated membuktikan RLS/ACL sesi sungguhan.
DO $$
DECLARE
  v_periode uuid;
  v_arsip uuid;
  v_dept uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_lama uuid;
  v_card uuid;
  v_admin uuid := gen_random_uuid();
  v_anggota uuid := gen_random_uuid();
  v_bph uuid := gen_random_uuid();
  v_nonaktif uuid := gen_random_uuid();
  v_i int := 0;
  v_user uuid;
  v_n int;
  v_rev bigint;
  v_tolak boolean;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename='proker_progress_signal'
  ), 'sinyal tidak ada di publication';
  ASSERT (SELECT relreplident='f' FROM pg_class
          WHERE oid='public.proker_progress_signal'::regclass),
    'REPLICA IDENTITY FULL wajib';
  ASSERT NOT has_table_privilege('authenticated', 'public.proker_progress_signal', 'INSERT'),
    'klien mendapat INSERT sinyal';
  ASSERT NOT has_table_privilege('authenticated', 'public.proker_progress_signal', 'UPDATE'),
    'klien mendapat UPDATE sinyal';
  ASSERT NOT has_table_privilege('authenticated', 'public.proker_progress_signal', 'DELETE'),
    'klien mendapat DELETE sinyal';
  ASSERT NOT has_table_privilege('anon', 'public.proker_progress_signal', 'SELECT'),
    'anon mendapat payload sinyal';

  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Signal aktif', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Signal arsip', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_arsip;
  INSERT INTO departemen (kode, nama, warna)
    VALUES ('Z25S', 'Signal', '#123456') RETURNING id INTO v_dept;
  FOREACH v_user IN ARRAY ARRAY[v_admin,v_anggota,v_bph,v_nonaktif] LOOP
    v_i := v_i + 1;
    INSERT INTO app_user (id,nama_lengkap,nim,email,is_active)
      VALUES (v_user, 'Signal ' || v_i, '3898025' || lpad(v_i::text, 3, '0'),
        'signal-' || v_i || '@uji.test', v_user <> v_nonaktif);
  END LOOP;
  INSERT INTO user_role (user_id,periode_id,role,departemen_id) VALUES
    (v_admin,v_periode,'ADMIN',NULL),
    (v_anggota,v_periode,'ANGGOTA',v_dept),
    (v_bph,v_periode,'BPH',NULL),
    (v_nonaktif,v_periode,'ANGGOTA',v_dept);
  INSERT INTO proker (periode_id,departemen_id,nama,kategori,status,dibuat_oleh)
    VALUES (v_periode,v_dept,'Signal proker 1','BERKALA','DISETUJUI',v_admin)
    RETURNING id INTO v_p1;
  INSERT INTO proker (periode_id,departemen_id,nama,kategori,status,dibuat_oleh)
    VALUES (v_periode,v_dept,'Signal proker 2','BERKALA','DISETUJUI',v_admin)
    RETURNING id INTO v_p2;
  INSERT INTO proker (periode_id,departemen_id,nama,kategori,status,dibuat_oleh)
    VALUES (v_arsip,v_dept,'Signal lama','BERKALA','DISETUJUI',v_admin)
    RETURNING id INTO v_lama;

  -- INSERT kartu langsung membentuk revisi, hanya untuk proker terhubung.
  INSERT INTO kanban_card (proker_id,judul,created_by)
    VALUES (v_p1,'Signal kartu',v_admin) RETURNING id INTO v_card;
  ASSERT (SELECT revision FROM proker_progress_signal WHERE proker_id=v_p1)=1,
    'INSERT tidak membuat revisi pertama';
  ASSERT (SELECT periode_id FROM proker_progress_signal WHERE proker_id=v_p1)=v_periode,
    'periode sinyal harus diturunkan dari proker, bukan request';
  UPDATE kanban_card SET judul='Signal judul lain' WHERE id=v_card;
  ASSERT (SELECT revision FROM proker_progress_signal WHERE proker_id=v_p1)=1,
    'UPDATE non-progres membuat event tak perlu';

  -- Anggota mengubah kolom pada lingkupnya; pengguna BPH di sesi LAIN harus
  -- bisa menerima sinyal dan membaca progres baru dari v_master_gantt.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_anggota::text)::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE kanban_card SET kolom='DONE' WHERE id=v_card;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n=1, 'mutasi Anggota sah ditolak';
  ASSERT (SELECT revision FROM proker_progress_signal WHERE proker_id=v_p1)=2,
    'UPDATE kolom tidak menaikkan revisi';
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_bph::text)::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM proker_progress_signal
    WHERE proker_id=v_p1 AND periode_id=v_periode AND revision=2;
  ASSERT v_n=1, 'BPH sesi lain tidak menerima sinyal lintas pengguna';
  ASSERT (SELECT progres FROM v_master_gantt WHERE proker_id=v_p1)=100,
    'BPH tidak membaca progres terbaru';
  v_tolak := false;
  BEGIN
    UPDATE proker_progress_signal SET revision=999 WHERE proker_id=v_p1;
  EXCEPTION WHEN insufficient_privilege THEN v_tolak := true;
  END;
  ASSERT v_tolak, 'BPH mampu memalsukan sinyal';
  EXECUTE 'RESET ROLE';

  -- Perpindahan kartu antar-proker harus menginvalidasi keduanya.
  UPDATE kanban_card SET proker_id=v_p2 WHERE id=v_card;
  ASSERT (SELECT revision FROM proker_progress_signal WHERE proker_id=v_p1)=3,
    'proker lama tidak diinvalidasi';
  ASSERT (SELECT revision FROM proker_progress_signal WHERE proker_id=v_p2)=1,
    'proker baru tidak diinvalidasi';
  DELETE FROM kanban_card WHERE id=v_card;
  ASSERT (SELECT revision FROM proker_progress_signal WHERE proker_id=v_p2)=2,
    'DELETE kartu tidak menginvalidasi proker';

  INSERT INTO kanban_card (proker_id,judul,created_by)
    VALUES (v_lama,'Signal arsip',v_admin);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_anggota::text)::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM proker_progress_signal WHERE proker_id=v_lama;
  ASSERT v_n=0, 'sinyal periode arsip terlihat pada sesi aktif';
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_nonaktif::text)::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM proker_progress_signal WHERE proker_id=v_p1;
  ASSERT v_n=0, 'pengguna nonaktif menerima sinyal';
  EXECUTE 'RESET ROLE';

  -- Menghapus induk tak boleh menyisakan sinyal yatim.
  DELETE FROM proker WHERE id=v_p2;
  ASSERT NOT EXISTS (SELECT 1 FROM proker_progress_signal WHERE proker_id=v_p2),
    'sinyal yatim setelah proker dihapus';
  RAISE NOTICE 'OK: publication/ACL, INSERT/UPDATE/DELETE, cross-user RLS, arsip, nonaktif, cascade';
END $$;
