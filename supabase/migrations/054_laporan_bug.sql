-- 054_laporan_bug — Lapor bug (ADR-060 §5).
--
-- Laporan tingkat sistem (bukan data organisasi), jadi sengaja tidak terikat periode:
-- bug yang dilaporkan di periode lama tetap harus terlihat Admin.
-- Pelapor melihat laporannya sendiri; Admin melihat semua dan mengubah status.
-- Ditulis lewat server (Prisma) di dalam withAuditContext; RLS di bawah adalah lapis kedua.

CREATE TABLE IF NOT EXISTS laporan_bug (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pelapor_id     UUID NOT NULL REFERENCES app_user(id),
  deskripsi      TEXT NOT NULL CHECK (length(trim(deskripsi)) BETWEEN 10 AND 5000),
  halaman        TEXT CHECK (halaman IS NULL OR length(halaman) <= 500),
  peramban       TEXT CHECK (peramban IS NULL OR length(peramban) <= 500),
  lampiran_key   TEXT CHECK (lampiran_key IS NULL OR lampiran_key ~ '^laporan-bug/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  lampiran_mime  TEXT CHECK (lampiran_mime IS NULL OR lampiran_mime IN ('image/jpeg','image/png','image/webp')),
  status         TEXT NOT NULL DEFAULT 'BARU' CHECK (status IN ('BARU','DITANGANI','SELESAI','DITOLAK')),
  catatan_admin  TEXT NOT NULL DEFAULT '' CHECK (length(catatan_admin) <= 2000),
  ditangani_oleh UUID REFERENCES app_user(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT laporan_bug_lampiran_lengkap CHECK ((lampiran_key IS NULL) = (lampiran_mime IS NULL))
);
CREATE INDEX IF NOT EXISTS laporan_bug_status ON laporan_bug (status, created_at DESC);
CREATE INDEX IF NOT EXISTS laporan_bug_pelapor ON laporan_bug (pelapor_id, created_at DESC);

CREATE OR REPLACE TRIGGER trg_updated_at_laporan_bug BEFORE UPDATE ON laporan_bug
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE OR REPLACE TRIGGER trg_audit_laporan_bug AFTER INSERT OR UPDATE OR DELETE ON laporan_bug
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

ALTER TABLE laporan_bug ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON laporan_bug TO authenticated;

DROP POLICY IF EXISTS laporan_bug_select ON laporan_bug;
CREATE POLICY laporan_bug_select ON laporan_bug FOR SELECT
  USING (pelapor_id = auth.uid() OR has_role('ADMIN'));
DROP POLICY IF EXISTS laporan_bug_insert ON laporan_bug;
CREATE POLICY laporan_bug_insert ON laporan_bug FOR INSERT
  WITH CHECK (pelapor_id = auth.uid() AND status = 'BARU' AND ditangani_oleh IS NULL AND catatan_admin = '');
DROP POLICY IF EXISTS laporan_bug_update ON laporan_bug;
CREATE POLICY laporan_bug_update ON laporan_bug FOR UPDATE
  USING (has_role('ADMIN')) WITH CHECK (has_role('ADMIN'));
