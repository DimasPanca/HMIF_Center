-- Test migrasi 013 — audit log, backup, konfigurasi.
--
-- Test terpenting di berkas ini menguji bahwa audit log TIDAK DAPAT diubah
-- bahkan oleh koneksi yang kita pakai sekarang — yang merupakan pemilik
-- database. REVOKE saja tidak menghentikan pemilik; itulah kenapa ada trigger.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-032 · PRD M15 · INV-06, ADR-008, ADR-016

DO $$
DECLARE
  v_periode UUID;
  v_user    UUID := '11111111-1111-1111-1111-111111111111';
  v_ditolak BOOLEAN;
  v_jumlah  INT;
  v_id      BIGINT;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Admin Uji', '3337220090', 'admin@example.test');

  ---------------------------------------------------------------------------
  -- 1. AUDIT LOG DAPAT DITULIS
  ---------------------------------------------------------------------------
  INSERT INTO audit_log (user_id, periode_id, aksi, entitas, entitas_id,
                         nilai_lama, nilai_baru, ip_address, user_agent)
  VALUES (v_user, v_periode, 'APPROVE', 'proker', 'abc-123',
          '{"status":"MENUNGGU_APPROVAL"}'::JSONB, '{"status":"DISETUJUI"}'::JSONB,
          '103.28.14.7'::INET, 'Mozilla/5.0')
  RETURNING id INTO v_id;

  -- Mutasi dari cron dan skrip tidak punya pengguna, tetapi tetap wajib
  -- tercatat. Memaksa user_id NOT NULL akan menggagalkan trigger audit dan
  -- ikut menggagalkan mutasinya.
  INSERT INTO audit_log (aksi, entitas, entitas_id, user_agent)
  VALUES ('CRON', 'proker_lock', 'sistem', 'sistem');

  -- Dibatasi pada dua baris yang ditulis test ini. Sejak migrasi 014c
  -- memasang trigger fn_audit, INSERT periode dan app_user di atas ikut
  -- menghasilkan baris audit — menghitung seluruh tabel akan menjadikan test
  -- ini gagal setiap kali daftar tabel teraudit bertambah.
  SELECT count(*)::INT INTO v_jumlah FROM audit_log
  WHERE entitas_id IN ('abc-123', 'sistem');
  ASSERT v_jumlah = 2, format('Audit log: %s baris tulisan manual, seharusnya 2', v_jumlah);

  ---------------------------------------------------------------------------
  -- 2. UPDATE DITOLAK — bahkan oleh pemilik database (INV-06)
  --    Koneksi test ini adalah owner, jadi REVOKE tidak menghalanginya.
  --    Yang menolak adalah trigger.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    UPDATE audit_log SET aksi = 'DIPALSUKAN' WHERE id = v_id;
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak,
    'UPDATE pada audit_log DITERIMA - jejak audit dapat dipalsukan pemegang kredensial owner';

  ASSERT (SELECT aksi FROM audit_log WHERE id = v_id) = 'APPROVE',
    'Isi audit log berubah walau UPDATE ditolak';

  ---------------------------------------------------------------------------
  -- 3. DELETE DITOLAK
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    DELETE FROM audit_log WHERE id = v_id;
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'DELETE pada audit_log DITERIMA - jejak audit dapat dihapus';

  SELECT count(*)::INT INTO v_jumlah FROM audit_log
  WHERE entitas_id IN ('abc-123', 'sistem');
  ASSERT v_jumlah = 2, 'Baris audit hilang walau DELETE ditolak';

  ---------------------------------------------------------------------------
  -- 4. TRUNCATE DITOLAK
  --    TRUNCATE melewati trigger per-baris. Tanpa trigger tingkat statement,
  --    seluruh jejak audit lenyap dalam satu perintah.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    TRUNCATE audit_log;
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'TRUNCATE pada audit_log DITERIMA - seluruh jejak lenyap sekaligus';

  ---------------------------------------------------------------------------
  -- 5. BACKUP — kegagalan wajib menyebutkan sebabnya
  ---------------------------------------------------------------------------
  INSERT INTO backup (jenis, status, storage_key, manifest, dibuat_oleh,
                      completed_at, ukuran_bytes)
  VALUES ('OTOMATIS', 'SUKSES', 'backup/2026-09/abc',
          '{"versiSkema":1,"files":[]}'::JSONB, v_user, now(), 154000000);

  v_ditolak := false;
  BEGIN
    INSERT INTO backup (jenis, status, storage_key, completed_at)
    VALUES ('OTOMATIS', 'GAGAL', 'backup/gagal', now());
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Backup GAGAL tanpa error_message DITERIMA';

  v_ditolak := false;
  BEGIN
    INSERT INTO backup (jenis, status, storage_key)
    VALUES ('MANUAL', 'SUKSES', 'backup/tanpa-waktu');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Backup SUKSES tanpa completed_at DITERIMA';

  -- Backup yang masih berjalan memang belum punya completed_at.
  INSERT INTO backup (jenis, status, storage_key)
  VALUES ('PRA_RESTORE', 'BERJALAN', 'backup/berjalan');

  ---------------------------------------------------------------------------
  -- 6. QUERY RETENSI HANYA MENJANGKAU BACKUP OTOMATIS (ADR-016)
  --    MANUAL dan PRA_RESTORE tidak boleh pernah terhapus otomatis.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah
  FROM backup WHERE jenis = 'OTOMATIS' AND status = 'SUKSES'
    AND created_at = now();  -- hanya baris test ini (now() tetap dalam satu transaksi)
  ASSERT v_jumlah = 1, 'Query retensi tidak menemukan backup otomatis';

  SELECT count(*)::INT INTO v_jumlah
  FROM backup WHERE jenis IN ('MANUAL', 'PRA_RESTORE') AND created_at = now();
  ASSERT v_jumlah = 1, 'Backup non-otomatis tidak tersimpan';

  ---------------------------------------------------------------------------
  -- 7. APP_CONFIG — TEPAT LIMA KEY, TANPA durasi_persiapan (ADR-008)
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah FROM app_config;
  ASSERT v_jumlah = 5, format('app_config: %s key, seharusnya tepat 5', v_jumlah);

  SELECT count(*)::INT INTO v_jumlah
  FROM app_config WHERE key LIKE 'durasi_persiapan%';
  ASSERT v_jumlah = 0,
    'app_config memuat durasi_persiapan - aturan itu hidup sebagai CHECK constraint pada proker (ADR-008)';

  ASSERT (SELECT value #>> '{}' FROM app_config WHERE key = 'kode_administrasi') = 'UN43.3.7',
    'kode_administrasi tidak sesuai ADR-001';
  ASSERT (SELECT value #>> '{}' FROM app_config WHERE key = 'kota_default') = 'Cilegon',
    'kota_default tidak sesuai';
  ASSERT (SELECT (value #>> '{}')::INT FROM app_config WHERE key = 'deadline_warning_hari') = 7,
    'deadline_warning_hari tidak sesuai PRD F-7.4';

  RAISE NOTICE 'OK 013_audit - UPDATE, DELETE, dan TRUNCATE audit_log ditolak; app_config tepat 5 key';
END $$;
