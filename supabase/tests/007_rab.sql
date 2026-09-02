-- Test migrasi 007 — RAB, pemasukan, peserta.
--
-- Fokus pada INV-26: kolom jumlah disimpan dua kali. Nilai teks bebas dari
-- template Excel harus tetap tersimpan apa adanya, sementara nilai numeriknya
-- boleh kosong ketika parser tidak yakin.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-026 · SYSTEM_DESIGN §4.6 · PRD F-9.1

DO $$
DECLARE
  v_periode UUID;
  v_dept    UUID;
  v_user    UUID := '11111111-1111-1111-1111-111111111111';
  v_proker  UUID;
  v_kep     UUID;
  v_divisi  UUID;
  v_section UUID;
  v_ditolak BOOLEAN;
  v_teks    TEXT;
  v_num     NUMERIC;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode
  RETURNING id INTO v_dept;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Bendahara Uji', '3337220030', 'bend@example.test');
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
  INSERT INTO rab_section (divisi_id, nama, urutan)
  VALUES (v_divisi, 'KONSUMSI PANITIA', 1) RETURNING id INTO v_section;

  ---------------------------------------------------------------------------
  -- 1. KOLOM JUMLAH GANDA (INV-26)
  --    Kasus-kasus nyata dari RAB_Template.xlsx.
  ---------------------------------------------------------------------------

  -- Kasus mudah: angka murni, parser yakin.
  INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik,
                        harga_satuan, total)
  VALUES (v_section, 1, 'Galon', '10', 10, 5000, 50000);

  -- Kasus angka + satuan: teks asli DIPERTAHANKAN, numerik terisi.
  INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik,
                        harga_satuan, total)
  VALUES (v_section, 2, 'Meja lipat', '16 Unit', 16, 25000, 400000);

  SELECT jumlah_teks, jumlah_numerik INTO v_teks, v_num
  FROM rab_item WHERE section_id = v_section AND no_urut = 2;
  ASSERT v_teks = '16 Unit',
    format('Teks asli berubah menjadi "%s" - export Excel tidak akan identik template', v_teks);
  ASSERT v_num = 16, 'Nilai numerik tidak terisi untuk kasus angka + satuan';

  -- Kasus kompleks: parser TIDAK yakin, numerik NULL. Ini harus SAH.
  -- Bila kolom ini NOT NULL, seluruh baris seperti ini mustahil disimpan dan
  -- user dipaksa mengarang angka.
  INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik,
                        harga_satuan, total, total_manual)
  VALUES (v_section, 3, 'Penginapan pemateri', '2 Hari 1 Malam', NULL, 0, 750000, true);

  SELECT jumlah_teks, jumlah_numerik INTO v_teks, v_num
  FROM rab_item WHERE section_id = v_section AND no_urut = 3;
  ASSERT v_teks = '2 Hari 1 Malam', 'Teks kompleks tidak tersimpan apa adanya';
  ASSERT v_num IS NULL, 'jumlah_numerik seharusnya NULL untuk teks yang tidak terparsing';
  ASSERT (SELECT total_manual FROM rab_item WHERE section_id = v_section AND no_urut = 3),
    'total_manual tidak tersimpan - kalkulasi ulang akan menimpa angka yang di-override';

  ---------------------------------------------------------------------------
  -- 2. NOMOR URUT UNIK DALAM SATU SUB-SECTION
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks)
    VALUES (v_section, 1, 'Duplikat', '1');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Nomor urut duplikat dalam satu sub-section DITERIMA';

  ---------------------------------------------------------------------------
  -- 3. NILAI NEGATIF DITOLAK
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, harga_satuan)
    VALUES (v_section, 9, 'Harga minus', '1', -5000);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Harga satuan negatif DITERIMA';

  ---------------------------------------------------------------------------
  -- 4. SUB-SECTION UNIK PER DIVISI
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO rab_section (divisi_id, nama) VALUES (v_divisi, 'KONSUMSI PANITIA');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Sub-section dengan nama sama dalam satu divisi DITERIMA';

  ---------------------------------------------------------------------------
  -- 5. RAB META — satu per acara, default DRAFT
  ---------------------------------------------------------------------------
  INSERT INTO rab_meta (kepanitiaan_id) VALUES (v_kep);
  ASSERT (SELECT status FROM rab_meta WHERE kepanitiaan_id = v_kep) = 'DRAFT',
    'Status RAB tidak default ke DRAFT';

  v_ditolak := false;
  BEGIN
    INSERT INTO rab_meta (kepanitiaan_id) VALUES (v_kep);
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Satu acara memperoleh dua rab_meta';

  ---------------------------------------------------------------------------
  -- 6. PESERTA — tanggal bayar tanpa status bayar itu data yang bertentangan
  ---------------------------------------------------------------------------
  INSERT INTO peserta (kepanitiaan_id, no_urut, nama_lengkap, nim,
                       sudah_bayar, tanggal_bayar, jumlah)
  VALUES (v_kep, 1, 'Triana Surya Sundari', '3337220100', true, '2026-11-22', 150000);

  -- Belum bayar, tanpa tanggal: sah.
  INSERT INTO peserta (kepanitiaan_id, no_urut, nama_lengkap, jumlah)
  VALUES (v_kep, 2, 'Peserta Belum Bayar', 150000);

  v_ditolak := false;
  BEGIN
    INSERT INTO peserta (kepanitiaan_id, no_urut, nama_lengkap, sudah_bayar, tanggal_bayar)
    VALUES (v_kep, 3, 'Tidak Konsisten', false, '2026-11-22');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak,
    'Tanggal bayar tanpa status bayar DITERIMA - ringkasan akan berbeda dari daftar pembayaran';

  ---------------------------------------------------------------------------
  -- 7. PEMASUKAN
  ---------------------------------------------------------------------------
  INSERT INTO pemasukan (kepanitiaan_id, no_urut, keterangan, saldo)
  VALUES (v_kep, 1, 'Total Pembayaran SYNCHRONIZE', 23400000);
  INSERT INTO pemasukan (kepanitiaan_id, no_urut, keterangan, saldo)
  VALUES (v_kep, 2, 'Himpunan', 2600000);

  ASSERT (SELECT sum(saldo) FROM pemasukan WHERE kepanitiaan_id = v_kep) = 26000000,
    'Total pemasukan tidak sesuai';

  ---------------------------------------------------------------------------
  -- 8. CASCADE — hapus acara melenyapkan seluruh RAB-nya
  ---------------------------------------------------------------------------
  DELETE FROM proker WHERE id = v_proker;

  ASSERT (SELECT count(*) FROM rab_section WHERE divisi_id = v_divisi) = 0, 'Sub-section tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM rab_item WHERE section_id = v_section) = 0, 'Item RAB tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM rab_meta WHERE kepanitiaan_id = v_kep) = 0, 'rab_meta tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM peserta WHERE kepanitiaan_id = v_kep) = 0, 'Peserta tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM pemasukan WHERE kepanitiaan_id = v_kep) = 0, 'Pemasukan tidak ikut terhapus';

  RAISE NOTICE 'OK 007_rab - kolom jumlah ganda terjaga, teks asli utuh, numerik boleh NULL';
END $$;
