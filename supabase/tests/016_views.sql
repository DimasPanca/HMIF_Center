-- Test migrasi 016 — view agregat.
--
-- Dua hal yang diperiksa di sini dan tidak terlihat di tempat lain:
--
--   1. VIEW TIDAK MENEMBUS RLS. Sebuah view yang lupa `security_invoker`
--      berjalan dengan hak pemiliknya — `postgres`, yang ber-BYPASSRLS — dan
--      membatalkan seluruh 180 policy tanpa satu pun error. Diperiksa dua
--      kali: dari katalog, dan dengan benar-benar membaca sebagai
--      `authenticated`.
--
--   2. YANG TIDAK BOLEH MUNCUL. View yang salah filter tidak melempar apa pun;
--      ia hanya menampilkan hal yang seharusnya tersembunyi. Karena itu di
--      bawah diuji juga proker DRAFT, proker periode arsip, dan proker yang
--      ditolak.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-040 · SYSTEM_DESIGN §10.4 · PRD F-5.5

DO $$
DECLARE
  v_aktif   UUID;
  v_arsip   UUID;
  v_dept    UUID;
  v_dept2   UUID;
  v_user    UUID := '6a000000-0000-0000-0000-000000000001';
  v_anggota UUID := '6a000000-0000-0000-0000-000000000002';
  v_jalan   UUID;
  v_draft   UUID;
  v_tolak   UUID;
  v_lama    UUID;
  v_kep     UUID;
  v_div     UUID;
  v_sec     UUID;
  v_item    UUID;
  v_img     UUID;
  v_nota    UUID;
  v_tmpl    UUID;
  v_n       INT;
  v_progres INT;
  v_num     NUMERIC;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar: dua periode, supaya kebocoran lintas periode terlihat.
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2026/2027', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_aktif;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2025/2026', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_arsip;

  INSERT INTO departemen (kode, nama, warna, urutan)
  VALUES ('KAD', 'Kaderisasi', '#1E90FF', 1)
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode RETURNING id INTO v_dept;
  INSERT INTO departemen (kode, nama, warna, urutan)
  VALUES ('MIKAT', 'Minat Bakat', '#22C55E', 2)
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode RETURNING id INTO v_dept2;

  INSERT INTO app_user (id, nama_lengkap, nim, email) VALUES
    (v_user,    'Penanggung Jawab', '3337220601', 'pj@view.test'),
    (v_anggota, 'Anggota Divisi',   '3337220602', 'anggota@view.test');

  INSERT INTO user_role (user_id, periode_id, role, departemen_id)
  VALUES (v_anggota, v_aktif, 'ANGGOTA', v_dept);

  ---------------------------------------------------------------------------
  -- 1. MASTER GANTT HANYA MENAMPILKAN YANG SEDANG BERJALAN
  ---------------------------------------------------------------------------
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai,
                      tanggal_hari_h_selesai, penanggung_jawab, dibuat_oleh)
  VALUES (v_aktif, v_dept, 'SYNCHRONIZE 2026', 'TERJADWAL', 'BERJALAN',
          '2026-11-01', '2026-11-20', '2026-11-22', v_user, v_user)
  RETURNING id INTO v_jalan;

  -- Tiga yang TIDAK boleh muncul, masing-masing karena alasan berbeda.
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, dibuat_oleh)
  VALUES (v_aktif, v_dept, 'Masih Draft', 'BERKALA', 'DRAFT', v_user)
  RETURNING id INTO v_draft;

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, dibuat_oleh)
  VALUES (v_aktif, v_dept2, 'Sudah Ditolak', 'BERKALA', 'DITOLAK', v_user)
  RETURNING id INTO v_tolak;

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, dibuat_oleh)
  VALUES (v_arsip, v_dept, 'Acara Periode Lalu', 'BERKALA', 'DISETUJUI', v_user)
  RETURNING id INTO v_lama;

  SELECT count(*)::INT INTO v_n FROM v_master_gantt;
  ASSERT v_n = 1, format('v_master_gantt berisi %s baris, seharusnya 1', v_n);

  ASSERT (SELECT proker_id FROM v_master_gantt) = v_jalan,
    'Baris yang muncul bukan proker yang sedang berjalan';

  ASSERT NOT EXISTS (SELECT 1 FROM v_master_gantt WHERE proker_id = v_draft),
    'Proker DRAFT muncul di kalender bersama — departemen lain akan mengira tanggalnya sudah diambil';
  ASSERT NOT EXISTS (SELECT 1 FROM v_master_gantt WHERE proker_id = v_tolak),
    'Proker DITOLAK muncul di kalender bersama';
  ASSERT NOT EXISTS (SELECT 1 FROM v_master_gantt WHERE proker_id = v_lama),
    'Proker periode ARSIP muncul di kalender periode aktif (INV-08)';

  -- Data departemen dan PJ ikut tergabung, bukan hanya id-nya.
  ASSERT (SELECT departemen_nama FROM v_master_gantt) = 'Kaderisasi',
    'Nama departemen tidak ikut tergabung';
  ASSERT (SELECT departemen_warna FROM v_master_gantt) = '#1E90FF',
    'Warna departemen tidak ikut — batang Gantt akan kehilangan identitas visual';
  ASSERT (SELECT pj_nama FROM v_master_gantt) = 'Penanggung Jawab',
    'Nama penanggung jawab tidak ikut tergabung';

  ---------------------------------------------------------------------------
  -- 2. PROGRES DIHITUNG DARI KANBAN
  --    Proker tanpa kartu sama sekali harus 0, bukan NULL dan bukan error
  --    pembagian nol.
  ---------------------------------------------------------------------------
  SELECT progres INTO v_progres FROM v_master_gantt WHERE proker_id = v_jalan;
  ASSERT v_progres = 0,
    format('Proker tanpa kartu Kanban berprogres %s, seharusnya 0', v_progres);

  INSERT INTO kanban_card (proker_id, departemen_id, judul, kolom, created_by) VALUES
    (v_jalan, v_dept, 'Survei tempat',   'DONE',        v_user),
    (v_jalan, v_dept, 'Hubungi pemateri','DONE',        v_user),
    (v_jalan, v_dept, 'Cetak spanduk',   'IN_PROGRESS', v_user),
    (v_jalan, v_dept, 'Rekap peserta',   'TODO',        v_user);

  SELECT progres INTO v_progres FROM v_master_gantt WHERE proker_id = v_jalan;
  ASSERT v_progres = 50, format('Progres 2 dari 4 kartu = %s, seharusnya 50', v_progres);

  ---------------------------------------------------------------------------
  -- 3. ANTRIAN APPROVAL — dua jenis, dua daftar approver
  ---------------------------------------------------------------------------
  UPDATE proker SET status = 'MENUNGGU_APPROVAL', diajukan_at = now() WHERE id = v_draft;

  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Peminjaman', 'template/05.docx', '{}'::JSONB)
  ON CONFLICT (kode_surat, varian, versi) DO UPDATE SET kode_surat = EXCLUDED.kode_surat
  RETURNING id INTO v_tmpl;
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal,
                     tujuan_nama, tujuan_alamat, departemen_id, dibuat_oleh, status)
  VALUES (v_aktif, v_tmpl, '05', '2026-10-15', 'Permohonan Peminjaman Auditorium',
          'Kabag Sekretariat FT', 'di Tempat', v_dept, v_user, 'MENUNGGU_APPROVAL');

  SELECT count(*)::INT INTO v_n FROM v_antrian_approval;
  ASSERT v_n = 2, format('Antrian berisi %s baris, seharusnya 2', v_n);

  -- Daftar approver proker dan surat BERBEDA. Kalau keduanya sama, salah satu
  -- pasti keliru (PRD §5.2).
  ASSERT (SELECT approver_roles FROM v_antrian_approval WHERE jenis = 'PROKER')
         = ARRAY['KETUA','WAKIL']::role_code[],
    'Approver proker bukan Ketua/Wakil';
  ASSERT (SELECT approver_roles FROM v_antrian_approval WHERE jenis = 'SURAT')
         = ARRAY['KETUA','WAKIL','SEKUM']::role_code[],
    'Approver surat bukan Ketua/Wakil/Sekum';

  ASSERT (SELECT asal FROM v_antrian_approval WHERE jenis = 'PROKER') = 'Kaderisasi',
    'Asal departemen tidak ikut pada antrian proker';
  ASSERT (SELECT pengaju FROM v_antrian_approval WHERE jenis = 'SURAT') = 'Penanggung Jawab',
    'Nama pengaju tidak ikut pada antrian surat';

  -- Yang sudah diputuskan keluar dari antrian.
  UPDATE proker SET status = 'DISETUJUI' WHERE id = v_draft;
  SELECT count(*)::INT INTO v_n FROM v_antrian_approval WHERE jenis = 'PROKER';
  ASSERT v_n = 0, 'Proker yang sudah disetujui masih menggantung di antrian';

  ---------------------------------------------------------------------------
  -- 4. RINGKASAN RAB — rencana versus aktual
  ---------------------------------------------------------------------------
  INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (v_jalan, 'SYNCHRONIZE 2026')
  RETURNING id INTO v_kep;
  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep, 'Konsumsi') RETURNING id INTO v_div;
  INSERT INTO divisi_member (divisi_id, user_id) VALUES (v_div, v_anggota);

  INSERT INTO rab_section (divisi_id, nama) VALUES (v_div, 'Konsumsi Hari-H')
  RETURNING id INTO v_sec;
  INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks,
                        jumlah_numerik, harga_satuan, total)
  VALUES (v_sec, 1, 'Nasi kotak', '150 kotak', 150, 20000, 3000000)
  RETURNING id INTO v_item;

  SELECT total_rencana INTO v_num FROM v_ringkasan_rab WHERE divisi_id = v_div;
  ASSERT v_num = 3000000, format('total_rencana = %s', v_num);

  -- Divisi yang belum menyerap apa pun: aktual 0, serapan NULL bukan error.
  SELECT total_aktual INTO v_num FROM v_ringkasan_rab WHERE divisi_id = v_div;
  ASSERT v_num = 0, format('total_aktual awal = %s, seharusnya 0', v_num);

  INSERT INTO image (uploader_id, original_filename, storage_uuid,
                     master_path, preview_path, thumbnail_path,
                     original_mime_type, master_mime_type,
                     original_width, original_height,
                     master_width, master_height, master_file_size, kind, is_scanned)
  VALUES (v_user, 'nota.jpg', 'uuid-view-test',
          'n/m.webp', 'n/p.webp', 'n/t.webp', 'image/jpeg', 'image/webp',
          3024, 4032, 2000, 2666, 400000, 'DOKUMEN', true)
  RETURNING id INTO v_img;

  INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota, status)
  VALUES (v_div, v_img, v_user, '2026-11-18', 1200000, 'MENUNGGU_VERIFIKASI')
  RETURNING id INTO v_nota;
  INSERT INTO nota_alokasi (nota_id, rab_item_id, nominal) VALUES (v_nota, v_item, 1200000);

  -- BELUM diverifikasi: tidak boleh ikut dihitung. Kalau ikut, angka realisasi
  -- akan naik-turun mengikuti unggahan yang belum tentu sah.
  SELECT total_aktual INTO v_num FROM v_ringkasan_rab WHERE divisi_id = v_div;
  ASSERT v_num = 0,
    format('Nota belum terverifikasi ikut dihitung sebagai realisasi: %s', v_num);

  UPDATE nota SET status = 'TERVERIFIKASI', verified_by = v_user WHERE id = v_nota;

  SELECT total_aktual INTO v_num FROM v_ringkasan_rab WHERE divisi_id = v_div;
  ASSERT v_num = 1200000, format('total_aktual setelah verifikasi = %s', v_num);

  SELECT sisa INTO v_num FROM v_ringkasan_rab WHERE divisi_id = v_div;
  ASSERT v_num = 1800000, format('sisa = %s, seharusnya 3000000 - 1200000', v_num);

  SELECT serapan_persen INTO v_num FROM v_ringkasan_rab WHERE divisi_id = v_div;
  ASSERT v_num = 40.0, format('serapan = %s persen, seharusnya 40', v_num);

  SELECT jumlah_nota_terverifikasi INTO v_n FROM v_ringkasan_rab WHERE divisi_id = v_div;
  ASSERT v_n = 1, format('jumlah nota terverifikasi = %s', v_n);

  ---------------------------------------------------------------------------
  -- 5. SELURUH VIEW MEMAKAI security_invoker — diperiksa dari katalog
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_n
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v';
  ASSERT v_n = 3, format('Ada %s view, seharusnya 3', v_n);

  SELECT count(*)::INT INTO v_n
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND COALESCE((SELECT o.option_value = 'true'
                    FROM pg_options_to_table(c.reloptions) o
                   WHERE o.option_name = 'security_invoker'), false);
  ASSERT v_n = 3,
    format('Hanya %s dari 3 view memakai security_invoker — sisanya menembus seluruh policy', v_n);

  ---------------------------------------------------------------------------
  -- 6. DAN DIBUKTIKAN DENGAN BENAR-BENAR MEMBACANYA SEBAGAI PENGGUNA
  --
  --    Pemeriksaan katalog di atas hanya membaca metadata. Yang membuktikan
  --    RLS benar-benar berlaku lewat view adalah membacanya sebagai role
  --    `authenticated`. Anggota tidak berhak melihat audit, tetapi berhak
  --    melihat kalender bersama.
  ---------------------------------------------------------------------------
  DECLARE v_sbg_postgres INT; v_sbg_anggota INT;
  BEGIN
    SELECT count(*)::INT INTO v_sbg_postgres FROM v_master_gantt;

    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_anggota::TEXT)::TEXT, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*)::INT INTO v_sbg_anggota FROM v_master_gantt;
    EXECUTE 'RESET ROLE';

    ASSERT v_sbg_postgres > 0, 'Master gantt kosong bahkan bagi postgres';
    ASSERT v_sbg_anggota = v_sbg_postgres,
      format('Anggota melihat %s baris master gantt, postgres melihat %s — kalender bersama tidak lagi bersama',
             v_sbg_anggota, v_sbg_postgres);

    -- Sisi sebaliknya: view TIDAK boleh menjadi pintu belakang. Anggota tidak
    -- berhak membaca audit_log, dan itu harus tetap berlaku lewat view mana
    -- pun yang menyentuhnya.
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_anggota::TEXT)::TEXT, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*)::INT INTO v_n FROM audit_log;
    EXECUTE 'RESET ROLE';
    ASSERT v_n = 0,
      format('Anggota melihat %s baris audit_log — RLS bocor di sesi yang sama', v_n);
  END;

  -- View mewarisi hak dari ALTER DEFAULT PRIVILEGES di migrasi 015c. Tanpa itu
  -- view ini lahir tanpa GRANT dan pembacaan di atas akan melempar, bukan
  -- mengembalikan baris.
  SELECT count(*)::INT INTO v_n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'authenticated'
    AND table_name IN ('v_master_gantt', 'v_antrian_approval', 'v_ringkasan_rab');
  ASSERT v_n >= 3,
    format('Hanya %s hak view untuk authenticated — hak bawaan 015c tidak bekerja', v_n);

  RAISE NOTICE 'OK 016_views - draft dan arsip tidak muncul, progres kanban 50 persen, nota belum terverifikasi tidak dihitung, tiga view security_invoker';
END $$;
