-- 045_nota_perbaikan — pengunggah memperbaiki nota yang dikembalikan; alokasi
-- hanya diubah selama nota masih dapat disunting (T-101).
--
-- 1. nota_update (015b) mengizinkan pengunggah hanya selama
--    MENUNGGU_VERIFIKASI. PRD F-11.1: "Nota ditolak Bendahara → kembali ke
--    panitia dengan catatan, dapat diunggah ulang". Pengunggah kini boleh
--    menyunting notanya yang DITOLAK / PERLU_PERBAIKAN, dan hasilnya WAJIB
--    kembali MENUNGGU_VERIFIKASI (WITH CHECK) — ia tidak dapat memverifikasi
--    notanya sendiri.
-- 2. nota_alokasi_* (015b) memakai my_divisi_aktif(): SETIAP anggota divisi
--    dapat mengubah alokasi nota mana pun di divisinya, termasuk nota yang
--    sudah TERVERIFIKASI — angka realisasi berubah tanpa verifikasi ulang.
--    Kini: Admin/Bendum, atau pengunggah nota itu selama statusnya masih
--    dapat disunting. Koordinator/Ketua Pelaksana yang mengunggah juga
--    tercakup (sebelumnya hanya divisi_member).
-- Guard aplikasi: lib/nota/service.ts (buatNota, perbaikiNota).
--
-- Sumber: docs/ai/tasks/P7-nota-lpj.md T-101 · PRD F-11.1 · ADR-007

DROP POLICY IF EXISTS nota_update ON nota;
CREATE POLICY nota_update ON nota FOR UPDATE
  USING (has_role('ADMIN','BENDUM')
         OR (uploader_id = auth.uid()
             AND status IN ('MENUNGGU_VERIFIKASI','DITOLAK','PERLU_PERBAIKAN')))
  WITH CHECK (has_role('ADMIN','BENDUM')
              OR (uploader_id = auth.uid() AND status = 'MENUNGGU_VERIFIKASI'));

CREATE OR REPLACE FUNCTION public.alokasi_dapat_disunting(p_nota UUID) RETURNS BOOLEAN AS $$
  SELECT public.has_role('ADMIN','BENDUM')
      OR EXISTS (SELECT 1 FROM public.nota n
                  WHERE n.id = p_nota
                    AND n.uploader_id = auth.uid()
                    AND n.status IN ('MENUNGGU_VERIFIKASI','DITOLAK','PERLU_PERBAIKAN'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.alokasi_dapat_disunting(UUID) IS
  'Admin/Bendum, atau pengunggah nota selama nota belum terverifikasi (045, T-101).';

REVOKE ALL ON FUNCTION public.alokasi_dapat_disunting(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alokasi_dapat_disunting(UUID) TO authenticated;

DROP POLICY IF EXISTS nota_alokasi_insert ON nota_alokasi;
DROP POLICY IF EXISTS nota_alokasi_update ON nota_alokasi;
DROP POLICY IF EXISTS nota_alokasi_delete ON nota_alokasi;
CREATE POLICY nota_alokasi_insert ON nota_alokasi FOR INSERT
  WITH CHECK (public.alokasi_dapat_disunting(nota_id));
CREATE POLICY nota_alokasi_update ON nota_alokasi FOR UPDATE
  USING (public.alokasi_dapat_disunting(nota_id));
CREATE POLICY nota_alokasi_delete ON nota_alokasi FOR DELETE
  USING (public.alokasi_dapat_disunting(nota_id));
