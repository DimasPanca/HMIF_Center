-- Test migrasi 014b — alokasi nomor surat dan pergantian periode.
--
-- Serialisasi lewat advisory lock TIDAK dapat diuji dari satu koneksi; itu
-- diuji terpisah oleh scripts/stress-nomor-surat.ts dengan 50 koneksi nyata
-- (T-057). Yang diuji di sini adalah kebenaran hasilnya: format nomor,
-- idempotensi terhadap retry, urutan pada batch, dan reset antar-periode.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-034 · PRD F-4.1 · ADR-001, ADR-003

DO $$
DECLARE
  v_p1      UUID;
  v_p2      UUID;
  v_user    UUID := '11111111-1111-1111-1111-111111111111';
  v_tmpl    UUID;
  v_s1      UUID;
  v_s2      UUID;
  v_nomor   TEXT;
  v_nomor2  TEXT;
  v_ditolak BOOLEAN;
  v_jumlah  INT;
  v_hasil   JSONB;
  v_ids     UUID[] := '{}';
  v_id      UUID;
  v_i       INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2026/2027', '2026-09-01', '2027-08-31', 'PERSIAPAN') RETURNING id INTO v_p1;

  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Sekretaris Umum', '3337220110', 'sekum4@example.test');

  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Peminjaman Ruangan', 'template/x.docx', '{}'::JSONB)
  RETURNING id INTO v_tmpl;

  ---------------------------------------------------------------------------
  -- 1. AKTIFKAN PERIODE — counter disiapkan (ADR-003)
  ---------------------------------------------------------------------------
  v_hasil := aktifkan_periode(v_p1);
  ASSERT (v_hasil->>'nomor_pertama')::INT = 1,
    format('nomor_pertama = %s, seharusnya 1', v_hasil->>'nomor_pertama');
  ASSERT (SELECT status FROM periode WHERE id = v_p1) = 'AKTIF', 'Periode tidak menjadi AKTIF';
  ASSERT (SELECT nomor_terakhir FROM surat_counter WHERE periode_id = v_p1) = 0,
    'Counter tidak dimulai dari nomor_surat_awal - 1';

  ---------------------------------------------------------------------------
  -- 2. SURAT PERTAMA BERNOMOR 001, BUKAN 1
  --    Bulan Oktober harus menghasilkan X, bukan 10 (PRD F-4.1).
  ---------------------------------------------------------------------------
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_p1, v_tmpl, '05', '2026-10-15',
          'Permohonan Peminjaman Auditorium', 'Kabag Sekretariat FT', 'di Tempat',
          v_user, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_s1;

  v_nomor := alokasi_nomor_surat(v_s1, v_user);

  ASSERT v_nomor = '05/001/UN43.3.7/HMIF/X/2026',
    format('Nomor = %s, seharusnya 05/001/UN43.3.7/HMIF/X/2026', v_nomor);

  ASSERT (SELECT status FROM surat WHERE id = v_s1) = 'DISETUJUI',
    'Status surat tidak menjadi DISETUJUI setelah alokasi';
  ASSERT (SELECT disetujui_oleh FROM surat WHERE id = v_s1) = v_user,
    'Approver tidak tercatat';
  ASSERT (SELECT bulan_romawi FROM surat WHERE id = v_s1) = 'X',
    'Bulan Oktober tidak menjadi X';

  ---------------------------------------------------------------------------
  -- 3. IDEMPOTEN TERHADAP RETRY
  --    Request yang timeout lalu diulang tidak boleh menghabiskan dua nomor.
  ---------------------------------------------------------------------------
  v_nomor2 := alokasi_nomor_surat(v_s1, v_user);
  ASSERT v_nomor2 = v_nomor,
    format('Alokasi ulang menghasilkan %s, seharusnya %s', v_nomor2, v_nomor);
  ASSERT (SELECT nomor_terakhir FROM surat_counter WHERE periode_id = v_p1) = 1,
    'Counter naik pada alokasi ulang — retry menghabiskan nomor';

  ---------------------------------------------------------------------------
  -- 4. SURAT BELUM DIAJUKAN DITOLAK (INV-14)
  --    Nomor hanya dialokasikan saat approval, bukan saat draft dibuat.
  ---------------------------------------------------------------------------
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_p1, v_tmpl, '05', '2026-11-01', 'Draft', 'X', 'di Tempat', v_user, 'DRAFT')
  RETURNING id INTO v_s2;

  v_ditolak := false;
  BEGIN
    PERFORM alokasi_nomor_surat(v_s2, v_user);
  EXCEPTION WHEN invalid_parameter_value THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Surat DRAFT memperoleh nomor — seharusnya hanya saat approval (INV-14)';

  ASSERT (SELECT nomor_terakhir FROM surat_counter WHERE periode_id = v_p1) = 1,
    'Counter naik walau alokasi ditolak — draft menghabiskan nomor';

  ---------------------------------------------------------------------------
  -- 5. KODE KEGIATAN VARIABEL
  --    Surat kepanitiaan memakai kode acara, bukan HMIF.
  ---------------------------------------------------------------------------
  UPDATE surat SET status = 'MENUNGGU_APPROVAL', kode_kegiatan = 'SYNCHRONIZE'
  WHERE id = v_s2;
  v_nomor := alokasi_nomor_surat(v_s2, v_user);
  ASSERT v_nomor = '05/002/UN43.3.7/SYNCHRONIZE/XI/2026',
    format('Nomor dengan kode kegiatan = %s', v_nomor);

  ---------------------------------------------------------------------------
  -- 6. BATCH — nomor berurutan tanpa loncat
  ---------------------------------------------------------------------------
  FOR v_i IN 1..30 LOOP
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES (v_p1, v_tmpl, '02', '2026-11-10',
            format('Keterangan Aktif %s', v_i), 'Yang Bersangkutan', 'di Tempat',
            v_user, 'MENUNGGU_APPROVAL')
    RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;

  PERFORM alokasi_nomor_batch(v_ids, v_user);

  -- 30 nomor unik.
  SELECT count(DISTINCT nomor_urut)::INT INTO v_jumlah
  FROM surat WHERE id = ANY(v_ids);
  ASSERT v_jumlah = 30, format('Batch menghasilkan %s nomor unik, seharusnya 30', v_jumlah);

  -- Berurutan 3..32 tanpa loncat: dua nomor pertama sudah dipakai surat lain.
  SELECT count(*)::INT INTO v_jumlah
  FROM surat WHERE id = ANY(v_ids) AND nomor_urut BETWEEN 3 AND 32;
  ASSERT v_jumlah = 30,
    'Nomor batch tidak berurutan 3-32 — ada yang meloncat, mencurigakan saat audit';

  ASSERT (SELECT nomor_terakhir FROM surat_counter WHERE periode_id = v_p1) = 32,
    'Counter tidak sesuai setelah batch';

  -- Batch lebih dari 50 ditolak.
  v_ditolak := false;
  BEGIN
    PERFORM alokasi_nomor_batch(
      (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 51)), v_user);
  EXCEPTION WHEN program_limit_exceeded THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Batch 51 surat DITERIMA — seharusnya ditolak';

  ---------------------------------------------------------------------------
  -- 7. PERIODE BARU MERESET COUNTER (ADR-003, INV-17)
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2027/2028', '2027-09-01', '2028-08-31', 'PERSIAPAN') RETURNING id INTO v_p2;

  v_hasil := aktifkan_periode(v_p2);

  ASSERT (v_hasil->>'periode_lama')::UUID = v_p1, 'Periode lama tidak tercatat';
  ASSERT (SELECT status FROM periode WHERE id = v_p1) = 'ARSIP',
    'Periode lama tidak diarsipkan — dua periode aktif sekaligus';
  ASSERT (SELECT status FROM periode WHERE id = v_p2) = 'AKTIF', 'Periode baru tidak aktif';

  -- Surat pertama periode baru kembali ke 001 walau periode lama sudah di 32.
  DECLARE v_s3 UUID;
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES (v_p2, v_tmpl, '01', '2027-09-05', 'Surat pertama periode baru',
            'BEM FT UNTIRTA', 'di Tempat', v_user, 'MENUNGGU_APPROVAL')
    RETURNING id INTO v_s3;

    v_nomor := alokasi_nomor_surat(v_s3, v_user);
    ASSERT v_nomor = '01/001/UN43.3.7/HMIF/IX/2027',
      format('Surat pertama periode baru = %s, seharusnya bernomor 001', v_nomor);
  END;

  ---------------------------------------------------------------------------
  -- 8. nomor_surat_awal DAPAT DISETEL ADMIN (ADR-003)
  --    Untuk organisasi yang memilih melanjutkan penomoran berjalan.
  ---------------------------------------------------------------------------
  DECLARE v_p3 UUID; v_s4 UUID;
  BEGIN
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status, nomor_surat_awal)
    VALUES ('HMIF 2028/2029', '2028-09-01', '2029-08-31', 'PERSIAPAN', 503)
    RETURNING id INTO v_p3;

    PERFORM aktifkan_periode(v_p3);

    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES (v_p3, v_tmpl, '03', '2028-09-10', 'Lanjut nomor', 'X', 'di Tempat',
            v_user, 'MENUNGGU_APPROVAL')
    RETURNING id INTO v_s4;

    v_nomor := alokasi_nomor_surat(v_s4, v_user);
    ASSERT v_nomor = '03/503/UN43.3.7/HMIF/IX/2028',
      format('nomor_surat_awal 503 menghasilkan %s', v_nomor);
  END;

  ---------------------------------------------------------------------------
  -- 9. KODE ADMINISTRASI DIBACA DARI KONFIGURASI (ADR-001)
  --    Koreksi nilainya cukup satu baris app_config, tanpa ubah kode.
  ---------------------------------------------------------------------------
  UPDATE app_config SET value = '"UN43.3.3.7"'::JSONB WHERE key = 'kode_administrasi';

  DECLARE v_s5 UUID;
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES ((SELECT id FROM periode WHERE status = 'AKTIF'), v_tmpl, '04', '2028-10-01',
            'Uji kode administrasi', 'X', 'di Tempat', v_user, 'MENUNGGU_APPROVAL')
    RETURNING id INTO v_s5;

    v_nomor := alokasi_nomor_surat(v_s5, v_user);
    ASSERT v_nomor LIKE '%/UN43.3.3.7/%',
      format('Kode administrasi tidak dibaca dari app_config: %s', v_nomor);
  END;

  RAISE NOTICE 'OK 014b_surat_fn - 001 dengan padding, Oktober jadi X, idempoten, batch berurutan, reset per periode';
END $$;
