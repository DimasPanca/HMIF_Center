-- 009_surat — template, counter nomor, surat, penandatangan, dokumen.
--
-- Nomor surat adalah identitas resmi organisasi. Tiga aturan yang dijaga
-- struktur di bawah ini:
--   INV-14  nomor dialokasikan saat APPROVAL, bukan saat draft dibuat
--   INV-15  alokasi hanya lewat fungsi database dengan advisory lock (T-034)
--   INV-16  nomor yang dibatalkan tidak pernah didaur ulang
--
-- Sumber: SYSTEM_DESIGN §4.8 · PRD F-4.1, F-4.3 · ADR-001, ADR-002, ADR-003

-- ---------------------------------------------------------------------------
-- TEMPLATE SURAT
-- ---------------------------------------------------------------------------

CREATE TABLE surat_template (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  kode_surat   TEXT NOT NULL,      -- '01'..'09'
  varian       TEXT NOT NULL,      -- 'PEMINJAMAN_BARANG', 'ASPIRASI', ...
  nama         TEXT NOT NULL,

  storage_key  TEXT NOT NULL,      -- lokasi berkas .docx di bucket privat

  -- Definisi field dinamis per jenis surat, plus daftar blok tanda tangan
  -- (ADR-004). Dirender menjadi form dan divalidasi ulang di server dengan
  -- skema Zod yang sama (K-04).
  field_schema JSONB NOT NULL,

  versi        INTEGER NOT NULL DEFAULT 1,
  is_active    BOOLEAN NOT NULL DEFAULT true,

  -- Template bersifat VERSIONED. Mengunggah revisi menambah baris dengan
  -- versi + 1 dan menonaktifkan yang lama, tidak menimpanya: surat yang sudah
  -- terbit harus tetap dapat di-generate ulang persis seperti aslinya.
  CONSTRAINT surat_template_unik UNIQUE (kode_surat, varian, versi),

  CONSTRAINT surat_template_kode_sah CHECK (kode_surat ~ '^0[1-9]$'),
  CONSTRAINT surat_template_versi_positif CHECK (versi >= 1)
);

CREATE INDEX surat_template_aktif ON surat_template (kode_surat, varian)
  WHERE is_active;

-- ---------------------------------------------------------------------------
-- COUNTER NOMOR — satu baris per periode
-- ---------------------------------------------------------------------------

CREATE TABLE surat_counter (
  periode_id     UUID PRIMARY KEY REFERENCES periode(id) ON DELETE CASCADE,

  -- Dimulai dari periode.nomor_surat_awal - 1, sehingga alokasi pertama
  -- menghasilkan tepat nomor_surat_awal (ADR-003).
  nomor_terakhir INTEGER NOT NULL DEFAULT 0,

  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Counter TIDAK PERNAH MUNDUR (INV-16). Nomor surat yang dibatalkan tetap
  -- terpakai; mendaur ulangnya membuat dua dokumen berbeda memiliki nomor sama
  -- dan jejak audit organisasi rusak permanen.
  CONSTRAINT surat_counter_tidak_negatif CHECK (nomor_terakhir >= 0)
);

COMMENT ON TABLE surat_counter IS
  'Diubah HANYA oleh fungsi alokasi_nomor_surat dengan advisory lock (INV-15). Dilarang UPDATE langsung dari aplikasi.';

-- ---------------------------------------------------------------------------
-- SURAT
-- ---------------------------------------------------------------------------

CREATE TABLE surat (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periode_id        UUID NOT NULL REFERENCES periode(id),
  template_id       UUID NOT NULL REFERENCES surat_template(id),

  -- Komponen nomor: KODE/URUT/ADMINISTRASI/KEGIATAN/ROMAWI/TAHUN
  -- Contoh nyata: 05/379/UN43.3.7/KT2HMIF/VIII/2025
  kode_surat        TEXT NOT NULL,

  -- NULL sampai surat DISETUJUI (INV-14). Draft yang dibatalkan karena itu
  -- tidak pernah menghabiskan nomor.
  nomor_urut        INTEGER,

  kode_administrasi TEXT NOT NULL DEFAULT 'UN43.3.7',   -- ADR-001
  kode_kegiatan     TEXT NOT NULL DEFAULT 'HMIF',       -- 'KT2HMIF', 'MUSMAIF'
  bulan_romawi      TEXT,
  tahun             INTEGER,
  nomor_lengkap     TEXT,                                -- hasil rakitan

  tanggal_surat     DATE NOT NULL,
  kota              TEXT NOT NULL DEFAULT 'Cilegon',
  lampiran          TEXT DEFAULT '-',
  perihal           TEXT NOT NULL,
  tujuan_nama       TEXT NOT NULL,
  tujuan_alamat     TEXT NOT NULL,
  isi_html          TEXT,

  -- Field khusus per jenis surat, bentuknya mengikuti template.field_schema.
  data_dinamis      JSONB NOT NULL DEFAULT '{}',

  status            surat_status NOT NULL DEFAULT 'DRAFT',
  format_output     TEXT NOT NULL DEFAULT 'DOCX',        -- 'DOCX' | 'PDF' | 'BOTH'

  kepanitiaan_id    UUID REFERENCES kepanitiaan(id),
  departemen_id     UUID REFERENCES departemen(id),

  dibuat_oleh       UUID NOT NULL REFERENCES app_user(id),
  disetujui_oleh    UUID REFERENCES app_user(id),
  disetujui_at      TIMESTAMPTZ,
  alasan_penolakan  TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT surat_kode_sah CHECK (kode_surat ~ '^0[1-9]$'),
  CONSTRAINT surat_nomor_positif CHECK (nomor_urut IS NULL OR nomor_urut >= 1),

  CONSTRAINT surat_romawi_sah CHECK (
    bulan_romawi IS NULL OR
    bulan_romawi IN ('I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII')
  ),

  -- Surat yang sudah bernomor wajib punya nomor lengkap yang terakit, dan
  -- sebaliknya. Setengah terisi berarti proses alokasi berhenti di tengah.
  CONSTRAINT surat_nomor_konsisten CHECK (
    (nomor_urut IS NULL AND nomor_lengkap IS NULL) OR
    (nomor_urut IS NOT NULL AND nomor_lengkap IS NOT NULL)
  ),

  -- Penolakan wajib beralasan (PRD F-4.3).
  CONSTRAINT surat_tolak_wajib_alasan CHECK (
    status <> 'DITOLAK' OR alasan_penolakan IS NOT NULL
  ),

  -- Surat TERBIT wajib sudah bernomor. Tanpa ini, dokumen resmi bisa keluar
  -- tanpa identitas.
  CONSTRAINT surat_terbit_wajib_bernomor CHECK (
    status <> 'TERBIT' OR nomor_urut IS NOT NULL
  ),

  CONSTRAINT surat_format_sah CHECK (format_output IN ('DOCX', 'PDF', 'BOTH'))
);

-- ==========================================================================
-- JARING PENGAMAN TERAKHIR PENOMORAN (INV-15).
--
-- Alokasi nomor sudah diserialisasi advisory lock di dalam fungsi database.
-- Index ini ada untuk keadaan yang seharusnya mustahil: bila suatu saat ada
-- jalur yang melewati fungsi itu, database tetap menolak nomor ganda.
--
-- PARSIAL, karena draft yang belum disetujui semuanya ber-nomor_urut NULL dan
-- jumlahnya boleh berapa pun.
-- ==========================================================================
CREATE UNIQUE INDEX surat_nomor_unik_per_periode
  ON surat (periode_id, nomor_urut)
  WHERE nomor_urut IS NOT NULL;

CREATE INDEX surat_status_idx ON surat (periode_id, status);
CREATE INDEX surat_antrian_approval ON surat (created_at)
  WHERE status = 'MENUNGGU_APPROVAL';
CREATE INDEX surat_kepanitiaan ON surat (kepanitiaan_id) WHERE kepanitiaan_id IS NOT NULL;

-- Pencarian teks penuh pada arsip surat.
-- Konfigurasi 'indonesian' tersedia dan mengakar dengan benar: "Peminjaman"
-- menjadi 'pinjam', sehingga pencarian "meminjam" tetap menemukannya.
CREATE INDEX surat_search ON surat USING gin (
  to_tsvector('indonesian',
    coalesce(perihal, '') || ' ' || coalesce(tujuan_nama, '') || ' ' || coalesce(nomor_lengkap, ''))
);

-- ---------------------------------------------------------------------------
-- PENANDATANGAN
-- ---------------------------------------------------------------------------

CREATE TABLE surat_signer (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surat_id      UUID NOT NULL REFERENCES surat(id) ON DELETE CASCADE,
  urutan        INTEGER NOT NULL,
  posisi        TEXT NOT NULL,      -- 'KIRI' | 'KANAN'
  jabatan       TEXT NOT NULL,
  nama          TEXT NOT NULL,
  nim           TEXT,

  -- Bila terisi, gambar TTD diambil dari tabel signature milik pengguna itu.
  -- Boleh NULL: penandatangan bisa pihak luar yang tidak punya akun (ADR-012).
  user_id       UUID REFERENCES app_user(id),

  pakai_ttd     BOOLEAN NOT NULL DEFAULT false,
  pakai_stempel BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT surat_signer_urut_unik UNIQUE (surat_id, urutan),
  CONSTRAINT surat_signer_posisi_sah CHECK (posisi IN ('KIRI', 'KANAN')),

  -- TTD hanya dapat disisipkan bila penandatangan punya akun; tanpa akun tidak
  -- ada berkas gambar yang bisa diambil.
  CONSTRAINT surat_signer_ttd_butuh_akun CHECK (
    pakai_ttd = false OR user_id IS NOT NULL
  )
);

CREATE INDEX surat_signer_surat ON surat_signer (surat_id, urutan);

-- ---------------------------------------------------------------------------
-- DOKUMEN HASIL GENERATE
-- ---------------------------------------------------------------------------

CREATE TABLE dokumen (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surat_id       UUID REFERENCES surat(id) ON DELETE CASCADE,
  kepanitiaan_id UUID REFERENCES kepanitiaan(id) ON DELETE CASCADE,

  jenis          TEXT NOT NULL,    -- 'SURAT','TOR','PROPOSAL','LPJ','NOTULENSI','RAB'
  format         TEXT NOT NULL,    -- 'DOCX' | 'PDF' | 'XLSX'
  storage_key    TEXT NOT NULL,
  file_size      BIGINT,

  generated_by   UUID NOT NULL REFERENCES app_user(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dokumen_jenis_sah CHECK (
    jenis IN ('SURAT','TOR','PROPOSAL','LPJ','NOTULENSI','RAB','HALUAN_KERJA')
  ),
  CONSTRAINT dokumen_format_sah CHECK (format IN ('DOCX','PDF','XLSX')),

  -- Dokumen harus punya induk. Tanpa ini ia menggantung di storage tanpa
  -- pernah bisa ditemukan lewat antarmuka mana pun.
  CONSTRAINT dokumen_wajib_induk CHECK (
    surat_id IS NOT NULL OR kepanitiaan_id IS NOT NULL
  )
);

CREATE INDEX dokumen_surat ON dokumen (surat_id) WHERE surat_id IS NOT NULL;
CREATE INDEX dokumen_kepanitiaan ON dokumen (kepanitiaan_id, jenis)
  WHERE kepanitiaan_id IS NOT NULL;
