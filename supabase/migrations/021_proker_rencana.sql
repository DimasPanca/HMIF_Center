-- 021_proker_rencana — rencana kepanitiaan & Gantt hasil submit wizard, MENUNGGU
-- materialisasi oleh approval (T-070).
--
-- ===========================================================================
-- KENAPA TABEL RENCANA, BUKAN LANGSUNG kepanitiaan/divisi/gantt
-- ===========================================================================
-- Wizard proker langkah 4-5 (T-069) mengumpulkan susunan kepanitiaan dan struktur
-- Gantt saat submit. Tetapi kontrak T-069 melarang membentuk `kepanitiaan`,
-- `divisi`, atau `divisi_member` pada tahap ini: entitas itu baru sah lahir saat
-- proker DISETUJUI (T-070). Membuatnya lebih awal menghasilkan kepanitiaan yatim
-- bila proker akhirnya ditolak.
--
-- Draft pengguna (`proker_draft`) tidak bisa dipakai sebagai tempatnya: kontrak
-- T-068 memerintahkan draft DIHAPUS setelah submit, sedangkan rencana ini justru
-- dibutuhkan LAGI oleh T-070 setelah submit — saat approval membentuk kepanitiaan.
--
-- Maka rencana hidup di tabel sendiri, terikat ke proker yang sudah lahir (bukan
-- ke draft yang sudah dihapus), sebagai JSONB. `bentukKepanitiaanOtomatis()`
-- (T-070) membacanya di dalam transaksi approval, membentuk kepanitiaan+divisi+
-- gantt sungguhan, lalu boleh menghapus baris ini. Ia TIDAK pernah mengunci
-- kalender dan tidak muncul di Master Gantt — persis seperti draft.
--
-- Sumber: docs/ai/tasks/P3-proker-gantt.md T-069, T-070 · ADR-056 · PRD F-8.1 ·
--         migrasi 005 (kepanitiaan), 006 (gantt) · K-09

CREATE TABLE proker_rencana (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Satu rencana per proker. Terikat ke proker (bukan draft): draft dihapus saat
  -- submit, proker menetap. CASCADE supaya membuang proker membuang rencananya.
  proker_id   UUID NOT NULL UNIQUE REFERENCES proker(id)   ON DELETE CASCADE,
  periode_id  UUID NOT NULL        REFERENCES periode(id)  ON DELETE CASCADE,

  -- Susunan kepanitiaan langkah 4: ketua/wakil/sekretaris/bendahara pelaksana
  -- (app_user id, bebas lintas departemen — PRD F-8.1) dan daftar divisi beserta
  -- koordinator + anggotanya. Bentuknya divalidasi lib/proker/wizard-state.ts
  -- sebelum ditulis; kolom ini hanya menyimpan.
  kepanitiaan JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Struktur Gantt tingkat proker langkah 5: daftar grup fase (Persiapan/
  -- Pelaksanaan/Evaluasi) dengan task di dalamnya. Dimaterialisasi menjadi
  -- gantt_chart(scope=PROKER)+gantt_group+gantt_task saat approval.
  gantt       JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX proker_rencana_periode ON proker_rencana (periode_id);

COMMENT ON TABLE proker_rencana IS
  'Rencana kepanitiaan & Gantt hasil submit wizard (JSONB). Bukan kepanitiaan sungguhan: dimaterialisasi oleh bentukKepanitiaanOtomatis() saat approval (T-070), lalu boleh dihapus. Tidak pernah mengunci kalender.';

-- ---------------------------------------------------------------------------
-- RLS — mengikuti proker
-- ---------------------------------------------------------------------------
--
-- Tabel lahir setelah loop ENABLE RLS di 015b, jadi diaktifkan eksplisit di sini.
-- Hak tabel untuk `authenticated` sudah otomatis dari ALTER DEFAULT PRIVILEGES
-- di 015c (tabel ini lahir sesudahnya).
--
-- BACA: sama dengan proker — dibaca seluruh pengurus (approval Ketua/Wakil harus
-- dapat melihat rencananya). TULIS: hanya yang mengelola departemen proker itu
-- (pembuatnya, lewat kelola_dept), pada periode aktif — cermin proker_insert.
-- HAPUS: pengelola departemen ATAU Ketua/Wakil/Admin (yang menuntaskan approval
-- lalu membersihkan rencana). is_pimpinan() sengaja TIDAK dipakai di sini karena
-- ia menyertakan BPH/Sekum/Bendum yang tidak berhak menulis (INV-03).

ALTER TABLE proker_rencana ENABLE ROW LEVEL SECURITY;

CREATE POLICY proker_rencana_select ON proker_rencana FOR SELECT
  USING (true);

CREATE POLICY proker_rencana_insert ON proker_rencana FOR INSERT
  WITH CHECK (
    periode_id = periode_aktif()
    AND EXISTS (
      SELECT 1 FROM proker p
      WHERE p.id = proker_id AND kelola_dept(p.departemen_id)
    )
  );

CREATE POLICY proker_rencana_update ON proker_rencana FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM proker p
      WHERE p.id = proker_id AND kelola_dept(p.departemen_id)
    )
  );

CREATE POLICY proker_rencana_delete ON proker_rencana FOR DELETE
  USING (
    has_role('ADMIN', 'KETUA', 'WAKIL')
    OR EXISTS (
      SELECT 1 FROM proker p
      WHERE p.id = proker_id AND kelola_dept(p.departemen_id)
    )
  );

-- ---------------------------------------------------------------------------
-- STEMPEL updated_at
-- ---------------------------------------------------------------------------
-- Loop di 017 memasang trg_updated_at hanya pada tabel yang ada saat itu; tabel
-- yang lahir sesudahnya memasangnya sendiri. fn_set_updated_at() sudah ada
-- sejak 017. Tanpa ini, updated_at tidak pernah bergerak — dan test 017
-- menangkapnya.
CREATE OR REPLACE TRIGGER trg_updated_at_proker_rencana
  BEFORE UPDATE ON proker_rencana
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
