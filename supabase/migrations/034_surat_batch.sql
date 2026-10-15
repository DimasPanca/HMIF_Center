-- Migrasi 034 — pengelompokan surat generate massal (T-064).
--
-- Surat Keterangan Aktif massal dibuat dan disetujui sebagai SATU batch:
-- nomornya dialokasikan bersama lewat `alokasi_nomor_batch` dalam satu
-- transaksi supaya berurutan tanpa disela (INV-15). Kolom ini yang mengikat
-- surat-surat itu menjadi satu batch.
--
-- Bukan tabel `surat_batch` tersendiri: batch tidak punya status atau
-- atribut sendiri — keadaannya adalah keadaan surat-suratnya — dan tabel baru
-- berarti RLS, audit, dan pembersihan tambahan untuk satu kolom UUID.
--
-- Idempoten: IF NOT EXISTS.
--
-- Sumber: T-064 · PRD F-4.2 · USER_FLOW §5.3 · INV-15

ALTER TABLE surat ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS surat_batch ON surat (batch_id, created_at) WHERE batch_id IS NOT NULL;
