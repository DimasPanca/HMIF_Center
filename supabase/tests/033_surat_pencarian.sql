-- Test migrasi 033 — pencarian arsip surat mencakup isi.
--
-- Sumber: T-063 · PRD F-4.4

DO $$
DECLARE
  v_p        UUID;
  v_user     UUID := '33333333-0330-0330-0330-333333333333';
  v_tandu    UUID;
  v_generik  UUID;
  v_lain     UUID;
  v_ids      UUID[];
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 033', '2036-09-01', '2037-08-31', 'PERSIAPAN') RETURNING id INTO v_p;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Sekum Uji 033', '3337220330', 'sekum033@example.test');

  -- Perihal memuat kata yang dicari (bobot A).
  INSERT INTO surat (periode_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, data_dinamis)
  VALUES (v_p, '01', '2036-10-01', 'Permohonan Peminjaman Tandu', 'Kepala BPBD Kota Cilegon', 'di Tempat', v_user,
          '{"barang": "Tandu", "tempat": "Kampus"}'::JSONB)
  RETURNING id INTO v_tandu;

  -- Kata hanya di ISI: HTML generik dan nilai data_dinamis.
  INSERT INTO surat (periode_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, isi_html)
  VALUES (v_p, '01', '2036-10-02', 'Pemberitahuan Kegiatan', 'Ketua DPM', 'di Tempat', v_user,
          '<p>Kami akan <strong>meminjam</strong> tandu dari klinik.</p>')
  RETURNING id INTO v_generik;

  -- Tidak relevan; kunci JSON "barang" tidak boleh membuatnya cocok.
  INSERT INTO surat (periode_id, kode_surat, tanggal_surat, perihal, tujuan_nama, tujuan_alamat, dibuat_oleh, data_dinamis)
  VALUES (v_p, '01', '2036-10-03', 'Undangan Rapat', 'Ketua BEM', 'di Tempat', v_user, '{"barang": "Proyektor"}'::JSONB)
  RETURNING id INTO v_lain;

  -- "peminjaman tandu": perihal (stemming "peminjaman" = "meminjam") dan isi.
  SELECT array_agg(id ORDER BY ts_rank(cari, q) DESC, id) INTO v_ids
  FROM surat, websearch_to_tsquery('indonesian', 'peminjaman tandu') q
  WHERE periode_id = v_p AND cari @@ q;
  ASSERT v_ids = ARRAY[v_tandu, v_generik],
    format('"peminjaman tandu" seharusnya menemukan surat perihal lalu surat isi, dapat %s', v_ids);

  -- Isi data_dinamis ikut terindeks (nilai, bukan kunci).
  ASSERT EXISTS (SELECT 1 FROM surat WHERE id = v_lain AND cari @@ websearch_to_tsquery('indonesian', 'proyektor')),
    'Nilai data_dinamis tidak terindeks';
  ASSERT NOT EXISTS (SELECT 1 FROM surat WHERE id = v_lain AND cari @@ websearch_to_tsquery('indonesian', 'barang')),
    'Kunci JSON data_dinamis ikut terindeks — setiap surat kepanitiaan akan cocok dengan "barang"';

  -- Tag HTML tidak terindeks sebagai kata.
  ASSERT NOT EXISTS (SELECT 1 FROM surat WHERE id = v_generik AND cari @@ websearch_to_tsquery('indonesian', 'strong')),
    'Nama tag HTML ikut terindeks';

  -- Kolom tergenerasi ikut berubah saat perihal disunting.
  UPDATE surat SET perihal = 'Permohonan Kerja Sama' WHERE id = v_lain;
  ASSERT EXISTS (SELECT 1 FROM surat WHERE id = v_lain AND cari @@ websearch_to_tsquery('indonesian', 'kerja sama')),
    'Kolom cari tidak mengikuti perubahan perihal';

  RAISE NOTICE 'OK 033_surat_pencarian - perihal+tujuan+isi, nilai JSON saja, tanpa tag HTML, peringkat perihal di atas isi';
END $$;
