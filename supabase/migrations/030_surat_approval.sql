-- Migrasi 030 — kolom alur approval surat (T-060).
--
-- `diajukan_at`: urutan antrian approval. `updated_at` tidak cukup — auto-save
-- draft menyentuhnya tiap 10 detik, dan setelah ditolak lalu diperbaiki surat
-- yang lama diajukan akan melompat ke depan antrian.
--
-- `alasan_pembatalan`, `dibatalkan_oleh`, `dibatalkan_at`: surat TERBIT yang
-- dibatalkan tetap tersimpan bernomor (INV-16), dan alasannya harus terbaca di
-- arsip, bukan hanya terkubur di nilai_baru audit_log.
--
-- Idempoten: ADD COLUMN IF NOT EXISTS dan constraint dibuat ulang.
--
-- Sumber: docs/ai/tasks/P2-persuratan.md T-060 · PRD F-4.3 · USER_FLOW §11.2

ALTER TABLE surat ADD COLUMN IF NOT EXISTS diajukan_at       TIMESTAMPTZ;
ALTER TABLE surat ADD COLUMN IF NOT EXISTS alasan_pembatalan TEXT;
ALTER TABLE surat ADD COLUMN IF NOT EXISTS dibatalkan_oleh   UUID REFERENCES app_user(id);
ALTER TABLE surat ADD COLUMN IF NOT EXISTS dibatalkan_at     TIMESTAMPTZ;

-- Pembatalan wajib beralasan, seperti penolakan (surat_tolak_wajib_alasan, 009).
ALTER TABLE surat DROP CONSTRAINT IF EXISTS surat_batal_wajib_alasan;
ALTER TABLE surat ADD CONSTRAINT surat_batal_wajib_alasan CHECK (
  status <> 'DIBATALKAN' OR (alasan_pembatalan IS NOT NULL AND dibatalkan_at IS NOT NULL)
);

-- Surat yang menunggu approval harus tahu kapan diajukan.
ALTER TABLE surat DROP CONSTRAINT IF EXISTS surat_menunggu_wajib_diajukan;
ALTER TABLE surat ADD CONSTRAINT surat_menunggu_wajib_diajukan CHECK (
  status <> 'MENUNGGU_APPROVAL' OR diajukan_at IS NOT NULL
);

CREATE INDEX IF NOT EXISTS surat_antrian ON surat (periode_id, diajukan_at)
  WHERE status = 'MENUNGGU_APPROVAL';
