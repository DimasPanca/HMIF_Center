-- 010_kanban_kendala — papan Kanban, checklist, dan kendala departemen.
--
-- Sumber: SYSTEM_DESIGN §4.9 · PRD F-7.1, F-7.2, F-7.3

-- ---------------------------------------------------------------------------
-- KARTU KANBAN
-- ---------------------------------------------------------------------------

CREATE TABLE kanban_card (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Kartu dapat menempel pada proker, divisi kepanitiaan, atau departemen.
  -- Ketiganya nullable karena konteksnya memang berbeda-beda.
  proker_id     UUID REFERENCES proker(id)      ON DELETE CASCADE,
  divisi_id     UUID REFERENCES divisi(id)      ON DELETE CASCADE,
  departemen_id UUID REFERENCES departemen(id)  ON DELETE CASCADE,

  judul         TEXT NOT NULL,
  deskripsi     TEXT,
  kolom         kanban_kolom NOT NULL DEFAULT 'TODO',
  prioritas     prioritas    NOT NULL DEFAULT 'SEDANG',
  assignee_id   UUID REFERENCES app_user(id),
  deadline      DATE,
  urutan        INTEGER NOT NULL DEFAULT 0,

  created_by    UUID NOT NULL REFERENCES app_user(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraint ini TIDAK ada di SYSTEM_DESIGN §4.9 dan ditambahkan di sini.
  -- Alasannya: kartu tanpa satu pun keterkaitan tidak akan pernah muncul di
  -- papan mana pun — tidak di Kanban departemen, tidak di ruang kerja divisi.
  -- Ia hanya menumpuk di database tanpa cara menemukannya kembali, dan RLS
  -- pun tidak punya dasar untuk memutuskan siapa yang boleh melihatnya.
  CONSTRAINT kanban_card_wajib_konteks CHECK (
    proker_id IS NOT NULL OR divisi_id IS NOT NULL OR departemen_id IS NOT NULL
  )
);

-- Papan Kanban departemen adalah tampilan paling sering dibuka.
CREATE INDEX kanban_lookup ON kanban_card (departemen_id, kolom, urutan)
  WHERE departemen_id IS NOT NULL;
CREATE INDEX kanban_divisi ON kanban_card (divisi_id, kolom, urutan)
  WHERE divisi_id IS NOT NULL;

-- Progres proker dihitung dari (kartu DONE / total kartu) x 100 (PRD F-7.1),
-- dan angka itu tampil di Master Gantt. Index ini menopang perhitungan tersebut.
CREATE INDEX kanban_proker ON kanban_card (proker_id, kolom)
  WHERE proker_id IS NOT NULL;

CREATE INDEX kanban_deadline ON kanban_card (deadline)
  WHERE deadline IS NOT NULL AND kolom <> 'DONE';

-- ---------------------------------------------------------------------------
-- CHECKLIST DI DALAM KARTU
-- ---------------------------------------------------------------------------

CREATE TABLE checklist_item (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id     UUID NOT NULL REFERENCES kanban_card(id) ON DELETE CASCADE,
  teks        TEXT NOT NULL,
  selesai     BOOLEAN NOT NULL DEFAULT false,
  assignee_id UUID REFERENCES app_user(id),
  deadline    DATE,
  urutan      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX checklist_card ON checklist_item (card_id, urutan);

-- ---------------------------------------------------------------------------
-- KENDALA
-- ---------------------------------------------------------------------------

CREATE TABLE kendala (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  departemen_id        UUID REFERENCES departemen(id) ON DELETE CASCADE,
  divisi_id            UUID REFERENCES divisi(id)     ON DELETE CASCADE,
  proker_id            UUID REFERENCES proker(id),

  judul                TEXT NOT NULL,
  deskripsi            TEXT NOT NULL,
  prioritas            prioritas      NOT NULL DEFAULT 'SEDANG',
  status               kendala_status NOT NULL DEFAULT 'TERBUKA',
  assignee_id          UUID REFERENCES app_user(id),

  dibuat_oleh          UUID NOT NULL REFERENCES app_user(id),
  resolved_at          TIMESTAMPTZ,
  catatan_penyelesaian TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Sama alasannya dengan kanban_card: kendala tanpa konteks tidak muncul
  -- di halaman mana pun.
  CONSTRAINT kendala_wajib_konteks CHECK (
    departemen_id IS NOT NULL OR divisi_id IS NOT NULL
  ),

  -- Menutup kendala WAJIB disertai catatan penyelesaian (PRD F-7.3).
  -- Tanpa ini, kendala yang sama berulang tiap kepengurusan tanpa ada yang
  -- tahu bagaimana dulu ia diselesaikan — persis masalah yang PRD §2.1
  -- sebut sebagai "kendala berulang tiap periode".
  CONSTRAINT kendala_selesai_wajib_catatan CHECK (
    status <> 'SELESAI' OR catatan_penyelesaian IS NOT NULL
  ),

  CONSTRAINT kendala_selesai_wajib_waktu CHECK (
    (status = 'SELESAI') = (resolved_at IS NOT NULL)
  )
);

-- Kendala KRITIS wajib muncul di dashboard Ketua, Wakil, dan BPH dalam
-- hitungan detik (PRD F-7.3). Index parsial ini yang membuatnya murah.
CREATE INDEX kendala_prioritas ON kendala (prioritas, created_at DESC)
  WHERE status <> 'SELESAI';

CREATE INDEX kendala_departemen ON kendala (departemen_id, status)
  WHERE departemen_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- BALASAN BERULIR
-- ---------------------------------------------------------------------------

CREATE TABLE kendala_reply (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kendala_id UUID NOT NULL REFERENCES kendala(id) ON DELETE CASCADE,

  -- Self-reference untuk balasan berulir. NULL berarti balasan tingkat atas.
  -- Kedalaman tidak dibatasi database; UI meratakan tampilan setelah tiga
  -- tingkat (PRD F-7.3).
  parent_id  UUID REFERENCES kendala_reply(id) ON DELETE CASCADE,

  konten     TEXT NOT NULL,
  penulis_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Balasan tidak boleh menjadi induk dirinya sendiri.
  CONSTRAINT kendala_reply_bukan_diri CHECK (id <> parent_id)
);

CREATE INDEX kendala_reply_kendala ON kendala_reply (kendala_id, created_at);
CREATE INDEX kendala_reply_parent  ON kendala_reply (parent_id) WHERE parent_id IS NOT NULL;
