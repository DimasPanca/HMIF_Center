-- 006_gantt — Gantt chart pada lima level.
--
-- Foreign key ke `divisi` dan `kepanitiaan` di bawah ini adalah alasan migrasi
-- 005 harus berjalan lebih dulu (ADR-005).
--
-- Lima level Gantt (PRD F-6.1):
--   Master Gantt   agregat seluruh proker — TIDAK disimpan di sini, ia view
--                  (v_master_gantt, migrasi 016) yang dihitung dari `proker`
--   Departemen     seluruh proker satu departemen
--   Proker         task di dalam satu proker
--   Ketua Pelaksana timeline keseluruhan acara besar
--   Divisi         task internal satu divisi
--
-- Sumber: SYSTEM_DESIGN §4.4 · PRD F-6.1, F-6.3

-- ---------------------------------------------------------------------------
-- CHART
-- ---------------------------------------------------------------------------

CREATE TABLE gantt_chart (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  scope          TEXT NOT NULL,   -- 'PROKER' | 'DIVISI' | 'KETUPLAK' | 'DEPARTEMEN'

  proker_id      UUID REFERENCES proker(id)      ON DELETE CASCADE,
  divisi_id      UUID REFERENCES divisi(id)      ON DELETE CASCADE,
  departemen_id  UUID REFERENCES departemen(id)  ON DELETE CASCADE,
  kepanitiaan_id UUID REFERENCES kepanitiaan(id) ON DELETE CASCADE,

  judul          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- TEPAT SATU pemilik, tidak boleh nol dan tidak boleh dua.
  --
  -- Chart tanpa pemilik menggantung dan tidak akan pernah muncul di layar mana
  -- pun. Chart dengan dua pemilik membuat pertanyaan "chart ini milik siapa"
  -- tidak punya jawaban tunggal — dan pertanyaan itulah yang dipakai RLS untuk
  -- memutuskan siapa boleh mengeditnya.
  CONSTRAINT gantt_scope_tepat_satu CHECK (
    (proker_id      IS NOT NULL)::INT +
    (divisi_id      IS NOT NULL)::INT +
    (departemen_id  IS NOT NULL)::INT +
    (kepanitiaan_id IS NOT NULL)::INT = 1
  ),

  CONSTRAINT gantt_scope_sah CHECK (
    scope IN ('PROKER', 'DIVISI', 'KETUPLAK', 'DEPARTEMEN')
  )
);

CREATE INDEX gantt_chart_proker      ON gantt_chart (proker_id)      WHERE proker_id      IS NOT NULL;
CREATE INDEX gantt_chart_divisi      ON gantt_chart (divisi_id)      WHERE divisi_id      IS NOT NULL;
CREATE INDEX gantt_chart_departemen  ON gantt_chart (departemen_id)  WHERE departemen_id  IS NOT NULL;
CREATE INDEX gantt_chart_kepanitiaan ON gantt_chart (kepanitiaan_id) WHERE kepanitiaan_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- GRUP — baris induk pada chart
-- ---------------------------------------------------------------------------

CREATE TABLE gantt_group (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chart_id  UUID NOT NULL REFERENCES gantt_chart(id) ON DELETE CASCADE,

  nama      TEXT NOT NULL,          -- "Persiapan", "Pelaksanaan", nama departemen
  warna     TEXT NOT NULL,

  -- Ditampilkan sebagai teks kecil DI ATAS bar grup, bukan di kolom terpisah
  -- (DESIGN_SYSTEM §10.4). Disimpan sebagai teks, bukan FK ke app_user, karena
  -- penanggung jawab bisa berupa nama yang tidak punya akun (ADR-012).
  pj_nama   TEXT,

  urutan    INTEGER NOT NULL DEFAULT 0,
  collapsed BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT gantt_group_warna_hex CHECK (warna ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX gantt_group_chart ON gantt_group (chart_id, urutan);

-- ---------------------------------------------------------------------------
-- TASK — bar pada chart
-- ---------------------------------------------------------------------------

CREATE TABLE gantt_task (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES gantt_group(id) ON DELETE CASCADE,

  nama            TEXT NOT NULL,
  tanggal_mulai   DATE NOT NULL,
  tanggal_selesai DATE NOT NULL,

  -- Ditampilkan sebagai isian gelap di dalam bar (PRD F-6.3).
  progres         SMALLINT NOT NULL DEFAULT 0,

  assignee_id     UUID REFERENCES app_user(id),

  -- Milestone dirender sebagai penanda, bukan bar memanjang.
  is_milestone    BOOLEAN NOT NULL DEFAULT false,

  urutan          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Task satu hari sah (mulai = selesai); yang dilarang hanya selesai mendahului
  -- mulai, karena itu menghasilkan bar berlebar negatif saat dirender.
  CONSTRAINT task_tanggal_valid CHECK (tanggal_selesai >= tanggal_mulai),

  CONSTRAINT task_progres_wajar CHECK (progres BETWEEN 0 AND 100)
);

CREATE INDEX gantt_task_group ON gantt_task (group_id, urutan);

-- ---------------------------------------------------------------------------
-- DEPENDENSI — Finish-to-Start, opsional pada MVP
-- ---------------------------------------------------------------------------

CREATE TABLE gantt_dependency (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_task UUID NOT NULL REFERENCES gantt_task(id) ON DELETE CASCADE,
  to_task   UUID NOT NULL REFERENCES gantt_task(id) ON DELETE CASCADE,
  tipe      TEXT NOT NULL DEFAULT 'FS',

  CONSTRAINT gantt_dependency_unik UNIQUE (from_task, to_task),

  -- Task tidak boleh bergantung pada dirinya sendiri: konektor akan digambar
  -- sebagai lingkaran dan penjadwalan ulang otomatis akan berputar tanpa henti.
  -- Siklus yang lebih panjang (A->B->A) tidak dapat dicegah constraint dan
  -- diperiksa di lapisan aplikasi saat menambah dependensi (T-078).
  CONSTRAINT gantt_dependency_bukan_diri CHECK (from_task <> to_task),

  CONSTRAINT gantt_dependency_tipe_sah CHECK (tipe IN ('FS', 'SS', 'FF', 'SF'))
);

CREATE INDEX gantt_dependency_from ON gantt_dependency (from_task);
CREATE INDEX gantt_dependency_to   ON gantt_dependency (to_task);
