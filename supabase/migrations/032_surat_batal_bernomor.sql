-- Migrasi 032 — alasan pembatalan wajib hanya untuk surat yang sudah bernomor.
--
-- CHECK surat_batal_wajib_alasan (migrasi 030) menuntut alasan untuk SETIAP
-- surat DIBATALKAN. Yang perlu dijelaskan di arsip adalah surat resmi — yang
-- sudah memperoleh nomor dan mungkin sudah beredar. Draft tanpa nomor yang
-- dibatalkan tidak meninggalkan jejak resmi apa pun, dan bentuk lama mematahkan
-- skenario "draft dibatalkan tidak menghabiskan nomor" di test 020, 900, dan
-- scripts/stress-nomor-surat.ts (T-057).
--
-- Idempoten: constraint dibuat ulang.
--
-- Sumber: T-060 · migrasi 030 · INV-16

ALTER TABLE surat DROP CONSTRAINT IF EXISTS surat_batal_wajib_alasan;
ALTER TABLE surat ADD CONSTRAINT surat_batal_wajib_alasan CHECK (
  status <> 'DIBATALKAN'
  OR nomor_urut IS NULL
  OR (alasan_pembatalan IS NOT NULL AND dibatalkan_at IS NOT NULL)
);
