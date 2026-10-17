-- Test migrasi 014a — fungsi anti-bentrok proker.
--
-- Yang diuji bukan hanya "fungsi mengembalikan sesuatu", melainkan perilaku
-- yang menentukan nasib data:
--   - approval yang bentrok TIDAK boleh mengunci, dan harus melaporkan apa
--     yang menghalanginya
--   - kunci LAMA harus selamat ketika revisi ditolak (INV-13) — ini yang
--     paling mudah salah, dan akibatnya paling sulit dilacak
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-033 · SYSTEM_DESIGN §6.4 · INV-09..INV-13

DO $$
DECLARE
  v_periode UUID;
  v_dept_a  UUID;
  v_dept_b  UUID;
  v_user    UUID := '11111111-1111-1111-1111-111111111111';
  v_pA      UUID;
  v_pB      UUID;
  v_pC      UUID;
  v_hasil   JSONB;
  v_jumlah  INT;
  v_ditolak BOOLEAN;
  v_rentang TEXT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_dept_a;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KOMINFO', 'Kominfo', '#A3E635')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_dept_b;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Ketua Himpunan', '3337220100', 'ketua3@example.test');

  -- Proker A milik Kaderisasi: persiapan 1 Nov, hari-H 6-7 Des 2026.
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_a, 'SYNCHRONIZE', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2026-11-01', '2026-12-06', '2026-12-07', v_user)
  RETURNING id INTO v_pA;

  ---------------------------------------------------------------------------
  -- 1. APPROVAL PERTAMA BERHASIL DAN MENGUNCI
  ---------------------------------------------------------------------------
  v_hasil := setujui_proker(v_pA, v_user);

  ASSERT (v_hasil->>'ok')::BOOLEAN,     format('Approval pertama gagal: %s', v_hasil);
  ASSERT (v_hasil->>'locked')::BOOLEAN, 'Proker TERJADWAL disetujui tanpa mengunci kalender';
  ASSERT (SELECT status FROM proker WHERE id = v_pA) = 'DISETUJUI', 'Status tidak menjadi DISETUJUI';
  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_pA) = 1, 'Kunci tidak terbentuk';

  -- Rentang harus INKLUSIF di kedua ujung: 1 Nov sampai 7 Des, bukan 6 Des.
  SELECT rentang::TEXT INTO v_rentang FROM proker_lock WHERE proker_id = v_pA;
  ASSERT v_rentang = '[2026-11-01,2026-12-08)',
    format('Rentang terkunci %s, seharusnya [2026-11-01,2026-12-08) — hari terakhir wajib ikut (INV-11)', v_rentang);

  ---------------------------------------------------------------------------
  -- 2. APPROVAL BENTROK DITOLAK DAN MELAPORKAN PENYEBABNYA
  ---------------------------------------------------------------------------
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_b, 'IT Festival', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2026-11-05', '2026-11-20', '2026-11-21', v_user)
  RETURNING id INTO v_pB;

  v_hasil := setujui_proker(v_pB, v_user);

  ASSERT NOT (v_hasil->>'ok')::BOOLEAN, 'Approval yang bentrok BERHASIL — anti-bentrok tidak bekerja';
  ASSERT v_hasil->>'reason' = 'KONFLIK', format('reason: %s, seharusnya KONFLIK', v_hasil->>'reason');

  ASSERT jsonb_array_length(v_hasil->'konflik') = 1,
    format('Daftar konflik memuat %s entri, seharusnya 1', jsonb_array_length(v_hasil->'konflik'));

  -- Approver harus tahu proker dan departemen mana yang menghalangi, bukan
  -- sekadar "tanggal tidak tersedia".
  ASSERT v_hasil->'konflik'->0->>'proker' = 'SYNCHRONIZE',
    format('Nama proker penghalang: %s', v_hasil->'konflik'->0->>'proker');
  ASSERT v_hasil->'konflik'->0->>'departemen' = 'Kaderisasi',
    format('Departemen penghalang: %s', v_hasil->'konflik'->0->>'departemen');
  ASSERT (v_hasil->'konflik'->0->>'selesai')::DATE = '2026-12-07',
    'Tanggal selesai yang dilaporkan salah — upper(rentang) tidak dikurangi 1';

  ASSERT (SELECT status FROM proker WHERE id = v_pB) = 'PERLU_REVISI',
    'Proker yang bentrok tidak berstatus PERLU_REVISI';
  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_pB) = 0,
    'Proker yang bentrok tetap memperoleh kunci';

  -- Kunci proker A harus utuh, tidak tersentuh kegagalan proker B.
  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_pA) = 1,
    'Kunci proker A hilang akibat approval proker B yang gagal';

  ---------------------------------------------------------------------------
  -- 3. BERKALA DISETUJUI TANPA MENGUNCI, WALAU DI RENTANG YANG SAMA (INV-10)
  ---------------------------------------------------------------------------
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      pola_ulang, dibuat_oleh)
  VALUES (v_periode, v_dept_b, 'Latihan Rutin', 'BERKALA', 'MENUNGGU_APPROVAL',
          '{"frekuensi":"MINGGUAN","hari":["SABTU"]}'::JSONB, v_user)
  RETURNING id INTO v_pC;

  v_hasil := setujui_proker(v_pC, v_user);

  ASSERT (v_hasil->>'ok')::BOOLEAN, 'Proker BERKALA gagal disetujui';
  ASSERT NOT (v_hasil->>'locked')::BOOLEAN, 'Proker BERKALA ikut mengunci kalender — seharusnya tidak';
  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_pC) = 0,
    'Proker BERKALA memperoleh kunci';

  ---------------------------------------------------------------------------
  -- 4. APPROVAL ULANG DITOLAK
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    PERFORM setujui_proker(v_pA, v_user);   -- sudah DISETUJUI
  EXCEPTION WHEN invalid_parameter_value THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Proker yang sudah disetujui dapat disetujui lagi';

  -- Proker yang tidak ada juga ditolak.
  v_ditolak := false;
  BEGIN
    PERFORM setujui_proker('99999999-9999-9999-9999-999999999999'::UUID, v_user);
  EXCEPTION WHEN no_data_found THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Approval proker yang tidak ada tidak menimbulkan error';

  ---------------------------------------------------------------------------
  -- 5. REVISI DITOLAK — KUNCI LAMA HARUS SELAMAT (INV-13)
  --
  --    Ini perilaku yang paling mudah salah. Bila DELETE kunci lama tidak
  --    ikut dibatalkan saat INSERT gagal, proker kehilangan kuncinya di tengah
  --    proses revisi dan departemen lain bisa menyerobot tanggalnya.
  ---------------------------------------------------------------------------
  -- Proker B mengubah tanggal, tetapi masih bentrok dengan A.
  UPDATE proker SET
    tanggal_mulai_persiapan = '2026-11-10',
    tanggal_hari_h_mulai    = '2026-11-25',
    tanggal_hari_h_selesai  = '2026-11-26',
    status = 'MENUNGGU_APPROVAL_REVISI'
  WHERE id = v_pB;

  -- Beri proker B kunci lebih dulu, seolah ia pernah disetujui sebelumnya.
  -- Rentang ini tidak bentrok dengan A.
  INSERT INTO proker_lock (proker_id, periode_id, rentang)
  VALUES (v_pB, v_periode, daterange('2027-03-01', '2027-03-20', '[)'));

  v_hasil := setujui_proker(v_pB, v_user);

  ASSERT NOT (v_hasil->>'ok')::BOOLEAN, 'Revisi yang masih bentrok BERHASIL';

  -- Kunci LAMA proker B harus masih ada, dengan rentang yang lama.
  SELECT count(*)::INT INTO v_jumlah FROM proker_lock WHERE proker_id = v_pB;
  ASSERT v_jumlah = 1,
    'Kunci lama HILANG saat revisi ditolak — proker kehilangan tanggalnya di tengah proses (INV-13)';

  SELECT rentang::TEXT INTO v_rentang FROM proker_lock WHERE proker_id = v_pB;
  ASSERT v_rentang = '[2027-03-01,2027-03-20)',
    format('Kunci lama berubah menjadi %s — seharusnya tetap rentang semula', v_rentang);

  ---------------------------------------------------------------------------
  -- 6. cek_konflik_proker MELAPORKAN RENTANG DENGAN BENAR
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah
  FROM cek_konflik_proker(v_periode, '2026-12-07', '2026-12-10');
  ASSERT v_jumlah = 1,
    'Rentang yang mulai tepat di hari terakhir proker A tidak terdeteksi bentrok (INV-11)';

  SELECT count(*)::INT INTO v_jumlah
  FROM cek_konflik_proker(v_periode, '2026-12-08', '2026-12-10');
  ASSERT v_jumlah = 0,
    'Rentang yang mulai sehari setelah proker A dilaporkan bentrok — batas atas terlalu longgar';

  -- Parameter exclude dipakai saat mengecek konflik untuk proker itu sendiri.
  SELECT count(*)::INT INTO v_jumlah
  FROM cek_konflik_proker(v_periode, '2026-11-01', '2026-12-07', v_pA);
  ASSERT v_jumlah = 0, 'Proker tidak dikecualikan dari pengecekan konfliknya sendiri';

  ---------------------------------------------------------------------------
  -- 7. lepas_kunci_selesai — tiga langkah lifecycle
  ---------------------------------------------------------------------------
  -- Rapikan dulu proker sungguhan di database dev agar hitungan di bawah hanya
  -- milik test (hermetis); proker test belum memenuhi syarat transisi apa pun.
  PERFORM lepas_kunci_selesai();

  -- Proker A dibuat seolah acaranya sudah lewat.
  UPDATE proker SET status = 'BERJALAN',
    tanggal_mulai_persiapan = CURRENT_DATE - 60,
    tanggal_hari_h_mulai    = CURRENT_DATE - 20,
    tanggal_hari_h_selesai  = CURRENT_DATE - 19
  WHERE id = v_pA;

  -- Proker baru yang masa persiapannya sudah tiba tetapi acaranya belum lewat.
  DECLARE v_pD UUID;
  BEGIN
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                        dibuat_oleh)
    VALUES (v_periode, v_dept_a, 'Acara Mendatang', 'TERJADWAL', 'DISETUJUI',
            CURRENT_DATE - 5, CURRENT_DATE + 15, CURRENT_DATE + 16, v_user)
    RETURNING id INTO v_pD;

    v_hasil := lepas_kunci_selesai();

    ASSERT (v_hasil->>'jadi_selesai')::INT = 1,
      format('jadi_selesai = %s, seharusnya 1', v_hasil->>'jadi_selesai');
    ASSERT (v_hasil->>'kunci_dilepas')::INT = 1,
      format('kunci_dilepas = %s, seharusnya 1', v_hasil->>'kunci_dilepas');
    ASSERT (v_hasil->>'jadi_berjalan')::INT = 1,
      format('jadi_berjalan = %s, seharusnya 1', v_hasil->>'jadi_berjalan');

    ASSERT (SELECT status FROM proker WHERE id = v_pA) = 'SELESAI', 'Proker lewat tidak menjadi SELESAI';
    ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_pA) = 0,
      'Kunci proker yang sudah selesai tidak dilepas — kalender terkunci selamanya';
    ASSERT (SELECT status FROM proker WHERE id = v_pD) = 'BERJALAN',
      'Proker yang masa persiapannya tiba tidak menjadi BERJALAN';

    -- Idempoten: dijalankan lagi tidak mengubah apa pun (ADR-009).
    v_hasil := lepas_kunci_selesai();
    ASSERT (v_hasil->>'jadi_selesai')::INT = 0
       AND (v_hasil->>'kunci_dilepas')::INT = 0
       AND (v_hasil->>'jadi_berjalan')::INT = 0,
      format('lepas_kunci_selesai tidak idempoten: %s', v_hasil);
  END;

  RAISE NOTICE 'OK 014a_proker_fn - konflik dilaporkan lengkap, kunci lama selamat saat revisi ditolak, lifecycle idempoten';
END $$;
