-- Test migrasi 030 — pembatalan dan pengajuan wajib tercatat.
--
-- Sumber: T-060 · PRD F-4.3

DO $$
DECLARE
  v_p       UUID;
  v_user    UUID := '30303030-3030-3030-3030-303030303030';
  v_s       UUID;
  v_ditolak BOOLEAN;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 030', '2034-09-01', '2035-08-31', 'PERSIAPAN') RETURNING id INTO v_p;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Sekum Uji 030', '3337220300', 'sekum030@example.test');

  INSERT INTO surat (periode_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
  VALUES (v_p, '01', '2034-10-01', 'Uji 030', 'X', 'di Tempat', v_user) RETURNING id INTO v_s;

  -- Masuk MENUNGGU_APPROVAL tanpa diajukan_at: diisi otomatis (migrasi 031),
  -- supaya antrian selalu dapat diurutkan tanpa mematahkan penulis lama.
  UPDATE surat SET status = 'MENUNGGU_APPROVAL' WHERE id = v_s;
  ASSERT (SELECT diajukan_at FROM surat WHERE id = v_s) IS NOT NULL,
    'diajukan_at tidak terisi saat surat masuk antrian — antrian tak dapat diurutkan';
  PERFORM alokasi_nomor_surat(v_s, v_user);
  UPDATE surat SET status = 'TERBIT' WHERE id = v_s;

  -- Dibatalkan tanpa alasan ditolak.
  v_ditolak := false;
  BEGIN
    UPDATE surat SET status = 'DIBATALKAN', dibatalkan_at = now() WHERE id = v_s;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Pembatalan tanpa alasan DITERIMA';

  UPDATE surat SET status = 'DIBATALKAN', alasan_pembatalan = 'Salah tujuan', dibatalkan_oleh = v_user, dibatalkan_at = now()
  WHERE id = v_s;
  ASSERT (SELECT nomor_urut FROM surat WHERE id = v_s) = 1, 'Surat dibatalkan kehilangan nomornya (INV-16)';

  -- Draft tanpa nomor boleh dibatalkan tanpa alasan (migrasi 032): ia tak
  -- pernah menjadi surat resmi, jadi tak ada yang perlu dijelaskan di arsip.
  INSERT INTO surat (periode_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
  VALUES (v_p, '01', '2034-10-02', 'Draft 030', 'X', 'di Tempat', v_user) RETURNING id INTO v_s;
  UPDATE surat SET status = 'DIBATALKAN' WHERE id = v_s;
  ASSERT (SELECT status FROM surat WHERE id = v_s) = 'DIBATALKAN', 'Draft tanpa nomor tidak dapat dibatalkan';

  RAISE NOTICE 'OK 030_surat_approval - diajukan_at terisi saat menunggu, pembatalan wajib beralasan, nomor tetap';
END $$;
