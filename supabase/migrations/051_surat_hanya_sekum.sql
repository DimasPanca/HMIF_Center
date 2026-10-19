-- 051_surat_hanya_sekum — lapis kedua ADR-036.
--
-- Surat resmi (seluruh jenis) disusun Sekretaris Umum; Admin tetap boleh untuk
-- pemeliharaan. Pengurus lain hanya mengajukan Surat Keterangan Aktif (kode 02)
-- atas nama dirinya sendiri — `dibuat_oleh` harus dirinya, dan baris itu
-- hanya boleh berkode 02. Pemohon selalu dapat membaca suratnya sendiri, walau
-- ia (mis. Anggota) tidak berhak membaca arsip surat.
--
-- Guard aplikasi memakai aturan yang sama: `surat.create` (ADMIN, SEKUM) dan
-- `surat.ajukan_aktif` (KETUA, WAKIL, SEKUM, BENDUM, KADEPT, ANGGOTA) di
-- lib/auth/permissions.ts. Idempoten: policy dihapus lalu dibuat ulang.
--
-- Sumber: docs/adr/ADR-036-surat-hanya-sekum-dan-sk-aktif-mandiri.md

DROP POLICY IF EXISTS surat_insert ON surat;
CREATE POLICY surat_insert ON surat FOR INSERT
  WITH CHECK (
    periode_id = periode_aktif()
    AND (
      has_role('ADMIN', 'SEKUM')
      OR (
        kode_surat = '02'
        AND dibuat_oleh = auth.uid()
        AND has_role('KETUA', 'WAKIL', 'BENDUM', 'KADEPT', 'ANGGOTA')
      )
    )
  );

DROP POLICY IF EXISTS surat_select ON surat;
CREATE POLICY surat_select ON surat FOR SELECT
  USING (
    has_role('ADMIN', 'KETUA', 'WAKIL', 'SEKUM', 'BENDUM', 'KADEPT', 'BPH')
    OR dibuat_oleh = auth.uid()
  );
