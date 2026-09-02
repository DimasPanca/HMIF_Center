-- 013_audit_backup — jejak audit, catatan backup, dan konfigurasi sistem.
--
-- Migrasi terakhir yang membentuk skema. Setelah ini menyusul fungsi domain
-- (014), RLS (015), view (016), trigger (017), dan seed (018).
--
-- Sumber: SYSTEM_DESIGN §4.11 · PRD M15 · ADR-008, ADR-016

-- ---------------------------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES app_user(id),
  periode_id UUID REFERENCES periode(id),

  aksi       TEXT NOT NULL,   -- 'CREATE','UPDATE','DELETE','APPROVE','LOGIN',...
  entitas    TEXT NOT NULL,   -- nama tabel
  entitas_id TEXT,

  nilai_lama JSONB,
  nilai_baru JSONB,

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_id sengaja NULLABLE: mutasi dari cron dan skrip administratif tidak
-- punya pengguna, tetapi tetap WAJIB tercatat. Memaksanya NOT NULL akan
-- membuat trigger audit gagal dan ikut menggagalkan mutasinya.

CREATE INDEX audit_user_waktu ON audit_log (user_id, created_at DESC);
CREATE INDEX audit_entitas    ON audit_log (entitas, entitas_id);
CREATE INDEX audit_waktu      ON audit_log (created_at DESC);

-- ==========================================================================
-- APPEND-ONLY (INV-06) — dua lapis, karena satu tidak cukup.
--
-- LAPIS 1: REVOKE menutup akses bagi role biasa.
-- LAPIS 2: trigger menolak UPDATE/DELETE bahkan bagi PEMILIK tabel, yang
--          kebal terhadap REVOKE. Tanpa lapis kedua, siapa pun yang memegang
--          kredensial owner — termasuk service role aplikasi — dapat menghapus
--          jejak perbuatannya sendiri, dan audit log kehilangan seluruh
--          gunanya sebagai bukti.
-- ==========================================================================

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log bersifat append-only: operasi % ditolak (INV-06, PRD M15)', TG_OP
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Jejak audit tidak dapat diubah atau dihapus oleh siapa pun, termasuk Admin.';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_tolak_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER trg_audit_log_tolak_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- TRUNCATE melewati trigger per-baris, jadi butuh trigger tingkat statement
-- tersendiri. Tanpa ini, seluruh jejak audit dapat dihapus dalam satu perintah.
CREATE TRIGGER trg_audit_log_tolak_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

COMMENT ON TABLE audit_log IS
  'Append-only seumur hidup sistem. Tidak ada fitur pembersihan log lama, dan jangan pernah menambahkannya (PRD M15).';

-- ---------------------------------------------------------------------------
-- BACKUP
-- ---------------------------------------------------------------------------

CREATE TABLE backup (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Enum, bukan TEXT (ADR-016). Retensi bergantung penuh pada nilai ini:
  -- hanya OTOMATIS yang boleh dihapus job pembersihan.
  jenis         backup_jenis  NOT NULL,
  status        backup_status NOT NULL DEFAULT 'BERJALAN',

  periode_id    UUID REFERENCES periode(id),

  -- Versi skema, jumlah record per modul, dan checksum tiap berkas.
  -- Checksum-lah yang membuat restore dapat menolak bundel yang rusak
  -- sebelum menimpa data yang masih baik.
  manifest      JSONB NOT NULL DEFAULT '{}',

  storage_key   TEXT NOT NULL,
  ukuran_bytes  BIGINT,
  error_message TEXT,

  dibuat_oleh   UUID REFERENCES app_user(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,

  -- Backup GAGAL wajib menyebutkan sebabnya, supaya kegagalan berulang dapat
  -- ditelusuri tanpa menebak.
  CONSTRAINT backup_gagal_wajib_pesan CHECK (
    status <> 'GAGAL' OR error_message IS NOT NULL
  ),

  -- Backup yang sudah tidak BERJALAN wajib punya waktu selesai.
  CONSTRAINT backup_selesai_wajib_waktu CHECK (
    status = 'BERJALAN' OR completed_at IS NOT NULL
  )
);

CREATE INDEX backup_jenis_waktu ON backup (jenis, created_at DESC);

-- Menopang job retensi, yang HANYA menyeleksi backup OTOMATIS (ADR-016).
-- MANUAL dan PRA_RESTORE tidak pernah dihapus otomatis.
CREATE INDEX backup_retensi ON backup (created_at DESC)
  WHERE jenis = 'OTOMATIS' AND status = 'SUKSES';

-- ---------------------------------------------------------------------------
-- KONFIGURASI SISTEM
-- ---------------------------------------------------------------------------

CREATE TABLE app_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nilai awal. Seed T-042 menerapkannya lagi secara idempoten, sehingga
-- database yang dibangun dari migrasi saja tetap dapat langsung dipakai.
INSERT INTO app_config (key, value) VALUES
  ('kode_administrasi',      '"UN43.3.7"'::JSONB),
  ('kode_kegiatan_default',  '"HMIF"'::JSONB),
  ('kota_default',           '"Cilegon"'::JSONB),
  ('deadline_warning_hari',  '7'::JSONB),
  ('deadline_critical_hari', '3'::JSONB)
ON CONFLICT (key) DO NOTHING;

-- ==========================================================================
-- TEPAT LIMA KEY. TIDAK ADA durasi_persiapan_min / durasi_persiapan_max.
--
-- SYSTEM_DESIGN §4.11 menyebut keduanya, tetapi ADR-008 menghapusnya.
-- Rentang persiapan 15-45 hari sudah ditegakkan CHECK constraint pada tabel
-- proker. Menyimpannya juga di sini menciptakan keadaan di mana Admin mengubah
-- nilai, aplikasi menerima input baru, lalu database tetap menolaknya —
-- kegagalan yang membingungkan dan sulit dilacak ke penyebabnya.
--
-- Jangan menambahkannya kembali.
-- ==========================================================================

COMMENT ON TABLE app_config IS
  'Tepat 5 key. durasi_persiapan_min/max sengaja TIDAK ada — aturan itu hidup sebagai CHECK constraint pada proker (ADR-008).';
