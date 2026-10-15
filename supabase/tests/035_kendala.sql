-- Test migrasi 035/036 — kendala ber-periode, dapat dicari, berlampiran, realtime.
--
-- Sumber: T-082 · PRD F-7.3 · INV-08

DO $$
DECLARE
  v_p       UUID;
  v_user    UUID := '35353535-0350-0350-0350-353535353535';
  v_dept    UUID;
  v_proker  UUID;
  v_k       UUID;
  v_k2      UUID;
  v_ditolak BOOLEAN;
  v_ubah    TIMESTAMPTZ;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 035', '2038-09-01', '2039-08-31', 'PERSIAPAN') RETURNING id INTO v_p;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Kadept Uji 035', '3337220350', 'kadept035@example.test');
  SELECT id INTO v_dept FROM departemen ORDER BY urutan LIMIT 1;
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
  VALUES (v_p, v_dept, 'Proker Uji 035', 'TERJADWAL', 'DRAFT', '2038-10-01', '2038-11-01', '2038-11-02', v_user)
  RETURNING id INTO v_proker;

  -- 1. periode diturunkan dari proker bila penulis lupa (INV-08)
  INSERT INTO kendala (departemen_id, proker_id, judul, deskripsi, dibuat_oleh)
  VALUES (v_dept, v_proker, 'Venue dibatalkan mendadak', 'Pihak gedung membatalkan sewa aula.', v_user)
  RETURNING id INTO v_k;
  ASSERT (SELECT periode_id FROM kendala WHERE id = v_k) = v_p, 'periode_id tidak diturunkan dari proker';

  -- 2. pencarian: judul, deskripsi, DAN catatan penyelesaian (arsip lintas periode)
  ASSERT EXISTS (SELECT 1 FROM kendala WHERE id = v_k AND cari @@ websearch_to_tsquery('indonesian', 'venue dibatalkan')),
    'Judul kendala tidak terindeks';
  ASSERT EXISTS (SELECT 1 FROM kendala WHERE id = v_k AND cari @@ websearch_to_tsquery('indonesian', 'sewa aula')),
    'Deskripsi kendala tidak terindeks';
  UPDATE kendala SET status = 'SELESAI', resolved_at = now(),
         catatan_penyelesaian = 'Pindah ke auditorium fakultas teknik'
  WHERE id = v_k;
  ASSERT EXISTS (SELECT 1 FROM kendala WHERE id = v_k AND cari @@ websearch_to_tsquery('indonesian', 'auditorium')),
    'Catatan penyelesaian tidak terindeks — arsip tak dapat dicari dengan solusi lamanya';

  -- 3. updated_at dipelihara
  INSERT INTO kendala (departemen_id, periode_id, judul, deskripsi, dibuat_oleh, updated_at)
  VALUES (v_dept, v_p, 'Lama', 'x', v_user, '2020-01-01') RETURNING id INTO v_k2;
  UPDATE kendala SET judul = 'Lama diubah' WHERE id = v_k2;
  SELECT updated_at INTO v_ubah FROM kendala WHERE id = v_k2;
  ASSERT v_ubah > '2025-01-01', 'updated_at kendala tidak diperbarui saat diubah';

  -- 4. lampiran hanya boleh di prefix privat kendala/
  v_ditolak := false;
  BEGIN
    INSERT INTO kendala_lampiran (kendala_id, storage_key, nama_berkas, mime_type, ukuran, diunggah_oleh)
    VALUES (v_k, 'aset/bocor.png', 'bocor.png', 'image/png', 10, v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Lampiran kendala di luar prefix privat kendala/ DITERIMA';
  INSERT INTO kendala_lampiran (kendala_id, storage_key, nama_berkas, mime_type, ukuran, diunggah_oleh)
  VALUES (v_k, 'kendala/' || v_k || '/a.png', 'a.png', 'image/png', 10, v_user);
  DELETE FROM kendala WHERE id = v_k;
  ASSERT NOT EXISTS (SELECT 1 FROM kendala_lampiran WHERE kendala_id = v_k), 'Lampiran tidak ikut terhapus bersama kendala';

  -- 5. realtime: kendala dipublikasikan (dashboard Ketua < 3 detik)
  ASSERT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'kendala'),
    'kendala tidak masuk publication supabase_realtime';

  RAISE NOTICE 'OK 035_kendala - periode otomatis, pencarian judul/deskripsi/solusi, updated_at, lampiran privat, realtime';
END $$;
