-- Test migrasi 014c — trigger audit generik.
--
-- Urutan blok di sini penting. set_config(..., true) berlaku sampai akhir
-- transaksi, jadi skenario "tanpa konteks" HARUS dijalankan lebih dulu:
-- sekali sebuah setting diisi, ia tidak bisa dikembalikan ke keadaan
-- belum-pernah-diisi dalam transaksi yang sama.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-035 · SYSTEM_DESIGN §14.1, §14.2 · INV-06

DO $$
DECLARE
  v_periode  UUID;
  v_user     UUID := '22222222-2222-2222-2222-222222222222';
  v_row      audit_log%ROWTYPE;
  v_jumlah   INT;
  v_ditolak  BOOLEAN;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. TANPA KONTEKS SAMA SEKALI
  --
  --    Ini keadaan cron harian dan skrip administratif: tidak ada JWT, tidak
  --    ada set_config. Mutasinya tetap harus tercatat. Kalau blok ini gagal,
  --    /api/cron/harian akan menjatuhkan seluruh sistem setiap malam.
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Audit 2026', '2026-09-01', '2027-08-31', 'PERSIAPAN')
  RETURNING id INTO v_periode;

  SELECT * INTO v_row FROM audit_log
  WHERE entitas = 'periode' AND entitas_id = v_periode::TEXT;

  ASSERT FOUND, 'Mutasi tanpa konteks TIDAK menghasilkan baris audit';
  ASSERT v_row.user_id IS NULL, 'user_id terisi padahal tidak ada JWT';
  ASSERT v_row.periode_id IS NULL, 'periode_id terisi padahal tidak di-set';
  ASSERT v_row.ip_address IS NULL, 'ip_address terisi padahal tidak di-set';
  ASSERT v_row.aksi = 'CREATE', format('aksi INSERT tercatat sebagai %s', v_row.aksi);
  ASSERT v_row.nilai_lama IS NULL, 'nilai_lama terisi pada INSERT';
  ASSERT v_row.nilai_baru->>'nama' = 'Audit 2026', 'nilai_baru tidak memuat data baris';

  ---------------------------------------------------------------------------
  -- 2. KONTEKS BERISI STRING KOSONG
  --
  --    Inilah yang membuat SYSTEM_DESIGN §14.1 apa adanya tidak dapat dipakai.
  --    Aplikasi yang tidak mengetahui IP peminta wajar menulis string kosong.
  --    Tanpa NULLIF, ''::INET melempar dan SETIAP mutasi ikut gagal.
  ---------------------------------------------------------------------------
  PERFORM set_config('app.ip',         '', true);
  PERFORM set_config('app.periode_id', '', true);
  PERFORM set_config('app.user_agent', '', true);

  UPDATE periode SET nama = 'Audit 2026 Revisi' WHERE id = v_periode;

  SELECT count(*)::INT INTO v_jumlah FROM audit_log
  WHERE entitas = 'periode' AND entitas_id = v_periode::TEXT AND aksi = 'UPDATE';
  ASSERT v_jumlah = 1,
    'Mutasi dengan konteks string kosong GAGAL — NULLIF hilang dari fn_audit';

  SELECT * INTO v_row FROM audit_log
  WHERE entitas = 'periode' AND entitas_id = v_periode::TEXT AND aksi = 'UPDATE';
  ASSERT v_row.ip_address IS NULL,  'String kosong tidak diperlakukan sebagai NULL';
  ASSERT v_row.periode_id IS NULL,  'String kosong tidak diperlakukan sebagai NULL';
  ASSERT v_row.user_agent IS NULL,  'String kosong tidak diperlakukan sebagai NULL';

  ---------------------------------------------------------------------------
  -- 3. NILAI LAMA DAN BARU PADA UPDATE
  --    Inti gunanya audit: menunjukkan apa yang berubah, bukan sekadar bahwa
  --    sesuatu berubah.
  ---------------------------------------------------------------------------
  ASSERT v_row.nilai_lama->>'nama' = 'Audit 2026',
    format('nilai_lama = %s, seharusnya nama sebelum diubah', v_row.nilai_lama->>'nama');
  ASSERT v_row.nilai_baru->>'nama' = 'Audit 2026 Revisi',
    format('nilai_baru = %s, seharusnya nama sesudah diubah', v_row.nilai_baru->>'nama');
  ASSERT v_row.nilai_lama->>'id' = v_row.nilai_baru->>'id',
    'Baris lama dan baru bukan baris yang sama';

  ---------------------------------------------------------------------------
  -- 4. KONTEKS TERISI PENUH
  ---------------------------------------------------------------------------
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Pelaku Audit', '3337220300', 'audit@example.test');

  PERFORM set_config('app.periode_id', v_periode::TEXT, true);
  PERFORM set_config('app.ip',         '182.253.44.7',  true);
  PERFORM set_config('app.user_agent', 'Mozilla/5.0 (Android 14)', true);
  -- auth.uid() membaca klaim JWT; diisi seperti yang dilakukan Supabase.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_user::TEXT)::TEXT, true);

  UPDATE periode SET status = 'AKTIF' WHERE id = v_periode;

  SELECT * INTO v_row FROM audit_log
  WHERE entitas = 'periode' AND entitas_id = v_periode::TEXT
    AND nilai_baru->>'status' = 'AKTIF';

  ASSERT v_row.user_id = v_user,
    format('user_id = %s, seharusnya dibaca dari klaim JWT', v_row.user_id);
  ASSERT v_row.periode_id = v_periode, 'periode_id tidak dibaca dari konteks';
  ASSERT v_row.ip_address = '182.253.44.7'::INET, 'ip_address tidak dibaca dari konteks';
  ASSERT v_row.user_agent = 'Mozilla/5.0 (Android 14)', 'user_agent tidak dibaca dari konteks';

  ---------------------------------------------------------------------------
  -- 5. KLAIM JWT RUSAK TIDAK MENJATUHKAN MUTASI
  --    auth.uid() melempar bila klaimnya bukan JSON. Mutasi tetap harus jalan
  --    dan tercatat, hanya pelakunya yang tidak diketahui.
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', 'bukan-json-sama-sekali', true);

  UPDATE periode SET nama = 'Audit 2026 Klaim Rusak' WHERE id = v_periode;

  SELECT * INTO v_row FROM audit_log
  WHERE entitas = 'periode' AND nilai_baru->>'nama' = 'Audit 2026 Klaim Rusak';
  ASSERT FOUND, 'Klaim JWT rusak menjatuhkan mutasi — konteks_user_id() tidak menelan error';
  ASSERT v_row.user_id IS NULL, 'Klaim rusak menghasilkan user_id yang bukan NULL';

  PERFORM set_config('request.jwt.claims', '', true);

  ---------------------------------------------------------------------------
  -- 6. DELETE TERCATAT BESERTA ISI BARIS YANG HILANG
  --    Tanpa nilai_lama, penghapusan tidak dapat ditelusuri sama sekali.
  ---------------------------------------------------------------------------
  DECLARE v_dept UUID; v_proker UUID;
  BEGIN
    INSERT INTO departemen (kode, nama, warna) VALUES ('AUD', 'Departemen Uji', '#123456')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
    RETURNING id INTO v_dept;

    -- Kepanitiaan menggantung pada proker, bukan langsung pada periode:
    -- ia lahir saat proker TERJADWAL disetujui (PRD F-8.1).
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (v_periode, v_dept, 'Proker Uji Audit', 'BERKALA', v_user)
    RETURNING id INTO v_proker;

    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan)
    VALUES (v_proker, 'Kepanitiaan Uji', 'UJI');

    DELETE FROM kepanitiaan WHERE kode_kegiatan = 'UJI';

    SELECT * INTO v_row FROM audit_log
    WHERE entitas = 'kepanitiaan' AND aksi = 'DELETE';
    ASSERT FOUND, 'DELETE tidak tercatat';
    ASSERT v_row.nilai_lama->>'nama_acara' = 'Kepanitiaan Uji',
      'nilai_lama kosong pada DELETE — baris yang hilang tidak dapat ditelusuri';
    ASSERT v_row.nilai_baru IS NULL, 'nilai_baru terisi pada DELETE';
  END;

  ---------------------------------------------------------------------------
  -- 7. JEJAK AUDIT TETAP TIDAK DAPAT DIUBAH (INV-06)
  --    Trigger audit menulis ke audit_log; itu tidak boleh membuka celah
  --    untuk menyuntingnya kemudian.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    UPDATE audit_log SET aksi = 'DIPALSUKAN' WHERE entitas = 'periode';
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'audit_log dapat diubah — INV-06 bocor';

  v_ditolak := false;
  BEGIN
    DELETE FROM audit_log WHERE entitas = 'periode';
  EXCEPTION WHEN insufficient_privilege THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'audit_log dapat dihapus — INV-06 bocor';

  ---------------------------------------------------------------------------
  -- 8. TABEL BERVOLUME TINGGI SENGAJA TIDAK DIAUDIT
  --    Memasangnya akan membanjiri jejak audit sampai yang penting tenggelam.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah
  FROM pg_trigger
  WHERE tgname IN ('trg_audit_kanban_card', 'trg_audit_gantt_task') AND NOT tgisinternal;
  ASSERT v_jumlah = 0, 'Tabel bervolume tinggi ikut diaudit';

  -- Dihitung dari FUNGSINYA, bukan dari nama trigger. Pola 'trg_audit_%'
  -- ikut menangkap trg_audit_log_tolak_* milik migrasi 013 yang tugasnya
  -- justru berlawanan: menolak tulisan, bukan mencatatnya.
  SELECT count(*)::INT INTO v_jumlah
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE p.proname = 'fn_audit' AND NOT t.tgisinternal;
  ASSERT v_jumlah = 12,
    format('Terpasang %s trigger fn_audit, seharusnya 12 sesuai §14.1', v_jumlah);

  RAISE NOTICE 'OK 014c_audit_fn - cron tanpa konteks tercatat, konteks kosong tidak menjatuhkan mutasi, audit tetap append-only';
END $$;
