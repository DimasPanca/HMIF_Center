-- 011_sekretariat — notulensi, daftar hadir, action item, data pengurus,
--                    ruangan, dan peminjaman ruangan.
--
-- Sumber: SYSTEM_DESIGN §4.9 · PRD M13, F-14.1, F-14.2 · ADR-012

-- ---------------------------------------------------------------------------
-- NOTULENSI
-- ---------------------------------------------------------------------------

CREATE TABLE notulensi (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periode_id    UUID NOT NULL REFERENCES periode(id),
  departemen_id UUID REFERENCES departemen(id),   -- NULL = rapat tingkat himpunan

  judul         TEXT NOT NULL,
  tanggal       DATE NOT NULL,
  waktu_mulai   TIME,
  waktu_selesai TIME,
  tempat        TEXT,
  pemimpin_id   UUID REFERENCES app_user(id),
  notulis_id    UUID REFERENCES app_user(id),

  konten        JSONB,   -- keluaran editor TipTap

  -- Poin keputusan disimpan TERPISAH dari isi bebas, bukan dilebur ke dalamnya.
  -- Keputusan rapat adalah hal yang paling sering dicari kembali; menguburnya
  -- di dalam paragraf membuatnya mustahil dirujuk atau ditelusuri.
  keputusan     JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notulensi_waktu_urut CHECK (
    waktu_mulai IS NULL OR waktu_selesai IS NULL OR waktu_selesai > waktu_mulai
  )
);

CREATE INDEX notulensi_periode ON notulensi (periode_id, tanggal DESC);
CREATE INDEX notulensi_search ON notulensi USING gin (
  to_tsvector('indonesian', coalesce(judul, '') || ' ' || coalesce(tempat, ''))
);

-- ---------------------------------------------------------------------------
-- DAFTAR HADIR
-- ---------------------------------------------------------------------------

CREATE TABLE notulensi_attendance (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notulensi_id UUID NOT NULL REFERENCES notulensi(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status       kehadiran NOT NULL DEFAULT 'ALFA',

  CONSTRAINT notulensi_hadir_unik UNIQUE (notulensi_id, user_id)
);

CREATE INDEX notulensi_hadir_user ON notulensi_attendance (user_id, status);

-- ---------------------------------------------------------------------------
-- ACTION ITEM
-- ---------------------------------------------------------------------------

CREATE TABLE action_item (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notulensi_id   UUID NOT NULL REFERENCES notulensi(id) ON DELETE CASCADE,
  tugas          TEXT NOT NULL,
  pic_id         UUID REFERENCES app_user(id),
  deadline       DATE,

  -- Terisi bila action item sudah dikonversi menjadi kartu Kanban (PRD M13).
  -- ON DELETE SET NULL, bukan CASCADE: menghapus kartunya tidak boleh
  -- menghapus catatan rapat yang melahirkannya.
  kanban_card_id UUID REFERENCES kanban_card(id) ON DELETE SET NULL
);

CREATE INDEX action_item_notulensi ON action_item (notulensi_id);
CREATE INDEX action_item_pic ON action_item (pic_id) WHERE pic_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- DATA PENGURUS
-- ---------------------------------------------------------------------------

CREATE TABLE pengurus (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periode_id    UUID NOT NULL REFERENCES periode(id) ON DELETE CASCADE,

  -- BOLEH NULL (ADR-012). Data pengurus dipakai sebagai sumber auto-fill Surat
  -- Keterangan Aktif Organisasi, yang bisa diterbitkan untuk puluhan mahasiswa
  -- sekaligus. Mewajibkan akun berarti membuat puluhan akun yang tidak pernah
  -- dipakai. Akun aplikasi hanya lahir dari undangan Admin.
  user_id       UUID REFERENCES app_user(id) ON DELETE SET NULL,

  nama_lengkap  TEXT NOT NULL,
  nim           TEXT NOT NULL,
  jabatan       TEXT NOT NULL,
  departemen_id UUID REFERENCES departemen(id),
  angkatan      INTEGER,
  is_aktif      BOOLEAN NOT NULL DEFAULT true,

  -- NIM unik per periode, bukan unik global: orang yang sama wajar muncul lagi
  -- di kepengurusan berikutnya dengan jabatan berbeda.
  CONSTRAINT pengurus_nim_unik UNIQUE (periode_id, nim)
);

CREATE INDEX pengurus_periode ON pengurus (periode_id, is_aktif);
CREATE INDEX pengurus_departemen ON pengurus (departemen_id) WHERE departemen_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RUANGAN
-- ---------------------------------------------------------------------------
-- Daftar ruangan dikelola sendiri oleh Sekretaris lewat form bebas, karena
-- ketersediaannya bergantung pada Dekanat dan berubah tanpa pemberitahuan
-- (PRD F-14.2).

CREATE TABLE ruangan (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama      TEXT NOT NULL,
  lokasi    TEXT,
  kapasitas INTEGER,
  pengelola TEXT,                 -- "Kepala Bagian Sekretariat FT"
  catatan   TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT ruangan_kapasitas_positif CHECK (kapasitas IS NULL OR kapasitas > 0)
);

-- ---------------------------------------------------------------------------
-- PEMINJAMAN RUANGAN
-- ---------------------------------------------------------------------------

CREATE TABLE booking_ruangan (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ruangan_id     UUID NOT NULL REFERENCES ruangan(id),
  periode_id     UUID NOT NULL REFERENCES periode(id),

  kegiatan       TEXT NOT NULL,
  tanggal        DATE NOT NULL,
  waktu_mulai    TIME,
  waktu_selesai  TIME,
  jumlah_peserta INTEGER,
  keperluan      TEXT,

  -- Terisi setelah Surat Peminjaman Ruangan kode 05 terbit (PRD F-14.2).
  surat_id       UUID REFERENCES surat(id) ON DELETE SET NULL,

  dibuat_oleh    UUID NOT NULL REFERENCES app_user(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_waktu_urut CHECK (
    waktu_mulai IS NULL OR waktu_selesai IS NULL OR waktu_selesai > waktu_mulai
  )
);

CREATE INDEX booking_tanggal ON booking_ruangan (ruangan_id, tanggal);

-- ==========================================================================
-- TIDAK ADA EXCLUDE CONSTRAINT DI SINI — DAN ITU DISENGAJA.
--
-- Godaannya besar: tabel ini punya ruangan, tanggal, dan rentang waktu, persis
-- bentuk yang cocok untuk EXCLUDE USING gist seperti pada proker_lock. Jangan.
--
-- Keputusan final peminjaman ruangan ada di DEKANAT, bukan di sistem ini.
-- Sistem hanya mencatat apa yang diajukan dan MEMPERINGATKAN bila terlihat
-- bertabrakan (PRD F-14.2). Memblokirnya di database berarti sistem menolak
-- mencatat kenyataan — mis. ketika Dekanat memang mengizinkan dua kegiatan
-- berbagi ruangan, atau ketika satu booking dibatalkan lewat telepon dan
-- penggantinya perlu dicatat pada slot yang sama.
--
-- Ini berbeda dari proker_lock, di mana HMIF sendiri yang berwenang penuh
-- dan bentrok memang harus dicegah.
-- ==========================================================================

COMMENT ON TABLE booking_ruangan IS
  'Bentrok jadwal adalah PERINGATAN, bukan blokir (PRD F-14.2). Jangan menambahkan EXCLUDE constraint di sini.';
