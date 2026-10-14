-- Migrasi 029 — surat berform generik boleh tanpa template.
--
-- Empat kode surat (01 Pengajuan, 06 Peringatan, 07 Keputusan, 09 Piagam)
-- memakai form generik dan TIDAK punya baris surat_template (seed 018 butir 1,
-- SEED_DATA §3). Kolom surat.template_id bersifat NOT NULL sejak 009, sehingga
-- draft surat jenis itu tidak dapat disimpan sama sekali — PRD F-4.2 menuntut
-- kesembilan kode dapat dibuat.
--
-- template_id kini boleh NULL, tetapi HANYA untuk keempat kode itu. Tujuh varian
-- bertemplate tetap wajib merujuk template, karena generator (T-061) memuat
-- berkas versi persis yang dipakai saat surat terbit (ADR-027).
--
-- Idempoten: DROP NOT NULL pada kolom yang sudah nullable tidak berbuat apa-apa,
-- dan constraint dibuat ulang lewat DROP ... IF EXISTS.
--
-- Sumber: ADR-028 · docs/ai/tasks/P2-persuratan.md T-058 · PRD F-4.1, F-4.2

ALTER TABLE surat ALTER COLUMN template_id DROP NOT NULL;

ALTER TABLE surat DROP CONSTRAINT IF EXISTS surat_template_wajib_kecuali_generik;
ALTER TABLE surat ADD CONSTRAINT surat_template_wajib_kecuali_generik CHECK (
  template_id IS NOT NULL OR kode_surat IN ('01', '06', '07', '09')
);

COMMENT ON COLUMN surat.template_id IS
  'Versi template yang dipakai surat ini. NULL hanya untuk kode generik 01/06/07/09 (ADR-028).';
