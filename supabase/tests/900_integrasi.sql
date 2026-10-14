-- Test integrasi — satu periode kepengurusan dijalani dari awal sampai nota.
--
-- Berkas test lain memeriksa satu tabel atau satu fungsi secara terpisah.
-- Yang ini memeriksa hal yang tidak terlihat di sana: apakah potongan-potongan
-- itu masih benar ketika disambung. Kegagalan khas yang hanya muncul di sini
-- adalah trigger audit yang menjatuhkan mutasi hilir, fungsi yang mengandaikan
-- data yang belum sempat dibuat, dan constraint yang saling menghalangi.
--
-- Alurnya mengikuti perjalanan nyata satu acara:
--   periode -> pengurus -> proker -> approval -> kunci kalender
--           -> surat -> nomor resmi
--           -> kepanitiaan -> divisi -> RAB -> nota -> alokasi
--           -> acara selesai -> kunci dilepas
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-036 · AI_EXECUTION_PLAN §5.1

DO $$
DECLARE
  v_periode   UUID;
  v_ketua     UUID := '3a000000-0000-0000-0000-000000000001';
  v_sekum     UUID := '3a000000-0000-0000-0000-000000000002';
  v_kadept    UUID := '3a000000-0000-0000-0000-000000000003';
  v_dept      UUID;
  v_proker    UUID;
  v_proker2   UUID;
  v_hasil     JSONB;
  v_tmpl      UUID;
  v_surat     UUID;
  v_nomor     TEXT;
  v_panitia   UUID;
  v_divisi    UUID;
  v_section   UUID;
  v_item      UUID;
  v_item2     UUID;
  v_image     UUID;
  v_nota      UUID;
  v_lock      DATERANGE;
  v_jumlah    INT;
  v_ditolak   BOOLEAN;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. PERIODE DAN PENGURUS
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2026/2027', '2026-09-01', '2027-08-31', 'PERSIAPAN')
  RETURNING id INTO v_periode;

  v_hasil := aktifkan_periode(v_periode);
  ASSERT (v_hasil->>'nomor_pertama')::INT = 1, 'Counter periode baru tidak siap';

  INSERT INTO app_user (id, nama_lengkap, nim, email) VALUES
    (v_ketua,  'Ketua Umum',    '3337220001', 'ketua@integrasi.test'),
    (v_sekum,  'Sekretaris Umum','3337220002', 'sekum@integrasi.test'),
    (v_kadept, 'Kepala Kaderisasi','3337220003','kadept@integrasi.test');

  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_dept;

  INSERT INTO user_role (user_id, periode_id, role, departemen_id) VALUES
    (v_ketua,  v_periode, 'KETUA',  NULL),
    (v_sekum,  v_periode, 'SEKUM',  NULL),
    (v_kadept, v_periode, 'KADEPT', v_dept);

  ---------------------------------------------------------------------------
  -- 2. PROKER TERJADWAL DIAJUKAN LALU DISETUJUI
  --    Persiapan 2026-11-01 sampai hari-H 2026-11-20 = 19 hari, di dalam
  --    rentang wajib 15-45 hari (INV-12).
  ---------------------------------------------------------------------------
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai,
                      tanggal_hari_h_selesai, dibuat_oleh)
  VALUES (v_periode, v_dept, 'SYNCHRONIZE 2026', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2026-11-01', '2026-11-20', '2026-11-22', v_kadept)
  RETURNING id INTO v_proker;

  v_hasil := setujui_proker(v_proker, v_ketua);
  ASSERT (v_hasil->>'ok')::BOOLEAN,     format('Approval proker gagal: %s', v_hasil);
  ASSERT (v_hasil->>'locked')::BOOLEAN, 'Proker TERJADWAL disetujui tanpa mengunci kalender (INV-10)';
  ASSERT (SELECT status FROM proker WHERE id = v_proker) = 'DISETUJUI', 'Status proker tidak berubah';

  -- Rentang terkunci inklusif di kedua ujung (INV-11): hari terakhir acara
  -- 2026-11-22 ikut terkunci, sehingga batas atas eksklusifnya 2026-11-23.
  SELECT rentang INTO v_lock FROM proker_lock WHERE proker_id = v_proker;
  ASSERT lower(v_lock) = '2026-11-01'::DATE, 'Kunci tidak dimulai dari awal persiapan';
  ASSERT upper(v_lock) = '2026-11-23'::DATE,
    format('Batas atas kunci %s — hari terakhir acara tidak ikut terkunci (INV-11)', upper(v_lock));

  ---------------------------------------------------------------------------
  -- 3. DEPARTEMEN LAIN MENYEROBOT TANGGAL YANG SAMA
  --    Ini risiko R3 pada PRD. Yang menolak adalah EXCLUDE constraint di
  --    database, bukan pemeriksaan aplikasi (INV-09).
  ---------------------------------------------------------------------------
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai,
                      tanggal_hari_h_selesai, dibuat_oleh)
  VALUES (v_periode, v_dept, 'Acara Bertabrakan', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2026-11-05', '2026-11-22', '2026-11-25', v_kadept)
  RETURNING id INTO v_proker2;

  v_hasil := setujui_proker(v_proker2, v_ketua);
  ASSERT NOT (v_hasil->>'ok')::BOOLEAN, 'Proker bertabrakan DISETUJUI — INV-09 bocor';
  ASSERT v_hasil->>'reason' = 'KONFLIK', format('Alasan penolakan: %s', v_hasil->>'reason');
  ASSERT (SELECT status FROM proker WHERE id = v_proker2) = 'PERLU_REVISI',
    'Proker bertabrakan tidak dikembalikan untuk revisi';

  -- Penolakan itu harus menyebut apa yang menghalangi, bukan sekadar gagal.
  ASSERT v_hasil->'konflik'->0->>'proker' = 'SYNCHRONIZE 2026',
    format('Detail konflik tidak menyebut proker penghalang: %s', v_hasil->'konflik');
  ASSERT v_hasil->'konflik'->0->>'departemen' = 'Kaderisasi',
    'Detail konflik tidak menyebut departemen penghalang';

  -- Kunci milik proker pertama tetap utuh setelah penolakan itu (INV-13).
  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_proker) = 1,
    'Kunci proker pertama hilang akibat approval proker lain yang gagal';

  ---------------------------------------------------------------------------
  -- 4. SURAT PEMINJAMAN RUANGAN MENDAPAT NOMOR RESMI
  ---------------------------------------------------------------------------
  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Peminjaman Ruangan', 'template/05.docx', '{}'::JSONB)
  ON CONFLICT (kode_surat, varian, versi) DO UPDATE SET kode_surat = EXCLUDED.kode_surat
  RETURNING id INTO v_tmpl;

  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_periode, v_tmpl, '05', '2026-10-15',
          'Permohonan Peminjaman Auditorium', 'Kabag Sekretariat FT', 'di Tempat',
          v_kadept, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_surat;

  v_nomor := alokasi_nomor_surat(v_surat, v_sekum);
  ASSERT v_nomor = '05/001/UN43.3.7/HMIF/X/2026',
    format('Nomor surat pertama periode = %s', v_nomor);

  ---------------------------------------------------------------------------
  -- 5. KEPANITIAAN, DIVISI, DAN RAB
  ---------------------------------------------------------------------------
  INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
  VALUES (v_proker, 'SYNCHRONIZE 2026', 'SYNCHRONIZE', v_kadept)
  RETURNING id INTO v_panitia;

  INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id)
  VALUES (v_panitia, 'Konsumsi', v_kadept) RETURNING id INTO v_divisi;

  INSERT INTO rab_section (divisi_id, nama) VALUES (v_divisi, 'Konsumsi Hari-H')
  RETURNING id INTO v_section;

  -- jumlah disimpan dua kali (INV-26): teks untuk tampilan dan ekspor Excel
  -- yang harus identik dengan arsip, numerik untuk kalkulasi.
  INSERT INTO rab_item (section_id, no_urut, jenis_barang,
                        jumlah_teks, jumlah_numerik, harga_satuan, total)
  VALUES (v_section, 1, 'Nasi kotak', '150 kotak', 150, 20000, 3000000)
  RETURNING id INTO v_item;

  INSERT INTO rab_item (section_id, no_urut, jenis_barang,
                        jumlah_teks, jumlah_numerik, harga_satuan, total)
  VALUES (v_section, 2, 'Air mineral', '10 dus', 10, 35000, 350000)
  RETURNING id INTO v_item2;

  INSERT INTO rab_meta (kepanitiaan_id, status) VALUES (v_panitia, 'DRAFT');

  ASSERT (SELECT jumlah_teks FROM rab_item WHERE id = v_item) = '150 kotak',
    'jumlah_teks tidak tersimpan apa adanya — ekspor Excel akan berbeda dari arsip';

  ---------------------------------------------------------------------------
  -- 6. NOTA BELANJA DAN ALOKASINYA
  ---------------------------------------------------------------------------
  INSERT INTO image (uploader_id, original_filename, storage_uuid,
                     master_path, preview_path, thumbnail_path,
                     original_mime_type, master_mime_type,
                     original_width, original_height,
                     master_width, master_height, master_file_size, kind, is_scanned)
  VALUES (v_kadept, 'nota-katering.jpg', 'a1b2c3d4-nota-integrasi',
          'nota/master/a1.webp', 'nota/preview/a1.webp', 'nota/thumb/a1.webp',
          'image/jpeg', 'image/webp', 3024, 4032, 2000, 2666, 480000, 'DOKUMEN', true)
  RETURNING id INTO v_image;

  INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota)
  VALUES (v_divisi, v_image, v_kadept, '2026-11-18', 3350000)
  RETURNING id INTO v_nota;

  -- Dialokasikan ke dua item RAB sekaligus, persis sebesar total nota.
  INSERT INTO nota_alokasi (nota_id, rab_item_id, nominal) VALUES
    (v_nota, v_item,  3000000),
    (v_nota, v_item2,  350000);

  -- Trigger cek_total_alokasi DEFERRABLE INITIALLY DEFERRED, jadi ia baru
  -- berjalan saat commit. Dipaksa IMMEDIATE supaya pelanggarannya dapat
  -- ditangkap di dalam blok EXCEPTION di bawah.
  SET CONSTRAINTS trg_cek_alokasi IMMEDIATE;

  -- Kelebihannya dialokasikan lewat jalur LUAR RAB (ADR-006): pengeluaran
  -- nyata yang tidak punya baris RAB, seperti parkir. Sekaligus membuktikan
  -- batas atas dijaga tanpa memandang jenis alokasinya.
  v_ditolak := false;
  BEGIN
    INSERT INTO nota_alokasi (nota_id, uraian_luar_rab, nominal)
    VALUES (v_nota, 'Parkir dan bensin', 1);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Alokasi melebihi total nota DITERIMA';

  SELECT COALESCE(SUM(nominal), 0)::INT INTO v_jumlah
  FROM nota_alokasi WHERE nota_id = v_nota;
  ASSERT v_jumlah = 3350000,
    format('Total alokasi %s, seharusnya sama dengan total nota 3350000', v_jumlah);

  SET CONSTRAINTS trg_cek_alokasi DEFERRED;

  ---------------------------------------------------------------------------
  -- 7. ACARA SELESAI — KUNCI KALENDER DILEPAS
  --    Tanpa langkah ini kalender tetap terkunci oleh acara yang sudah lewat.
  ---------------------------------------------------------------------------
  UPDATE proker SET status = 'SELESAI' WHERE id = v_proker;
  v_hasil := lepas_kunci_selesai();

  ASSERT (v_hasil->>'kunci_dilepas')::INT >= 1,
    format('Kunci tidak dilepas untuk proker selesai: %s', v_hasil);
  ASSERT (SELECT count(*) FROM proker_lock WHERE proker_id = v_proker) = 0,
    'Kunci masih menempel pada proker yang sudah selesai';

  -- Sekarang tanggal itu bebas dipakai proker yang tadi ditolak.
  UPDATE proker SET status = 'MENUNGGU_APPROVAL' WHERE id = v_proker2;
  v_hasil := setujui_proker(v_proker2, v_ketua);
  ASSERT (v_hasil->>'ok')::BOOLEAN,
    'Tanggal tetap terkunci walau acara penghalangnya sudah selesai';

  ---------------------------------------------------------------------------
  -- 8. NOMOR SURAT TIDAK DIDAUR ULANG (INV-16)
  --    Surat pertama dibatalkan; surat berikutnya tetap memperoleh 002.
  ---------------------------------------------------------------------------
  -- Pembatalan surat bernomor wajib beralasan (migrasi 030/032), seperti lewat aplikasi.
  UPDATE surat SET status = 'DIBATALKAN', alasan_pembatalan = 'Uji pembatalan', dibatalkan_at = now()
  WHERE id = v_surat;

  DECLARE v_surat2 UUID;
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status,
                       kode_kegiatan)
    VALUES (v_periode, v_tmpl, '05', '2026-10-20', 'Permohonan kedua',
            'Kabag Sekretariat FT', 'di Tempat', v_kadept, 'MENUNGGU_APPROVAL',
            'SYNCHRONIZE')
    RETURNING id INTO v_surat2;

    v_nomor := alokasi_nomor_surat(v_surat2, v_sekum);
    ASSERT v_nomor = '05/002/UN43.3.7/SYNCHRONIZE/X/2026',
      format('Nomor setelah pembatalan = %s — nomor 001 didaur ulang (INV-16)', v_nomor);
  END;

  ---------------------------------------------------------------------------
  -- 9. SELURUH ALUR MENINGGALKAN JEJAK AUDIT (INV-07)
  --    Diperiksa terakhir supaya mencakup semua langkah di atas.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah FROM audit_log WHERE entitas = 'proker';
  ASSERT v_jumlah >= 2, format('Mutasi proker tercatat %s kali, terlalu sedikit', v_jumlah);

  SELECT count(*)::INT INTO v_jumlah FROM audit_log WHERE entitas = 'surat';
  ASSERT v_jumlah >= 2, format('Mutasi surat tercatat %s kali, terlalu sedikit', v_jumlah);

  SELECT count(*)::INT INTO v_jumlah FROM audit_log WHERE entitas = 'proker_lock';
  ASSERT v_jumlah >= 2,
    'Penguncian dan pelepasan kalender tidak tercatat — perubahan paling sensitif tanpa jejak';

  -- Semua tercatat tanpa pelaku karena test berjalan tanpa JWT. Itu keadaan
  -- yang sama dengan cron harian, dan memang harus tetap tercatat.
  --
  -- DIBATASI pada periode milik test ini. Versi sebelumnya menghitung SELURUH
  -- audit_log dan lulus hanya selama database belum pernah melihat lalu lintas
  -- sungguhan. Begitu gate login E2E berjalan, baris LOGIN yang sah — memang
  -- ber-user_id, memang seharusnya begitu — membuat test ini merah dengan
  -- pesan yang menuduh trigger audit.
  --
  -- Yang hendak dibuktikan sejak awal memang bukan "audit_log kosong dari
  -- pelaku", melainkan "mutasi yang DILAKUKAN TANPA JWT tercatat tanpa
  -- pelaku". Batas periode menyatakan maksud itu apa adanya.
  SELECT count(*)::INT INTO v_jumlah
  FROM audit_log
  WHERE user_id IS NOT NULL AND periode_id = v_periode;
  ASSERT v_jumlah = 0, 'Ada baris audit dengan pelaku padahal tidak ada JWT';

  RAISE NOTICE 'OK 900_integrasi - proker terkunci lalu dilepas, surat bernomor tanpa daur ulang, alokasi nota terjaga';
END $$;
