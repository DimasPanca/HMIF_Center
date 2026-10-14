-- Test migrasi 029 — template_id boleh NULL hanya untuk kode generik.
--
-- Sumber: ADR-028 · T-058

DO $$
DECLARE
  v_p       UUID;
  v_user    UUID := '29292929-2929-2929-2929-292929292929';
  v_kode    TEXT;
  v_ditolak BOOLEAN;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 029', '2033-09-01', '2034-08-31', 'PERSIAPAN') RETURNING id INTO v_p;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Sekum Uji 029', '3337220290', 'sekum029@example.test');

  -- Empat kode generik dapat disimpan tanpa template.
  FOREACH v_kode IN ARRAY ARRAY['01', '06', '07', '09'] LOOP
    INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                       perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
    VALUES (v_p, NULL, v_kode, '2033-10-01', 'Generik ' || v_kode, '', '', v_user);
  END LOOP;
  ASSERT (SELECT count(*) FROM surat WHERE periode_id = v_p AND template_id IS NULL) = 4,
    'Surat generik tanpa template tidak dapat disimpan';

  -- Tujuh varian bertemplate tetap wajib merujuk template.
  FOREACH v_kode IN ARRAY ARRAY['02', '03', '04', '05', '08'] LOOP
    v_ditolak := false;
    BEGIN
      INSERT INTO surat (periode_id, template_id, kode_surat, tanggal_surat,
                         perihal, tujuan_nama, tujuan_alamat, dibuat_oleh)
      VALUES (v_p, NULL, v_kode, '2033-10-01', 'Bertemplate ' || v_kode, '', '', v_user);
    EXCEPTION WHEN check_violation THEN
      v_ditolak := true;
    END;
    ASSERT v_ditolak, format('Surat kode %s tanpa template DITERIMA — generator tidak tahu berkasnya', v_kode);
  END LOOP;

  RAISE NOTICE 'OK 029_surat_generik - generik boleh tanpa template, bertemplate tetap wajib';
END $$;
