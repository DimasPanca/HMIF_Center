-- Test migrasi 006 — Gantt chart, grup, task, dependensi.
--
-- Fokusnya pada gantt_scope_tepat_satu. Constraint itu yang menjaga pertanyaan
-- "chart ini milik siapa" selalu punya jawaban tunggal — pertanyaan yang dipakai
-- RLS untuk memutuskan siapa boleh mengeditnya.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-025 · SYSTEM_DESIGN §4.4 · PRD F-6.1

DO $$
DECLARE
  v_periode UUID;
  v_dept    UUID;
  v_user    UUID := '11111111-1111-1111-1111-111111111111';
  v_proker  UUID;
  v_kep     UUID;
  v_divisi  UUID;
  v_chart   UUID;
  v_grup    UUID;
  v_task1   UUID;
  v_task2   UUID;
  v_ditolak BOOLEAN;
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
  VALUES (v_user, 'PJ Uji', '3337220020', 'pj@example.test');

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept, 'SYNCHRONIZE', 'TERJADWAL', 'DISETUJUI',
          '2026-11-01', '2026-12-06', '2026-12-07', v_user)
  RETURNING id INTO v_proker;

  INSERT INTO kepanitiaan (proker_id, nama_acara) VALUES (v_proker, 'SYNCHRONIZE')
  RETURNING id INTO v_kep;

  INSERT INTO divisi (kepanitiaan_id, nama) VALUES (v_kep, 'ACARA')
  RETURNING id INTO v_divisi;

  ---------------------------------------------------------------------------
  -- 1. TEPAT SATU PEMILIK — nol ditolak
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_chart (scope, judul) VALUES ('PROKER', 'Tanpa pemilik');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Chart tanpa pemilik DITERIMA - ia akan menggantung selamanya';

  ---------------------------------------------------------------------------
  -- 2. TEPAT SATU PEMILIK — dua ditolak
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_chart (scope, proker_id, divisi_id, judul)
    VALUES ('PROKER', v_proker, v_divisi, 'Dua pemilik');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Chart dengan dua pemilik DITERIMA - kepemilikan jadi ambigu bagi RLS';

  ---------------------------------------------------------------------------
  -- 3. KEEMPAT LEVEL SAH, masing-masing dengan satu pemilik
  ---------------------------------------------------------------------------
  INSERT INTO gantt_chart (scope, proker_id, judul)
  VALUES ('PROKER', v_proker, 'Gantt Proker') RETURNING id INTO v_chart;

  INSERT INTO gantt_chart (scope, divisi_id, judul)      VALUES ('DIVISI', v_divisi, 'Gantt Divisi');
  INSERT INTO gantt_chart (scope, departemen_id, judul)  VALUES ('DEPARTEMEN', v_dept, 'Gantt Departemen');
  INSERT INTO gantt_chart (scope, kepanitiaan_id, judul) VALUES ('KETUPLAK', v_kep, 'Gantt Ketuplak');

  ASSERT (SELECT count(*) FROM gantt_chart) = 4, 'Keempat level chart tidak tersimpan';

  ---------------------------------------------------------------------------
  -- 4. SCOPE DI LUAR DAFTAR DITOLAK
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_chart (scope, proker_id, judul) VALUES ('ENTAH', v_proker, 'Scope aneh');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Scope di luar daftar DITERIMA';

  ---------------------------------------------------------------------------
  -- 5. TASK — tanggal dan progres
  ---------------------------------------------------------------------------
  INSERT INTO gantt_group (chart_id, nama, warna, pj_nama, urutan)
  VALUES (v_chart, 'Persiapan', '#1E90FF', 'Muhammad Zidan', 1)
  RETURNING id INTO v_grup;

  -- Task satu hari SAH: mulai = selesai.
  INSERT INTO gantt_task (group_id, nama, tanggal_mulai, tanggal_selesai, progres)
  VALUES (v_grup, 'Rapat perdana', '2026-11-01', '2026-11-01', 100)
  RETURNING id INTO v_task1;

  INSERT INTO gantt_task (group_id, nama, tanggal_mulai, tanggal_selesai, progres)
  VALUES (v_grup, 'Cari venue', '2026-11-02', '2026-11-20', 40)
  RETURNING id INTO v_task2;

  -- Selesai mendahului mulai -> ditolak (bar berlebar negatif saat dirender).
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_task (group_id, nama, tanggal_mulai, tanggal_selesai)
    VALUES (v_grup, 'Terbalik', '2026-11-20', '2026-11-01');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Task dengan selesai mendahului mulai DITERIMA';

  -- Progres di luar 0-100 -> ditolak.
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_task (group_id, nama, tanggal_mulai, tanggal_selesai, progres)
    VALUES (v_grup, 'Progres 150', '2026-11-01', '2026-11-02', 150);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Progres 150 persen DITERIMA';

  ---------------------------------------------------------------------------
  -- 6. WARNA GRUP HARUS HEX
  ---------------------------------------------------------------------------
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_group (chart_id, nama, warna) VALUES (v_chart, 'Salah', 'biru');
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Warna grup non-hex DITERIMA';

  ---------------------------------------------------------------------------
  -- 7. DEPENDENSI
  ---------------------------------------------------------------------------
  INSERT INTO gantt_dependency (from_task, to_task) VALUES (v_task1, v_task2);

  -- Duplikat ditolak.
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_dependency (from_task, to_task) VALUES (v_task1, v_task2);
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Dependensi duplikat DITERIMA';

  -- Bergantung pada diri sendiri ditolak: konektor akan digambar melingkar.
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_dependency (from_task, to_task) VALUES (v_task1, v_task1);
  EXCEPTION WHEN check_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Task bergantung pada dirinya sendiri DITERIMA';

  ---------------------------------------------------------------------------
  -- 8. CASCADE — hapus chart melenyapkan grup, task, dan dependensinya
  ---------------------------------------------------------------------------
  DELETE FROM gantt_chart WHERE id = v_chart;

  ASSERT (SELECT count(*) FROM gantt_group WHERE chart_id = v_chart) = 0, 'Grup tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM gantt_task WHERE group_id = v_grup) = 0, 'Task tidak ikut terhapus';
  ASSERT (SELECT count(*) FROM gantt_dependency WHERE from_task = v_task1) = 0,
    'Dependensi tidak ikut terhapus';

  -- Chart level lain tidak terpengaruh.
  ASSERT (SELECT count(*) FROM gantt_chart) = 3, 'Chart level lain ikut terhapus';

  RAISE NOTICE 'OK 006_gantt - tepat satu pemilik ditegakkan, 4 level sah, cascade tepat';
END $$;
