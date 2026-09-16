-- 026_checklist — T-081 (fondasi data): template checklist persisten + perbaikan
-- lingkup RLS checklist_item.
--
-- ==========================================================================
-- DUA MASALAH YANG DITUTUP
-- ==========================================================================
-- 1) Template checklist harus PERSISTEN dan dipakai ulang lintas kartu untuk
--    "proker sejenis" (PRD F-7.2). localStorage tak memenuhi itu — hilang per
--    peramban, tak terbagi. Karena itu disimpan di database, berlingkup
--    departemen (satu template "Persiapan Seminar" dipakai kartu mana pun di
--    departemen itu, lintas periode).
-- 2) RLS checklist_item lama (015b) HANYA memeriksa role global
--    `has_role('ADMIN','KADEPT','ANGGOTA')`, sehingga anggota departemen mana
--    pun dapat menyunting checklist kartu di luar lingkupnya. Lingkup wajib
--    diturunkan dari kartu induk (departemen/divisi/proker + periode aktif),
--    persis seperti kartu itu sendiri. `kanban_boleh_tulis` (024) sudah
--    mengkodekan aturan itu; checklist tinggal mendelegasikannya lewat kartu
--    induk. BPH tetap baca saja (INV-03).
--
-- Migrasi lama tetap utuh. Sumber: docs/ai/tasks/P4-kanban.md T-081 · PRD F-7.2 ·
--   PRD §5.1 (Kanban & Checklist) · INV-03, INV-08 · docs/ai/CHECKLIST_CONTRACT.md

-- ---------------------------------------------------------------------------
-- 1. TEMPLATE CHECKLIST — persisten, per departemen, lintas kartu & periode
-- ---------------------------------------------------------------------------

CREATE TABLE checklist_template (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  departemen_id UUID NOT NULL REFERENCES departemen(id) ON DELETE CASCADE,
  nama          TEXT NOT NULL,
  dibuat_oleh   UUID NOT NULL REFERENCES app_user(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checklist_template_nama_ada CHECK (length(btrim(nama)) > 0)
);
CREATE INDEX checklist_template_dept ON checklist_template (departemen_id);

CREATE TABLE checklist_template_item (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES checklist_template(id) ON DELETE CASCADE,
  teks        TEXT NOT NULL,
  urutan      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT checklist_template_item_teks_ada CHECK (length(btrim(teks)) > 0)
);
CREATE INDEX checklist_template_item_tpl ON checklist_template_item (template_id, urutan);

ALTER TABLE checklist_template      ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_item ENABLE ROW LEVEL SECURITY;

-- Baca org-wide (konsisten dengan kanban_card & checklist_item). Menulis
-- mengikuti lingkup departemen kartu: kartu tanpa proker/divisi → panggil
-- kanban_boleh_tulis(dept, NULL, NULL) yang menuntut role KADEPT/ANGGOTA pada
-- departemen itu di periode aktif (atau ADMIN); BPH tak pernah lolos.
CREATE POLICY checklist_template_select ON checklist_template FOR SELECT USING (true);
CREATE POLICY checklist_template_insert ON checklist_template FOR INSERT TO authenticated
  WITH CHECK (kanban_boleh_tulis(departemen_id, NULL, NULL));
CREATE POLICY checklist_template_update ON checklist_template FOR UPDATE TO authenticated
  USING (kanban_boleh_tulis(departemen_id, NULL, NULL))
  WITH CHECK (kanban_boleh_tulis(departemen_id, NULL, NULL));
CREATE POLICY checklist_template_delete ON checklist_template FOR DELETE TO authenticated
  USING (kanban_boleh_tulis(departemen_id, NULL, NULL));

CREATE POLICY checklist_template_item_select ON checklist_template_item FOR SELECT USING (true);
CREATE POLICY checklist_template_item_insert ON checklist_template_item FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM checklist_template t
                       WHERE t.id = template_id AND kanban_boleh_tulis(t.departemen_id, NULL, NULL)));
CREATE POLICY checklist_template_item_update ON checklist_template_item FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM checklist_template t
                  WHERE t.id = template_id AND kanban_boleh_tulis(t.departemen_id, NULL, NULL)))
  WITH CHECK (EXISTS (SELECT 1 FROM checklist_template t
                       WHERE t.id = template_id AND kanban_boleh_tulis(t.departemen_id, NULL, NULL)));
CREATE POLICY checklist_template_item_delete ON checklist_template_item FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM checklist_template t
                  WHERE t.id = template_id AND kanban_boleh_tulis(t.departemen_id, NULL, NULL)));

COMMENT ON TABLE checklist_template IS
  'Template checklist dapat dipakai ulang, berlingkup departemen, lintas kartu & periode (PRD F-7.2, T-081).';

-- ---------------------------------------------------------------------------
-- 2. PERBAIKAN LINGKUP RLS checklist_item — turunkan dari kartu induk
-- ---------------------------------------------------------------------------
-- SELECT tetap org-wide (015b) — sejalan dengan kanban_card. Yang diperbaiki
-- hanya jalur TULIS: sebelumnya role global tanpa lingkup.

DROP POLICY checklist_item_insert ON checklist_item;
DROP POLICY checklist_item_update ON checklist_item;
DROP POLICY checklist_item_delete ON checklist_item;

CREATE POLICY checklist_item_insert ON checklist_item FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM kanban_card c
     WHERE c.id = card_id
       AND kanban_boleh_tulis(c.departemen_id, c.proker_id, c.divisi_id)));

CREATE POLICY checklist_item_update ON checklist_item FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM kanban_card c
     WHERE c.id = card_id
       AND kanban_boleh_tulis(c.departemen_id, c.proker_id, c.divisi_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM kanban_card c
     WHERE c.id = card_id
       AND kanban_boleh_tulis(c.departemen_id, c.proker_id, c.divisi_id)));

-- Menghapus item checklist mengikuti lingkup tulis yang sama: pengelola kartu
-- (termasuk ANGGOTA departemennya) boleh membenahi daftarnya. Ini SENGAJA lebih
-- longgar daripada penghapusan KARTU (yang menutup ANGGOTA), karena item hanyalah
-- sub-elemen daftar, bukan entitas papan; BPH & lintas-lingkup tetap ditutup.
CREATE POLICY checklist_item_delete ON checklist_item FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM kanban_card c
     WHERE c.id = card_id
       AND kanban_boleh_tulis(c.departemen_id, c.proker_id, c.divisi_id)));
