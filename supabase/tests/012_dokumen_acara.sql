-- Test migrasi 012 — TOR, Proposal, LPJ, rundown.
--
-- Fokus pada urutan persetujuan LPJ. Tanpa penegakan di database, LPJ bisa
-- menjadi FINAL tanpa pernah diperiksa bendahara — padahal isinya laporan
-- keuangan seluruh acara.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-031 · PRD F-12.1 · ADR-015

DO $$
DECLARE
  v_periode UUID;
  v_dept    UUID;
  v_bendum  UUID := '11111111-1111-1111-1111-111111111111';
  v_ketua   UUID := '22222222-2222-2222-2222-222222222222';
  v_proker  UUID;
  v_kep     UUID;
  v_lpj     UUID;
  v_ditolak BOOLEAN;
  v_jumlah  INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_dept;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_bendum, 'Bendahara Umum', '3337220080', 'bendum@example.test');
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_ketua, 'Ketua Himpunan', '3337220081', 'ketua@example.test');
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept, 'SYNCHRONIZE', 'TERJADWAL', 'SELESAI',
          '2026-11-01', '2026-12-06', '2026-12-07', v_bendum)
  RETURNING id INTO v_proker;
  INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (v_proker, 'SYNCHRONIZE')
  RETURNING id INTO v_kep;

  ---------------------------------------------------------------------------
  -- 1. SATU TOR, SATU PROPOSAL, SATU LPJ PER ACARA
  ---------------------------------------------------------------------------
  INSERT INTO tor (kepanitiaan_id, data, updated_by)
  VALUES (v_kep, '{"nama_kegiatan":"SYNCHRONIZE","tema":"Sinergi"}'::JSONB, v_bendum);

  v_ditolak := false;
  BEGIN
    INSERT INTO tor (kepanitiaan_id) VALUES (v_kep);
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Satu acara memperoleh dua TOR';

  INSERT INTO proposal (kepanitiaan_id, data, updated_by)
  VALUES (v_kep, '{"latar_belakang":"..."}'::JSONB, v_bendum);

  ---------------------------------------------------------------------------
  -- 2. LPJ DEFAULT DRAFT, DAN DRAFT BOLEH TANPA ANALISIS
  ---------------------------------------------------------------------------
  INSERT INTO lpj (kepanitiaan_id, data_manual)
  VALUES (v_kep, '{"evaluasi":"belum diisi"}'::JSONB) RETURNING id INTO v_lpj;

  ASSERT (SELECT status FROM lpj WHERE id = v_lpj) = 'DRAFT',
    'Status LPJ tidak default ke DRAFT';

  ---------------------------------------------------------------------------
  -- 3. DIAJUKAN WAJIB SUDAH PUNYA SNAPSHOT ANALISIS
  --    LPJ tanpa analisis berarti angka keuangannya belum pernah dihitung.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    UPDATE lpj SET status = 'DIAJUKAN' WHERE id = v_lpj;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'LPJ DIAJUKAN tanpa snapshot analisis DITERIMA';

  -- Melompati DIAJUKAN ditolak trigger 046 walau kolom persetujuan lengkap.
  v_ditolak := false;
  BEGIN
    UPDATE lpj
    SET analisis = '{"total_aktual":1}'::JSONB, status = 'DISETUJUI_BENDUM',
        disetujui_bendum_oleh = v_bendum, disetujui_bendum_at = now()
    WHERE id = v_lpj;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Transisi DRAFT -> DISETUJUI_BENDUM (melompati DIAJUKAN) DITERIMA';

  UPDATE lpj
  SET analisis = '{"total_rencana":26000000,"total_aktual":24580000,"sisa_dana":1420000}'::JSONB,
      status = 'DIAJUKAN'
  WHERE id = v_lpj;

  -- Isi hanya berubah selama DRAFT (046).
  v_ditolak := false;
  BEGIN
    UPDATE lpj SET analisis = '{"total_aktual":1}'::JSONB WHERE id = v_lpj;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Snapshot analisis LPJ DIAJUKAN dapat diganti';

  ---------------------------------------------------------------------------
  -- 4. URUTAN PERSETUJUAN TIDAK BOLEH DILOMPATI (ADR-015)
  --    Ketua hanya bisa menyetujui SETELAH Bendahara Umum.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    UPDATE lpj SET disetujui_ketua_oleh = v_ketua, disetujui_ketua_at = now()
    WHERE id = v_lpj;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak,
    'Ketua menyetujui LPJ sebelum Bendum DITERIMA - laporan keuangan lolos tanpa diperiksa bendahara';

  -- Urutan yang benar: Bendum dulu.
  UPDATE lpj
  SET disetujui_bendum_oleh = v_bendum, disetujui_bendum_at = now(),
      status = 'DISETUJUI_BENDUM'
  WHERE id = v_lpj;

  ---------------------------------------------------------------------------
  -- 5. APPROVER DAN WAKTUNYA HARUS TERISI BERSAMAAN
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    UPDATE lpj SET disetujui_ketua_oleh = v_ketua WHERE id = v_lpj;   -- tanpa timestamp
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Approver terisi tanpa timestamp DITERIMA';

  ---------------------------------------------------------------------------
  -- 6. FINAL WAJIB PUNYA KEDUA PERSETUJUAN
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    UPDATE lpj SET status = 'FINAL' WHERE id = v_lpj;   -- Ketua belum menyetujui
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'LPJ FINAL tanpa persetujuan Ketua DITERIMA';

  UPDATE lpj
  SET disetujui_ketua_oleh = v_ketua, disetujui_ketua_at = now(), status = 'FINAL'
  WHERE id = v_lpj;

  ASSERT (SELECT status FROM lpj WHERE id = v_lpj) = 'FINAL',
    'LPJ gagal menjadi FINAL walau kedua persetujuan lengkap';

  ---------------------------------------------------------------------------
  -- 6b. FINAL BEKU (046/047, ADR-015): tak dapat diubah, dikembalikan, dihapus langsung
  --     (penghapusan berantai bersama acaranya tetap boleh — lihat akhir berkas)
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    UPDATE lpj SET data_manual = '{"evaluasi":"diubah setelah final"}'::JSONB WHERE id = v_lpj;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'LPJ FINAL dapat diubah';

  v_ditolak := false;
  BEGIN
    UPDATE lpj SET status = 'DRAFT' WHERE id = v_lpj;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'LPJ FINAL dapat dikembalikan ke DRAFT';

  v_ditolak := false;
  BEGIN
    DELETE FROM lpj WHERE id = v_lpj;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'LPJ FINAL dapat dihapus langsung';

  ---------------------------------------------------------------------------
  -- 7. RUNDOWN — satu sumber, banyak baris, waktu harus urut
  ---------------------------------------------------------------------------
  INSERT INTO rundown (kepanitiaan_id, tanggal, waktu_mulai, waktu_selesai, acara, keterangan, urutan)
  VALUES (v_kep, '2026-12-06', '08:00', '08:30', 'Registrasi peserta', 'Divisi Acara', 1);
  INSERT INTO rundown (kepanitiaan_id, tanggal, waktu_mulai, waktu_selesai, acara, keterangan, urutan)
  VALUES (v_kep, '2026-12-06', '08:30', '09:00', 'Pembukaan & sambutan', 'Ketua Pelaksana', 2);
  INSERT INTO rundown (kepanitiaan_id, tanggal, waktu_mulai, waktu_selesai, acara, keterangan, urutan)
  VALUES (v_kep, '2026-12-07', '08:00', '12:00', 'Sesi materi', 'Pemateri', 1);

  SELECT count(*)::INT INTO v_jumlah FROM rundown WHERE kepanitiaan_id = v_kep;
  ASSERT v_jumlah = 3, format('Rundown: %s baris, seharusnya 3', v_jumlah);

  v_ditolak := false;
  BEGIN
    INSERT INTO rundown (kepanitiaan_id, tanggal, waktu_mulai, waktu_selesai, acara)
    VALUES (v_kep, '2026-12-06', '12:00', '08:00', 'Terbalik');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Rundown dengan waktu selesai mendahului mulai DITERIMA';

  ---------------------------------------------------------------------------
  -- 8. CASCADE — hapus acara melenyapkan seluruh dokumennya
  ---------------------------------------------------------------------------
  DELETE FROM proker WHERE id = v_proker;

  ASSERT (SELECT count(*) FROM tor      WHERE kepanitiaan_id = v_kep) = 0, 'TOR tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM proposal WHERE kepanitiaan_id = v_kep) = 0, 'Proposal tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM lpj      WHERE kepanitiaan_id = v_kep) = 0, 'LPJ tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM rundown  WHERE kepanitiaan_id = v_kep) = 0, 'Rundown tidak ikut terhapus';

  RAISE NOTICE 'OK 012_dokumen_acara - urutan approval LPJ ditegakkan, FINAL wajib lengkap';
END $$;
