-- Migrasi 031 — diajukan_at diisi otomatis, bukan diwajibkan lewat CHECK.
--
-- Migrasi 030 menambah CHECK surat_menunggu_wajib_diajukan. Tujuannya benar
-- (antrian approval harus dapat diurutkan menurut waktu pengajuan), tetapi
-- bentuknya mematahkan setiap penulis yang memindahkan surat ke
-- MENUNGGU_APPROVAL tanpa tahu kolom baru itu: tujuh berkas test SQL dan
-- scripts/stress-nomor-surat.ts gagal sesudahnya.
--
-- Trigger mencapai jaminan yang sama tanpa menuntut semua penulis berubah:
-- setiap kali surat MASUK ke MENUNGGU_APPROVAL dengan diajukan_at kosong, kolom
-- itu diisi now(). Pengajuan ulang setelah ditolak tetap mendapat waktu baru
-- karena service T-060 mengisinya eksplisit.
--
-- Idempoten: DROP ... IF EXISTS dan CREATE OR REPLACE.
--
-- Sumber: T-060 · migrasi 030

ALTER TABLE surat DROP CONSTRAINT IF EXISTS surat_menunggu_wajib_diajukan;

CREATE OR REPLACE FUNCTION fn_surat_diajukan_otomatis() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'MENUNGGU_APPROVAL' AND NEW.diajukan_at IS NULL THEN
    NEW.diajukan_at := now();
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_surat_diajukan_otomatis ON surat;
CREATE TRIGGER trg_surat_diajukan_otomatis
  BEFORE INSERT OR UPDATE OF status ON surat
  FOR EACH ROW EXECUTE FUNCTION fn_surat_diajukan_otomatis();
