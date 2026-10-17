-- 048_restore_job — jejak & progres restore (T-112).
--
-- Restore berjalan bertahap (PRA_RESTORE → VERIFIKASI → TERAPKAN) dan dapat
-- melampaui batas satu fungsi serverless, jadi keadaannya harus tersimpan:
-- tahap yang sedang berjalan, progres untuk UI, dan LAPORAN bagian mana yang
-- sudah terpakai bila gagal di tengah (kontrak 6).
--
-- Tidak termasuk modul backup mana pun (lib/backup/export-modul.ts
-- TABEL_DIKECUALIKAN) — restore tidak boleh menimpa riwayat restore-nya
-- sendiri. `dibuat_oleh` sengaja TANPA foreign key: restore penuh mengganti
-- app_user, dan jejak siapa yang memulihkan harus tetap utuh apa pun isinya.
--
-- Sumber: docs/ai/tasks/P9-rilis.md T-112 · PRD F-16.3 · SYSTEM_DESIGN §15.3

CREATE TABLE IF NOT EXISTS restore_job (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  backup_id      UUID NOT NULL REFERENCES backup(id),
  mode           TEXT NOT NULL CHECK (mode IN ('PENUH', 'MODUL')),
  modul          TEXT[] NOT NULL DEFAULT '{}',
  strategi       TEXT CHECK (strategi IN ('TAMBAH', 'TIMPA', 'GABUNG')),
  status         backup_status NOT NULL DEFAULT 'BERJALAN',
  tahap          TEXT NOT NULL DEFAULT 'PRA_RESTORE'
                 CHECK (tahap IN ('PRA_RESTORE', 'VERIFIKASI', 'TERAPKAN', 'SELESAI')),
  pra_restore_id UUID REFERENCES backup(id),
  progres        JSONB NOT NULL DEFAULT '{}',
  laporan        JSONB NOT NULL DEFAULT '{}',
  error_message  TEXT,
  dibuat_oleh    UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,

  CONSTRAINT restore_modul_wajib_strategi CHECK (mode = 'PENUH' OR (strategi IS NOT NULL AND cardinality(modul) > 0)),
  CONSTRAINT restore_gagal_wajib_pesan CHECK (status <> 'GAGAL' OR error_message IS NOT NULL),
  CONSTRAINT restore_selesai_wajib_waktu CHECK (status = 'BERJALAN' OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS restore_job_waktu ON restore_job (created_at DESC);
-- Satu restore pada satu waktu.
CREATE UNIQUE INDEX IF NOT EXISTS restore_job_satu_berjalan ON restore_job ((true)) WHERE status = 'BERJALAN';

ALTER TABLE restore_job ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON restore_job TO authenticated;

DROP POLICY IF EXISTS restore_job_select ON restore_job;
CREATE POLICY restore_job_select ON restore_job FOR SELECT USING (has_role('ADMIN', 'KETUA', 'BPH'));
DROP POLICY IF EXISTS restore_job_insert ON restore_job;
CREATE POLICY restore_job_insert ON restore_job FOR INSERT WITH CHECK (has_role('ADMIN'));
DROP POLICY IF EXISTS restore_job_update ON restore_job;
CREATE POLICY restore_job_update ON restore_job FOR UPDATE USING (has_role('ADMIN'));
