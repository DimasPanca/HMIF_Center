-- 020_proker_draft — draft wizard proker, tersimpan per pengguna di server.
--
-- ===========================================================================
-- KENAPA TABEL TERPISAH, BUKAN BARIS proker BERSTATUS DRAFT
-- ===========================================================================
-- Kontrak T-068 menuntut progres wizard tersimpan per langkah di server, dan
-- klausa "Jangan" melarang menyimpannya di localStorage saja. Cara yang tampak
-- paling langsung — menulis baris `proker` berstatus DRAFT tiap langkah — TIDAK
-- BISA: tiga CHECK di migrasi 004 menyala pada `kategori = 'TERJADWAL'` tanpa
-- peduli status. Draft TERJADWAL yang baru memilih kategori di Langkah 1 belum
-- punya tanggal, sehingga `terjadwal_wajib_tanggal` menolaknya. Draft memang
-- separuh jadi; tabel `proker` sengaja tidak menampung yang separuh jadi.
--
-- Maka draft hidup di tabel sendiri sebagai JSONB bebas-bentuk. Ia tidak pernah
-- mengunci kalender, tidak muncul di Master Gantt, dan tidak tersentuh anti-
-- bentrok. Saat wizard di-submit (T-069), barulah baris `proker` sungguhan
-- dibuat dari isi draft ini, dan draft-nya dihapus.
--
-- Sumber: docs/ai/tasks/P3-proker-gantt.md T-068 · PRD F-5.3 · USER_FLOW §4.1

CREATE TABLE proker_draft (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  periode_id  UUID NOT NULL REFERENCES periode(id)  ON DELETE CASCADE,

  -- Seluruh isian wizard sejauh ini. Bebas-bentuk DAN parsial dengan sengaja:
  -- validasinya milik lib/proker/wizard-state.ts, bukan constraint kolom, karena
  -- draft justru boleh tidak lengkap. Constraint proker yang sesungguhnya baru
  -- ditegakkan saat submit membuat baris `proker`.
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Langkah terjauh yang pernah dicapai (1-6), untuk memulihkan posisi wizard.
  langkah     INTEGER NOT NULL DEFAULT 1,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proker_draft_langkah_1_6 CHECK (langkah BETWEEN 1 AND 6),

  -- Satu draft aktif per pengguna per periode. Wizard "Tambah Proker" berjalan
  -- satu per satu; meninggalkan lalu kembali memulihkan draft yang sama. Bila
  -- kelak perlu banyak draft sekaligus, constraint ini yang dilonggarkan.
  CONSTRAINT proker_draft_satu_per_user_periode UNIQUE (user_id, periode_id)
);

CREATE INDEX proker_draft_user ON proker_draft (user_id, periode_id);

-- ---------------------------------------------------------------------------
-- RLS — draft milik pribadi
-- ---------------------------------------------------------------------------
--
-- Tabel dibuat SETELAH 015b, jadi loop ENABLE RLS di sana tidak menjangkaunya;
-- diaktifkan eksplisit di sini. Hak tabel (SELECT/INSERT/UPDATE/DELETE untuk
-- `authenticated`) sudah otomatis dari ALTER DEFAULT PRIVILEGES di 015c.
--
-- Draft bersifat pribadi: tidak seperti proker yang dibaca seluruh pengurus,
-- corat-coret wizard yang belum diajukan hanya milik pembuatnya. Keempat policy
-- karena itu memakai syarat yang sama — baris hanya terlihat dan hanya dapat
-- disentuh oleh pemiliknya.

ALTER TABLE proker_draft ENABLE ROW LEVEL SECURITY;

CREATE POLICY proker_draft_select ON proker_draft FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY proker_draft_insert ON proker_draft FOR INSERT
  WITH CHECK (user_id = auth.uid() AND periode_id = periode_aktif());

CREATE POLICY proker_draft_update ON proker_draft FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY proker_draft_delete ON proker_draft FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE proker_draft IS
  'Draft wizard proker per pengguna (JSONB parsial). Bukan baris proker: proker menolak data separuh jadi. Diubah menjadi proker sungguhan saat submit (T-069).';

-- ---------------------------------------------------------------------------
-- STEMPEL updated_at
-- ---------------------------------------------------------------------------
-- Loop di migrasi 017 memasang trg_updated_at hanya pada tabel yang ADA saat
-- itu; tabel yang lahir sesudahnya harus memasangnya sendiri. Tanpa ini,
-- updated_at proker_draft tidak pernah bergerak — dan test 017 memang menangkap
-- persis kelalaian itu. Fungsi fn_set_updated_at() sudah ada sejak 017.
CREATE OR REPLACE TRIGGER trg_updated_at_proker_draft
  BEFORE UPDATE ON proker_draft
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
