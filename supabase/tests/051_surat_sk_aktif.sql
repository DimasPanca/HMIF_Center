-- Test RLS ADR-036 (migrasi 051): surat resmi hanya Sekum/Admin; pengurus lain
-- hanya Surat Keterangan Aktif (kode 02) atas nama dirinya; pemohon membaca
-- suratnya sendiri. Memakai SET LOCAL ROLE authenticated seperti 015c — role
-- postgres BYPASSRLS sehingga tanpa itu tidak ada yang teruji.

DO $$
DECLARE
  v_periode UUID;
  v_dept    UUID;
  v_tmpl01  UUID;
  v_tmpl02  UUID;
  v_sekum   UUID := '5b000000-0000-0000-0000-000000000001';
  v_kadept  UUID := '5b000000-0000-0000-0000-000000000002';
  v_anggota UUID := '5b000000-0000-0000-0000-000000000003';
  v_bph     UUID := '5b000000-0000-0000-0000-000000000004';
  v_milik   UUID;
  v_n       INT;
  v_ditolak BOOLEAN;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF uji ADR-036', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode RETURNING id INTO v_dept;

  INSERT INTO app_user (id, nama_lengkap, nim, email) VALUES
    (v_sekum,   'Sekum Uji',   '3337251701', 'sekum@adr036.test'),
    (v_kadept,  'Kadept Uji',  '3337251702', 'kadept@adr036.test'),
    (v_anggota, 'Anggota Uji', '3337251703', 'anggota@adr036.test'),
    (v_bph,     'BPH Uji',     '3337251704', 'bph@adr036.test');
  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_sekum, v_periode, 'SEKUM', NULL),
    (v_kadept, v_periode, 'KADEPT', v_dept),
    (v_anggota, v_periode, 'ANGGOTA', v_dept),
    (v_bph, v_periode, 'BPH', NULL);

  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('02', 'KETERANGAN_AKTIF', 'Keterangan Aktif', 'template/02.docx', '{}'::JSONB)
  ON CONFLICT (kode_surat, varian, versi) DO UPDATE SET kode_surat = EXCLUDED.kode_surat
  RETURNING id INTO v_tmpl02;
  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('04', 'UNDANGAN_PEMATERI', 'Undangan Pemateri', 'template/04.docx', '{}'::JSONB)
  ON CONFLICT (kode_surat, varian, versi) DO UPDATE SET kode_surat = EXCLUDED.kode_surat
  RETURNING id INTO v_tmpl01;

  -- 1. Anggota: SK Aktif atas nama dirinya → boleh.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_periode, v_tmpl02, '02', '2026-10-19', '', '', '', v_anggota, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_milik;
  -- …dan membaca suratnya sendiri walau tidak berhak membaca arsip.
  SELECT count(*) INTO v_n FROM surat WHERE id = v_milik;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 1, 'Anggota TIDAK dapat membaca SK Aktif miliknya sendiri';
  RAISE NOTICE 'OK: anggota mengajukan & membaca SK Aktif dirinya';

  -- 2. Anggota: SK Aktif atas nama orang lain → ditolak.
  v_ditolak := false;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES (v_periode, v_tmpl02, '02', '2026-10-19', '', '', '', v_kadept, 'DRAFT');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'Anggota BERHASIL membuat SK Aktif atas nama orang lain';

  -- 3. Kadept: surat jenis lain (undangan pemateri) → ditolak (ADR-036).
  v_ditolak := false;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_kadept::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES (v_periode, v_tmpl01, '04', '2026-10-19', 'Undangan', 'Pemateri', 'di Tempat', v_kadept, 'DRAFT');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'Kadept BERHASIL membuat surat selain SK Aktif (ADR-036)';
  RAISE NOTICE 'OK: kadept ditolak membuat surat resmi';

  -- 4. BPH: bahkan SK Aktif dirinya pun ditolak (tidak mengajukan).
  v_ditolak := false;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bph::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES (v_periode, v_tmpl02, '02', '2026-10-19', '', '', '', v_bph, 'DRAFT');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'BPH BERHASIL mengajukan SK Aktif';

  -- 5. Sekum: surat jenis apa pun → boleh.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sekum::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_periode, v_tmpl01, '04', '2026-10-19', 'Undangan', 'Pemateri', 'di Tempat', v_sekum, 'DRAFT');
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'OK: sekum membuat surat resmi';
END $$;
