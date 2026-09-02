-- Test migrasi 011 — kesekretariatan.
--
-- Satu test di sini menguji KETIADAAN constraint, bukan keberadaannya:
-- booking ruangan yang bertabrakan HARUS tersimpan, karena keputusan final
-- ada di Dekanat dan sistem hanya memperingatkan (PRD F-14.2).
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-030 · PRD M13, F-14.1, F-14.2 · ADR-012

DO $$
DECLARE
  v_periode1 UUID;
  v_periode2 UUID;
  v_dept     UUID;
  v_user     UUID := '11111111-1111-1111-1111-111111111111';
  v_notul    UUID;
  v_card     UUID;
  v_action   UUID;
  v_ruangan  UUID;
  v_ditolak  BOOLEAN;
  v_jumlah   INT;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2026', '2026-09-01', '2027-08-31', 'AKTIF') RETURNING id INTO v_periode1;
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 2025', '2025-09-01', '2026-08-31', 'ARSIP') RETURNING id INTO v_periode2;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KAD', 'Kaderisasi', '#1E90FF')
  RETURNING id INTO v_dept;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Sekum Uji', '3337220070', 'sekum2@example.test');

  ---------------------------------------------------------------------------
  -- 1. NOTULENSI — waktu harus urut
  ---------------------------------------------------------------------------
  INSERT INTO notulensi (periode_id, departemen_id, judul, tanggal,
                         waktu_mulai, waktu_selesai, tempat, pemimpin_id, notulis_id,
                         keputusan)
  VALUES (v_periode1, v_dept, 'Rapat Evaluasi Bulanan', '2026-11-10',
          '19:00', '21:00', 'Sekretariat HMIF', v_user, v_user,
          '[{"poin":"Venue SYNCHRONIZE dipindah ke Gedung B"}]'::JSONB)
  RETURNING id INTO v_notul;

  v_ditolak := false;
  BEGIN
    INSERT INTO notulensi (periode_id, judul, tanggal, waktu_mulai, waktu_selesai)
    VALUES (v_periode1, 'Waktu terbalik', '2026-11-11', '21:00', '19:00');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Notulensi dengan waktu selesai mendahului mulai DITERIMA';

  ---------------------------------------------------------------------------
  -- 2. DAFTAR HADIR — satu orang sekali per rapat
  ---------------------------------------------------------------------------
  INSERT INTO notulensi_attendance (notulensi_id, user_id, status)
  VALUES (v_notul, v_user, 'HADIR');

  v_ditolak := false;
  BEGIN
    INSERT INTO notulensi_attendance (notulensi_id, user_id, status)
    VALUES (v_notul, v_user, 'IZIN');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Satu orang tercatat dua kali di daftar hadir rapat yang sama';

  ---------------------------------------------------------------------------
  -- 3. ACTION ITEM DIKONVERSI JADI KARTU KANBAN
  --    Menghapus kartunya TIDAK boleh menghapus catatan rapat yang
  --    melahirkannya — karena itu SET NULL, bukan CASCADE.
  ---------------------------------------------------------------------------
  INSERT INTO kanban_card (departemen_id, judul, created_by)
  VALUES (v_dept, 'Hubungi pengelola Gedung B', v_user) RETURNING id INTO v_card;

  INSERT INTO action_item (notulensi_id, tugas, pic_id, deadline, kanban_card_id)
  VALUES (v_notul, 'Hubungi pengelola Gedung B', v_user, '2026-11-15', v_card)
  RETURNING id INTO v_action;

  DELETE FROM kanban_card WHERE id = v_card;

  ASSERT (SELECT count(*) FROM action_item WHERE id = v_action) = 1,
    'Action item ikut terhapus saat kartu Kanban dihapus - catatan rapat hilang';
  ASSERT (SELECT kanban_card_id FROM action_item WHERE id = v_action) IS NULL,
    'kanban_card_id tidak di-SET NULL setelah kartunya dihapus';

  ---------------------------------------------------------------------------
  -- 4. PENGURUS TANPA AKUN (ADR-012)
  --    Dipakai sebagai sumber auto-fill Surat Keterangan Aktif Organisasi.
  --    Mewajibkan akun berarti membuat puluhan akun yang tidak pernah dipakai.
  ---------------------------------------------------------------------------
  INSERT INTO pengurus (periode_id, nama_lengkap, nim, jabatan, departemen_id, angkatan)
  VALUES (v_periode1, 'Mahasiswa Tanpa Akun', '3337220200', 'Anggota', v_dept, 2022);

  ASSERT (SELECT user_id FROM pengurus WHERE nim = '3337220200') IS NULL,
    'Pengurus tanpa akun tidak tersimpan';

  -- NIM unik PER PERIODE, bukan global: orang yang sama wajar muncul lagi
  -- di kepengurusan berikutnya dengan jabatan berbeda.
  v_ditolak := false;
  BEGIN
    INSERT INTO pengurus (periode_id, nama_lengkap, nim, jabatan)
    VALUES (v_periode1, 'Duplikat', '3337220200', 'Anggota');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'NIM duplikat dalam satu periode DITERIMA';

  INSERT INTO pengurus (periode_id, nama_lengkap, nim, jabatan)
  VALUES (v_periode2, 'Orang Sama Periode Lalu', '3337220200', 'Kepala Departemen');

  SELECT count(*)::INT INTO v_jumlah FROM pengurus WHERE nim = '3337220200';
  ASSERT v_jumlah = 2,
    'NIM sama di periode berbeda ditolak - padahal pengurus wajar menjabat lagi';

  ---------------------------------------------------------------------------
  -- 5. BOOKING RUANGAN BENTROK HARUS TERSIMPAN
  --
  --    Ini test yang menguji KETIADAAN constraint. Keputusan final peminjaman
  --    ada di Dekanat; sistem hanya mencatat dan memperingatkan (PRD F-14.2).
  --    Memblokirnya di database berarti sistem menolak mencatat kenyataan.
  ---------------------------------------------------------------------------
  INSERT INTO ruangan (nama, lokasi, kapasitas, pengelola)
  VALUES ('Auditorium FT', 'Gedung Dekanat Lt.3', 300, 'Kepala Bagian Sekretariat FT')
  RETURNING id INTO v_ruangan;

  INSERT INTO booking_ruangan (ruangan_id, periode_id, kegiatan, tanggal,
                               waktu_mulai, waktu_selesai, jumlah_peserta, dibuat_oleh)
  VALUES (v_ruangan, v_periode1, 'SYNCHRONIZE Hari 1', '2026-12-06',
          '08:00', '16:00', 156, v_user);

  -- Ruangan, tanggal, dan jam yang persis bertabrakan. HARUS tersimpan.
  INSERT INTO booking_ruangan (ruangan_id, periode_id, kegiatan, tanggal,
                               waktu_mulai, waktu_selesai, jumlah_peserta, dibuat_oleh)
  VALUES (v_ruangan, v_periode1, 'Rapat Dekanat', '2026-12-06',
          '08:00', '16:00', 30, v_user);

  SELECT count(*)::INT INTO v_jumlah
  FROM booking_ruangan WHERE ruangan_id = v_ruangan AND tanggal = '2026-12-06';
  ASSERT v_jumlah = 2,
    'Booking bentrok DITOLAK - seharusnya hanya peringatan, keputusan ada di Dekanat (PRD F-14.2)';

  -- Waktu terbalik tetap ditolak: itu kesalahan input, bukan keputusan Dekanat.
  v_ditolak := false;
  BEGIN
    INSERT INTO booking_ruangan (ruangan_id, periode_id, kegiatan, tanggal,
                                 waktu_mulai, waktu_selesai, dibuat_oleh)
    VALUES (v_ruangan, v_periode1, 'Waktu terbalik', '2026-12-07', '16:00', '08:00', v_user);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Booking dengan waktu selesai mendahului mulai DITERIMA';

  ---------------------------------------------------------------------------
  -- 6. CASCADE NOTULENSI
  ---------------------------------------------------------------------------
  DELETE FROM notulensi WHERE id = v_notul;
  ASSERT (SELECT count(*) FROM notulensi_attendance WHERE notulensi_id = v_notul) = 0,
    'Daftar hadir tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM action_item WHERE notulensi_id = v_notul) = 0,
    'Action item tidak ikut terhapus';

  RAISE NOTICE 'OK 011_sekretariat - booking bentrok tersimpan (disengaja), pengurus tanpa akun sah';
END $$;
