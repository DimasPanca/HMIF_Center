-- 007_rab — Rencana Anggaran Biaya, pemasukan, dan data peserta.
--
-- RAB punya tiga level hierarki (PRD F-9.1):
--   ACARA (kepanitiaan) -> DIVISI -> SUB-SECTION -> ITEM
--
-- Level DIVISI sudah ada di migrasi 005, jadi di sini hanya sub-section ke bawah.
--
-- Sumber: SYSTEM_DESIGN §4.6 · PRD F-9.1, F-9.4, F-9.5

-- ---------------------------------------------------------------------------
-- SUB-SECTION — pengelompokan di dalam divisi
-- ---------------------------------------------------------------------------
-- Contoh nyata dari RAB_Template.xlsx: di dalam DIVISI KONSUMSI terdapat
-- "KONSUMSI PANITIA", "KONSUMSI PESERTA", "KONSUMSI PEMATERI", dan
-- "KEBUTUHAN DIVISI". Baris-baris ini di-merge B:F pada Excel.

CREATE TABLE rab_section (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  divisi_id UUID NOT NULL REFERENCES divisi(id) ON DELETE CASCADE,
  nama      TEXT NOT NULL,
  urutan    INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT rab_section_unik UNIQUE (divisi_id, nama)
);

CREATE INDEX rab_section_divisi ON rab_section (divisi_id, urutan);

-- ---------------------------------------------------------------------------
-- ITEM
-- ---------------------------------------------------------------------------

CREATE TABLE rab_item (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id   UUID NOT NULL REFERENCES rab_section(id) ON DELETE CASCADE,
  no_urut      INTEGER NOT NULL,
  jenis_barang TEXT NOT NULL,

  -- ==========================================================================
  -- DUA KOLOM UNTUK SATU KONSEP "JUMLAH" (INV-26).
  --
  -- Kolom Jumlah pada RAB_Template.xlsx berisi teks bebas: "10", "16 Unit",
  -- "2 pack (12 pcs/pack)", bahkan "2 Hari 1 Malam". Memaksanya menjadi angka
  -- akan menghilangkan informasi yang dipakai bendahara saat berbelanja;
  -- menyimpannya hanya sebagai teks membuat total tidak bisa dihitung.
  --
  -- Jadi keduanya disimpan:
  --   jumlah_teks     apa adanya, dipakai untuk tampilan dan export Excel
  --                   supaya hasilnya identik dengan template asli
  --   jumlah_numerik  hasil parsing, dipakai untuk kalkulasi. NULL bila parser
  --                   tidak yakin, dan UI meminta user mengisinya manual.
  -- ==========================================================================
  jumlah_teks    TEXT NOT NULL,
  jumlah_numerik NUMERIC(12,2),

  harga_satuan   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total          NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Menandai total yang diisi user, bukan hasil jumlah_numerik x harga_satuan.
  -- Tanpa penanda ini, kalkulasi ulang akan diam-diam menimpa angka yang
  -- sengaja di-override bendahara.
  total_manual   BOOLEAN NOT NULL DEFAULT false,

  -- Kolom tambahan yang tidak ada pada Excel asli (PRD F-9.1).
  keterangan     TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rab_item_urut_unik UNIQUE (section_id, no_urut),
  CONSTRAINT rab_item_harga_positif CHECK (harga_satuan >= 0),
  CONSTRAINT rab_item_total_positif CHECK (total >= 0),
  CONSTRAINT rab_item_jumlah_positif CHECK (jumlah_numerik IS NULL OR jumlah_numerik >= 0)
);

CREATE INDEX rab_item_section ON rab_item (section_id, no_urut);

COMMENT ON COLUMN rab_item.jumlah_teks IS
  'Teks asli apa adanya. Dipakai untuk export Excel agar identik template (INV-26).';
COMMENT ON COLUMN rab_item.jumlah_numerik IS
  'Hasil parsing untuk kalkulasi. NULL berarti parser tidak yakin dan user diminta mengisi manual.';

-- ---------------------------------------------------------------------------
-- STATUS RAB PER ACARA
-- ---------------------------------------------------------------------------

CREATE TABLE rab_meta (
  kepanitiaan_id    UUID PRIMARY KEY REFERENCES kepanitiaan(id) ON DELETE CASCADE,
  status            rab_status NOT NULL DEFAULT 'DRAFT',

  -- Pos anggaran cadangan. Dihitung terpisah dan TIDAK tercampur ke total
  -- divisi, karena pada laporan ia muncul sebagai baris tersendiri.
  dana_tak_terduga  NUMERIC(15,2) NOT NULL DEFAULT 0,

  disetujui_oleh    UUID REFERENCES app_user(id),
  disetujui_at      TIMESTAMPTZ,

  -- Membuka kunci RAB yang sudah disetujui WAJIB beralasan (PRD F-9.5).
  -- Alasannya disimpan di sini dan ikut tercatat di audit log.
  alasan_buka_kunci TEXT,

  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rab_meta_dana_positif CHECK (dana_tak_terduga >= 0)
);

-- ---------------------------------------------------------------------------
-- PEMASUKAN — sumber dana
-- ---------------------------------------------------------------------------

CREATE TABLE pemasukan (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kepanitiaan_id UUID NOT NULL REFERENCES kepanitiaan(id) ON DELETE CASCADE,
  no_urut        INTEGER NOT NULL,

  -- "Total Pembayaran SYNCHRONIZE", "Himpunan", "Sponsor", "Dana Fakultas"
  keterangan     TEXT NOT NULL,
  saldo          NUMERIC(15,2) NOT NULL DEFAULT 0,

  CONSTRAINT pemasukan_urut_unik UNIQUE (kepanitiaan_id, no_urut),
  CONSTRAINT pemasukan_saldo_positif CHECK (saldo >= 0)
);

CREATE INDEX pemasukan_kepanitiaan ON pemasukan (kepanitiaan_id, no_urut);

-- ---------------------------------------------------------------------------
-- PESERTA — rincian pembayaran, sheet PEMASUKAN blok kedua
-- ---------------------------------------------------------------------------

CREATE TABLE peserta (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kepanitiaan_id UUID NOT NULL REFERENCES kepanitiaan(id) ON DELETE CASCADE,
  no_urut        INTEGER NOT NULL,
  nama_lengkap   TEXT NOT NULL,
  nim            TEXT,

  sudah_bayar    BOOLEAN NOT NULL DEFAULT false,
  tanggal_bayar  DATE,
  jumlah         NUMERIC(15,2) NOT NULL DEFAULT 0,

  CONSTRAINT peserta_urut_unik UNIQUE (kepanitiaan_id, no_urut),
  CONSTRAINT peserta_jumlah_positif CHECK (jumlah >= 0),

  -- Tanggal bayar tanpa status bayar adalah data yang saling bertentangan;
  -- ringkasan "sudah bayar" akan berbeda dari daftar tanggal pembayaran.
  CONSTRAINT peserta_tanggal_konsisten CHECK (
    tanggal_bayar IS NULL OR sudah_bayar = true
  )
);

CREATE INDEX peserta_kepanitiaan ON peserta (kepanitiaan_id, no_urut);
CREATE INDEX peserta_belum_bayar ON peserta (kepanitiaan_id) WHERE sudah_bayar = false;
