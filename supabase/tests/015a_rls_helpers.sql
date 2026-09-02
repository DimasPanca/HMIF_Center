-- Test migrasi 015a — fungsi pembantu RLS.
--
-- Helper ini menjadi dasar seluruh policy di 015b. Kalau salah satunya
-- mengembalikan NULL atau melewatkan sebuah jalur keanggotaan, kesalahannya
-- tidak muncul sebagai error melainkan sebagai akses yang diam-diam hilang
-- atau diam-diam terbuka. Karena itu yang diuji di sini bukan hanya nilainya,
-- tetapi juga sifat fungsinya: SECURITY DEFINER, STABLE, dan search_path
-- terkunci.
--
-- auth.uid() dipalsukan lewat request.jwt.claims, persis seperti yang
-- dilakukan Supabase saat meneruskan JWT.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-037 · SYSTEM_DESIGN §5.2 · INV-01..INV-04, INV-08

DO $$
DECLARE
  v_aktif    UUID;
  v_arsip    UUID;
  v_dept1    UUID;
  v_dept2    UUID;
  v_polos    UUID := '4a000000-0000-0000-0000-000000000001';
  v_kadept   UUID := '4a000000-0000-0000-0000-000000000002';
  v_ketua    UUID := '4a000000-0000-0000-0000-000000000003';
  v_bph      UUID := '4a000000-0000-0000-0000-000000000004';
  v_kapel    UUID := '4a000000-0000-0000-0000-000000000005';
  v_panitia  UUID := '4a000000-0000-0000-0000-000000000006';
  v_proker1  UUID;
  v_proker2  UUID;
  v_kep1     UUID;
  v_kep2     UUID;
  v_divisi   UUID;
  v_jumlah   INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar: dua periode, supaya kebocoran lintas periode terlihat.
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2026/2027', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_aktif;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2025/2026', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_arsip;

  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  RETURNING id INTO v_dept1;
  INSERT INTO departemen (kode, nama, warna) VALUES ('MIKAT', 'Minat dan Bakat', '#22C55E')
  RETURNING id INTO v_dept2;

  INSERT INTO app_user (id, nama_lengkap, nim, email) VALUES
    (v_polos,   'Tanpa Peran',      '3337220401', 'polos@rls.test'),
    (v_kadept,  'Kepala Kaderisasi','3337220402', 'kadept@rls.test'),
    (v_ketua,   'Ketua Umum',       '3337220403', 'ketua@rls.test'),
    (v_bph,     'Anggota BPH',      '3337220404', 'bph@rls.test'),
    (v_kapel,   'Ketua Pelaksana',  '3337220405', 'kapel@rls.test'),
    (v_panitia, 'Panitia Divisi',   '3337220406', 'panitia@rls.test');

  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_kadept, v_aktif, 'KADEPT', v_dept1),
    (v_ketua,  v_aktif, 'KETUA',  NULL),
    (v_bph,    v_aktif, 'BPH',    NULL),
    -- Peran periode LALU. Tidak boleh terbawa ke periode aktif.
    (v_polos,  v_arsip, 'KADEPT', v_dept2);

  ---------------------------------------------------------------------------
  -- 1. PENGGUNA TANPA PERAN PADA PERIODE AKTIF
  --
  --    Ini keadaan paling berbahaya kalau salah: pengguna baru, atau mantan
  --    pengurus yang perannya sudah berakhir. Semua helper harus mengembalikan
  --    array KOSONG, bukan NULL — policy memakai `= ANY(...)` dan NULL membuat
  --    seluruh perbandingan menjadi NULL.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_polos::TEXT)::TEXT, true);

  ASSERT auth_roles() IS NOT NULL, 'auth_roles() mengembalikan NULL';
  ASSERT auth_roles() = ARRAY[]::role_code[],
    format('auth_roles() = %s untuk pengguna tanpa peran aktif', auth_roles());

  ASSERT my_departemen() IS NOT NULL, 'my_departemen() mengembalikan NULL';
  ASSERT my_departemen() = ARRAY[]::UUID[],
    'Peran periode ARSIP terbawa ke periode aktif — kebocoran lintas periode (INV-08)';

  ASSERT my_divisi()      = ARRAY[]::UUID[], 'my_divisi() tidak kosong';
  ASSERT my_kepanitiaan() = ARRAY[]::UUID[], 'my_kepanitiaan() tidak kosong';

  ASSERT NOT has_role('KETUA'::role_code), 'has_role() true untuk pengguna tanpa peran';
  ASSERT NOT is_pimpinan(), 'is_pimpinan() true untuk pengguna tanpa peran';

  ---------------------------------------------------------------------------
  -- 2. KADEPT — hanya departemennya sendiri
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_kadept::TEXT)::TEXT, true);

  ASSERT auth_roles() = ARRAY['KADEPT']::role_code[],
    format('auth_roles() KADEPT = %s', auth_roles());
  ASSERT my_departemen() = ARRAY[v_dept1],
    'my_departemen() tidak mengembalikan departemen yang dinaungi';
  ASSERT NOT (v_dept2 = ANY(my_departemen())),
    'KADEPT melihat departemen lain';
  ASSERT has_role('KADEPT'::role_code), 'has_role(KADEPT) false untuk KADEPT';
  ASSERT has_role('KETUA'::role_code, 'KADEPT'::role_code),
    'has_role() gagal saat salah satu dari beberapa role cocok';
  ASSERT NOT is_pimpinan(), 'KADEPT dianggap pimpinan — akses lintas departemen bocor';

  ---------------------------------------------------------------------------
  -- 3. KETUA — pimpinan
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_ketua::TEXT)::TEXT, true);

  ASSERT is_pimpinan(), 'KETUA tidak dianggap pimpinan';
  ASSERT my_departemen() = ARRAY[]::UUID[],
    'KETUA punya departemen — seharusnya kosong karena aksesnya lintas departemen';

  ---------------------------------------------------------------------------
  -- 4. BPH IKUT is_pimpinan()
  --
  --    Ini bukan cacat, melainkan hal yang harus diketahui: BPH berhak
  --    MELIHAT lintas departemen (PRD §4.4), tetapi tidak pernah menulis
  --    (INV-03). Test ini mengunci kenyataan itu supaya penulis policy 015b
  --    tidak memakai is_pimpinan() pada policy tulis.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_bph::TEXT)::TEXT, true);

  ASSERT is_pimpinan(),
    'BPH tidak dianggap pimpinan — akses baca lintas departemen hilang (PRD 4.4)';
  ASSERT has_role('BPH'::role_code), 'has_role(BPH) false untuk BPH';

  ---------------------------------------------------------------------------
  -- 4b. ROLE PALSU DI DALAM JWT DIABAIKAN (INV-02)
  --
  --     JWT dibuat server Supabase, tetapi isinya tidak boleh menjadi sumber
  --     kebenaran otorisasi. Bila klaim tambahan pernah bisa disisipkan —
  --     lewat metadata pengguna yang dapat disunting sendiri, misalnya —
  --     helper ini harus tetap membaca user_role, bukan klaimnya.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_polos::TEXT,
                                       'role', 'ADMIN',
                                       'user_role', 'ADMIN')::TEXT, true);

  ASSERT auth_roles() = ARRAY[]::role_code[],
    format('Role dari klaim JWT terbaca: %s — klien dapat menaikkan haknya sendiri (INV-02)', auth_roles());
  ASSERT NOT has_role('ADMIN'::role_code), 'Klaim ADMIN palsu di JWT diterima';
  ASSERT NOT is_pimpinan(), 'Klaim palsu di JWT menjadikan pengguna pimpinan';

  ---------------------------------------------------------------------------
  -- 5. my_kepanitiaan() — DUA JALUR KETERLIBATAN
  --
  --    Versi SYSTEM_DESIGN §5.2 menggabungkan dua SELECT beragregat dengan
  --    UNION, yang hanya mengambil baris pertama sehingga cabang ketua
  --    pelaksana hilang seluruhnya. Dua blok di bawah mengunci kedua jalur.
  ---------------------------------------------------------------------------
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
  VALUES (v_aktif, v_dept1, 'Acara Pertama', 'BERKALA', v_kadept) RETURNING id INTO v_proker1;
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
  VALUES (v_aktif, v_dept2, 'Acara Kedua', 'BERKALA', v_kadept) RETURNING id INTO v_proker2;

  INSERT INTO kepanitiaan (proker_id, nama_acara, ketua_pelaksana)
  VALUES (v_proker1, 'Acara Pertama', v_kapel) RETURNING id INTO v_kep1;
  INSERT INTO kepanitiaan (proker_id, nama_acara)
  VALUES (v_proker2, 'Acara Kedua') RETURNING id INTO v_kep2;

  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep2, 'Konsumsi')
  RETURNING id INTO v_divisi;

  -- 5a. HANYA ketua pelaksana, tidak terdaftar di divisi mana pun.
  --     Inilah kasus yang hilang pada versi spesifikasi.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_kapel::TEXT)::TEXT, true);

  ASSERT my_divisi() = ARRAY[]::UUID[], 'Ketua pelaksana terdaftar di divisi';
  ASSERT my_kepanitiaan() = ARRAY[v_kep1],
    format('Ketua pelaksana memperoleh %s — kehilangan akses ke acaranya sendiri', my_kepanitiaan());

  -- 5b. Merangkap: anggota divisi pada satu acara, ketua pelaksana pada acara lain.
  INSERT INTO divisi_member (divisi_id, user_id) VALUES (v_divisi, v_kapel);

  SELECT array_length(my_kepanitiaan(), 1) INTO v_jumlah;
  ASSERT v_jumlah = 2,
    format('my_kepanitiaan() mengembalikan %s kepanitiaan, seharusnya 2 — dua jalur tidak digabung', v_jumlah);
  ASSERT v_kep1 = ANY(my_kepanitiaan()), 'Jalur ketua pelaksana hilang saat merangkap';
  ASSERT v_kep2 = ANY(my_kepanitiaan()), 'Jalur keanggotaan divisi hilang saat merangkap';

  -- 5c. Anggota divisi biasa hanya melihat acaranya sendiri.
  INSERT INTO divisi_member (divisi_id, user_id) VALUES (v_divisi, v_panitia);
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_panitia::TEXT)::TEXT, true);

  ASSERT my_divisi() = ARRAY[v_divisi], 'my_divisi() tidak mengembalikan divisi yang diikuti';
  ASSERT my_kepanitiaan() = ARRAY[v_kep2], 'Anggota divisi melihat kepanitiaan yang bukan miliknya';

  ---------------------------------------------------------------------------
  -- 6. TANPA JWT SAMA SEKALI
  --    Koneksi service dan cron. Semua helper harus kosong, bukan error.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);

  ASSERT auth_roles()     = ARRAY[]::role_code[], 'auth_roles() tidak kosong tanpa JWT';
  ASSERT my_departemen()  = ARRAY[]::UUID[],      'my_departemen() tidak kosong tanpa JWT';
  ASSERT my_divisi()      = ARRAY[]::UUID[],      'my_divisi() tidak kosong tanpa JWT';
  ASSERT my_kepanitiaan() = ARRAY[]::UUID[],      'my_kepanitiaan() tidak kosong tanpa JWT';
  ASSERT NOT is_pimpinan(), 'is_pimpinan() true tanpa JWT';

  ---------------------------------------------------------------------------
  -- 7. SIFAT FUNGSI — search_path terkunci pada SEMUA helper
  --
  --    SECURITY DEFINER tanpa search_path terkunci adalah jalan pintas
  --    menjadi Admin: pemanggil membuat tabel `user_role` palsu di schema
  --    miliknya, menaruhnya di depan search_path, dan fungsi ini membacanya
  --    dengan hak pemilik database.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('auth_roles','has_role','my_departemen',
                      'my_divisi','my_kepanitiaan','is_pimpinan');
  ASSERT v_jumlah = 6, format('Terpasang %s helper, seharusnya 6', v_jumlah);

  SELECT count(*)::INT INTO v_jumlah
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('auth_roles','has_role','my_departemen',
                      'my_divisi','my_kepanitiaan','is_pimpinan')
    AND p.prosecdef
    AND p.provolatile = 's'
    AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) c
                 WHERE c LIKE 'search\_path=%');
  ASSERT v_jumlah = 6,
    format('Hanya %s dari 6 helper yang SECURITY DEFINER + STABLE + search_path terkunci', v_jumlah);

  RAISE NOTICE 'OK 015a_rls_helpers - array kosong bukan NULL, peran arsip tidak bocor, dua jalur kepanitiaan digabung, search_path terkunci';
END $$;
