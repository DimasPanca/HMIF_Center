-- Test migrasi 005 — kepanitiaan, divisi, anggota, job desk.
--
-- Fokus pada dua hal yang mudah salah dipahami saat implementasi:
--   1. Ketua Pelaksana BEBAS lintas departemen (PRD F-8.1) — bukan dibatasi
--      departemen pengusul proker.
--   2. Nama divisi unik DALAM satu acara, bukan unik global.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-024 · SYSTEM_DESIGN §4.5 · ADR-005, ADR-013

DO $$
DECLARE
  v_periode   UUID;
  v_dept_kad  UUID;
  v_dept_kom  UUID;
  v_orang_kad UUID := '11111111-1111-1111-1111-111111111111';
  v_orang_kom UUID := '22222222-2222-2222-2222-222222222222';
  v_proker1   UUID;
  v_proker2   UUID;
  v_kep1      UUID;
  v_kep2      UUID;
  v_div       UUID;
  v_ditolak   BOOLEAN;
  v_jumlah    INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar: dua departemen, dua orang, dua proker
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;

  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_dept_kad;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KOMINFO', 'Kominfo', '#A3E635')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_dept_kom;

  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_orang_kad, 'Anggota Kaderisasi', '3337220010', 'kad@example.test');
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_orang_kom, 'Anggota Kominfo', '3337220011', 'kom@example.test');

  INSERT INTO user_role (user_id, periode_id, role, departemen_id)
  VALUES (v_orang_kom, v_periode, 'ANGGOTA', v_dept_kom);

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_kad, 'SYNCHRONIZE', 'TERJADWAL', 'DISETUJUI',
          '2026-11-01', '2026-12-06', '2026-12-07', v_orang_kad)
  RETURNING id INTO v_proker1;

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_kom, 'IT Festival', 'TERJADWAL', 'DISETUJUI',
          '2027-01-01', '2027-01-20', '2027-01-21', v_orang_kad)
  RETURNING id INTO v_proker2;

  ---------------------------------------------------------------------------
  -- 1. KETUA PELAKSANA BEBAS LINTAS DEPARTEMEN (PRD F-8.1)
  --    Acara milik Kaderisasi, ketua pelaksananya anggota Kominfo.
  --    Ini SAH dan merupakan salah satu poin penting spesifikasi.
  ---------------------------------------------------------------------------
  INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
  VALUES (v_proker1, 'SYNCHRONIZE', 'SYNCHRONIZE', v_orang_kom)
  RETURNING id INTO v_kep1;

  ASSERT (SELECT ketua_pelaksana FROM kepanitiaan WHERE id = v_kep1) = v_orang_kom,
    'Ketua Pelaksana lintas departemen tidak tersimpan';

  ---------------------------------------------------------------------------
  -- 2. SATU PROKER HANYA BOLEH PUNYA SATU KEPANITIAAN
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (v_proker1, 'Duplikat');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Satu proker memperoleh dua kepanitiaan';

  ---------------------------------------------------------------------------
  -- 3. NAMA DIVISI UNIK DALAM SATU ACARA, TETAPI BOLEH SAMA ANTAR-ACARA
  ---------------------------------------------------------------------------
  INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan)
  VALUES (v_kep1, 'KONSUMSI', v_orang_kad, 2) RETURNING id INTO v_div;

  v_ditolak := false;
  BEGIN
    INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep1, 'KONSUMSI');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Divisi dengan nama sama dalam satu acara DITERIMA';

  -- Acara lain boleh punya divisi KONSUMSI juga.
  INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (v_proker2, 'IT Festival')
  RETURNING id INTO v_kep2;
  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep2, 'KONSUMSI');

  ---------------------------------------------------------------------------
  -- 4. WARNA DIVISI BOLEH KOSONG, TETAPI BILA DIISI HARUS HEX
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO divisi (kepanitiaan_id, nama, warna) VALUES (v_kep1, 'PDD', 'merah');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Warna divisi non-hex DITERIMA';

  INSERT INTO divisi (kepanitiaan_id, nama, warna) VALUES (v_kep1, 'PDD', '#F59E0B');

  ---------------------------------------------------------------------------
  -- 5. SATU ORANG HANYA SEKALI DALAM SATU DIVISI
  ---------------------------------------------------------------------------
  INSERT INTO divisi_member (divisi_id, user_id, peran)
  VALUES (v_div, v_orang_kad, 'KOORDINATOR');

  v_ditolak := false;
  BEGIN
    INSERT INTO divisi_member (divisi_id, user_id, peran)
    VALUES (v_div, v_orang_kad, 'ANGGOTA');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Orang yang sama masuk dua kali ke satu divisi';

  -- Tetapi satu orang boleh berada di beberapa divisi sekaligus (PRD §4.4).
  INSERT INTO divisi_member (divisi_id, user_id, peran)
  SELECT id, v_orang_kad, 'ANGGOTA' FROM divisi WHERE kepanitiaan_id = v_kep1 AND nama = 'PDD';

  SELECT count(*)::INT INTO v_jumlah FROM divisi_member WHERE user_id = v_orang_kad;
  ASSERT v_jumlah = 2, format('Multi-divisi gagal: %s baris, seharusnya 2', v_jumlah);

  ---------------------------------------------------------------------------
  -- 6. SATU JOB DESK PER DIVISI
  ---------------------------------------------------------------------------
  INSERT INTO job_desk (divisi_id, konten, updated_by)
  VALUES (v_div, '{"type":"doc","content":[]}'::JSONB, v_orang_kad);

  v_ditolak := false;
  BEGIN
    INSERT INTO job_desk (divisi_id, konten) VALUES (v_div, '{}'::JSONB);
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Satu divisi memperoleh dua job desk';

  ---------------------------------------------------------------------------
  -- 7. RANTAI CASCADE — hapus proker melenyapkan seluruh ruang kerjanya
  --    Tanpa ini, divisi dan anggota menggantung tanpa acara induk.
  ---------------------------------------------------------------------------
  DELETE FROM proker WHERE id = v_proker1;

  ASSERT (SELECT count(*) FROM kepanitiaan WHERE id = v_kep1) = 0, 'Kepanitiaan tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM divisi WHERE kepanitiaan_id = v_kep1) = 0, 'Divisi tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM divisi_member WHERE divisi_id = v_div) = 0, 'Anggota divisi tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM job_desk WHERE divisi_id = v_div) = 0, 'Job desk tidak ikut terhapus';

  -- Pengguna TIDAK boleh ikut terhapus — CASCADE tidak boleh sejauh itu.
  ASSERT (SELECT count(*) FROM app_user WHERE id = v_orang_kad) = 1,
    'Pengguna ikut terhapus saat proker dihapus - CASCADE terlalu jauh';

  -- Acara lain tidak terpengaruh.
  ASSERT (SELECT count(*) FROM kepanitiaan WHERE id = v_kep2) = 1,
    'Kepanitiaan acara lain ikut terhapus';

  RAISE NOTICE 'OK 005_kepanitiaan - ketuplak lintas departemen, divisi unik per acara, cascade tepat';
END $$;
