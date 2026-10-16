-- Test migrasi 017 — lapisan trigger.
--
-- Dua hal yang diuji, dan keduanya gagal tanpa suara bila rusak:
--
--   1. KEDUABELAS TABEL MENINGGALKAN JEJAK. Trigger audit yang lepas dari satu
--      tabel tidak menimbulkan error apa pun; tabel itu sekadar berhenti
--      tercatat, dan baru ketahuan saat ada yang perlu ditelusuri.
--
--   2. updated_at BENAR-BENAR BERGERAK. Kolom yang tidak terpelihara juga
--      tidak berteriak — ia hanya menunjukkan tanggal pembuatan sambil
--      berpura-pura menunjukkan tanggal penyuntingan.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-041 · SYSTEM_DESIGN §14.1 · INV-06, INV-07

DO $$
DECLARE
  v_periode  UUID;
  v_dept     UUID;
  v_user     UUID := '7a000000-0000-0000-0000-000000000001';
  v_proker   UUID;
  v_kep      UUID;
  v_div      UUID;
  v_sec      UUID;
  v_item     UUID;
  v_img      UUID;
  v_nota     UUID;
  v_tmpl     UUID;
  v_surat    UUID;
  v_n        INT;
  v_lama     TIMESTAMPTZ;
  v_baru     TIMESTAMPTZ;
  v_tabel    TEXT;
  v_kurang   TEXT;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. SATU MUTASI PADA TIAP TABEL MENGHASILKAN TEPAT SATU BARIS AUDIT
  --
  --    Dibuat berurutan mengikuti ketergantungan foreign key, karena setiap
  --    baris di sini adalah induk bagi baris berikutnya.
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('HMIF 2026/2027', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;

  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Pengurus Uji', '3337220701', 'trigger@uji.test');

  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_dept;

  INSERT INTO user_role (user_id, periode_id, role, departemen_id)
  VALUES (v_user, v_periode, 'KADEPT', v_dept);

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai,
                      tanggal_hari_h_selesai, dibuat_oleh)
  VALUES (v_periode, v_dept, 'SYNCHRONIZE', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2026-11-01', '2026-11-20', '2026-11-22', v_user)
  RETURNING id INTO v_proker;

  PERFORM setujui_proker(v_proker, v_user);   -- mengisi proker_lock

  INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (v_proker, 'SYNCHRONIZE')
  RETURNING id INTO v_kep;
  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep, 'Konsumsi') RETURNING id INTO v_div;

  INSERT INTO rab_section (divisi_id, nama) VALUES (v_div, 'Konsumsi Hari-H')
  RETURNING id INTO v_sec;
  INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks,
                        jumlah_numerik, harga_satuan, total)
  VALUES (v_sec, 1, 'Nasi kotak', '150 kotak', 150, 20000, 3000000)
  RETURNING id INTO v_item;

  INSERT INTO rab_meta (kepanitiaan_id, status) VALUES (v_kep, 'DRAFT');

  INSERT INTO image (uploader_id, original_filename, storage_uuid,
                     master_path, preview_path, thumbnail_path,
                     original_mime_type, master_mime_type,
                     original_width, original_height,
                     master_width, master_height, master_file_size, kind, is_scanned)
  VALUES (v_user, 'nota.jpg', 'uuid-trigger-test', 'n/m.webp', 'n/p.webp', 'n/t.webp',
          'image/jpeg', 'image/webp', 3024, 4032, 2000, 2666, 400000, 'DOKUMEN', true)
  RETURNING id INTO v_img;

  INSERT INTO nota (divisi_id, image_id, uploader_id, tanggal_belanja, total_nota)
  VALUES (v_div, v_img, v_user, '2026-11-18', 3000000) RETURNING id INTO v_nota;

  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Peminjaman', 'template/05.docx', '{}'::JSONB)
  ON CONFLICT (kode_surat, varian, versi) DO UPDATE SET kode_surat = EXCLUDED.kode_surat
  RETURNING id INTO v_tmpl;
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat, perihal,
                     tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_periode, v_tmpl, '05', '2026-10-15', 'Permohonan', 'Kabag', 'di Tempat',
          v_user, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_surat;

  INSERT INTO lpj (kepanitiaan_id, data_manual) VALUES (v_kep, '{}'::JSONB);

  -- Keduabelas tabel harus punya jejak. Yang tidak punya disebut namanya,
  -- karena "salah satu tidak tercatat" tidak cukup untuk memperbaikinya.
  SELECT string_agg(x, ', ') INTO v_kurang
  FROM unnest(ARRAY['proker','proker_lock','surat','rab_item','rab_meta','nota',
                    'user_role','periode','kepanitiaan','divisi','lpj','app_user']) x
  WHERE NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.entitas = x);

  ASSERT v_kurang IS NULL,
    format('Tabel tanpa jejak audit sama sekali: %s', v_kurang);

  ---------------------------------------------------------------------------
  -- 2. entitas_id MENUNJUK BARIS YANG BENAR
  --    Jejak audit tanpa id yang benar tidak dapat ditelusuri.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_n FROM audit_log
  WHERE entitas = 'proker' AND entitas_id = v_proker::TEXT AND aksi = 'CREATE';
  ASSERT v_n = 1, format('Jejak CREATE proker: %s baris, seharusnya 1', v_n);

  SELECT count(*)::INT INTO v_n FROM audit_log
  WHERE entitas = 'rab_item' AND entitas_id = v_item::TEXT;
  ASSERT v_n = 1, 'Jejak rab_item tidak menunjuk id yang benar';

  SELECT count(*)::INT INTO v_n FROM audit_log
  WHERE entitas = 'nota' AND entitas_id = v_nota::TEXT;
  ASSERT v_n = 1, 'Jejak nota tidak menunjuk id yang benar';

  ---------------------------------------------------------------------------
  -- 3. nilai_lama TERISI PADA UPDATE DAN DELETE
  --    Tanpa itu jejak audit hanya mengatakan "sesuatu berubah", bukan apa.
  ---------------------------------------------------------------------------
  UPDATE proker SET nama = 'SYNCHRONIZE Revisi' WHERE id = v_proker;

  ASSERT (SELECT nilai_lama->>'nama' FROM audit_log
           WHERE entitas = 'proker' AND aksi = 'UPDATE'
             AND nilai_baru->>'nama' = 'SYNCHRONIZE Revisi') = 'SYNCHRONIZE',
    'nilai_lama kosong pada UPDATE proker';

  DELETE FROM rab_item WHERE id = v_item;

  ASSERT (SELECT nilai_lama->>'jenis_barang' FROM audit_log
           WHERE entitas = 'rab_item' AND aksi = 'DELETE' AND entitas_id = v_item::TEXT) = 'Nasi kotak',
    'nilai_lama kosong pada DELETE rab_item — baris yang hilang tidak dapat ditelusuri';
  ASSERT (SELECT nilai_baru FROM audit_log
           WHERE entitas = 'rab_item' AND aksi = 'DELETE' AND entitas_id = v_item::TEXT) IS NULL,
    'nilai_baru terisi pada DELETE';

  ---------------------------------------------------------------------------
  -- 4. audit_log SENDIRI TIDAK DIAUDIT
  --    Selain menimbulkan rekursi, itu akan menggandakan setiap baris.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_n
  FROM pg_trigger t
  JOIN pg_proc p  ON p.oid = t.tgfoid
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE p.proname = 'fn_audit' AND c.relname = 'audit_log' AND NOT t.tgisinternal;
  ASSERT v_n = 0, 'audit_log ikut diaudit — rekursi';

  ASSERT (SELECT count(*) FROM audit_log WHERE entitas = 'audit_log') = 0,
    'Ada baris audit yang mencatat audit_log itu sendiri';

  ---------------------------------------------------------------------------
  -- 5. updated_at BENAR-BENAR DIPERBARUI
  --
  --    Sebelum migrasi ini, 18 tabel punya kolom updated_at dan tidak satu pun
  --    memeliharanya: kolom itu menunjukkan kapan baris DIBUAT sambil
  --    berpura-pura menunjukkan kapan terakhir diubah.
  --
  --    Diuji dengan menyisipkan baris ber-updated_at lama secara EKSPLISIT.
  --    Cara yang lebih polos tidak akan berhasil: now() adalah waktu mulai
  --    transaksi, sehingga di dalam satu transaksi nilainya tidak pernah
  --    bergerak — dan test akan gagal walau triggernya bekerja sempurna.
  ---------------------------------------------------------------------------
  DECLARE v_usang UUID;
  BEGIN
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status, updated_at)
    VALUES ('Periode Berstempel Usang', '2020-09-01', '2021-08-31', 'ARSIP',
            '2020-01-01 00:00:00+00')
    RETURNING id INTO v_usang;

    SELECT updated_at INTO v_lama FROM periode WHERE id = v_usang;
    ASSERT v_lama = '2020-01-01 00:00:00+00'::TIMESTAMPTZ,
      'INSERT ikut menimpa updated_at — trigger seharusnya hanya BEFORE UPDATE';

    UPDATE periode SET nama = 'Stempel Diperbarui' WHERE id = v_usang;
    SELECT updated_at INTO v_baru FROM periode WHERE id = v_usang;

    ASSERT v_baru > v_lama,
      format('updated_at tidak diperbarui saat UPDATE: %s tetap %s', v_lama, v_baru);
    ASSERT v_baru = now(),
      format('updated_at = %s, seharusnya waktu transaksi %s', v_baru, now());

    -------------------------------------------------------------------------
    -- 6. URUTAN TRIGGER: updated_at DULU, AUDIT KEMUDIAN
    --
    --    fn_set_updated_at BEFORE, fn_audit AFTER. Kalau terbalik, nilai_baru
    --    pada audit_log akan memuat stempel waktu yang lama dan jejaknya
    --    bertentangan dengan baris yang dicatatnya.
    -------------------------------------------------------------------------
    DECLARE v_dicatat TIMESTAMPTZ;
    BEGIN
      SELECT (nilai_baru->>'updated_at')::TIMESTAMPTZ INTO v_dicatat
      FROM audit_log
      WHERE entitas = 'periode' AND aksi = 'UPDATE'
        AND nilai_baru->>'nama' = 'Stempel Diperbarui';

      ASSERT v_dicatat IS NOT NULL, 'Jejak UPDATE periode tidak ditemukan';
      ASSERT v_dicatat = v_baru,
        format('audit mencatat updated_at %s sedangkan barisnya %s — trigger audit berjalan sebelum stempel waktu dipasang',
               v_dicatat, v_baru);
    END;
  END;

  -- Dan berlaku untuk seluruh tabel yang punya kolomnya, bukan hanya periode.
  SELECT string_agg(c.table_name, ', ') INTO v_kurang
  FROM information_schema.columns c
  JOIN pg_class pc     ON pc.relname = c.table_name
  JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
  WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND pc.relkind = 'r'
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = pc.oid AND p.proname = 'fn_set_updated_at' AND NOT t.tgisinternal);

  ASSERT v_kurang IS NULL,
    format('Tabel ber-updated_at tanpa trigger pemelihara: %s', v_kurang);

  ---------------------------------------------------------------------------
  -- 7. TABEL BERVOLUME TINGGI TETAP TIDAK DIAUDIT
  --    Membanjiri jejak audit membuat yang penting tenggelam.
  ---------------------------------------------------------------------------
  FOREACH v_tabel IN ARRAY ARRAY['kanban_card','gantt_task','checklist_item','notulensi_attendance'] LOOP
    SELECT count(*)::INT INTO v_n
    FROM pg_trigger t
    JOIN pg_proc p  ON p.oid = t.tgfoid
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE p.proname = 'fn_audit' AND c.relname = v_tabel AND NOT t.tgisinternal;
    ASSERT v_n = 0, format('%s ikut diaudit — jejak akan tenggelam oleh perubahan remeh', v_tabel);
  END LOOP;

  RAISE NOTICE 'OK 017_triggers - 12 tabel berjejak, nilai_lama terisi pada UPDATE dan DELETE, updated_at bergerak dan tercatat benar';
END $$;
