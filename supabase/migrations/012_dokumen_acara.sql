-- 012_dokumen_acara — TOR, Proposal, LPJ, dan rundown.
--
-- Ketiganya satu-per-acara dan isinya JSONB, karena strukturnya mengikuti
-- template dokumen resmi yang bisa berubah antar-kepengurusan. Memecahnya
-- menjadi puluhan kolom berarti setiap revisi template menuntut migrasi baru.
--
-- Sumber: SYSTEM_DESIGN §4.10 · PRD F-10.1, F-10.2, F-12.1 · ADR-015

-- ---------------------------------------------------------------------------
-- TOR — Term of Reference
-- ---------------------------------------------------------------------------

CREATE TABLE tor (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kepanitiaan_id UUID NOT NULL UNIQUE REFERENCES kepanitiaan(id) ON DELETE CASCADE,

  -- Empat belas bagian TOR (PRD F-10.1). Bagian Anggaran TIDAK disimpan di
  -- sini: ia selalu ditarik ulang dari RAB saat generate, supaya perubahan RAB
  -- langsung tercermin dan angka tidak pernah bercabang antara dua tempat.
  data           JSONB NOT NULL DEFAULT '{}',

  updated_by     UUID REFERENCES app_user(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN tor.data IS
  'Bagian 1-11, 13, 14. Bagian 12 (Anggaran) ditarik dari RAB saat generate, tidak disalin ke sini.';

-- ---------------------------------------------------------------------------
-- PROPOSAL
-- ---------------------------------------------------------------------------

CREATE TABLE proposal (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kepanitiaan_id UUID NOT NULL UNIQUE REFERENCES kepanitiaan(id) ON DELETE CASCADE,

  -- Delapan bagian (PRD F-10.2). Susunan kepanitiaan dan anggaran juga tidak
  -- disimpan di sini — keduanya ditarik dari data kepanitiaan dan RAB.
  data           JSONB NOT NULL DEFAULT '{}',

  updated_by     UUID REFERENCES app_user(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- LPJ — Laporan Pertanggungjawaban
-- ---------------------------------------------------------------------------

CREATE TABLE lpj (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kepanitiaan_id UUID NOT NULL UNIQUE REFERENCES kepanitiaan(id) ON DELETE CASCADE,

  -- Bagian yang diketik manusia: realisasi kegiatan, evaluasi, saran.
  data_manual    JSONB NOT NULL DEFAULT '{}',

  -- SNAPSHOT hasil analisis keuangan saat generate, bukan dihitung ulang tiap
  -- ditampilkan. LPJ yang sudah final adalah dokumen pertanggungjawaban resmi;
  -- angkanya tidak boleh berubah hanya karena seseorang mengedit RAB setelahnya.
  analisis       JSONB,

  -- Enum, bukan TEXT bebas (ADR-015). Dengan TEXT, urutan persetujuan dua tahap
  -- tidak dapat ditegakkan database sama sekali.
  status         lpj_status NOT NULL DEFAULT 'DRAFT',

  -- Persetujuan dua tahap: Bendahara Umum lebih dulu, baru Ketua Himpunan.
  disetujui_bendum_oleh UUID REFERENCES app_user(id),
  disetujui_bendum_at   TIMESTAMPTZ,
  disetujui_ketua_oleh  UUID REFERENCES app_user(id),
  disetujui_ketua_at    TIMESTAMPTZ,

  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Urutan persetujuan tidak boleh dilompati: Ketua hanya bisa menyetujui
  -- setelah Bendum. Tanpa constraint ini, LPJ bisa menjadi FINAL tanpa pernah
  -- diperiksa bendahara — padahal isinya laporan keuangan.
  CONSTRAINT lpj_urutan_approval CHECK (
    disetujui_ketua_at IS NULL OR disetujui_bendum_at IS NOT NULL
  ),

  CONSTRAINT lpj_bendum_lengkap CHECK (
    (disetujui_bendum_oleh IS NULL) = (disetujui_bendum_at IS NULL)
  ),
  CONSTRAINT lpj_ketua_lengkap CHECK (
    (disetujui_ketua_oleh IS NULL) = (disetujui_ketua_at IS NULL)
  ),

  -- Status FINAL wajib punya kedua persetujuan.
  CONSTRAINT lpj_final_wajib_lengkap CHECK (
    status <> 'FINAL' OR (disetujui_bendum_at IS NOT NULL AND disetujui_ketua_at IS NOT NULL)
  ),

  -- LPJ yang di-generate wajib menyimpan snapshot analisisnya.
  CONSTRAINT lpj_diajukan_wajib_analisis CHECK (
    status = 'DRAFT' OR analisis IS NOT NULL
  )
);

COMMENT ON COLUMN lpj.analisis IS
  'Snapshot analisis saat generate. Tidak dihitung ulang saat ditampilkan, supaya LPJ final tidak berubah bila RAB diedit kemudian.';

-- ---------------------------------------------------------------------------
-- RUNDOWN — susunan acara
-- ---------------------------------------------------------------------------
-- SATU sumber untuk tiga tempat: TOR bagian 11, lampiran Proposal, dan
-- Surat Undangan & Sambutan. Menyalinnya ke tiap dokumen berarti tiga versi
-- yang perlahan berbeda tanpa ada yang menyadarinya.

CREATE TABLE rundown (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kepanitiaan_id UUID NOT NULL REFERENCES kepanitiaan(id) ON DELETE CASCADE,

  tanggal        DATE NOT NULL,
  waktu_mulai    TIME,
  waktu_selesai  TIME,
  acara          TEXT NOT NULL,
  keterangan     TEXT,              -- PIC atau catatan
  urutan         INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT rundown_waktu_urut CHECK (
    waktu_mulai IS NULL OR waktu_selesai IS NULL OR waktu_selesai > waktu_mulai
  )
);

CREATE INDEX rundown_kepanitiaan ON rundown (kepanitiaan_id, tanggal, urutan);

COMMENT ON TABLE rundown IS
  'Satu sumber untuk TOR bagian 11, lampiran Proposal, dan Surat Undangan. Jangan menyalinnya ke tor.data atau proposal.data.';
