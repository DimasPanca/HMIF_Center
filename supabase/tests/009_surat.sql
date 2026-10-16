-- Test migrasi 009 — persuratan.
--
-- Yang dipertaruhkan: nomor surat adalah identitas resmi organisasi. Nomor
-- ganda merusak jejak audit secara permanen dan tidak dapat diperbaiki tanpa
-- membatalkan dokumen yang sudah beredar.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-028 · PRD F-4.1, F-4.3 · INV-14, INV-15, INV-16

DO $$
DECLARE
  v_periode1 UUID;
  v_periode2 UUID;
  v_user     UUID := '11111111-1111-1111-1111-111111111111';
  v_tmpl     UUID;
  v_surat    UUID;
  v_ditolak  BOOLEAN;
  v_jumlah   INT;
  v_versi    INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode1;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2025', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_periode2;

  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Sekum Uji', '3337220050', 'sekum@example.test');

  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Surat Peminjaman Ruangan',
          'template/surat-05-peminjaman-ruangan_v1.docx', '{"fields":[]}'::JSONB)
  ON CONFLICT (kode_surat, varian, versi) DO UPDATE SET kode_surat = EXCLUDED.kode_surat
  RETURNING id INTO v_tmpl;

  ---------------------------------------------------------------------------
  -- 1. DRAFT TIDAK BERNOMOR (INV-14)
  --    Banyak draft boleh hidup berdampingan, semuanya ber-nomor_urut NULL.
  --    Bila index-nya bukan parsial, baris kedua di bawah sudah gagal.
  ---------------------------------------------------------------------------
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
  VALUES (v_periode1, v_tmpl, '05', '2026-11-01',
          'Permohonan Peminjaman Auditorium', 'Kepala Bagian Sekretariat FT', 'di Tempat', v_user)
  RETURNING id INTO v_surat;

  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
  VALUES (v_periode1, v_tmpl, '05', '2026-11-02',
          'Permohonan Peminjaman Tandu', 'Kepala BPBD Kota Cilegon', 'di Tempat', v_user);

  -- Hanya draft milik test ini: DB dev juga memuat draft dari e2e (hermetis, seperti 014c/017).
  SELECT count(*)::INT INTO v_jumlah FROM surat WHERE nomor_urut IS NULL AND dibuat_oleh = v_user;
  ASSERT v_jumlah = 2,
    format('Draft tanpa nomor: %s baris, seharusnya 2 - index bukan parsial', v_jumlah);

  ---------------------------------------------------------------------------
  -- 2. NOMOR GANDA DALAM SATU PERIODE -> DITOLAK (INV-15 jaring pengaman)
  ---------------------------------------------------------------------------
  UPDATE surat SET nomor_urut = 379, nomor_lengkap = '05/379/UN43.3.7/HMIF/XI/2026',
                   bulan_romawi = 'XI', tahun = 2026, status = 'DISETUJUI'
  WHERE id = v_surat;

  v_ditolak := false;
  BEGIN
    UPDATE surat SET nomor_urut = 379, nomor_lengkap = '05/379/UN43.3.7/HMIF/XI/2026'
    WHERE id <> v_surat AND periode_id = v_periode1;
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak,
    'Nomor surat ganda dalam satu periode DITERIMA - jejak audit organisasi rusak (INV-15)';

  ---------------------------------------------------------------------------
  -- 3. NOMOR SAMA DI PERIODE BERBEDA -> DITERIMA
  --    Counter direset tiap periode (ADR-003), jadi nomor 379 wajar muncul
  --    lagi di kepengurusan berikutnya.
  ---------------------------------------------------------------------------
  INSERT INTO surat (periode_id, template_id, kode_surat, nomor_urut, nomor_lengkap,
                     bulan_romawi, tahun, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_periode2, v_tmpl, '05', 379, '05/379/UN43.3.7/HMIF/XI/2025',
          'XI', 2025, '2025-11-01',
          'Surat periode lama', 'BEM FT UNTIRTA', 'di Tempat', v_user, 'TERBIT');

  ---------------------------------------------------------------------------
  -- 4. NOMOR SETENGAH TERISI -> DITOLAK
  --    Menandakan proses alokasi berhenti di tengah.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, nomor_urut, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
    VALUES (v_periode1, v_tmpl, '05', 500, '2026-11-05',
            'Setengah jadi', 'X', 'di Tempat', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Surat bernomor tanpa nomor_lengkap DITERIMA';

  ---------------------------------------------------------------------------
  -- 5. SURAT TERBIT WAJIB SUDAH BERNOMOR
  --    Tanpa ini, dokumen resmi bisa keluar tanpa identitas.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES (v_periode1, v_tmpl, '05', '2026-11-06',
            'Terbit tanpa nomor', 'X', 'di Tempat', v_user, 'TERBIT');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Surat TERBIT tanpa nomor DITERIMA - dokumen resmi tanpa identitas';

  ---------------------------------------------------------------------------
  -- 6. PENOLAKAN WAJIB BERALASAN
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
    VALUES (v_periode1, v_tmpl, '05', '2026-11-07',
            'Ditolak diam', 'X', 'di Tempat', v_user, 'DITOLAK');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Surat ditolak tanpa alasan DITERIMA';

  ---------------------------------------------------------------------------
  -- 7. KODE SURAT DAN BULAN ROMAWI DIBATASI
  --    Bulan Oktober harus X, bukan 10 (PRD F-4.1).
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
    VALUES (v_periode1, v_tmpl, '15', '2026-11-08', 'Kode aneh', 'X', 'di Tempat', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Kode surat di luar 01-09 DITERIMA';

  v_ditolak := false;
  BEGIN
    INSERT INTO surat (periode_id, template_id, kode_surat, bulan_romawi, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
    VALUES (v_periode1, v_tmpl, '05', '10', '2026-10-08', 'Bulan angka', 'X', 'di Tempat', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Bulan romawi ditulis sebagai angka 10 DITERIMA - seharusnya X';

  ---------------------------------------------------------------------------
  -- 8. COUNTER TIDAK PERNAH NEGATIF (INV-16)
  ---------------------------------------------------------------------------
  INSERT INTO surat_counter (periode_id, nomor_terakhir) VALUES (v_periode1, 379);

  v_ditolak := false;
  BEGIN
    UPDATE surat_counter SET nomor_terakhir = -1 WHERE periode_id = v_periode1;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Counter nomor surat bisa menjadi negatif';

  ---------------------------------------------------------------------------
  -- 9. TEMPLATE VERSIONED
  --    Revisi menambah versi baru, tidak menimpa: surat lama harus tetap bisa
  --    di-generate ulang persis seperti aslinya.
  ---------------------------------------------------------------------------
  -- Versi berikutnya dihitung, bukan ditulis 2: DB dev memuat versi sungguhan
  -- hasil scripts/upload-templates.ts (T-061 menaikkan template ini ke v2).
  SELECT max(versi) + 1 INTO v_versi FROM surat_template WHERE kode_surat = '05' AND varian = 'PEMINJAMAN_RUANGAN';
  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema, versi, is_active)
  VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Surat Peminjaman Ruangan (revisi)',
          format('template/uji-009_v%s.docx', v_versi), '{"fields":[]}'::JSONB, v_versi, true);

  v_ditolak := false;
  BEGIN
    INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema, versi)
    VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Duplikat versi',
            'x.docx', '{}'::JSONB, v_versi);
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Template dengan kode, varian, dan versi sama DITERIMA';

  ---------------------------------------------------------------------------
  -- 10. TTD BUTUH AKUN
  --     Penandatangan tanpa akun tidak punya berkas gambar untuk disisipkan.
  ---------------------------------------------------------------------------
  INSERT INTO surat_signer (surat_id, urutan, posisi, jabatan, nama, user_id, pakai_ttd, pakai_stempel)
  VALUES (v_surat, 1, 'KANAN', 'Ketua Himpunan', 'Dimas Panca', v_user, true, true);

  -- Penandatangan pihak luar tanpa akun: sah, asal tidak minta TTD gambar.
  INSERT INTO surat_signer (surat_id, urutan, posisi, jabatan, nama, nim)
  VALUES (v_surat, 2, 'KIRI', 'Ketua Pelaksana', 'Nama Tanpa Akun', '3337229999');

  v_ditolak := false;
  BEGIN
    INSERT INTO surat_signer (surat_id, urutan, posisi, jabatan, nama, pakai_ttd)
    VALUES (v_surat, 3, 'KIRI', 'Tanpa akun', 'Siapa', true);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'pakai_ttd true tanpa user_id DITERIMA - tidak ada gambar yang bisa diambil';

  ---------------------------------------------------------------------------
  -- 11. DOKUMEN WAJIB PUNYA INDUK
  ---------------------------------------------------------------------------
  INSERT INTO dokumen (surat_id, jenis, format, storage_key, generated_by)
  VALUES (v_surat, 'SURAT', 'DOCX', 'dokumen/surat/x.docx', v_user);

  v_ditolak := false;
  BEGIN
    INSERT INTO dokumen (jenis, format, storage_key, generated_by)
    VALUES ('SURAT', 'DOCX', 'dokumen/yatim.docx', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Dokumen tanpa induk DITERIMA - ia akan menggantung di storage';

  ---------------------------------------------------------------------------
  -- 12. PENCARIAN TEKS PENUH BAHASA INDONESIA
  --     Konfigurasi indonesian mengakar: "Peminjaman" menjadi 'pinjam',
  --     sehingga mencari "meminjam" tetap menemukannya.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah
  FROM surat
  WHERE to_tsvector('indonesian', coalesce(perihal,'') || ' ' || coalesce(tujuan_nama,''))
        @@ to_tsquery('indonesian', 'meminjam');
  ASSERT v_jumlah >= 1,
    'Pencarian "meminjam" tidak menemukan surat berperihal "Peminjaman" - stemming tidak bekerja';

  RAISE NOTICE 'OK 009_surat - nomor ganda ditolak, draft boleh banyak tanpa nomor, stemming bekerja';
END $$;
