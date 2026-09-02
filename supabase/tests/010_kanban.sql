-- Test migrasi 010 — Kanban, checklist, kendala, balasan berulir.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-029 · SYSTEM_DESIGN §4.9 · PRD F-7.1, F-7.3

DO $$
DECLARE
  v_periode UUID;
  v_dept    UUID;
  v_user    UUID := '11111111-1111-1111-1111-111111111111';
  v_proker  UUID;
  v_card    UUID;
  v_kendala UUID;
  v_r1      UUID;
  v_r2      UUID;
  v_r3      UUID;
  v_ditolak BOOLEAN;
  v_jumlah  INT;
  v_progres NUMERIC;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  RETURNING id INTO v_dept;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Anggota Uji', '3337220060', 'anggota@example.test');
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept, 'SYNCHRONIZE', 'TERJADWAL', 'BERJALAN',
          '2026-11-01', '2026-12-06', '2026-12-07', v_user)
  RETURNING id INTO v_proker;

  ---------------------------------------------------------------------------
  -- 1. KARTU WAJIB PUNYA KONTEKS
  --    Kartu tanpa keterkaitan tidak akan pernah muncul di papan mana pun.
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO kanban_card (judul, created_by) VALUES ('Kartu yatim', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Kartu tanpa proker, divisi, maupun departemen DITERIMA';

  ---------------------------------------------------------------------------
  -- 2. PROGRES PROKER DIHITUNG DARI KOLOM KARTU (PRD F-7.1)
  --    Angka ini tampil di Master Gantt, jadi rumusnya harus terbukti.
  ---------------------------------------------------------------------------
  INSERT INTO kanban_card (proker_id, departemen_id, judul, kolom, created_by, urutan)
  VALUES (v_proker, v_dept, 'Cari venue', 'DONE', v_user, 1) RETURNING id INTO v_card;
  INSERT INTO kanban_card (proker_id, departemen_id, judul, kolom, created_by, urutan)
  VALUES (v_proker, v_dept, 'Hubungi pemateri', 'DONE', v_user, 2);
  INSERT INTO kanban_card (proker_id, departemen_id, judul, kolom, created_by, urutan)
  VALUES (v_proker, v_dept, 'Susun rundown', 'IN_PROGRESS', v_user, 3);
  INSERT INTO kanban_card (proker_id, departemen_id, judul, kolom, created_by, urutan)
  VALUES (v_proker, v_dept, 'Cetak sertifikat', 'TODO', v_user, 4);

  SELECT ROUND(100.0 * count(*) FILTER (WHERE kolom = 'DONE') / NULLIF(count(*), 0))
  INTO v_progres FROM kanban_card WHERE proker_id = v_proker;

  ASSERT v_progres = 50,
    format('Progres proker terhitung %s persen, seharusnya 50 (2 dari 4 kartu DONE)', v_progres);

  ---------------------------------------------------------------------------
  -- 3. CHECKLIST DI DALAM KARTU
  ---------------------------------------------------------------------------
  INSERT INTO checklist_item (card_id, teks, selesai, urutan) VALUES (v_card, 'Survei lokasi', true, 1);
  INSERT INTO checklist_item (card_id, teks, selesai, urutan) VALUES (v_card, 'Nego harga', true, 2);
  INSERT INTO checklist_item (card_id, teks, selesai, urutan) VALUES (v_card, 'Bayar DP', false, 3);

  SELECT count(*)::INT INTO v_jumlah FROM checklist_item WHERE card_id = v_card AND selesai;
  ASSERT v_jumlah = 2, format('Checklist selesai: %s, seharusnya 2', v_jumlah);

  ---------------------------------------------------------------------------
  -- 4. KENDALA — konteks wajib, dan penutupan wajib beralasan
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO kendala (judul, deskripsi, dibuat_oleh)
    VALUES ('Kendala yatim', 'Tanpa konteks', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Kendala tanpa departemen maupun divisi DITERIMA';

  INSERT INTO kendala (departemen_id, proker_id, judul, deskripsi, prioritas, dibuat_oleh)
  VALUES (v_dept, v_proker, 'Venue dibatalkan mendadak',
          'Pihak gedung membatalkan H-14 tanpa pemberitahuan.', 'KRITIS', v_user)
  RETURNING id INTO v_kendala;

  -- Menutup tanpa catatan penyelesaian -> ditolak.
  -- Tanpa catatan, kendala yang sama berulang tiap kepengurusan tanpa ada yang
  -- tahu bagaimana dulu ia diselesaikan (PRD §2.1).
  v_ditolak := false;
  BEGIN
    UPDATE kendala SET status = 'SELESAI', resolved_at = now() WHERE id = v_kendala;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Kendala ditutup tanpa catatan penyelesaian DITERIMA';

  -- Status SELESAI tanpa resolved_at juga ditolak.
  v_ditolak := false;
  BEGIN
    UPDATE kendala SET status = 'SELESAI', catatan_penyelesaian = 'Pindah venue'
    WHERE id = v_kendala;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Kendala SELESAI tanpa resolved_at DITERIMA';

  ---------------------------------------------------------------------------
  -- 5. KENDALA KRITIS TERBUKA MUDAH DITEMUKAN
  --    Query yang dipakai dashboard Ketua, Wakil, dan BPH.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah
  FROM kendala WHERE prioritas = 'KRITIS' AND status <> 'SELESAI';
  ASSERT v_jumlah = 1, 'Kendala kritis terbuka tidak ditemukan query dashboard';

  ---------------------------------------------------------------------------
  -- 6. BALASAN BERULIR TIGA TINGKAT
  ---------------------------------------------------------------------------
  INSERT INTO kendala_reply (kendala_id, konten, penulis_id)
  VALUES (v_kendala, 'Sudah dicek, benar dibatalkan.', v_user) RETURNING id INTO v_r1;

  INSERT INTO kendala_reply (kendala_id, parent_id, konten, penulis_id)
  VALUES (v_kendala, v_r1, 'Ada alternatif di gedung B?', v_user) RETURNING id INTO v_r2;

  INSERT INTO kendala_reply (kendala_id, parent_id, konten, penulis_id)
  VALUES (v_kendala, v_r2, 'Gedung B kosong tanggal itu.', v_user) RETURNING id INTO v_r3;

  -- Telusuri rantai dari tingkat tiga ke atas.
  WITH RECURSIVE rantai AS (
    SELECT id, parent_id, 1 AS tingkat FROM kendala_reply WHERE id = v_r3
    UNION ALL
    SELECT r.id, r.parent_id, rantai.tingkat + 1
    FROM kendala_reply r JOIN rantai ON r.id = rantai.parent_id
  )
  SELECT max(tingkat)::INT INTO v_jumlah FROM rantai;

  ASSERT v_jumlah = 3, format('Kedalaman balasan terbaca %s tingkat, seharusnya 3', v_jumlah);

  -- Balasan tidak boleh menjadi induk dirinya sendiri.
  v_ditolak := false;
  BEGIN
    UPDATE kendala_reply SET parent_id = v_r1 WHERE id = v_r1;
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Balasan menjadi induk dirinya sendiri DITERIMA';

  ---------------------------------------------------------------------------
  -- 7. MENUTUP KENDALA DENGAN BENAR
  ---------------------------------------------------------------------------
  UPDATE kendala
  SET status = 'SELESAI', resolved_at = now(),
      catatan_penyelesaian = 'Dipindah ke Gedung B, konfirmasi tertulis dari pengelola.'
  WHERE id = v_kendala;

  ASSERT (SELECT status FROM kendala WHERE id = v_kendala) = 'SELESAI',
    'Kendala gagal ditutup walau catatan dan waktu sudah diisi';

  ---------------------------------------------------------------------------
  -- 8. CASCADE
  ---------------------------------------------------------------------------
  DELETE FROM kanban_card WHERE id = v_card;
  ASSERT (SELECT count(*) FROM checklist_item WHERE card_id = v_card) = 0,
    'Checklist tidak ikut terhapus saat kartu dihapus';

  DELETE FROM kendala WHERE id = v_kendala;
  ASSERT (SELECT count(*) FROM kendala_reply WHERE kendala_id = v_kendala) = 0,
    'Balasan tidak ikut terhapus saat kendala dihapus';

  RAISE NOTICE 'OK 010_kanban - konteks wajib, progres 50 persen tepat, ulir 3 tingkat, tutup wajib beralasan';
END $$;
