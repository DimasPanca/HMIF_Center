-- 004_proker — program kerja dan tabel kunci kalender.
--
-- Ini migrasi terpenting di seluruh sistem. Tabel `proker_lock` beserta
-- EXCLUDE constraint-nya adalah SATU-SATUNYA mekanisme yang mencegah dua
-- departemen menjadwalkan acara besar pada rentang yang beririsan.
--
-- Sumber: SYSTEM_DESIGN §4.3 · PRD F-5.2 · ADR-008

-- ---------------------------------------------------------------------------
-- PROGRAM KERJA
-- ---------------------------------------------------------------------------

CREATE TABLE proker (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periode_id        UUID NOT NULL REFERENCES periode(id),
  departemen_id     UUID NOT NULL REFERENCES departemen(id),
  nama              TEXT NOT NULL,
  kategori          proker_kategori NOT NULL,
  status            proker_status NOT NULL DEFAULT 'DRAFT',

  deskripsi         TEXT,
  tujuan            TEXT,
  sasaran           TEXT,
  estimasi_peserta  INTEGER,
  penanggung_jawab  UUID REFERENCES app_user(id),

  -- Penjadwalan.
  -- Rentang yang dikunci membentang dari MULAI PERSIAPAN sampai HARI TERAKHIR
  -- acara, bukan hanya hari-H. Masa persiapanlah yang sebenarnya berebut SDM
  -- dan venue antar-departemen (PRD F-5.2 R1).
  tanggal_mulai_persiapan DATE,
  tanggal_hari_h_mulai    DATE,
  tanggal_hari_h_selesai  DATE,

  -- Pola pengulangan untuk kategori BERKALA.
  -- {"frekuensi":"MINGGUAN","hari":["SABTU"],"mulai":"...","selesai":"..."}
  pola_ulang        JSONB,

  estimasi_anggaran NUMERIC(15,2),
  sumber_dana       TEXT[],

  diajukan_at       TIMESTAMPTZ,
  disetujui_oleh    UUID REFERENCES app_user(id),
  disetujui_at      TIMESTAMPTZ,
  alasan_penolakan  TEXT,

  dibuat_oleh       UUID NOT NULL REFERENCES app_user(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Hanya TERJADWAL yang wajib bertanggal. BERKALA memakai pola_ulang,
  -- RESPONSIF bersifat insidental.
  CONSTRAINT terjadwal_wajib_tanggal CHECK (
    kategori <> 'TERJADWAL' OR (
      tanggal_mulai_persiapan IS NOT NULL AND
      tanggal_hari_h_mulai    IS NOT NULL AND
      tanggal_hari_h_selesai  IS NOT NULL
    )
  ),

  CONSTRAINT urutan_tanggal CHECK (
    tanggal_mulai_persiapan IS NULL OR (
      tanggal_mulai_persiapan <= tanggal_hari_h_mulai
      AND tanggal_hari_h_mulai <= tanggal_hari_h_selesai
    )
  ),

  -- Durasi persiapan 15-45 hari adalah ATURAN KERAS organisasi, bukan
  -- konfigurasi (ADR-008). Sengaja TIDAK dibaca dari app_config: nilai yang
  -- dapat diubah Admin sementara database tetap menolak menghasilkan kegagalan
  -- yang membingungkan dan sulit dilacak.
  CONSTRAINT durasi_persiapan_15_45 CHECK (
    kategori <> 'TERJADWAL' OR (
      (tanggal_hari_h_mulai - tanggal_mulai_persiapan) BETWEEN 15 AND 45
    )
  )
);

CREATE INDEX proker_periode_status ON proker (periode_id, status);
CREATE INDEX proker_departemen     ON proker (departemen_id);

-- ---------------------------------------------------------------------------
-- KUNCI KALENDER — jantung sistem anti-bentrok
-- ---------------------------------------------------------------------------
--
-- Tabel ini HANYA berisi proker TERJADWAL berstatus DISETUJUI atau BERJALAN.
-- Draft dan yang ditolak tidak mengunci apa pun (INV-10).
--
-- Kenapa tabel terpisah, bukan constraint di tabel `proker`:
-- proker menyimpan seluruh riwayat termasuk draft, ditolak, dan selesai.
-- Rentang yang benar-benar mengunci kalender adalah himpunan yang jauh lebih
-- kecil dan berubah lewat approval. Memisahkannya membuat EXCLUDE constraint
-- bekerja pada himpunan yang tepat tanpa perlu klausa kondisional.

CREATE TABLE proker_lock (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proker_id   UUID NOT NULL UNIQUE REFERENCES proker(id) ON DELETE CASCADE,
  periode_id  UUID NOT NULL REFERENCES periode(id) ON DELETE CASCADE,

  -- Selalu dibentuk sebagai daterange(mulai, selesai + 1, '[)') sehingga
  -- tanggal terakhir acara IKUT terkunci (INV-11). Memakai '[]' tidak dipakai
  -- karena PostgreSQL menormalkannya ke '[)' juga, dan menuliskannya eksplisit
  -- membuat maksudnya terbaca di kode pemanggil.
  rentang     DATERANGE NOT NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ==========================================================================
  -- INI ATURAN INTINYA (INV-09).
  --
  -- Dua proker terjadwal dalam periode yang sama tidak boleh memiliki rentang
  -- yang beririsan sedikit pun. Ditegakkan DATABASE, bukan aplikasi.
  --
  -- Pengecekan di aplikasi hanya untuk memberi tahu lebih awal; ia tidak dapat
  -- menutup celah race condition ketika dua Kepala Departemen menyetujui proker
  -- beririsan pada detik yang sama (PRD §11 risiko R3). Constraint inilah yang
  -- membuat salah satu dari keduanya pasti gagal.
  -- ==========================================================================
  CONSTRAINT no_overlap_terjadwal
    EXCLUDE USING gist (
      periode_id WITH =,
      rentang    WITH &&
    )
);

CREATE INDEX proker_lock_rentang ON proker_lock USING gist (rentang);

COMMENT ON TABLE proker_lock IS
  'Rentang kalender yang terkunci. Diisi/dihapus HANYA oleh fungsi setujui_proker dan lepas_kunci_selesai (T-033), tidak pernah lewat INSERT langsung dari aplikasi.';
