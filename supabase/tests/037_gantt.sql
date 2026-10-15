-- Test migrasi 037 — Gantt ber-periode, satu chart departemen per periode,
-- chart_id task dijaga trigger, realtime.
--
-- Sumber: T-078 · INV-08

DO $$
DECLARE
  v_p       UUID;
  v_user    UUID := '37373737-0370-0370-0370-373737373737';
  v_dept    UUID;
  v_proker  UUID;
  v_c       UUID;
  v_c2      UUID;
  v_cd      UUID;
  v_g       UUID;
  v_g2      UUID;
  v_t       UUID;
  v_ditolak BOOLEAN;
BEGIN
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji 037', '2040-09-01', '2041-08-31', 'PERSIAPAN') RETURNING id INTO v_p;
  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Kadept Uji 037', '3337220370', 'kadept037@example.test');
  SELECT id INTO v_dept FROM departemen ORDER BY urutan LIMIT 1;
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
  VALUES (v_p, v_dept, 'Proker Uji 037', 'TERJADWAL', 'DRAFT', '2040-10-01', '2040-11-01', '2040-11-02', v_user)
  RETURNING id INTO v_proker;

  -- 1. periode chart diturunkan dari proker
  INSERT INTO gantt_chart (scope, proker_id, judul) VALUES ('PROKER', v_proker, 'Uji 037') RETURNING id INTO v_c;
  ASSERT (SELECT periode_id FROM gantt_chart WHERE id = v_c) = v_p, 'periode chart tidak diturunkan dari proker';

  -- 2. satu chart DEPARTEMEN per departemen per periode
  INSERT INTO gantt_chart (scope, departemen_id, periode_id, judul) VALUES ('DEPARTEMEN', v_dept, v_p, 'Dept 037') RETURNING id INTO v_cd;
  v_ditolak := false;
  BEGIN
    INSERT INTO gantt_chart (scope, departemen_id, periode_id, judul) VALUES ('DEPARTEMEN', v_dept, v_p, 'Dept 037 kembar');
  EXCEPTION WHEN unique_violation THEN v_ditolak := true;
  END;
  ASSERT v_ditolak, 'Dua chart DEPARTEMEN untuk departemen & periode yang sama DITERIMA';

  -- 3. chart_id task mengikuti grup, termasuk saat dipindah grup & bila dipalsukan
  INSERT INTO gantt_group (chart_id, nama, warna) VALUES (v_c, 'Grup A', '#123456') RETURNING id INTO v_g;
  INSERT INTO gantt_group (chart_id, nama, warna) VALUES (v_cd, 'Grup B', '#654321') RETURNING id INTO v_g2;
  INSERT INTO gantt_task (group_id, nama, tanggal_mulai, tanggal_selesai) VALUES (v_g, 'Task', '2040-10-01', '2040-10-03') RETURNING id INTO v_t;
  ASSERT (SELECT chart_id FROM gantt_task WHERE id = v_t) = v_c, 'chart_id task tidak diisi dari grup';
  UPDATE gantt_task SET group_id = v_g2 WHERE id = v_t;
  ASSERT (SELECT chart_id FROM gantt_task WHERE id = v_t) = v_cd, 'chart_id task tidak ikut saat grup berganti';
  UPDATE gantt_task SET chart_id = v_c WHERE id = v_t;
  ASSERT (SELECT chart_id FROM gantt_task WHERE id = v_t) = v_cd, 'chart_id task dapat dipalsukan lepas dari grupnya';

  -- 4. realtime
  ASSERT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gantt_task'),
    'gantt_task tidak masuk publication supabase_realtime';
  ASSERT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gantt_group'),
    'gantt_group tidak masuk publication supabase_realtime';

  RAISE NOTICE 'OK 037_gantt - periode chart, departemen unik per periode, chart_id task, realtime';
END $$;
