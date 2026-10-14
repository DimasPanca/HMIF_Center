-- Test 020 — sisi penomoran surat yang deterministik, pendamping T-057.
--
-- ===========================================================================
-- BERKAS INI TIDAK MENGUJI KONKURENSI, DAN MEMANG TIDAK BISA
-- ===========================================================================
-- Runner `npm run db:test` menjalankan setiap berkas di dalam SATU transaksi.
-- Advisory lock hanya diperebutkan antar-transaksi yang BERBEDA; di sini
-- panggilan kedua sudah memegang kunci yang sama. Konkurensi sungguhan diuji
-- `scripts/stress-nomor-surat.ts` (50 klien paralel lewat transaction pooler).
--
-- 014b_surat_fn sudah mengunci format nomor, Oktober = X, idempotensi retry,
-- draft ditolak, batch 30 berurutan, dan reset per periode. Yang dikunci DI
-- SINI adalah hal yang paling mudah rusak diam-diam saat seseorang menyunting
-- 014b, dan yang tidak tercakup di sana:
--
--   1. advisory lock per periode benar-benar dipasang, dengan kunci BERBEDA
--      dari kunci approval proker (seed 0 vs seed 1) — kalau sama, approval
--      surat ikut mengantre di belakang approval proker;
--   2. periode berbeda tidak saling menyentuh counter;
--   3. nomor surat yang TERBIT lalu DIBATALKAN tidak didaur ulang (INV-16);
--   4. batch semua-atau-tidak: satu surat tak sah membatalkan seluruh batch
--      dan counter tidak naik sama sekali;
--   5. benteng terakhir — index unik — tetap menolak nomor kembar walau
--      fungsinya dilewati;
--   6. counter tidak dapat dibuat negatif.
--
-- Sumber: docs/ai/tasks/P2-persuratan.md T-057 · SYSTEM_DESIGN §7.2 ·
--         INV-14, INV-15, INV-16

DO $$
DECLARE
  v_pa       UUID;
  v_pb       UUID;
  v_user     UUID := '20202020-2020-2020-2020-202020202020';
  v_tmpl     UUID;
  v_s        UUID;
  v_s2       UUID;
  v_draft    UUID;
  v_nomor    TEXT;
  v_kunci    BIGINT;
  v_jumlah   INT;
  v_dipegang BOOLEAN;
  v_ditolak  BOOLEAN;
  v_counter  INT;
  v_urut     INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar — periode PERSIAPAN, tidak pernah diaktifkan, supaya counter
  -- periode aktif mana pun tidak tersentuh walau berkas ini kelak di-commit.
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji Nomor A 2031', '2031-09-01', '2032-08-31', 'PERSIAPAN') RETURNING id INTO v_pa;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji Nomor B 2032', '2032-09-01', '2033-08-31', 'PERSIAPAN') RETURNING id INTO v_pb;

  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Sekum Uji 020', '3337220200', 'sekum020@example.test');

  INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema)
  VALUES ('05', 'PEMINJAMAN_RUANGAN', 'Peminjaman Ruangan', 'template/x.docx', '{}'::JSONB)
  ON CONFLICT (kode_surat, varian, versi) DO UPDATE SET kode_surat = EXCLUDED.kode_surat
  RETURNING id INTO v_tmpl;

  ---------------------------------------------------------------------------
  -- 1. ADVISORY LOCK PER PERIODE DIPASANG — dan bukan kunci proker
  ---------------------------------------------------------------------------
  v_kunci := hashtextextended(v_pa::TEXT, 0);

  SELECT count(*)::INT INTO v_jumlah FROM pg_locks
  WHERE locktype = 'advisory' AND ((classid::BIGINT << 32) | objid::BIGINT) = v_kunci
    AND pid = pg_backend_pid();
  ASSERT v_jumlah = 0, 'Advisory lock nomor periode A sudah dipegang sebelum alokasi mana pun';

  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_pa, v_tmpl, '05', '2031-10-15', 'Uji 020 satu', 'Uji', 'di Tempat', v_user, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_s;

  v_nomor := alokasi_nomor_surat(v_s, v_user);
  ASSERT v_nomor = '05/001/UN43.3.7/HMIF/X/2031', format('Nomor pertama periode A = %s', v_nomor);

  SELECT EXISTS (
    SELECT 1 FROM pg_locks
    WHERE locktype = 'advisory' AND ((classid::BIGINT << 32) | objid::BIGINT) = v_kunci
      AND pid = pg_backend_pid()
  ) INTO v_dipegang;
  ASSERT v_dipegang,
    'alokasi_nomor_surat TIDAK memasang advisory lock per periode (INV-15) — '
    'serialisasi kini hanya bergantung pada bentuk UPDATE counter';

  -- Kunci proker periode yang sama memakai seed 1 (migrasi 019). Bila kunci
  -- surat ikut seed 1, keduanya ternyata satu kunci.
  ASSERT hashtextextended(v_pa::TEXT, 0) <> hashtextextended(v_pa::TEXT, 1),
    'Kunci nomor surat sama dengan kunci approval proker — approval surat akan mengantre di belakang proker';

  ---------------------------------------------------------------------------
  -- 2. PERIODE BERBEDA TIDAK SALING MENYENTUH COUNTER
  ---------------------------------------------------------------------------
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_pb, v_tmpl, '05', '2032-10-15', 'Uji 020 periode B', 'Uji', 'di Tempat', v_user, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_s2;

  v_nomor := alokasi_nomor_surat(v_s2, v_user);
  ASSERT v_nomor = '05/001/UN43.3.7/HMIF/X/2032',
    format('Periode B tidak mulai dari 001 — counter tercampur antar-periode (%s)', v_nomor);
  ASSERT (SELECT nomor_terakhir FROM surat_counter WHERE periode_id = v_pa) = 1,
    'Alokasi di periode B menaikkan counter periode A';

  ---------------------------------------------------------------------------
  -- 3. NOMOR YANG SUDAH TERBIT LALU DIBATALKAN TIDAK DIDAUR ULANG (INV-16)
  ---------------------------------------------------------------------------
  UPDATE surat SET status = 'TERBIT' WHERE id = v_s;
  -- Pembatalan surat bernomor wajib beralasan (migrasi 030/032), seperti lewat aplikasi.
  UPDATE surat SET status = 'DIBATALKAN', alasan_pembatalan = 'Uji pembatalan', dibatalkan_at = now()
  WHERE id = v_s;

  ASSERT (SELECT nomor_urut FROM surat WHERE id = v_s) = 1,
    'Surat dibatalkan kehilangan nomornya — jejak nomor 001 hilang';
  ASSERT (SELECT nomor_terakhir FROM surat_counter WHERE periode_id = v_pa) = 1,
    'Membatalkan surat menurunkan counter — nomor akan didaur ulang';

  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_pa, v_tmpl, '05', '2031-10-16', 'Uji 020 sesudah batal', 'Uji', 'di Tempat', v_user, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_s2;
  v_nomor := alokasi_nomor_surat(v_s2, v_user);
  ASSERT v_nomor = '05/002/UN43.3.7/HMIF/X/2031',
    format('Surat sesudah pembatalan mendapat %s — nomor 001 didaur ulang', v_nomor);

  ---------------------------------------------------------------------------
  -- 4. BATCH SEMUA-ATAU-TIDAK
  --    Surat ke-2 berstatus DRAFT: seluruh batch harus gagal, surat ke-1 tetap
  --    tanpa nomor, dan counter tidak naik. Blok EXCEPTION membuat
  --    subtransaksi, jadi yang teramati di bawahnya adalah hasil rollback-nya.
  ---------------------------------------------------------------------------
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_pa, v_tmpl, '02', '2031-11-10', 'Uji 020 batch sah', 'Uji', 'di Tempat', v_user, 'MENUNGGU_APPROVAL')
  RETURNING id INTO v_s;
  INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                     perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, status)
  VALUES (v_pa, v_tmpl, '02', '2031-11-10', 'Uji 020 batch draft', 'Uji', 'di Tempat', v_user, 'DRAFT')
  RETURNING id INTO v_draft;

  SELECT nomor_terakhir INTO v_counter FROM surat_counter WHERE periode_id = v_pa;
  v_ditolak := false;
  BEGIN
    PERFORM alokasi_nomor_batch(ARRAY[v_s, v_draft], v_user);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Batch berisi surat DRAFT DITERIMA — seharusnya ditolak seluruhnya';
  ASSERT (SELECT nomor_urut FROM surat WHERE id = v_s) IS NULL,
    'Surat sah di batch yang gagal tetap memegang nomor — batch tidak semua-atau-tidak';
  ASSERT (SELECT nomor_terakhir FROM surat_counter WHERE periode_id = v_pa) = v_counter,
    'Batch yang gagal menaikkan counter — nomor terbuang';

  ---------------------------------------------------------------------------
  -- 5. INDEX UNIK MENOLAK NOMOR KEMBAR WALAU FUNGSI DILEWATI
  ---------------------------------------------------------------------------
  SELECT nomor_urut INTO v_urut FROM surat WHERE id = v_s2;
  v_ditolak := false;
  BEGIN
    UPDATE surat SET nomor_urut = v_urut, nomor_lengkap = 'kembar', status = 'DISETUJUI' WHERE id = v_s;
  EXCEPTION WHEN unique_violation THEN
    v_ditolak := true;
  END;
  ASSERT v_ditolak,
    'Index surat_nomor_unik_per_periode tidak menolak nomor kembar — benteng terakhir INV-15 hilang';

  -- Nomor urut sama di PERIODE LAIN tetap sah: keunikannya per periode.
  ASSERT (SELECT nomor_urut FROM surat WHERE periode_id = v_pb AND nomor_urut = 1) = 1,
    'Nomor 001 di periode B hilang';

  ---------------------------------------------------------------------------
  -- 6. COUNTER TIDAK DAPAT NEGATIF
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    UPDATE surat_counter SET nomor_terakhir = -1 WHERE periode_id = v_pa;
  EXCEPTION WHEN check_violation THEN
    v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Counter dapat dibuat negatif — CHECK surat_counter_tidak_negatif hilang';

  RAISE NOTICE 'OK 020_nomor_konkuren - advisory lock per periode, counter terpisah, tanpa daur ulang, batch atomik, index unik';
END $$;
