-- 052_formulir — modul Formulir HMIF Center (ADR-038, docs/ai/FORM_CONTRACT.md).
--
-- Data terstruktur: form → bagian → pertanyaan; respons → satu baris jawaban
-- per pertanyaan dengan kolom bertipe (bukan satu gumpalan JSON), supaya dapat
-- diringkas, dikueri, dan diekspor.
--
-- Pengisian publik dilayani SERVER (Prisma, pemilik) setelah validasi penuh —
-- sengaja TIDAK ada policy INSERT respons untuk role mana pun: PostgREST tidak
-- boleh menjadi jalan pintas menulis respons tanpa validasi struktur, kuota,
-- dan batas waktu.

-- ---------------------------------------------------------------------------
-- Template global (Sekum & Admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_template (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama        TEXT NOT NULL CHECK (length(trim(nama)) BETWEEN 3 AND 120),
  kategori    TEXT NOT NULL CHECK (kategori IN ('PENDAFTARAN','EVALUASI','OPEN_RECRUITMENT','PENDATAAN_PENGURUS','LAINNYA')),
  deskripsi   TEXT NOT NULL DEFAULT '',
  isi         JSONB NOT NULL DEFAULT '{"bagian":[]}',
  bawaan      BOOLEAN NOT NULL DEFAULT false,
  aktif       BOOLEAN NOT NULL DEFAULT true,
  dibuat_oleh UUID REFERENCES app_user(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS form_template_nama_unik ON form_template (lower(nama));

-- ---------------------------------------------------------------------------
-- Form
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periode_id     UUID NOT NULL REFERENCES periode(id),
  kepanitiaan_id UUID REFERENCES kepanitiaan(id) ON DELETE CASCADE,
  kategori       TEXT NOT NULL CHECK (kategori IN ('PENDAFTARAN','EVALUASI','OPEN_RECRUITMENT','PENDATAAN_PENGURUS','LAINNYA')),
  judul          TEXT NOT NULL CHECK (length(trim(judul)) BETWEEN 3 AND 200),
  deskripsi      TEXT NOT NULL DEFAULT '' CHECK (length(deskripsi) <= 5000),
  status         TEXT NOT NULL DEFAULT 'DRAF' CHECK (status IN ('DRAF','DIBUKA','DITUTUP')),
  akses          TEXT NOT NULL DEFAULT 'PUBLIK' CHECK (akses IN ('PUBLIK','INTERNAL')),
  anonim         BOOLEAN NOT NULL DEFAULT false,
  satu_respons   BOOLEAN NOT NULL DEFAULT false,
  ditutup_pada   TIMESTAMPTZ,
  kuota          INTEGER CHECK (kuota IS NULL OR kuota BETWEEN 1 AND 100000),
  pesan_selesai  TEXT NOT NULL DEFAULT 'Terima kasih, jawaban Anda sudah tercatat.' CHECK (length(pesan_selesai) <= 1000),
  -- 122 bit acak (UUID v4 tanpa tanda hubung, 32 heksa) — tautan publik tak dapat ditebak.
  -- gen_random_uuid() bawaan Postgres ≥ 13: tanpa ekstensi pgcrypto.
  token          TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') CHECK (token ~ '^[0-9a-f]{32}$'),
  template_id    UUID REFERENCES form_template(id) ON DELETE SET NULL,
  dibuat_oleh    UUID NOT NULL REFERENCES app_user(id),
  dibuka_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ADR-038 #2: kategori menentukan apakah form milik acara atau organisasi.
  CONSTRAINT form_kategori_acara CHECK (
    (kategori IN ('PENDAFTARAN','EVALUASI') AND kepanitiaan_id IS NOT NULL)
    OR (kategori IN ('OPEN_RECRUITMENT','PENDATAAN_PENGURUS') AND kepanitiaan_id IS NULL)
    OR kategori = 'LAINNYA'
  ),
  -- Satu respons per akun hanya bermakna bila responden login.
  CONSTRAINT form_satu_respons_internal CHECK (NOT satu_respons OR akses = 'INTERNAL')
);
CREATE INDEX IF NOT EXISTS form_periode ON form (periode_id, created_at DESC);
CREATE INDEX IF NOT EXISTS form_acara ON form (kepanitiaan_id) WHERE kepanitiaan_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS form_bagian (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id    UUID NOT NULL REFERENCES form(id) ON DELETE CASCADE,
  urutan     INTEGER NOT NULL CHECK (urutan >= 0),
  judul      TEXT NOT NULL DEFAULT '' CHECK (length(judul) <= 200),
  deskripsi  TEXT NOT NULL DEFAULT '' CHECK (length(deskripsi) <= 2000),
  -- NULL = bagian berikutnya; 'KIRIM' = selesai; selain itu id bagian tujuan.
  lanjut_ke  TEXT
);
CREATE INDEX IF NOT EXISTS form_bagian_form ON form_bagian (form_id, urutan);

CREATE TABLE IF NOT EXISTS form_pertanyaan (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id       UUID NOT NULL REFERENCES form(id) ON DELETE CASCADE,
  bagian_id     UUID NOT NULL REFERENCES form_bagian(id) ON DELETE CASCADE,
  urutan        INTEGER NOT NULL CHECK (urutan >= 0),
  tipe          TEXT NOT NULL CHECK (tipe IN ('TEKS_SINGKAT','PARAGRAF','EMAIL','ANGKA','PILIHAN_GANDA','DROPDOWN',
                                              'KOTAK_CENTANG','SKALA','TANGGAL','WAKTU','UNGGAH_BERKAS','KISI_PILIHAN','KISI_CENTANG')),
  judul         TEXT NOT NULL CHECK (length(trim(judul)) BETWEEN 1 AND 500),
  deskripsi     TEXT NOT NULL DEFAULT '' CHECK (length(deskripsi) <= 2000),
  wajib         BOOLEAN NOT NULL DEFAULT false,
  opsi          JSONB NOT NULL DEFAULT '{}',
  peran         TEXT CHECK (peran IS NULL OR peran IN ('nama_lengkap','nim','email','no_hp','angkatan','jabatan')),
  diarsipkan_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS form_pertanyaan_form ON form_pertanyaan (form_id, bagian_id, urutan);

-- ---------------------------------------------------------------------------
-- Respons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_respons (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id          UUID NOT NULL REFERENCES form(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES app_user(id) ON DELETE SET NULL,
  -- SHA-256(form_id || user_id): satu respons per akun TANPA membuka identitas
  -- pada form anonim.
  responden_kunci  TEXT,
  status_seleksi   TEXT NOT NULL DEFAULT 'BARU' CHECK (status_seleksi IN ('BARU','LOLOS','TIDAK_LOLOS')),
  integrasi        JSONB NOT NULL DEFAULT '{}',
  dikirim_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_respons_form ON form_respons (form_id, dikirim_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS form_respons_satu_akun ON form_respons (form_id, responden_kunci) WHERE responden_kunci IS NOT NULL;

CREATE TABLE IF NOT EXISTS form_jawaban (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  respons_id     UUID NOT NULL REFERENCES form_respons(id) ON DELETE CASCADE,
  pertanyaan_id  UUID NOT NULL REFERENCES form_pertanyaan(id) ON DELETE CASCADE,
  nilai_teks     TEXT CHECK (nilai_teks IS NULL OR length(nilai_teks) <= 5000),
  nilai_angka    NUMERIC,
  nilai_tanggal  DATE,
  nilai_waktu    TIME,
  nilai_json     JSONB,
  berkas         JSONB,
  UNIQUE (respons_id, pertanyaan_id)
);
CREATE INDEX IF NOT EXISTS form_jawaban_pertanyaan ON form_jawaban (pertanyaan_id);

-- ---------------------------------------------------------------------------
-- updated_at + audit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_updated_at_form BEFORE UPDATE ON form
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE OR REPLACE TRIGGER trg_updated_at_form_template BEFORE UPDATE ON form_template
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE OR REPLACE TRIGGER trg_audit_form AFTER INSERT OR UPDATE OR DELETE ON form
  FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE OR REPLACE TRIGGER trg_audit_form_template AFTER INSERT OR UPDATE OR DELETE ON form_template
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

-- ---------------------------------------------------------------------------
-- RLS — lapis kedua (guard aplikasi di lib/form/akses.ts lapis pertama)
-- ---------------------------------------------------------------------------
-- Pengelola form: pembuat, Admin/Ketua/Wakil/Sekum, panitia acara (form acara).
CREATE OR REPLACE FUNCTION public.form_kelola(p_form UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM form f
    WHERE f.id = p_form
      AND (f.dibuat_oleh = auth.uid()
           OR has_role('ADMIN','KETUA','WAKIL','SEKUM')
           OR (f.kepanitiaan_id IS NOT NULL AND f.kepanitiaan_id = ANY (my_kepanitiaan()) AND NOT has_role('BPH')))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
COMMENT ON FUNCTION public.form_kelola IS
  'ADR-038 #4/#6: pembuat, pimpinan penulis, atau panitia acara form itu. Juga pembaca respons. BPH tidak pernah.';

-- Pembaca struktur form: pengelola + BPH (pengawas, tanpa respons).
CREATE OR REPLACE FUNCTION public.form_baca(p_form UUID) RETURNS BOOLEAN AS $$
  SELECT public.form_kelola(p_form) OR has_role('BPH');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

ALTER TABLE form_template   ENABLE ROW LEVEL SECURITY;
ALTER TABLE form            ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_bagian     ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_pertanyaan ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_respons    ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_jawaban    ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON form_template, form, form_bagian, form_pertanyaan TO authenticated;
GRANT SELECT, UPDATE ON form_respons TO authenticated;
GRANT SELECT ON form_jawaban TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_kelola(UUID), public.form_baca(UUID) TO authenticated;

DROP POLICY IF EXISTS form_template_select ON form_template;
CREATE POLICY form_template_select ON form_template FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS form_template_tulis ON form_template;
CREATE POLICY form_template_tulis ON form_template FOR ALL
  USING (has_role('ADMIN','SEKUM')) WITH CHECK (has_role('ADMIN','SEKUM'));

DROP POLICY IF EXISTS form_select ON form;
CREATE POLICY form_select ON form FOR SELECT USING (public.form_baca(id));
DROP POLICY IF EXISTS form_insert ON form;
CREATE POLICY form_insert ON form FOR INSERT WITH CHECK (
  dibuat_oleh = auth.uid() AND NOT has_role('BPH') AND (
    has_role('ADMIN','KETUA','WAKIL','SEKUM')
    OR (kepanitiaan_id IS NOT NULL AND kepanitiaan_id = ANY (my_kepanitiaan()))
  )
);
DROP POLICY IF EXISTS form_update ON form;
CREATE POLICY form_update ON form FOR UPDATE USING (public.form_kelola(id)) WITH CHECK (public.form_kelola(id));
DROP POLICY IF EXISTS form_delete ON form;
CREATE POLICY form_delete ON form FOR DELETE USING (public.form_kelola(id));

DROP POLICY IF EXISTS form_bagian_select ON form_bagian;
CREATE POLICY form_bagian_select ON form_bagian FOR SELECT USING (public.form_baca(form_id));
DROP POLICY IF EXISTS form_bagian_tulis ON form_bagian;
CREATE POLICY form_bagian_tulis ON form_bagian FOR ALL USING (public.form_kelola(form_id)) WITH CHECK (public.form_kelola(form_id));

DROP POLICY IF EXISTS form_pertanyaan_select ON form_pertanyaan;
CREATE POLICY form_pertanyaan_select ON form_pertanyaan FOR SELECT USING (public.form_baca(form_id));
DROP POLICY IF EXISTS form_pertanyaan_tulis ON form_pertanyaan;
CREATE POLICY form_pertanyaan_tulis ON form_pertanyaan FOR ALL USING (public.form_kelola(form_id)) WITH CHECK (public.form_kelola(form_id));

-- Respons: hanya pengelola (bukan BPH) yang membaca; status seleksi diubah pengelola.
DROP POLICY IF EXISTS form_respons_select ON form_respons;
CREATE POLICY form_respons_select ON form_respons FOR SELECT USING (public.form_kelola(form_id));
DROP POLICY IF EXISTS form_respons_update ON form_respons;
CREATE POLICY form_respons_update ON form_respons FOR UPDATE USING (public.form_kelola(form_id)) WITH CHECK (public.form_kelola(form_id));

DROP POLICY IF EXISTS form_jawaban_select ON form_jawaban;
CREATE POLICY form_jawaban_select ON form_jawaban FOR SELECT USING (
  EXISTS (SELECT 1 FROM form_respons r WHERE r.id = respons_id AND public.form_kelola(r.form_id))
);
