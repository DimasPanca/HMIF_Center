-- Migrasi 033 — pencarian teks penuh arsip surat mencakup ISI surat.
--
-- Index `surat_search` (migrasi 009) hanya memuat perihal, nama tujuan, dan
-- nomor. PRD F-4.4 dan kontrak T-063 menuntut pencarian pada perihal, tujuan,
-- DAN isi. Isi surat tinggal di dua tempat:
--
--   isi_html      surat generik dan Aspirasi — HTML TipTap, tag dibuang
--   data_dinamis  surat bertemplate — mis. barang yang dipinjam, nama kegiatan
--
-- Kolom tergenerasi `cari` menyatukan ketiganya dengan bobot: perihal & nomor
-- (A) di atas tujuan (B) di atas isi (C), supaya peringkat `ts_rank` menaruh
-- surat yang PERIHAL-nya cocok di atas surat yang hanya menyebut kata itu di
-- isinya. `jsonb_to_tsvector(..., '["string"]')` hanya mengindeks NILAI teks
-- data_dinamis, bukan kuncinya — kata "tempat" atau "barang" tidak membuat
-- setiap surat kepanitiaan ikut cocok.
--
-- Konfigurasi 'indonesian' sama dengan 009: "meminjam" menemukan "Peminjaman".
-- Index lama dibuang karena seluruh isinya kini tercakup kolom baru.
--
-- Idempoten: IF NOT EXISTS / IF EXISTS.
--
-- Sumber: T-063 · PRD F-4.4 · migrasi 009

ALTER TABLE surat ADD COLUMN IF NOT EXISTS cari TSVECTOR GENERATED ALWAYS AS (
  setweight(to_tsvector('indonesian', coalesce(perihal, '') || ' ' || coalesce(nomor_lengkap, '')), 'A') ||
  setweight(to_tsvector('indonesian', coalesce(tujuan_nama, '') || ' ' || coalesce(tujuan_alamat, '')), 'B') ||
  setweight(
    to_tsvector('indonesian', regexp_replace(coalesce(isi_html, ''), '<[^>]*>', ' ', 'g')) ||
      jsonb_to_tsvector('indonesian', coalesce(data_dinamis, '{}'::JSONB), '["string"]'),
    'C'
  )
) STORED;

CREATE INDEX IF NOT EXISTS surat_cari ON surat USING gin (cari);
DROP INDEX IF EXISTS surat_search;

-- Arsip diurutkan tanggal surat terbaru lebih dulu, per periode (paginasi kursor T-063).
CREATE INDEX IF NOT EXISTS surat_arsip_urut ON surat (periode_id, tanggal_surat DESC, created_at DESC, id DESC);
