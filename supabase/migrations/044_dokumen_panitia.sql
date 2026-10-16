-- 044_dokumen_panitia — panitia acara boleh mencatat dokumen TOR/Proposal acaranya (T-095).
--
-- 015b: dokumen_insert hanya ADMIN/KETUA/WAKIL/SEKUM/BENDUM/KADEPT. TOR disusun
-- dan dibuat panitia acara (tor_insert/tor_update sudah memberi mereka hak
-- lewat my_kepanitiaan); tanpa ini koordinator yang menyusun TOR tidak dapat
-- mencatat hasil generate-nya sendiri. Dibatasi ke jenis TOR dan PROPOSAL
-- milik acara mereka — surat, LPJ, dan RAB tetap jalur semula.
-- Guard aplikasi (lib/tor/generate.ts → bisaTulisTor) memakai aturan yang sama.
--
-- Sumber: docs/ai/tasks/P6-tor-proposal.md T-095, T-096 · migrasi 009, 015b

DROP POLICY IF EXISTS dokumen_insert ON dokumen;
CREATE POLICY dokumen_insert ON dokumen FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM','KADEPT')
              OR (jenis IN ('TOR','PROPOSAL')
                  AND kepanitiaan_id = ANY(my_kepanitiaan())));
