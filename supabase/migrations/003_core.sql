-- 003_core — periode, pengguna, departemen, peran, undangan, tanda tangan.
--
-- Enam tabel yang menjadi tumpuan seluruh sistem. Hampir setiap tabel di migrasi
-- berikutnya merujuk ke `periode` atau `app_user`.
--
-- Sumber: SYSTEM_DESIGN §4.2 · ADR-003

-- ---------------------------------------------------------------------------
-- PERIODE KEPENGURUSAN
-- ---------------------------------------------------------------------------

CREATE TABLE periode (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama             TEXT NOT NULL,                  -- "HMIF 3.0 2025/2026"
  tanggal_mulai    DATE NOT NULL,
  tanggal_selesai  DATE NOT NULL,
  status           periode_status NOT NULL DEFAULT 'PERSIAPAN',

  -- Nomor surat pertama periode ini. Default 1 sehingga surat pertama
  -- bernomor 001; Admin dapat mengisinya bila organisasi memutuskan
  -- melanjutkan penomoran berjalan (ADR-003).
  nomor_surat_awal INTEGER NOT NULL DEFAULT 1,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT periode_tanggal_valid CHECK (tanggal_selesai > tanggal_mulai),
  CONSTRAINT periode_nomor_awal_positif CHECK (nomor_surat_awal >= 1)
);

-- Tepat SATU periode boleh berstatus AKTIF.
--
-- Ditegakkan index parsial, bukan logika aplikasi: seluruh scoping data,
-- penomoran surat, dan resolusi peran bergantung pada "periode aktif" bersifat
-- tunggal. Dua periode aktif membuat nomor surat bercabang dan peran pengurus
-- menjadi ambigu — kerusakan yang tidak bisa dibereskan tanpa audit manual.
CREATE UNIQUE INDEX periode_hanya_satu_aktif
  ON periode ((status)) WHERE status = 'AKTIF';

-- ---------------------------------------------------------------------------
-- PENGGUNA
-- ---------------------------------------------------------------------------

CREATE TABLE app_user (
  id            UUID PRIMARY KEY,   -- SAMA dengan auth.users.id milik Supabase Auth
  nama_lengkap  TEXT NOT NULL,
  nim           TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  angkatan      INTEGER,
  no_hp         TEXT,
  avatar_path   TEXT,

  -- Menonaktifkan pengguna TIDAK menghapus barisnya: proker, surat, dan nota
  -- yang pernah dibuatnya harus tetap punya pemilik agar jejak audit utuh
  -- (PRD F-1.2).
  is_active     BOOLEAN NOT NULL DEFAULT true,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sengaja TANPA foreign key ke auth.users. Nilainya memang disamakan, tetapi
-- FK lintas-schema ke tabel milik Supabase Auth membuat seed dan test tidak
-- dapat membuat pengguna tanpa lebih dulu membuat akun autentikasi.
COMMENT ON COLUMN app_user.id IS
  'Sama dengan auth.users.id Supabase. Tanpa FK agar seed & test dapat berjalan mandiri.';

CREATE UNIQUE INDEX app_user_nim_unique ON app_user (nim);

-- ---------------------------------------------------------------------------
-- DEPARTEMEN
-- ---------------------------------------------------------------------------

CREATE TABLE departemen (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kode      TEXT NOT NULL UNIQUE,       -- 'KAD','MIKAT','INT','EKS','KOMINFO','RND'
  nama      TEXT NOT NULL,

  -- Warna identitas departemen, dipakai langsung sebagai fill bar Master Gantt.
  -- Formatnya dijaga karena nilai yang salah tidak memunculkan error: bar
  -- Gantt hanya menjadi tak berwarna, dan penyebabnya sulit ditelusuri.
  warna     TEXT NOT NULL,

  urutan    INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT departemen_warna_hex CHECK (warna ~ '^#[0-9A-Fa-f]{6}$')
);

-- ---------------------------------------------------------------------------
-- PERAN — satu pengguna boleh memegang beberapa peran sekaligus
-- ---------------------------------------------------------------------------

CREATE TABLE user_role (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  periode_id    UUID NOT NULL REFERENCES periode(id)  ON DELETE CASCADE,
  role          role_code NOT NULL,
  departemen_id UUID REFERENCES departemen(id),
  jabatan_teks  TEXT,                   -- teks jabatan untuk surat
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NULLS NOT DISTINCT (PostgreSQL 15+) dipakai secara sengaja.
  -- Dengan UNIQUE biasa, PostgreSQL menganggap NULL saling berbeda, sehingga
  -- satu pengguna bisa tercatat sebagai KETUA dua kali pada periode yang sama
  -- (keduanya ber-departemen_id NULL). Itu bertentangan dengan maksud constraint.
  CONSTRAINT user_role_unik
    UNIQUE NULLS NOT DISTINCT (user_id, periode_id, role, departemen_id),

  -- KADEPT dan ANGGOTA melekat pada satu departemen; peran lain bersifat
  -- lintas-himpunan dan tidak boleh punya departemen.
  CONSTRAINT role_dept_wajib CHECK (
    (role IN ('KADEPT', 'ANGGOTA') AND departemen_id IS NOT NULL)
    OR (role NOT IN ('KADEPT', 'ANGGOTA'))
  )
);

CREATE INDEX user_role_lookup ON user_role (user_id, periode_id);

-- ---------------------------------------------------------------------------
-- UNDANGAN
-- ---------------------------------------------------------------------------

CREATE TABLE invitation (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL,

  -- Yang disimpan HASH-nya, bukan tokennya. Bila isi database bocor, undangan
  -- yang belum dipakai tidak dapat ditebus oleh penemunya.
  token_hash  TEXT NOT NULL UNIQUE,

  user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,             -- terisi = sudah dipakai, sekali pakai
  created_by  UUID NOT NULL REFERENCES app_user(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invitation_email ON invitation (email) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- TANDA TANGAN
-- ---------------------------------------------------------------------------

CREATE TABLE signature (
  user_id     UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,           -- bucket PRIVAT, diakses signed URL
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE signature IS
  'Gambar tanda tangan di bucket privat. storage_key tidak boleh pernah muncul di response API (PRD F-1.3).';
