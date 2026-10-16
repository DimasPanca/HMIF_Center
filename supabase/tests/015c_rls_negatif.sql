-- Test negatif Row Level Security.
--
-- Menguji migrasi 015a (helper), 015b (policy), dan 015c (hak bawaan).
-- Namanya mengikuti kontrak T-039; angka 015c di sini menunjuk keluarga
-- migrasi RLS, bukan berkas 015c_default_privileges.sql secara khusus.
--
-- ===========================================================================
-- KENAPA BERKAS INI BERBEDA DARI SELURUH TEST LAIN
-- ===========================================================================
-- Role `postgres` di Supabase memiliki BYPASSRLS. Seluruh berkas test lain
-- berjalan lewat koneksi itu, sehingga tidak satu pun di antaranya menguji
-- otorisasi — semuanya akan tetap hijau seandainya 180 policy dihapus.
--
-- Berkas ini satu-satunya yang memakai `SET LOCAL ROLE authenticated`, dan
-- karena itu satu-satunya yang benar-benar menguji RLS.
--
-- Dua hal yang mudah membuat test RLS lulus padahal tidak menguji apa pun:
--
--   1. PENOLAKAN BACA TIDAK MELEMPAR ERROR. RLS menyaring baris, bukan
--      menolak query. `SELECT count(*)` tetap sukses, hasilnya saja 0. Test
--      yang menunggu exception pada operasi baca akan selalu lulus walau
--      seluruh data terbuka. Karena itu di bawah yang diperiksa jumlah baris.
--
--   2. PENOLAKAN UPDATE JUGA TIDAK MELEMPAR ERROR bila barisnya tersaring
--      klausa USING — ia hanya mengubah 0 baris. Yang melempar hanya
--      pelanggaran WITH CHECK, yaitu saat baris BARU tidak memenuhi syarat.
--      Keduanya diuji terpisah di sini.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-039 · PRD §5.1, F-8.3 · INV-01..INV-05, INV-29, INV-30

DO $$
DECLARE
  v_periode  UUID;
  v_deptA    UUID;
  v_deptB    UUID;
  v_proker   UUID;
  v_proker2  UUID;
  v_kep      UUID;
  v_div1     UUID;
  v_div2     UUID;
  v_sec2     UUID;
  v_item2    UUID;
  v_tmpl     UUID;
  v_surat    UUID;
  v_surat2   UUID;

  v_admin    UUID := '5a000000-0000-0000-0000-000000000001';
  v_ketua    UUID := '5a000000-0000-0000-0000-000000000002';
  v_wakil    UUID := '5a000000-0000-0000-0000-000000000003';
  v_sekum    UUID := '5a000000-0000-0000-0000-000000000004';
  v_bendum   UUID := '5a000000-0000-0000-0000-000000000005';
  v_kadept   UUID := '5a000000-0000-0000-0000-000000000006';
  v_anggota  UUID := '5a000000-0000-0000-0000-000000000007';
  v_bph      UUID := '5a000000-0000-0000-0000-000000000008';
  v_ganda    UUID := '5a000000-0000-0000-0000-000000000009';

  v_ketuplak UUID := '5a000000-0000-0000-0000-00000000000a';
  v_koor     UUID := '5a000000-0000-0000-0000-00000000000b';
  v_chart2   UUID;
  v_grup2    UUID;
  v_task2    UUID;

  v_n        INT;
  v_ditolak  BOOLEAN;
BEGIN
  ---------------------------------------------------------------------------
  -- DATA DASAR — disiapkan sebagai postgres, sebelum berpindah role.
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2026/2027', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;

  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_deptA;
  INSERT INTO departemen (kode, nama, warna) VALUES ('MIKAT', 'Minat Bakat', '#22C55E')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_deptB;

  INSERT INTO app_user (id, nama_lengkap, nim, email) VALUES
    (v_admin,   'Admin',            '3337220501', 'admin@rls.test'),
    (v_ketua,   'Ketua Umum',       '3337220502', 'ketua@rls.test'),
    (v_wakil,   'Wakil Ketua',      '3337220503', 'wakil@rls.test'),
    (v_sekum,   'Sekretaris Umum',  '3337220504', 'sekum@rls.test'),
    (v_bendum,  'Bendahara Umum',   '3337220505', 'bendum@rls.test'),
    (v_kadept,  'Kepala Kaderisasi','3337220506', 'kadept@rls.test'),
    (v_anggota, 'Anggota Kaderisasi','3337220507','anggota@rls.test'),
    (v_bph,     'Anggota BPH',      '3337220508', 'bph@rls.test'),
    (v_ganda,   'Anggota merangkap BPH', '3337220509', 'ganda@rls.test');

  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_admin,   v_periode, 'ADMIN',   NULL),
    (v_ketua,   v_periode, 'KETUA',   NULL),
    (v_wakil,   v_periode, 'WAKIL',   NULL),
    (v_sekum,   v_periode, 'SEKUM',   NULL),
    (v_bendum,  v_periode, 'BENDUM',  NULL),
    (v_kadept,  v_periode, 'KADEPT',  v_deptA),
    (v_anggota, v_periode, 'ANGGOTA', v_deptA),
    (v_bph,     v_periode, 'BPH',     NULL),
    -- Pengguna multi-role. Hak adalah GABUNGAN, dan BPH tidak menambah apa pun
    -- sehingga ia harus tetap dapat menulis sebagai ANGGOTA (INV-03).
    (v_ganda,   v_periode, 'ANGGOTA', v_deptA),
    (v_ganda,   v_periode, 'BPH',     NULL);

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai,
                      tanggal_hari_h_selesai, dibuat_oleh)
  VALUES (v_periode, v_deptA, 'SYNCHRONIZE', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2026-11-01', '2026-11-20', '2026-11-22', v_kadept)
  RETURNING id INTO v_proker;

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai,
                      tanggal_hari_h_selesai, dibuat_oleh)
  VALUES (v_periode, v_deptA, 'Acara Kedua', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2027-02-01', '2027-02-20', '2027-02-22', v_kadept)
  RETURNING id INTO v_proker2;

  INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (v_proker, 'SYNCHRONIZE')
  RETURNING id INTO v_kep;

  -- Dua divisi dalam SATU kepanitiaan. Inilah pasangan yang menguji INV-30:
  -- lintas divisi boleh dibaca, tidak boleh ditulis.
  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep, 'Konsumsi') RETURNING id INTO v_div1;
  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep, 'Acara')    RETURNING id INTO v_div2;

  INSERT INTO divisi_member (divisi_id, user_id) VALUES (v_div1, v_anggota);
  INSERT INTO divisi_member (divisi_id, user_id) VALUES (v_div1, v_ganda);

  INSERT INTO rab_section (divisi_id, nama) VALUES (v_div2, 'Perlengkapan Acara')
  RETURNING id INTO v_sec2;
  INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks,
                        jumlah_numerik, harga_satuan, total)
  VALUES (v_sec2, 1, 'Sewa panggung', '1 unit', 1, 5000000, 5000000)
  RETURNING id INTO v_item2;

  INSERT INTO rab_meta (kepanitiaan_id, status) VALUES (v_kep, 'DRAFT');

  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Peminjaman', 'template/05.docx', '{}'::JSONB)
  ON CONFLICT (kode_surat, varian, versi) DO UPDATE SET kode_surat = EXCLUDED.kode_surat
  RETURNING id INTO v_tmpl;
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal,
                     tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_periode, v_tmpl, '05', '2026-10-15', 'Permohonan', 'Kabag', 'di Tempat',
          v_kadept, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_surat;
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal,
                     tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_periode, v_tmpl, '05', '2026-10-16', 'Permohonan 2', 'Kabag', 'di Tempat',
          v_kadept, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_surat2;

  ---------------------------------------------------------------------------
  -- 1. LINTAS DIVISI: BACA BOLEH (INV-30)
  --
  --    Anggota divisi Konsumsi membaca RAB divisi Acara dalam acara yang sama.
  --    Transparansi di dalam satu kepanitiaan memang disengaja (PRD F-8.3).
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*)::INT INTO v_n FROM rab_item WHERE id = v_item2;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 1,
    'Anggota TIDAK dapat membaca RAB divisi lain dalam acara yang sama (INV-30)';

  ---------------------------------------------------------------------------
  -- 2. LINTAS DIVISI: TULIS TIDAK, DAN CARANYA MENOLAK ITU PENTING
  --
  --    Harus 0 baris terpengaruh, BUKAN error. Barisnya tersaring klausa
  --    USING sebelum sempat diubah. Kalau ini melempar exception, antarmuka
  --    akan menampilkan kegagalan teknis untuk hal yang sebenarnya normal.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_ditolak := false;
  BEGIN
    UPDATE rab_item SET harga_satuan = 1 WHERE id = v_item2;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT NOT v_ditolak,
    'UPDATE lintas divisi melempar exception — seharusnya cukup 0 baris terpengaruh';
  ASSERT v_n = 0, format('UPDATE lintas divisi mengubah %s baris (INV-30)', v_n);
  ASSERT (SELECT harga_satuan FROM rab_item WHERE id = v_item2) = 5000000,
    'Harga RAB divisi lain berubah';

  ---------------------------------------------------------------------------
  -- 3. BPH TIDAK PERNAH MENULIS (INV-03)
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_bph::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- INSERT ditolak dengan exception, karena baris BARU melanggar WITH CHECK.
  v_ditolak := false;
  BEGIN
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_periode, v_deptA, 'Proker BPH', 'BERKALA', v_bph);
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;

  -- UPDATE ditolak tanpa exception: barisnya tersaring USING.
  UPDATE departemen SET nama = 'Diubah BPH' WHERE id = v_deptA;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Tetapi membaca harus tetap bisa — itu memang perannya sebagai pengawas.
  DECLARE v_baca INT;
  BEGIN
    SELECT count(*)::INT INTO v_baca FROM proker;
    EXECUTE 'RESET ROLE';
    ASSERT v_ditolak, 'BPH BERHASIL membuat proker (INV-03)';
    ASSERT v_n = 0, format('BPH mengubah %s baris departemen (INV-03)', v_n);
    ASSERT v_baca = 2, format('BPH hanya melihat %s proker — hak bacanya hilang', v_baca);
  END;

  ASSERT (SELECT nama FROM departemen WHERE id = v_deptA) = 'Kaderisasi',
    'Nama departemen berubah walau UPDATE dilaporkan 0 baris';

  ---------------------------------------------------------------------------
  -- 4. MULTI-ROLE: ANGGOTA + BPH TETAP DAPAT MENULIS SEBAGAI ANGGOTA
  --
  --    Hak adalah GABUNGAN, dan BPH bersifat restriktif hanya dalam arti
  --    tidak menambah apa pun (INV-03). Ia tidak boleh MENGURANGI hak yang
  --    sudah dimiliki peran lain — kalau iya, setiap pengurus yang ditunjuk
  --    sebagai pengawas akan kehilangan pekerjaannya sendiri.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_ganda::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_ditolak := false;
  BEGIN
    INSERT INTO rab_section (divisi_id, nama) VALUES (v_div1, 'Konsumsi Panitia');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT NOT v_ditolak,
    'Pengguna ANGGOTA+BPH DITOLAK menulis di divisinya sendiri — BPH mengurangi hak';
  ASSERT (SELECT count(*) FROM rab_section WHERE divisi_id = v_div1) = 1,
    'Baris tidak tersimpan walau tidak ada penolakan';

  ---------------------------------------------------------------------------
  -- 5. APPROVAL PROKER HANYA KETUA ATAU WAKIL (INV-05)
  --
  --    Ditegakkan policy proker_lock_insert. setujui_proker() berjalan dengan
  --    hak pemanggil, jadi policy itulah yang menjadi penjaganya.
  ---------------------------------------------------------------------------
  -- =======================================================================
  -- PENOLAKAN YANG SAMA MUNCUL DALAM DUA BENTUK BERBEDA.
  --
  -- Ditemukan saat menulis test ini, dan perlu diketahui lapisan service:
  --
  --   KADEPT  lolos `SELECT ... FOR UPDATE` atas proker departemennya
  --           sendiri, lalu tertahan policy proker_lock_insert.
  --           -> insufficient_privilege (42501)
  --
  --   SEKUM   tidak punya departemen, sehingga policy proker_update sudah
  --           menyaring barisnya lebih dulu. PostgreSQL menerapkan policy
  --           UPDATE pada `SELECT ... FOR UPDATE`, jadi barisnya tidak
  --           terlihat sama sekali dan fungsi masuk ke cabang NOT FOUND.
  --           -> no_data_found, dengan pesan "Proker tidak ditemukan"
  --
  -- Pesan kedua itu menyesatkan: prokernya ada, Sekum saja yang tidak berhak
  -- menyetujuinya. Yang ditegakkan tetap benar; yang perlu diperbaiki adalah
  -- pemetaan pesan di lapisan service (T-045 dan seterusnya), bukan policy.
  --
  -- Test ini menerima kedua kode, karena keduanya berarti DITOLAK.
  -- =======================================================================
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_kadept::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ditolak := false;
  BEGIN
    PERFORM setujui_proker(v_proker, v_kadept);
  EXCEPTION
    WHEN insufficient_privilege THEN v_ditolak := true;
    WHEN no_data_found          THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'KADEPT BERHASIL menyetujui proker (INV-05)';

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_sekum::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ditolak := false;
  BEGIN
    PERFORM setujui_proker(v_proker, v_sekum);
  EXCEPTION
    WHEN insufficient_privilege THEN v_ditolak := true;
    WHEN no_data_found          THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'SEKUM BERHASIL menyetujui proker (INV-05)';

  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_proker) = 0,
    'Kalender terkunci walau seluruh approval ditolak';

  -- KETUA berhasil. Sisi positifnya wajib diuji juga: policy yang menolak
  -- semua orang juga akan membuat seluruh test negatif di atas lulus.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_ketua::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM setujui_proker(v_proker, v_ketua);
  EXECUTE 'RESET ROLE';

  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_proker) = 1,
    'KETUA tidak dapat menyetujui proker — policy terlalu ketat';

  -- WAKIL juga cukup, satu di antaranya (PRD §5.2).
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_wakil::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM setujui_proker(v_proker2, v_wakil);
  EXECUTE 'RESET ROLE';
  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_proker2) = 1,
    'WAKIL tidak dapat menyetujui proker';

  ---------------------------------------------------------------------------
  -- 5b. TITIK PENEGAKANNYA DIUJI LANGSUNG
  --
  --     Blok 5 memanggil setujui_proker(), dan itu ternyata TIDAK cukup.
  --     Ditemukan lewat uji mutasi: menambahkan SEKUM ke policy
  --     proker_lock_insert tidak membuat blok 5 gagal, karena Sekum sudah
  --     tertahan lebih dulu oleh policy proker_update saat `SELECT ... FOR
  --     UPDATE`. Perlindungannya kebetulan, bukan disengaja — dan akan
  --     runtuh diam-diam bila Sekum kelak diberi hak menyunting proker.
  --
  --     Karena itu proker_lock diserang LANGSUNG di sini, melewati fungsi,
  --     persis seperti yang akan dilakukan penyerang yang memegang kredensial
  --     dan berbicara ke PostgREST tanpa lewat aplikasi.
  ---------------------------------------------------------------------------
  DECLARE
    v_uid     UUID;
    v_peran   TEXT;
    v_proker3 UUID;
    v_rentang DATERANGE := daterange('2028-01-01', '2028-01-10', '[)');
  BEGIN
    -- Proker yang BELUM terkunci. Memakai proker yang sudah punya kunci akan
    -- membuat percobaan gagal karena unique constraint, bukan karena policy —
    -- dan test akan tampak lulus dengan alasan yang keliru.
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_periode, v_deptA, 'Belum Terkunci', 'BERKALA', v_kadept)
    RETURNING id INTO v_proker3;

    FOREACH v_peran IN ARRAY ARRAY['SEKUM','BENDUM','KADEPT','ANGGOTA','BPH'] LOOP
      v_uid := CASE v_peran
                 WHEN 'SEKUM'   THEN v_sekum
                 WHEN 'BENDUM'  THEN v_bendum
                 WHEN 'KADEPT'  THEN v_kadept
                 WHEN 'ANGGOTA' THEN v_anggota
                 ELSE v_bph END;

      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', v_uid::TEXT)::TEXT, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      v_ditolak := false;
      BEGIN
        INSERT INTO proker_lock (proker_id, periode_id, rentang)
        VALUES (v_proker3, v_periode, v_rentang);
      EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
      END;
      EXECUTE 'RESET ROLE';

      ASSERT v_ditolak,
        format('%s BERHASIL mengunci kalender langsung ke proker_lock (INV-05)', v_peran);
    END LOOP;

    -- Hal yang sama untuk penomoran surat: counter diserang langsung.
    FOREACH v_peran IN ARRAY ARRAY['BENDUM','KADEPT','ANGGOTA','BPH'] LOOP
      v_uid := CASE v_peran
                 WHEN 'BENDUM'  THEN v_bendum
                 WHEN 'KADEPT'  THEN v_kadept
                 WHEN 'ANGGOTA' THEN v_anggota
                 ELSE v_bph END;

      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', v_uid::TEXT)::TEXT, true);
      EXECUTE 'SET LOCAL ROLE authenticated';

      UPDATE surat_counter SET nomor_terakhir = nomor_terakhir + 100
      WHERE periode_id = v_periode;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      EXECUTE 'RESET ROLE';

      ASSERT v_n = 0,
        format('%s BERHASIL memajukan counter nomor surat (INV-05, INV-16)', v_peran);
    END LOOP;
  END;

  ---------------------------------------------------------------------------
  -- 6. APPROVAL SURAT: SEKUM BOLEH, KADEPT TIDAK (INV-05)
  --
  --    Perhatikan bahwa Sekum DITOLAK pada proker tetapi DITERIMA pada surat.
  --    Dua daftar approver yang berbeda; kalau keduanya sama, salah satu
  --    policy pasti keliru.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_kadept::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ditolak := false;
  BEGIN
    PERFORM alokasi_nomor_surat(v_surat, v_kadept);
  EXCEPTION
    WHEN insufficient_privilege THEN v_ditolak := true;
    WHEN no_data_found          THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'KADEPT BERHASIL menerbitkan nomor surat (INV-05)';

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_sekum::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM alokasi_nomor_surat(v_surat, v_sekum);
  EXECUTE 'RESET ROLE';

  ASSERT (SELECT nomor_lengkap FROM surat WHERE id = v_surat) = '05/001/UN43.3.7/HMIF/X/2026',
    'SEKUM tidak dapat menerbitkan nomor surat — policy terlalu ketat';

  ---------------------------------------------------------------------------
  -- 7. RAB TERKUNCI MENOLAK PERUBAHAN DI LEVEL RLS (INV-29)
  --
  --    Bukan sekadar tombol yang disembunyikan di antarmuka. Setelah RAB
  --    DISETUJUI, permintaan yang datang langsung ke database pun ditolak.
  ---------------------------------------------------------------------------
  -- Jalur sah mesin status (041): DRAFT → DIAJUKAN → DISETUJUI.
  UPDATE rab_meta SET status = 'DIAJUKAN' WHERE kepanitiaan_id = v_kep;
  UPDATE rab_meta SET status = 'DISETUJUI' WHERE kepanitiaan_id = v_kep;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_ditolak := false;
  BEGIN
    INSERT INTO rab_section (divisi_id, nama) VALUES (v_div1, 'Tambahan Setelah Kunci');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT v_ditolak, 'Panitia BERHASIL menambah RAB setelah status DISETUJUI (INV-29)';
  ASSERT (SELECT count(*) FROM rab_section WHERE divisi_id = v_div1) = 1,
    'Baris RAB bertambah walau RAB sudah dikunci';

  -- Dibuka kembali, penulisan harus hidup lagi. Tanpa pemeriksaan ini,
  -- policy yang menolak selamanya juga akan membuat test di atas lulus.
  UPDATE rab_meta SET status = 'DRAFT', alasan_buka_kunci = 'Uji: membuka kunci untuk revisi'
   WHERE kepanitiaan_id = v_kep;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO rab_section (divisi_id, nama) VALUES (v_div1, 'Setelah Dibuka Kembali');
  EXECUTE 'RESET ROLE';

  ASSERT (SELECT count(*) FROM rab_section WHERE divisi_id = v_div1) = 2,
    'RAB yang dibuka kembali tetap menolak penulisan';

  ---------------------------------------------------------------------------
  -- 8. ESKALASI HAK DITOLAK (INV-02)
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ditolak := false;
  BEGIN
    INSERT INTO user_role (user_id, periode_id, role) VALUES (v_anggota, v_periode, 'KETUA');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'ANGGOTA BERHASIL mengangkat dirinya menjadi KETUA (INV-02)';

  ---------------------------------------------------------------------------
  -- 9. JEJAK AUDIT TERTUTUP BAGI ANGGOTA (PRD §5.1)
  --    Diperiksa dari JUMLAH BARIS, bukan dari ada tidaknya error.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*)::INT INTO v_n FROM audit_log;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 0, format('ANGGOTA melihat %s baris audit_log', v_n);

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_bph::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*)::INT INTO v_n FROM audit_log;
  EXECUTE 'RESET ROLE';
  ASSERT v_n > 0, 'BPH tidak dapat membaca audit_log — pengawasan mustahil';

  ---------------------------------------------------------------------------
  -- 10. KADEPT TERBATAS PADA DEPARTEMENNYA
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_kadept::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_ditolak := false;
  BEGIN
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_periode, v_deptB, 'Serobot Departemen Lain', 'BERKALA', v_kadept);
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
  VALUES (v_periode, v_deptA, 'Proker Sah', 'BERKALA', v_kadept);
  EXECUTE 'RESET ROLE';

  ASSERT v_ditolak, 'KADEPT BERHASIL membuat proker di departemen lain';
  ASSERT (SELECT count(*) FROM proker WHERE nama = 'Proker Sah') = 1,
    'KADEPT tidak dapat membuat proker di departemennya sendiri';

  ---------------------------------------------------------------------------
  -- 11. KETUA PELAKSANA MENULIS DI SELURUH DIVISI (PRD F-8.3, T-085)
  --
  --     Ia bukan anggota divisi mana pun, dan departemennya pun lain.
  --     Sebelum 039, policy RAB hanya melihat keanggotaan divisi.
  ---------------------------------------------------------------------------
  INSERT INTO app_user (id, nama_lengkap, nim, email) VALUES
    (v_ketuplak, 'Ketua Pelaksana', '3337220510', 'ketuplak@rls.test'),
    (v_koor,     'Koordinator Acara', '3337220511', 'koor@rls.test');
  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_ketuplak, v_periode, 'ANGGOTA', v_deptB),
    (v_koor,     v_periode, 'ANGGOTA', v_deptB);
  UPDATE kepanitiaan SET ketua_pelaksana = v_ketuplak WHERE id = v_kep;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ketuplak::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE rab_item SET harga_satuan = 6000000 WHERE id = v_item2;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO rab_section (divisi_id, nama) VALUES (v_div1, 'Dari Ketua Pelaksana');
  EXECUTE 'RESET ROLE';

  ASSERT v_n = 1, 'Ketua Pelaksana TIDAK dapat mengubah RAB divisi Acara (PRD F-8.3)';
  ASSERT (SELECT count(*) FROM rab_section WHERE divisi_id = v_div1 AND nama = 'Dari Ketua Pelaksana') = 1,
    'Ketua Pelaksana TIDAK dapat menambah RAB divisi Konsumsi (PRD F-8.3)';

  ---------------------------------------------------------------------------
  -- 12. KOORDINATOR MENULIS DIVISINYA SAJA, WALAU TAK TERCATAT DI divisi_member
  ---------------------------------------------------------------------------
  UPDATE divisi SET koordinator_id = v_koor WHERE id = v_div2;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_koor::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE rab_item SET harga_satuan = 7000000 WHERE id = v_item2;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ditolak := false;
  BEGIN
    INSERT INTO rab_section (divisi_id, nama) VALUES (v_div1, 'Serobot Konsumsi');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT v_n = 1, 'Koordinator divisi Acara TIDAK dapat mengubah RAB divisinya';
  ASSERT v_ditolak, 'Koordinator divisi Acara BERHASIL menulis RAB divisi Konsumsi (INV-30)';

  ---------------------------------------------------------------------------
  -- 13. BPH YANG TERCATAT SEBAGAI PANITIA TETAP TIDAK MENULIS (INV-03)
  --
  --     my_divisi_aktif() tidak melihat role; helper 039 mensyaratkan role
  --     non-BPH. Pengguna ANGGOTA+BPH (skenario 4) tetap boleh.
  ---------------------------------------------------------------------------
  INSERT INTO divisi_member (divisi_id, user_id) VALUES (v_div1, v_bph);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bph::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ditolak := false;
  BEGIN
    INSERT INTO rab_section (divisi_id, nama) VALUES (v_div1, 'Ditulis BPH');
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT v_ditolak, 'BPH yang menjadi anggota divisi BERHASIL menulis RAB (INV-03)';

  ---------------------------------------------------------------------------
  -- 14. GANTT DIVISI: PANITIA DIVISI LAIN TIDAK DAPAT MENGGESER TIMELINE
  --
  --     Sebelum 039, gantt_task_update = has_role(..., 'ANGGOTA') tanpa syarat
  --     baris. Kadept PIC dan koordinator divisi itu tetap boleh.
  ---------------------------------------------------------------------------
  INSERT INTO gantt_chart (scope, divisi_id, judul) VALUES ('DIVISI', v_div2, 'Gantt Divisi Acara')
  RETURNING id INTO v_chart2;
  INSERT INTO gantt_group (chart_id, nama, warna) VALUES (v_chart2, 'Persiapan', '#2563EB')
  RETURNING id INTO v_grup2;
  INSERT INTO gantt_task (group_id, nama, tanggal_mulai, tanggal_selesai)
  VALUES (v_grup2, 'Sewa panggung', '2026-11-01', '2026-11-05') RETURNING id INTO v_task2;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_anggota::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE gantt_task SET progres = 90 WHERE id = v_task2;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 0, format('Panitia Konsumsi mengubah %s task Gantt divisi Acara (INV-30)', v_n);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_koor::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE gantt_task SET progres = 40 WHERE id = v_task2;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 1, 'Koordinator divisi Acara TIDAK dapat mengubah Gantt divisinya';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_kadept::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE gantt_task SET progres = 50 WHERE id = v_task2;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 1, 'Kadept departemen PIC TIDAK dapat mengubah Gantt divisi acaranya';
  ASSERT (SELECT progres FROM gantt_task WHERE id = v_task2) = 50, 'Progres task Gantt tidak sesuai urutan perubahan';
  ---------------------------------------------------------------------------
  -- 15. MESIN STATUS RAB DI DATABASE (T-089, migrasi 041)
  --
  --     Bendum boleh UPDATE rab_meta (015b), tetapi lewat jalur langsung pun
  --     ia tidak dapat membuka kunci tanpa alasan, atau melompati status.
  ---------------------------------------------------------------------------
  UPDATE rab_meta SET status = 'DIAJUKAN' WHERE kepanitiaan_id = v_kep;
  UPDATE rab_meta SET status = 'DISETUJUI' WHERE kepanitiaan_id = v_kep;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendum::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ditolak := false;
  BEGIN
    UPDATE rab_meta SET status = 'DRAFT' WHERE kepanitiaan_id = v_kep;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  EXECUTE 'RESET ROLE';
  ASSERT v_ditolak, 'Bendum BERHASIL membuka kunci RAB tanpa alasan (PRD F-9.5)';

  v_ditolak := false;
  BEGIN
    UPDATE rab_meta SET status = 'DRAFT', alasan_buka_kunci = 'Uji: membuka kunci untuk revisi'
     WHERE kepanitiaan_id = v_kep;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Alasan buka kunci LAMA dipakai ulang tanpa ditolak';

  v_ditolak := false;
  BEGIN
    UPDATE rab_meta SET status = 'SELESAI' WHERE kepanitiaan_id = v_kep;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Transisi DISETUJUI -> SELESAI (melompati REALISASI) DITERIMA';
  ASSERT (SELECT status FROM rab_meta WHERE kepanitiaan_id = v_kep) = 'DISETUJUI', 'Status RAB berubah walau transisinya ditolak';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendum::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE rab_meta SET status = 'DRAFT', alasan_buka_kunci = 'Ada tambahan sewa sound system'
   WHERE kepanitiaan_id = v_kep;
  EXECUTE 'RESET ROLE';
  ASSERT (SELECT status FROM rab_meta WHERE kepanitiaan_id = v_kep) = 'DRAFT', 'Bendum tidak dapat membuka kunci dengan alasan sah';
  ASSERT (SELECT disetujui_at FROM rab_meta WHERE kepanitiaan_id = v_kep) IS NULL, 'Jejak persetujuan lama tidak dibersihkan saat kembali ke DRAFT';
  ASSERT EXISTS (SELECT 1 FROM audit_log WHERE entitas = 'rab_meta' AND aksi = 'UPDATE'
                   AND entitas_id = v_kep::TEXT
                   AND nilai_baru->>'alasan_buka_kunci' = 'Ada tambahan sewa sound system'),
    'Alasan buka kunci tidak tercatat di audit_log dengan entitas_id acaranya (042)';

  ---------------------------------------------------------------------------
  -- 16. RUNDOWN: PANITIA ACARA MENGHAPUS BARISNYA, BUKAN-PANITIA TIDAK (T-094, 043)
  --
  --     Sebelum 043, rundown_delete hanya ADMIN/KETUA/WAKIL/KADEPT — baris yang
  --     dibuang panitia dari editor TOR tertinggal di DB.
  ---------------------------------------------------------------------------
  INSERT INTO rundown (kepanitiaan_id, tanggal, acara) VALUES
    (v_kep, '2026-11-10', 'Uji rundown 1'), (v_kep, '2026-11-10', 'Uji rundown 2');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bendum::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM rundown WHERE kepanitiaan_id = v_kep AND acara = 'Uji rundown 1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 0, format('Bukan-panitia menghapus %s baris rundown acara', v_n);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_koor::TEXT)::TEXT, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM rundown WHERE kepanitiaan_id = v_kep AND acara = 'Uji rundown 1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  ASSERT v_n = 1, 'Koordinator divisi (panitia acara) TIDAK dapat menghapus baris rundown acaranya';
  ASSERT (SELECT count(*) FROM rundown WHERE kepanitiaan_id = v_kep) = 1, 'Jumlah baris rundown tidak sesuai';

  RAISE NOTICE 'OK 015c_rls_negatif - 16 skenario, rundown dihapus panitia saja, lintas divisi baca boleh tulis 0 baris, Ketua Pelaksana menulis semua divisi, buka kunci RAB wajib alasan, BPH tak pernah menulis, approver terpisah per jenis';
END $$;
