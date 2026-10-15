-- Migrasi 035 — kendala departemen siap dipakai (T-082).
--
-- Migrasi 010 membuat tabel dasar `kendala` & `kendala_reply`, tetapi kontrak
-- T-082 dan INV-08 menuntut empat hal yang belum ada:
--
--   1. periode_id — semua data ber-scope periode (INV-08). Tanpa ini kendala
--      periode lalu tercampur dengan periode berjalan di setiap daftar.
--      Baris lama (bila ada) diisi dari proker terkait, lalu periode AKTIF.
--   2. Pencarian teks penuh arsip kendala ("dapat dicari untuk referensi
--      periode berikutnya", USER_FLOW §8.2): judul (A), deskripsi (B),
--      catatan penyelesaian (C) — yang terakhir justru paling berharga di
--      arsip.
--   3. Lampiran (PRD F-7.3) — berkas di bucket PRIVAT `kendala/{id}/…`.
--   4. Publikasi realtime: kendala KRITIS muncul di dashboard Ketua/Wakil/BPH
--      < 3 detik. Realtime menghormati RLS `kendala_select`.
--
-- Idempoten: IF NOT EXISTS / DO-block.
--
-- Sumber: T-082 · PRD F-7.3 · USER_FLOW §8.2 · INV-08 · migrasi 010, 020

-- 1. periode_id -------------------------------------------------------------
ALTER TABLE kendala ADD COLUMN IF NOT EXISTS periode_id UUID REFERENCES periode(id) ON DELETE CASCADE;

UPDATE kendala k SET periode_id = p.periode_id
FROM proker p
WHERE k.periode_id IS NULL AND k.proker_id = p.id;

UPDATE kendala SET periode_id = (SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1)
WHERE periode_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kendala WHERE periode_id IS NULL) THEN
    ALTER TABLE kendala ALTER COLUMN periode_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS kendala_periode_dept ON kendala (periode_id, departemen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kendala_kritis_terbuka ON kendala (periode_id, created_at DESC)
  WHERE prioritas = 'KRITIS' AND status <> 'SELESAI';
CREATE INDEX IF NOT EXISTS kendala_reply_utas ON kendala_reply (kendala_id, created_at);

-- Waktu perubahan terakhir — urutan "aktivitas terbaru" dan penanda di daftar.
ALTER TABLE kendala ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Pencarian teks penuh ---------------------------------------------------
ALTER TABLE kendala ADD COLUMN IF NOT EXISTS cari TSVECTOR GENERATED ALWAYS AS (
  setweight(to_tsvector('indonesian', coalesce(judul, '')), 'A') ||
  setweight(to_tsvector('indonesian', coalesce(deskripsi, '')), 'B') ||
  setweight(to_tsvector('indonesian', coalesce(catatan_penyelesaian, '')), 'C')
) STORED;
CREATE INDEX IF NOT EXISTS kendala_cari ON kendala USING gin (cari);

-- 3. Lampiran -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kendala_lampiran (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kendala_id    UUID NOT NULL REFERENCES kendala(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL UNIQUE,
  nama_berkas   TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  ukuran        BIGINT NOT NULL CHECK (ukuran > 0),
  diunggah_oleh UUID NOT NULL REFERENCES app_user(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Hanya bucket privat dengan prefix kendala/ (lib/storage/keys.ts).
  CONSTRAINT kendala_lampiran_key_privat CHECK (storage_key LIKE 'kendala/%')
);
CREATE INDEX IF NOT EXISTS kendala_lampiran_kendala ON kendala_lampiran (kendala_id);

ALTER TABLE kendala_lampiran ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON kendala_lampiran TO authenticated;

DROP POLICY IF EXISTS kendala_lampiran_select ON kendala_lampiran;
CREATE POLICY kendala_lampiran_select ON kendala_lampiran FOR SELECT USING (true);
DROP POLICY IF EXISTS kendala_lampiran_insert ON kendala_lampiran;
CREATE POLICY kendala_lampiran_insert ON kendala_lampiran FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA') AND diunggah_oleh = auth.uid());
DROP POLICY IF EXISTS kendala_lampiran_delete ON kendala_lampiran;
CREATE POLICY kendala_lampiran_delete ON kendala_lampiran FOR DELETE
  USING (diunggah_oleh = auth.uid() OR has_role('ADMIN'));

-- 4. Realtime -----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kendala'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kendala;
  END IF;
END $$;
