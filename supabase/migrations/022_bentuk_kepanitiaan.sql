-- 022_bentuk_kepanitiaan — materialisasi rencana kepanitiaan & Gantt saat approval.
--
-- ===========================================================================
-- KENAPA SECURITY DEFINER, SAMA SEPERTI setujui_proker
-- ===========================================================================
-- Saat proker TERJADWAL disetujui (T-070), kepanitiaan sungguhan dibentuk dari
-- proker_rencana (hasil submit wizard T-069). Pembentukan itu menulis ke banyak
-- tabel yang policy tulisnya berbasis KEANGGOTAAN: rab_meta_insert hanya
-- mengizinkan ADMIN/BENDUM atau anggota kepanitiaan (my_kepanitiaan()). Approver
-- (Ketua/Wakil) BELUM menjadi anggota kepanitiaan yang baru saja lahir, sehingga
-- INSERT rab_meta-nya ditolak RLS. Menjahit pengecualian ke tiap policy hanya
-- untuk momen bootstrap ini akan melemahkan policy-nya selamanya.
--
-- Maka pembentukan dijalankan satu fungsi SECURITY DEFINER — pola yang sama
-- dipakai setujui_proker untuk menulis proker_lock (INV-09). Fungsi ini
-- dipanggil DI DALAM transaksi approval oleh lib/proker/approval.ts, tepat
-- setelah setujui_proker berhasil, sehingga kepanitiaan + kunci kalender lahir
-- atau gagal bersama (kontrak T-070 "Jangan": tak ada kepanitiaan yatim).
--
-- "Folder dokumen" (kontrak §5) TIDAK dibuat di sini: folder pada object storage
-- bersifat virtual dan lahir saat unggah pertama (lib/storage), jadi tak ada
-- baris/transaksi yang perlu dibentuk. Dicatat di docs/ai/APPROVAL_CONTRACT.md.
--
-- Sumber: docs/ai/tasks/P3-proker-gantt.md T-070 · PRD F-5.4, F-8.1 ·
--         USER_FLOW §4.3, §6.1 · migrasi 005/006/007/021 · ADR-013 · INV-09

CREATE OR REPLACE FUNCTION bentuk_kepanitiaan(
  p_proker_id   UUID,
  p_approver_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_proker      proker%ROWTYPE;
  v_rencana     proker_rencana%ROWTYPE;
  v_kp          JSONB;
  v_gantt       JSONB;
  v_kepan_id    UUID;
  v_nama_acara  TEXT;
  v_kode        TEXT;
  v_divisi      JSONB;
  v_divisi_id   UUID;
  v_anggota     TEXT;
  v_koor        TEXT;
  v_chart_id    UUID;
  v_group       JSONB;
  v_group_id    UUID;
  v_task        JSONB;
  v_urutan      INT;
  v_urutan_task INT;
BEGIN
  SELECT * INTO v_proker FROM proker WHERE id = p_proker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proker tidak ditemukan: %', p_proker_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Hanya TERJADWAL membentuk kepanitiaan (PRD F-8.1). BERKALA/RESPONSIF tidak.
  IF v_proker.kategori <> 'TERJADWAL' THEN
    RETURN jsonb_build_object('ok', true, 'dibentuk', false, 'alasan', 'BUKAN_TERJADWAL');
  END IF;

  -- Idempoten: satu kepanitiaan per proker (UNIQUE). Bila sudah ada, jangan
  -- membentuk dua — cukup laporkan.
  IF EXISTS (SELECT 1 FROM kepanitiaan WHERE proker_id = p_proker_id) THEN
    RETURN jsonb_build_object('ok', true, 'dibentuk', false, 'alasan', 'SUDAH_ADA');
  END IF;

  SELECT * INTO v_rencana FROM proker_rencana WHERE proker_id = p_proker_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rencana kepanitiaan tak ada untuk proker %', p_proker_id
      USING ERRCODE = 'no_data_found';
  END IF;
  v_kp := v_rencana.kepanitiaan;
  v_gantt := v_rencana.gantt;

  -- Nama acara: dari rencana, jatuh ke nama proker. kode_kegiatan = slug huruf
  -- besar alfanumerik (PRD F-8.1 §6), dipakai pada nomor surat kepanitiaan.
  v_nama_acara := COALESCE(NULLIF(v_kp->>'nama_acara', ''), v_proker.nama);
  v_kode := NULLIF(left(upper(regexp_replace(v_nama_acara, '[^a-zA-Z0-9]+', '', 'g')), 20), '');

  INSERT INTO kepanitiaan (
    proker_id, nama_acara, tema, kode_kegiatan,
    ketua_pelaksana, wakil_pelaksana, sekretaris, bendahara, target_anggaran
  ) VALUES (
    p_proker_id, v_nama_acara, NULLIF(v_kp->>'tema', ''), v_kode,
    (v_kp->>'ketua_pelaksana')::uuid,
    (NULLIF(v_kp->>'wakil_pelaksana', ''))::uuid,
    (NULLIF(v_kp->>'sekretaris', ''))::uuid,
    (NULLIF(v_kp->>'bendahara', ''))::uuid,
    (NULLIF(v_kp->>'target_anggaran', ''))::numeric
  ) RETURNING id INTO v_kepan_id;

  -- RAB mulai berstatus DRAFT (kontrak §5).
  INSERT INTO rab_meta (kepanitiaan_id) VALUES (v_kepan_id);

  -- Divisi + anggota + job_desk kosong + gantt_chart divisi.
  v_urutan := 0;
  FOR v_divisi IN SELECT * FROM jsonb_array_elements(COALESCE(v_kp->'divisi', '[]'::jsonb))
  LOOP
    INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, warna, urutan)
    VALUES (
      v_kepan_id, v_divisi->>'nama',
      (NULLIF(v_divisi->>'koordinator_id', ''))::uuid,
      NULLIF(v_divisi->>'warna', ''), v_urutan
    ) RETURNING id INTO v_divisi_id;

    v_koor := NULLIF(v_divisi->>'koordinator_id', '');
    IF v_koor IS NOT NULL THEN
      INSERT INTO divisi_member (divisi_id, user_id, peran)
      VALUES (v_divisi_id, v_koor::uuid, 'KOORDINATOR')
      ON CONFLICT (divisi_id, user_id) DO NOTHING;
    END IF;

    FOR v_anggota IN
      SELECT jsonb_array_elements_text(COALESCE(v_divisi->'anggota', '[]'::jsonb))
    LOOP
      -- Koordinator yang juga terdaftar sebagai anggota tak digandakan (UNIQUE).
      INSERT INTO divisi_member (divisi_id, user_id, peran)
      VALUES (v_divisi_id, v_anggota::uuid, 'ANGGOTA')
      ON CONFLICT (divisi_id, user_id) DO NOTHING;
    END LOOP;

    -- Ruang kerja divisi: satu job_desk kosong (diisi belakangan lewat editor).
    INSERT INTO job_desk (divisi_id, konten, updated_by)
    VALUES (v_divisi_id, NULL, p_approver_id);

    -- Chart Gantt divisi (kosong) — timeline internal divisi diisi kemudian.
    INSERT INTO gantt_chart (scope, divisi_id, judul)
    VALUES ('DIVISI', v_divisi_id, v_divisi->>'nama');

    v_urutan := v_urutan + 1;
  END LOOP;

  -- Chart Gantt tingkat PROKER, dimaterialisasi dari struktur langkah 5 wizard.
  INSERT INTO gantt_chart (scope, proker_id, judul)
  VALUES ('PROKER', p_proker_id, COALESCE(NULLIF(v_gantt->>'judul', ''), v_proker.nama))
  RETURNING id INTO v_chart_id;

  v_urutan := 0;
  FOR v_group IN SELECT * FROM jsonb_array_elements(COALESCE(v_gantt->'groups', '[]'::jsonb))
  LOOP
    INSERT INTO gantt_group (chart_id, nama, warna, pj_nama, urutan)
    VALUES (
      v_chart_id, v_group->>'nama',
      COALESCE(NULLIF(v_group->>'warna', ''), '#3B82F6'),
      NULLIF(v_group->>'pj_nama', ''), v_urutan
    ) RETURNING id INTO v_group_id;

    v_urutan_task := 0;
    FOR v_task IN SELECT * FROM jsonb_array_elements(COALESCE(v_group->'tasks', '[]'::jsonb))
    LOOP
      INSERT INTO gantt_task (
        group_id, nama, tanggal_mulai, tanggal_selesai,
        progres, assignee_id, is_milestone, urutan
      ) VALUES (
        v_group_id, v_task->>'nama',
        (v_task->>'tanggal_mulai')::date, (v_task->>'tanggal_selesai')::date,
        COALESCE((NULLIF(v_task->>'progres', ''))::int, 0),
        (NULLIF(v_task->>'assignee_id', ''))::uuid,
        COALESCE((v_task->>'is_milestone')::boolean, false),
        v_urutan_task
      );
      v_urutan_task := v_urutan_task + 1;
    END LOOP;
    v_urutan := v_urutan + 1;
  END LOOP;

  -- Rencana sudah menjadi entitas sungguhan; buang supaya tak ada dua sumber.
  DELETE FROM proker_rencana WHERE proker_id = p_proker_id;

  RETURN jsonb_build_object('ok', true, 'dibentuk', true, 'kepanitiaan_id', v_kepan_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION bentuk_kepanitiaan IS
  'Membentuk kepanitiaan+divisi+member+rab_meta+job_desk+gantt dari proker_rencana saat approval TERJADWAL. SECURITY DEFINER karena menembus policy berbasis keanggotaan pada momen bootstrap. Dipanggil dalam transaksi approval setelah setujui_proker (T-070).';
