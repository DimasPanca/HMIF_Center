-- Test migrasi 008 — gambar, nota, alokasi.
--
-- Dua hal yang paling menentukan di sini, keduanya penyimpangan dari
-- SYSTEM_DESIGN §4.7 yang harus terbukti berfungsi:
--
--   ADR-006  alokasi di luar RAB harus MUNGKIN, karena LPJ wajib melaporkannya
--   ADR-007  trigger menjaga batas ATAS saja; alokasi KURANG harus lolos di
--            level database supaya input bertahap tetap bisa dilakukan
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-027 · PRD F-11.1, F-12.2 · ADR-006, ADR-007

DO $$
DECLARE
  v_periode UUID;
  v_dept    UUID;
  v_user    UUID := '11111111-1111-1111-1111-111111111111';
  v_proker  UUID;
  v_kep     UUID;
  v_divisi  UUID;
  v_section UUID;
  v_item1   UUID;
  v_item2   UUID;
  v_image   UUID;
  v_nota    UUID;
  v_ditolak BOOLEAN;
  v_jumlah  INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  RETURNING id INTO v_dept;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Panitia Uji', '3337220040', 'panitia@example.test');
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept, 'SYNCHRONIZE', 'TERJADWAL', 'DISETUJUI',
          '2026-11-01', '2026-12-06', '2026-12-07', v_user)
  RETURNING id INTO v_proker;
  INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (v_proker, 'SYNCHRONIZE')
  RETURNING id INTO v_kep;
  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep, 'KONSUMSI')
  RETURNING id INTO v_divisi;
  INSERT INTO rab_section (divisi_id, nama) VALUES (v_divisi, 'KONSUMSI PANITIA')
  RETURNING id INTO v_section;
  INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik,
                        harga_satuan, total)
  VALUES (v_section, 1, 'Snack', '10', 10, 10000, 100000) RETURNING id INTO v_item1;
  INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik,
                        harga_satuan, total)
  VALUES (v_section, 2, 'Galon', '10', 10, 5000, 50000) RETURNING id INTO v_item2;

  ---------------------------------------------------------------------------
  -- 1. GAMBAR — master tidak boleh lebih besar dari sumbernya (INV-22)
  ---------------------------------------------------------------------------
  INSERT INTO image (uploader_id, original_filename, storage_uuid,
                     master_path, preview_path, thumbnail_path,
                     original_mime_type, master_mime_type,
                     original_width, original_height,
                     master_width, master_height, master_file_size, kind)
  VALUES (v_user, 'IMG_20260901_153021.jpg', 'a1b2c3d4-uuid',
          'nota/master/a1b2c3d4.jpg', 'nota/preview/a1b2c3d4.webp', 'nota/thumb/a1b2c3d4.webp',
          'image/jpeg', 'image/jpeg',
          4032, 3024, 3000, 2250, 1450000, 'DOKUMEN')
  RETURNING id INTO v_image;

  v_ditolak := false;
  BEGIN
    INSERT INTO image (uploader_id, original_filename, storage_uuid,
                       master_path, preview_path, thumbnail_path,
                       original_mime_type, master_mime_type,
                       original_width, original_height,
                       master_width, master_height, master_file_size)
    VALUES (v_user, 'kecil.jpg', 'upscale-uuid',
            'm', 'p', 't', 'image/jpeg', 'image/jpeg',
            800, 600, 3000, 2250, 500000);   -- master LEBIH BESAR dari sumber
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Master lebih besar dari gambar sumber DITERIMA - upscale terjadi (INV-22)';

  ---------------------------------------------------------------------------
  -- 2. NOTA — penolakan wajib beralasan
  ---------------------------------------------------------------------------
  INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota)
  VALUES (v_divisi, v_image, v_user, '2026-11-20', 75000)
  RETURNING id INTO v_nota;

  v_ditolak := false;
  BEGIN
    UPDATE nota SET status = 'DITOLAK' WHERE id = v_nota;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak,
    'Nota ditolak tanpa alasan DITERIMA - panitia tidak tahu apa yang harus diperbaiki';

  ---------------------------------------------------------------------------
  -- 3. ALOKASI BERTAHAP — kurang dari total HARUS lolos di level database
  --    Inilah alasan trigger hanya menjaga batas atas (ADR-007). Bila kesamaan
  --    ditegakkan di trigger, baris pertama di bawah ini sudah gagal.
  ---------------------------------------------------------------------------
  INSERT INTO nota_alokasi (nota_id, rab_item_id, nominal) VALUES (v_nota, v_item1, 50000);

  ASSERT (SELECT sum(nominal) FROM nota_alokasi WHERE nota_id = v_nota) = 50000,
    'Alokasi pertama tidak tersimpan';

  -- Melengkapi sampai persis total nota.
  INSERT INTO nota_alokasi (nota_id, rab_item_id, nominal) VALUES (v_nota, v_item2, 25000);

  ASSERT (SELECT sum(nominal) FROM nota_alokasi WHERE nota_id = v_nota) = 75000,
    'Total alokasi tidak sama dengan total nota';

  ---------------------------------------------------------------------------
  -- 4. ALOKASI MELEBIHI TOTAL NOTA -> DITOLAK trigger
  --
  --    Trigger sengaja DEFERRABLE INITIALLY DEFERRED, sehingga pemeriksaannya
  --    terjadi saat transaksi ditutup, BUKAN saat INSERT. Itu yang membuat
  --    penggantian seluruh alokasi dalam satu transaksi mungkin: memasukkan
  --    himpunan baru lebih dulu lalu menghapus yang lama, tanpa gagal di
  --    keadaan antara yang totalnya sempat melebihi.
  --
  --    Konsekuensinya untuk test: blok EXCEPTION biasa tidak akan pernah
  --    melihat pelanggaran ini, karena exception-nya belum terjadi saat blok
  --    ditutup. SET CONSTRAINTS IMMEDIATE memaksanya diperiksa sekarang.
  ---------------------------------------------------------------------------
  SET CONSTRAINTS trg_cek_alokasi IMMEDIATE;

  v_ditolak := false;
  BEGIN
    INSERT INTO nota_alokasi (nota_id, uraian_luar_rab, nominal)
    VALUES (v_nota, 'Kelebihan', 1);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Alokasi melebihi total nota DITERIMA - trigger batas atas tidak bekerja';

  -- Kembalikan ke perilaku semula untuk sisa test.
  SET CONSTRAINTS trg_cek_alokasi DEFERRED;

  ---------------------------------------------------------------------------
  -- 5. SATU ITEM RAB HANYA SEKALI PER NOTA
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO nota_alokasi (nota_id, rab_item_id, nominal) VALUES (v_nota, v_item1, 1);
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Item RAB yang sama dialokasikan dua kali dalam satu nota';

  ---------------------------------------------------------------------------
  -- 6. PENGELUARAN DI LUAR RAB (ADR-006)
  --    Inti perubahan skema ini. Bila rab_item_id tetap NOT NULL, seluruh blok
  --    di bawah mustahil dan fitur temuan LPJ tidak akan pernah berfungsi.
  ---------------------------------------------------------------------------
  DECLARE v_nota2 UUID;
  BEGIN
    INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota)
    VALUES (v_divisi, v_image, v_user, '2026-11-21', 40000) RETURNING id INTO v_nota2;

    -- Dua baris luar-RAB dalam satu nota: keduanya ber-rab_item_id NULL.
    -- Ini yang membuat UNIQUE harus PARSIAL, bukan UNIQUE biasa.
    INSERT INTO nota_alokasi (nota_id, uraian_luar_rab, nominal)
    VALUES (v_nota2, 'Ojek antar barang mendadak', 25000);
    INSERT INTO nota_alokasi (nota_id, uraian_luar_rab, nominal)
    VALUES (v_nota2, 'Parkir', 15000);

    SELECT count(*)::INT INTO v_jumlah
    FROM nota_alokasi WHERE nota_id = v_nota2 AND rab_item_id IS NULL;
    ASSERT v_jumlah = 2,
      format('Alokasi luar RAB: %s baris, seharusnya 2 - UNIQUE parsial tidak bekerja', v_jumlah);

    -- Query yang dipakai analisisLpj untuk menemukan pengeluaran di luar rencana.
    -- Dengan rab_item_id NOT NULL, query ini SELALU kosong dan fitur temuan mati.
    SELECT count(*)::INT INTO v_jumlah FROM nota_alokasi WHERE rab_item_id IS NULL;
    ASSERT v_jumlah > 0,
      'Query temuan LPJ mengembalikan nol - pengeluaran di luar RAB tidak dapat dideteksi (ADR-006)';
  END;

  ---------------------------------------------------------------------------
  -- 7. ALOKASI TANPA TARGET APA PUN -> DITOLAK
  --    Pengeluaran tak terencana tanpa uraian tidak dapat dipertanggungjawabkan.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO nota_alokasi (nota_id, nominal) VALUES (v_nota, 1);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Alokasi tanpa item RAB dan tanpa uraian DITERIMA';

  ---------------------------------------------------------------------------
  -- 8. CASCADE — hapus nota melenyapkan alokasinya, gambar tetap ada
  ---------------------------------------------------------------------------
  DELETE FROM nota WHERE id = v_nota;
  ASSERT (SELECT count(*) FROM nota_alokasi WHERE nota_id = v_nota) = 0,
    'Alokasi tidak ikut terhapus saat nota dihapus';
  ASSERT (SELECT count(*) FROM image WHERE id = v_image) = 1,
    'Gambar ikut terhapus saat nota dihapus - berkas storage jadi yatim';

  RAISE NOTICE 'OK 008_nota - luar RAB mungkin, batas atas dijaga, alokasi kurang lolos di DB';
END $$;
