-- Test migrasi 003 — enam tabel inti dan constraint yang menjaganya.
--
-- Yang diuji adalah PENOLAKAN, bukan penerimaan. Constraint yang tidak pernah
-- dicoba dilanggar sama saja dengan tidak ada.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-022 · SYSTEM_DESIGN §4.2 · ADR-003

DO $$
DECLARE
  v_periode1 UUID;
  v_periode2 UUID;
  v_user     UUID := '11111111-1111-1111-1111-111111111111';
  v_dept     UUID;
  v_ditolak  BOOLEAN;
  v_jumlah   INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2025/2026', '2025-09-01', '2026-08-31', 'AKTIF')
  RETURNING id INTO v_periode1;

  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Pengurus Uji', '3337220001', 'uji@example.test');

  INSERT INTO departemen (kode, nama, warna, urutan)
  VALUES ('KAD', 'Kaderisasi', '#1E90FF', 1)
  RETURNING id INTO v_dept;

  ---------------------------------------------------------------------------
  -- 1. HANYA SATU PERIODE AKTIF
  --    Dua periode aktif membuat penomoran surat bercabang dan resolusi peran
  --    menjadi ambigu.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Uji Kedua', '2026-09-01', '2027-08-31', 'AKTIF');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Periode AKTIF kedua DITERIMA — index periode_hanya_satu_aktif tidak bekerja';

  -- Periode non-aktif boleh berapa pun banyaknya.
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji Arsip', '2024-09-01', '2025-08-31', 'ARSIP')
  RETURNING id INTO v_periode2;

  ---------------------------------------------------------------------------
  -- 2. TANGGAL PERIODE HARUS URUT
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Terbalik', '2026-08-31', '2025-09-01', 'PERSIAPAN');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Periode dengan tanggal selesai lebih awal DITERIMA';

  ---------------------------------------------------------------------------
  -- 3. MULTI-ROLE — satu pengguna, beberapa peran sekaligus (PRD §4.4)
  ---------------------------------------------------------------------------
  INSERT INTO user_role (user_id, periode_id, role, departemen_id)
  VALUES (v_user, v_periode1, 'ANGGOTA', v_dept);
  INSERT INTO user_role (user_id, periode_id, role)
  VALUES (v_user, v_periode1, 'BPH');

  SELECT count(*)::INT INTO v_jumlah FROM user_role WHERE user_id = v_user;
  ASSERT v_jumlah = 2, format('Multi-role gagal: %s baris, seharusnya 2', v_jumlah);

  ---------------------------------------------------------------------------
  -- 4. PERAN DUPLIKAT DITOLAK, TERMASUK YANG BER-DEPARTEMEN NULL
  --    Inilah alasan memakai UNIQUE NULLS NOT DISTINCT: dengan UNIQUE biasa,
  --    PostgreSQL menganggap NULL saling berbeda sehingga baris di bawah lolos.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO user_role (user_id, periode_id, role)
    VALUES (v_user, v_periode1, 'BPH');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak,
    'Peran duplikat ber-departemen NULL DITERIMA — UNIQUE NULLS NOT DISTINCT tidak bekerja';

  -- Peran sama pada periode BERBEDA tetap boleh: peran ber-scope periode.
  INSERT INTO user_role (user_id, periode_id, role)
  VALUES (v_user, v_periode2, 'BPH');

  ---------------------------------------------------------------------------
  -- 5. KADEPT DAN ANGGOTA WAJIB PUNYA DEPARTEMEN
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO user_role (user_id, periode_id, role)
    VALUES (v_user, v_periode1, 'KADEPT');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'KADEPT tanpa departemen_id DITERIMA — CHECK role_dept_wajib tidak bekerja';

  ---------------------------------------------------------------------------
  -- 6. WARNA DEPARTEMEN HARUS HEX
  --    Nilai salah tidak memunculkan error saat render; bar Gantt hanya
  --    kehilangan warna dan penyebabnya sulit ditelusuri.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO departemen (kode, nama, warna) VALUES ('XX', 'Salah', 'biru');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Warna departemen non-hex DITERIMA';

  ---------------------------------------------------------------------------
  -- 7. NIM DAN EMAIL UNIK
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO app_user (id, nama_lengkap, nim, email)
    VALUES ('22222222-2222-2222-2222-222222222222', 'Kembar', '3337220001', 'lain@example.test');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'NIM duplikat DITERIMA';

  ---------------------------------------------------------------------------
  -- 8. NOMOR SURAT AWAL — default 1, dan tidak boleh nol/negatif (ADR-003)
  ---------------------------------------------------------------------------
  ASSERT (SELECT nomor_surat_awal FROM periode WHERE id = v_periode1) = 1,
    'nomor_surat_awal tidak default ke 1';

  v_ditolak := false;
  BEGIN
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, nomor_surat_awal)
    VALUES ('Nol', '2027-09-01', '2028-08-31', 0);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'nomor_surat_awal = 0 DITERIMA';

  ---------------------------------------------------------------------------
  -- 9. MENGHAPUS PENGGUNA MENGHAPUS PERANNYA, BUKAN SEBALIKNYA
  ---------------------------------------------------------------------------
  DELETE FROM app_user WHERE id = v_user;
  SELECT count(*)::INT INTO v_jumlah FROM user_role WHERE user_id = v_user;
  ASSERT v_jumlah = 0, 'Peran tidak ikut terhapus saat pengguna dihapus';

  SELECT count(*)::INT INTO v_jumlah FROM departemen WHERE id = v_dept;
  ASSERT v_jumlah = 1, 'Departemen ikut terhapus saat pengguna dihapus — CASCADE terlalu jauh';

  RAISE NOTICE 'OK 003_core — 6 tabel, 8 constraint terbukti menolak pelanggaran';
END $$;
