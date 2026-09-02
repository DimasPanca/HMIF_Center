-- 005_kepanitiaan — kepanitiaan acara besar, divisi, anggota, dan job desk.
--
-- URUTAN MIGRASI INI PENTING (ADR-005). Ia sengaja mendahului 006_gantt,
-- menyimpang dari Lampiran SYSTEM_DESIGN yang menempatkan gantt lebih dulu.
-- Alasannya sederhana: gantt_chart punya foreign key ke `divisi` dan
-- `kepanitiaan`, sehingga urutan versi dokumen gagal dijalankan dari database
-- kosong dengan error foreign key.
--
-- Sumber: SYSTEM_DESIGN §4.5 · PRD F-8.1, F-8.2 · ADR-005, ADR-013

-- ---------------------------------------------------------------------------
-- KEPANITIAAN
-- ---------------------------------------------------------------------------

CREATE TABLE kepanitiaan (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Satu proker menghasilkan paling banyak satu kepanitiaan. Dibentuk otomatis
  -- saat proker TERJADWAL disetujui, dari data Langkah 4 wizard (PRD F-8.1).
  proker_id       UUID NOT NULL UNIQUE REFERENCES proker(id) ON DELETE CASCADE,

  nama_acara      TEXT NOT NULL,
  tema            TEXT,

  -- Dipakai sebagai komponen KEGIATAN pada nomor surat, menggantikan default
  -- 'HMIF'. Contoh nyata dari arsip: 05/379/UN43.3.7/KT2HMIF/VIII/2025.
  kode_kegiatan   TEXT,

  -- Ketua Pelaksana BEBAS lintas departemen dan tidak harus berasal dari
  -- departemen pengusul (PRD F-8.1). Karena itu kolomnya merujuk app_user
  -- langsung, bukan disaring lewat user_role.departemen_id. Ini peran
  -- KONTEKSTUAL yang berakhir saat acara ditutup, bukan peran global.
  ketua_pelaksana UUID REFERENCES app_user(id),
  wakil_pelaksana UUID REFERENCES app_user(id),
  sekretaris      UUID REFERENCES app_user(id),
  bendahara       UUID REFERENCES app_user(id),

  target_anggaran NUMERIC(15,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT kepanitiaan_anggaran_positif CHECK (
    target_anggaran IS NULL OR target_anggaran >= 0
  )
);

CREATE INDEX kepanitiaan_ketuplak ON kepanitiaan (ketua_pelaksana);

COMMENT ON COLUMN kepanitiaan.kode_kegiatan IS
  'Komponen KEGIATAN pada nomor surat. Kosong berarti memakai app_config.kode_kegiatan_default.';

-- ---------------------------------------------------------------------------
-- DIVISI
-- ---------------------------------------------------------------------------

CREATE TABLE divisi (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kepanitiaan_id UUID NOT NULL REFERENCES kepanitiaan(id) ON DELETE CASCADE,

  -- Sembilan preset (ADR-013): ACARA, KONSUMSI, HUMAS, PERALATAN, PDD, P3K,
  -- SEKRETARIS, BENDAHARA, KOMDIS. Dapat ditambah atau dikurangi per acara,
  -- sehingga disimpan sebagai TEXT, bukan enum.
  nama           TEXT NOT NULL,

  koordinator_id UUID REFERENCES app_user(id),
  warna          TEXT,
  urutan         INTEGER NOT NULL DEFAULT 0,

  -- Nama divisi unik DALAM SATU acara, tetapi acara berbeda tentu boleh
  -- sama-sama punya divisi KONSUMSI.
  CONSTRAINT divisi_unik_per_acara UNIQUE (kepanitiaan_id, nama),

  CONSTRAINT divisi_warna_hex CHECK (warna IS NULL OR warna ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX divisi_kepanitiaan ON divisi (kepanitiaan_id);

-- ---------------------------------------------------------------------------
-- ANGGOTA DIVISI
-- ---------------------------------------------------------------------------

CREATE TABLE divisi_member (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  divisi_id UUID NOT NULL REFERENCES divisi(id)   ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  peran     TEXT,                                  -- 'KOORDINATOR' | 'ANGGOTA'

  CONSTRAINT divisi_member_unik UNIQUE (divisi_id, user_id)
);

-- Index ini menopang helper RLS my_divisi(), yang dipanggil pada hampir setiap
-- policy tulis di modul kepanitiaan, RAB, dan nota (T-037).
CREATE INDEX divisi_member_user ON divisi_member (user_id);

-- ---------------------------------------------------------------------------
-- JOB DESK
-- ---------------------------------------------------------------------------

CREATE TABLE job_desk (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Satu job desk per divisi. Ruang kerja divisi memuat tepat satu dokumen
  -- job desk, bukan banyak.
  divisi_id  UUID NOT NULL UNIQUE REFERENCES divisi(id) ON DELETE CASCADE,

  konten     JSONB,                                 -- keluaran editor TipTap
  updated_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN job_desk.konten IS
  'Dokumen TipTap. Wajib disanitasi sebelum disimpan DAN sebelum dirender (XSS).';
