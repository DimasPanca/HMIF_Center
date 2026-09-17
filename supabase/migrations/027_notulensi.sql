-- 027_notulensi — T-106 (fondasi data): pencarian isi, lampiran, departemen
-- tujuan action item, dan perbaikan lingkup RLS.
--
-- ==========================================================================
-- EMPAT LUBANG YANG DITUTUP (dari kontrak T-106 · PRD M13 · USER_FLOW §9.2)
-- ==========================================================================
-- 1) PENCARIAN ISI. Index lama hanya judul+tempat (011). Kontrak mewajibkan
--    pencarian berdasarkan ISI. Konten TipTap adalah JSONB; teksnya diekstrak
--    service ke `konten_teks`, lalu kolom tsvector STORED menggabungnya dengan
--    judul & tempat sehingga selalu sinkron tanpa trigger.
-- 2) LAMPIRAN. Tabel notulensi belum punya relasi lampiran → tabel baru
--    `notulensi_lampiran` (berkas nyata di storage; baris ini metadatanya).
-- 3) DEPARTEMEN TUJUAN ACTION ITEM. Notulensi tingkat himpunan ber-departemen
--    NULL; departemen kartu Kanban TIDAK boleh ditebak dari PIC (bisa
--    multi-role). Kolom `action_item.departemen_id` meresmikan tujuannya.
-- 4) LINGKUP RLS. `notulensi_attendance` & `action_item` memakai role GLOBAL,
--    jadi KADEPT departemen A bisa menyunting kehadiran/aksi notulensi
--    departemen B. Mutasi wajib diturunkan dari notulensi INDUK (departemen +
--    periode aktif) lewat `notulensi_boleh_tulis`. BPH tetap baca saja (INV-03).
--
-- Migrasi lama tetap utuh. Sumber: docs/ai/tasks/P8-kesekretariatan.md T-106 ·
--   PRD M13 · PRD §5.1 (Notulensi) · INV-03, INV-08 · docs/ai/NOTULENSI_CONTRACT.md

-- ---------------------------------------------------------------------------
-- 1. PENCARIAN ISI
-- ---------------------------------------------------------------------------
-- Teks datar hasil ekstraksi konten + keputusan (diisi service saat simpan).
ALTER TABLE notulensi ADD COLUMN konten_teks TEXT;

-- tsvector STORED: judul + tempat + isi. Selalu ikut berubah bersama kolomnya.
ALTER TABLE notulensi ADD COLUMN cari_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('indonesian',
      coalesce(judul, '') || ' ' || coalesce(tempat, '') || ' ' || coalesce(konten_teks, ''))
  ) STORED;

DROP INDEX notulensi_search;   -- lama: hanya judul+tempat
CREATE INDEX notulensi_search ON notulensi USING gin (cari_tsv);

-- ---------------------------------------------------------------------------
-- 2. LAMPIRAN
-- ---------------------------------------------------------------------------
CREATE TABLE notulensi_lampiran (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notulensi_id  UUID NOT NULL REFERENCES notulensi(id) ON DELETE CASCADE,
  nama_berkas   TEXT NOT NULL,
  storage_key   TEXT NOT NULL,     -- kunci objek di storage privat
  mime          TEXT,
  ukuran        INTEGER,
  diunggah_oleh UUID REFERENCES app_user(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notulensi_lampiran_nama_ada CHECK (length(btrim(nama_berkas)) > 0)
);
CREATE INDEX notulensi_lampiran_notulensi ON notulensi_lampiran (notulensi_id);

-- ---------------------------------------------------------------------------
-- 3. DEPARTEMEN TUJUAN ACTION ITEM
-- ---------------------------------------------------------------------------
-- Tujuan kartu Kanban saat action item dikonversi. Untuk notulensi departemen
-- default = departemennya; untuk notulensi himpunan WAJIB diisi eksplisit
-- (ditegakkan service). NULL selama belum ditentukan.
ALTER TABLE action_item ADD COLUMN departemen_id UUID REFERENCES departemen(id);

-- ---------------------------------------------------------------------------
-- 4. LINGKUP RLS — diturunkan dari notulensi induk
-- ---------------------------------------------------------------------------
-- Hak TULIS notulensi (dan sub-elemennya): ADMIN/KETUA/WAKIL/SEKUM lintas
-- organisasi; KADEPT hanya departemennya (role & departemen pada BARIS user_role
-- yang sama, bukan gabungan). Wajib periode aktif & pengguna aktif. BPH/BENDUM/
-- ANGGOTA tidak menulis (PRD §5.1). Mengikuti matriks Notulensi CRU(D).
CREATE OR REPLACE FUNCTION notulensi_boleh_tulis(p_dept UUID) RETURNS BOOLEAN AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND periode_aktif() IS NOT NULL
    AND EXISTS (SELECT 1 FROM app_user WHERE id = auth.uid() AND is_active)
    AND (
      has_role('ADMIN', 'KETUA', 'WAKIL', 'SEKUM')
      OR (p_dept IS NOT NULL AND EXISTS (
        SELECT 1 FROM user_role ur
        WHERE ur.user_id = auth.uid() AND ur.periode_id = periode_aktif()
          AND ur.role = 'KADEPT' AND ur.departemen_id = p_dept))
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION notulensi_boleh_tulis(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notulensi_boleh_tulis(UUID) TO authenticated;

COMMENT ON FUNCTION notulensi_boleh_tulis(UUID) IS
  'Izin tulis notulensi: pimpinan/Sekum lintas-organisasi, KADEPT departemennya, periode aktif. BPH tidak menambah hak.';

-- notulensi: tambah syarat periode aktif dan pakai helper. SELECT tetap org-wide.
DROP POLICY notulensi_insert ON notulensi;
DROP POLICY notulensi_update ON notulensi;
DROP POLICY notulensi_delete ON notulensi;
CREATE POLICY notulensi_insert ON notulensi FOR INSERT TO authenticated
  WITH CHECK (periode_id = periode_aktif() AND notulensi_boleh_tulis(departemen_id));
CREATE POLICY notulensi_update ON notulensi FOR UPDATE TO authenticated
  USING (periode_id = periode_aktif() AND notulensi_boleh_tulis(departemen_id))
  WITH CHECK (periode_id = periode_aktif() AND notulensi_boleh_tulis(departemen_id));
-- Ketua/Wakil tidak menghapus (matriks CRU). Hapus = ADMIN/SEKUM, atau KADEPT
-- departemennya.
CREATE POLICY notulensi_delete ON notulensi FOR DELETE TO authenticated
  USING (periode_id = periode_aktif()
         AND (has_role('ADMIN', 'SEKUM')
              OR (departemen_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM user_role ur
                    WHERE ur.user_id = auth.uid() AND ur.periode_id = periode_aktif()
                      AND ur.role = 'KADEPT' AND ur.departemen_id = departemen_id))));

-- attendance/action_item/lampiran: menulis = hak tulis notulensi INDUK. Menyunting
-- sub-elemen adalah bagian dari menyunting notulensi (termasuk Ketua/Wakil yang
-- ber-Update); penghapusan sub-baris pun demikian, bukan penghapusan notulensi.
DROP POLICY notulensi_attendance_insert ON notulensi_attendance;
DROP POLICY notulensi_attendance_update ON notulensi_attendance;
DROP POLICY notulensi_attendance_delete ON notulensi_attendance;
CREATE POLICY notulensi_attendance_insert ON notulensi_attendance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                        AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)));
CREATE POLICY notulensi_attendance_update ON notulensi_attendance FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                   AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                        AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)));
CREATE POLICY notulensi_attendance_delete ON notulensi_attendance FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                   AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)));

DROP POLICY action_item_insert ON action_item;
DROP POLICY action_item_update ON action_item;
DROP POLICY action_item_delete ON action_item;
CREATE POLICY action_item_insert ON action_item FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                        AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)));
CREATE POLICY action_item_update ON action_item FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                   AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                        AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)));
CREATE POLICY action_item_delete ON action_item FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                   AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)));

ALTER TABLE notulensi_lampiran ENABLE ROW LEVEL SECURITY;
CREATE POLICY notulensi_lampiran_select ON notulensi_lampiran FOR SELECT USING (true);
CREATE POLICY notulensi_lampiran_insert ON notulensi_lampiran FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                        AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)));
CREATE POLICY notulensi_lampiran_delete ON notulensi_lampiran FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM notulensi n WHERE n.id = notulensi_id
                   AND n.periode_id = periode_aktif() AND notulensi_boleh_tulis(n.departemen_id)));

COMMENT ON TABLE notulensi_lampiran IS
  'Lampiran berkas notulensi (T-106). Berkas di storage; baris ini metadata + kunci objek.';
