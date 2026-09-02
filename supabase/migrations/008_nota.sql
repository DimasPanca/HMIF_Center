-- 008_nota — gambar, nota belanja, dan alokasinya ke item RAB.
--
-- Dua keputusan menyimpang dari SYSTEM_DESIGN §4.7 dan keduanya penting:
--   ADR-006  rab_item_id menjadi NULLABLE + kolom uraian_luar_rab
--   ADR-007  trigger hanya menjaga batas ATAS, kesamaan divalidasi di service
--
-- Sumber: SYSTEM_DESIGN §4.7 · PRD F-11.1, F-11.2 · ADR-006, ADR-007, ADR-011

-- ---------------------------------------------------------------------------
-- GAMBAR — tiga turunan dari satu unggahan
-- ---------------------------------------------------------------------------

CREATE TABLE image (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploader_id       UUID NOT NULL REFERENCES app_user(id),

  -- Nama asli dari perangkat user, mis. IMG_20260901_153021.jpg.
  -- Dipakai HANYA sebagai nama berkas saat diunduh; nama penyimpanannya UUID.
  original_filename TEXT NOT NULL,

  -- Nama internal di storage. UUID, bukan nama dari user (INV-21): nama dari
  -- user bisa memuat path traversal, karakter yang merusak, atau membocorkan
  -- informasi lewat namanya sendiri.
  storage_uuid      TEXT NOT NULL UNIQUE,

  -- Ketiganya di bucket PRIVAT (ADR-011), menyimpang dari SYSTEM_DESIGN §12.2
  -- yang menaruh preview dan thumbnail di bucket publik. Nota memuat data
  -- keuangan organisasi; preview-nya tidak boleh dapat dibaca siapa pun yang
  -- menebak URL, termasuk setelah pengurusnya tidak lagi menjabat.
  master_path       TEXT NOT NULL,
  preview_path      TEXT NOT NULL,
  thumbnail_path    TEXT NOT NULL,
  original_path     TEXT,

  original_mime_type TEXT NOT NULL,
  master_mime_type   TEXT NOT NULL,

  original_width    INTEGER NOT NULL,
  original_height   INTEGER NOT NULL,
  master_width      INTEGER NOT NULL,
  master_height     INTEGER NOT NULL,
  master_file_size  BIGINT  NOT NULL,

  -- Menentukan kualitas kompresi master: DOKUMEN 93, FOTO 90 (PRD F-11.2 I9).
  kind              image_kind NOT NULL DEFAULT 'FOTO',
  is_scanned        BOOLEAN NOT NULL DEFAULT false,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Master yang korup terdeteksi di sini, bukan saat LPJ dicetak berbulan-bulan
  -- kemudian (PRD F-11.2 I10).
  CONSTRAINT master_valid CHECK (
    master_width > 0 AND master_height > 0 AND master_file_size > 0
  ),
  CONSTRAINT original_valid CHECK (
    original_width > 0 AND original_height > 0
  ),

  -- Turunan tidak pernah diperbesar dari sumbernya (INV-22).
  CONSTRAINT master_tidak_upscale CHECK (
    master_width <= original_width AND master_height <= original_height
  )
);

CREATE INDEX image_uploader ON image (uploader_id, created_at DESC);

COMMENT ON COLUMN image.master_path IS
  'SATU-SATUNYA berkas yang boleh dikirim saat unduh. Tidak pernah preview/thumbnail, tanpa rekompresi (INV-19).';

-- ---------------------------------------------------------------------------
-- NOTA BELANJA
-- ---------------------------------------------------------------------------

CREATE TABLE nota (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  divisi_id        UUID NOT NULL REFERENCES divisi(id) ON DELETE CASCADE,
  image_id         UUID NOT NULL REFERENCES image(id),
  uploader_id      UUID NOT NULL REFERENCES app_user(id),

  tanggal_belanja  DATE NOT NULL,
  total_nota       NUMERIC(15,2) NOT NULL,
  keterangan       TEXT,

  status           nota_status NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
  verified_by      UUID REFERENCES app_user(id),
  verified_at      TIMESTAMPTZ,
  alasan_penolakan TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nota_total_positif CHECK (total_nota > 0),

  -- Penolakan wajib beralasan (PRD F-11.4). Tanpa ini, panitia menerima nota
  -- kembali tanpa tahu apa yang harus diperbaiki.
  CONSTRAINT nota_tolak_wajib_alasan CHECK (
    status <> 'DITOLAK' OR alasan_penolakan IS NOT NULL
  )
);

CREATE INDEX nota_divisi_status ON nota (divisi_id, status);
CREATE INDEX nota_antrian_verifikasi ON nota (created_at)
  WHERE status = 'MENUNGGU_VERIFIKASI';

-- ---------------------------------------------------------------------------
-- ALOKASI — satu nota dapat mencakup beberapa item RAB
-- ---------------------------------------------------------------------------
-- Contoh nyata: struk Indomaret Rp75.000 dipecah menjadi Snack Rp50.000 dan
-- Galon Rp25.000 (PRD F-11.1).

CREATE TABLE nota_alokasi (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nota_id         UUID NOT NULL REFERENCES nota(id) ON DELETE CASCADE,

  -- ==========================================================================
  -- NULLABLE — ini perubahan ADR-006, bukan kelalaian.
  --
  -- SYSTEM_DESIGN §4.7 menetapkannya NOT NULL. Tetapi PRD F-12.2 mewajibkan LPJ
  -- melaporkan "pengeluaran di luar rencana", dan fungsi analisisLpj memfilter
  -- alokasi yang TIDAK punya rab_item_id. Dengan NOT NULL, filter itu selalu
  -- mengembalikan array kosong dan fiturnya tidak akan pernah berfungsi.
  -- ==========================================================================
  rab_item_id     UUID REFERENCES rab_item(id),

  -- Terisi ketika pengeluaran memang di luar RAB. Wajib ada penjelasannya:
  -- pengeluaran tak terencana tanpa uraian tidak dapat dipertanggungjawabkan.
  uraian_luar_rab TEXT,

  jumlah_aktual   NUMERIC(12,2),
  harga_aktual    NUMERIC(15,2),

  -- Porsi nota yang dialokasikan ke baris ini.
  nominal         NUMERIC(15,2) NOT NULL,

  CONSTRAINT nota_alokasi_target_wajib CHECK (
    rab_item_id IS NOT NULL OR uraian_luar_rab IS NOT NULL
  ),
  CONSTRAINT nota_alokasi_nominal_positif CHECK (nominal > 0)
);

-- UNIQUE PARSIAL, bukan UNIQUE biasa (ADR-006).
-- Satu item RAB hanya boleh muncul sekali dalam satu nota, tetapi baris
-- luar-RAB (rab_item_id NULL) boleh berjumlah berapa pun dalam nota yang sama.
CREATE UNIQUE INDEX nota_alokasi_item_unik
  ON nota_alokasi (nota_id, rab_item_id)
  WHERE rab_item_id IS NOT NULL;

CREATE INDEX nota_alokasi_item ON nota_alokasi (rab_item_id)
  WHERE rab_item_id IS NOT NULL;
CREATE INDEX nota_alokasi_nota ON nota_alokasi (nota_id);

-- ---------------------------------------------------------------------------
-- TRIGGER — batas ATAS alokasi
-- ---------------------------------------------------------------------------
--
-- Pembagian tanggung jawab sesuai ADR-007:
--
--   TRIGGER (di sini)  total alokasi tidak boleh MELEBIHI total nota.
--                      Berlaku setiap saat.
--   SERVICE (T-101)    total alokasi harus PERSIS SAMA dengan total nota.
--                      Diperiksa saat submit dan saat verifikasi.
--
-- Kenapa kesamaan tidak ditegakkan di trigger: alokasi dimasukkan bertahap satu
-- per satu, sehingga baris pertama akan selalu melanggar syarat "harus sama
-- dengan total" dan sistem menjadi tidak bisa dipakai sama sekali.

CREATE OR REPLACE FUNCTION cek_total_alokasi() RETURNS TRIGGER AS $$
DECLARE
  v_nota_id    UUID;
  v_total_nota NUMERIC(15,2);
  v_total_alok NUMERIC(15,2);
BEGIN
  v_nota_id := COALESCE(NEW.nota_id, OLD.nota_id);

  SELECT total_nota INTO v_total_nota FROM nota WHERE id = v_nota_id;
  IF NOT FOUND THEN
    RETURN NULL;   -- notanya sudah dihapus; tidak ada yang perlu diperiksa
  END IF;

  SELECT COALESCE(SUM(nominal), 0) INTO v_total_alok
  FROM nota_alokasi WHERE nota_id = v_nota_id;

  IF v_total_alok > v_total_nota THEN
    RAISE EXCEPTION
      'Total alokasi (%) melebihi total nota (%). Selisih: %',
      v_total_alok, v_total_nota, v_total_alok - v_total_nota
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END; $$ LANGUAGE plpgsql;

-- DEFERRABLE INITIALLY DEFERRED: pemeriksaan terjadi di AKHIR transaksi, bukan
-- per baris. Tanpa ini, memasukkan tiga alokasi sekaligus dalam satu transaksi
-- bisa gagal di baris tengah walau totalnya nanti sah.
CREATE CONSTRAINT TRIGGER trg_cek_alokasi
  AFTER INSERT OR UPDATE OR DELETE ON nota_alokasi
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION cek_total_alokasi();
