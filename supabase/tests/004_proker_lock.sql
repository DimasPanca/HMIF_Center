-- Test migrasi 004 — anti-bentrok proker.
--
-- Ini test terpenting di seluruh suite. Bila ia lulus tetapi sebenarnya tidak
-- menguji apa-apa, kegagalan sistem baru terlihat saat dua departemen sudah
-- terlanjur menjadwalkan acara pada tanggal yang sama.
--
-- Kasus batas diuji eksplisit karena di situlah kesalahan bersembunyi:
-- rentang yang bersinggungan tepat satu hari.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-023 · PRD F-5.2 · INV-09, INV-11, INV-12

DO $$
DECLARE
  v_periode  UUID;
  v_periode2 UUID;
  v_dept_a   UUID;
  v_dept_b   UUID;
  v_user     UUID := '11111111-1111-1111-1111-111111111111';
  v_proker   UUID;
  v_p2       UUID;
  v_ditolak  BOOLEAN;

  -- Skenario dari PRD F-5.2:
  --   Proker A "SYNCHRONIZE": persiapan 1 Nov, hari-H 6-7 Des 2026
  --   Rentang terkunci: 1 Nov - 7 Des inklusif = [2026-11-01, 2026-12-08)
  c_mulai_a  DATE := '2026-11-01';
  c_hariH_a  DATE := '2026-12-06';
  c_akhir_a  DATE := '2026-12-07';
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;

  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2025', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_periode2;

  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Kadept Uji', '3337220002', 'kadept@example.test');

  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  RETURNING id INTO v_dept_a;

  INSERT INTO departemen (kode, nama, warna) VALUES ('KOMINFO', 'Kominfo', '#A3E635')
  RETURNING id INTO v_dept_b;

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_a, 'SYNCHRONIZE', 'TERJADWAL', 'DISETUJUI',
          c_mulai_a, c_hariH_a, c_akhir_a, v_user)
  RETURNING id INTO v_proker;

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_b, 'IT Festival', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2027-01-01', '2027-01-20', '2027-01-21', v_user)
  RETURNING id INTO v_p2;

  -- Kunci proker A: 1 Nov - 7 Des inklusif
  INSERT INTO proker_lock (proker_id, periode_id, rentang)
  VALUES (v_proker, v_periode, daterange(c_mulai_a, c_akhir_a + 1, '[)'));

  ---------------------------------------------------------------------------
  -- 1. RENTANG BERIRISAN DI TENGAH -> DITOLAK
  --    Kominfo mengusulkan hari-H 20 Nov, di dalam masa persiapan Kaderisasi.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO proker_lock (proker_id, periode_id, rentang)
    VALUES (v_p2, v_periode, daterange('2026-11-05', '2026-11-21', '[)'));
  EXCEPTION WHEN exclusion_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Rentang beririsan DITERIMA - anti-bentrok tidak bekerja (INV-09)';

  ---------------------------------------------------------------------------
  -- 2. KASUS BATAS: mulai TEPAT pada hari terakhir proker A -> DITOLAK
  --    Inilah pembeda antara rentang inklusif dan eksklusif (INV-11).
  --    Bila rentang dibentuk tanpa "+ 1", kasus ini LOLOS dan hari terakhir
  --    acara bisa dipakai departemen lain.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO proker_lock (proker_id, periode_id, rentang)
    VALUES (v_p2, v_periode, daterange(c_akhir_a, c_akhir_a + 20, '[)'));
  EXCEPTION WHEN exclusion_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak,
    'Rentang yang mulai tepat pada hari terakhir proker A DITERIMA - rentang tidak inklusif (INV-11)';

  ---------------------------------------------------------------------------
  -- 3. KASUS BATAS: mulai SEHARI SETELAH proker A berakhir -> DITERIMA
  --    Batas atas harus tepat, bukan longgar. Menolak kasus ini berarti
  --    kalender terkunci sehari lebih panjang dari seharusnya.
  ---------------------------------------------------------------------------
  INSERT INTO proker_lock (proker_id, periode_id, rentang)
  VALUES (v_p2, v_periode, daterange(c_akhir_a + 1, c_akhir_a + 21, '[)'));
  DELETE FROM proker_lock WHERE proker_id = v_p2;

  ---------------------------------------------------------------------------
  -- 4. RENTANG SAMA PERSIS PADA PERIODE BERBEDA -> DITERIMA
  --    Kunci ber-scope periode. Periode lama tidak boleh memblokir periode baru.
  ---------------------------------------------------------------------------
  INSERT INTO proker_lock (proker_id, periode_id, rentang)
  VALUES (v_p2, v_periode2, daterange(c_mulai_a, c_akhir_a + 1, '[)'));
  DELETE FROM proker_lock WHERE proker_id = v_p2;

  ---------------------------------------------------------------------------
  -- 5. DURASI PERSIAPAN - 15 dan 45 hari adalah batas yang SAH (INV-12)
  ---------------------------------------------------------------------------
  INSERT INTO proker (periode_id, departemen_id, nama, kategori,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_a, 'Batas 15 hari', 'TERJADWAL',
          '2027-03-01', '2027-03-16', '2027-03-16', v_user);

  INSERT INTO proker (periode_id, departemen_id, nama, kategori,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_a, 'Batas 45 hari', 'TERJADWAL',
          '2027-04-01', '2027-05-16', '2027-05-16', v_user);

  -- 14 hari -> ditolak
  v_ditolak := false;
  BEGIN
    INSERT INTO proker (periode_id, departemen_id, nama, kategori,
                        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                        dibuat_oleh)
    VALUES (v_periode, v_dept_a, 'Terlalu pendek', 'TERJADWAL',
            '2027-06-01', '2027-06-15', '2027-06-15', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Persiapan 14 hari DITERIMA - batas bawah 15 hari tidak bekerja';

  -- 46 hari -> ditolak
  v_ditolak := false;
  BEGIN
    INSERT INTO proker (periode_id, departemen_id, nama, kategori,
                        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                        dibuat_oleh)
    VALUES (v_periode, v_dept_a, 'Terlalu panjang', 'TERJADWAL',
            '2027-07-01', '2027-08-16', '2027-08-16', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Persiapan 46 hari DITERIMA - batas atas 45 hari tidak bekerja';

  ---------------------------------------------------------------------------
  -- 6. TERJADWAL WAJIB BERTANGGAL; BERKALA TIDAK
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_periode, v_dept_a, 'Terjadwal tanpa tanggal', 'TERJADWAL', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Proker TERJADWAL tanpa tanggal DITERIMA';

  -- BERKALA tanpa tanggal sah: ia memakai pola_ulang dan tidak mengunci apa pun.
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, pola_ulang, dibuat_oleh)
  VALUES (v_periode, v_dept_a, 'Rapat Mingguan', 'BERKALA',
          '{"frekuensi":"MINGGUAN","hari":["SABTU"]}'::JSONB, v_user);

  ---------------------------------------------------------------------------
  -- 7. URUTAN TANGGAL - hari-H tidak boleh mendahului persiapan
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO proker (periode_id, departemen_id, nama, kategori,
                        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                        dibuat_oleh)
    VALUES (v_periode, v_dept_a, 'Terbalik', 'TERJADWAL',
            '2027-09-20', '2027-09-01', '2027-09-02', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Hari-H mendahului mulai persiapan DITERIMA';

  ---------------------------------------------------------------------------
  -- 8. SATU PROKER HANYA BOLEH PUNYA SATU KUNCI
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO proker_lock (proker_id, periode_id, rentang)
    VALUES (v_proker, v_periode, daterange('2027-10-01', '2027-10-10', '[)'));
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Satu proker memperoleh dua kunci';

  ---------------------------------------------------------------------------
  -- 9. MENGHAPUS PROKER MELEPAS KUNCINYA
  --    Tanpa CASCADE, kalender tetap terkunci oleh proker yang sudah tiada.
  ---------------------------------------------------------------------------
  DELETE FROM proker WHERE id = v_proker;
  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_proker) = 0,
    'Kunci tidak ikut terhapus saat proker dihapus - kalender terkunci selamanya';

  RAISE NOTICE 'OK 004_proker_lock - bentrok ditolak, kasus batas tepat, durasi 15-45 ditegakkan';
END $$;
