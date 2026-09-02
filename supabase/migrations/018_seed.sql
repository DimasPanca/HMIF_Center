-- 018_seed — data referensi organisasi.
--
-- Seluruhnya idempoten. Migrasi ini boleh dijalankan berkali-kali dan hasilnya
-- tetap sama; `npm run db:reset` mengandalkan itu.
--
-- TIDAK ADA DATA PERSONAL DI SINI. Nama, NIM, dan email pengurus masuk lewat
-- undangan Admin (T-047) atau import (T-048). Periode kepengurusan ditentukan
-- pengurus lewat /admin/periode, bukan oleh sistem.
--
-- ===========================================================================
-- DUA PERTENTANGAN KONTRAK YANG DISELESAIKAN DI SINI
-- ===========================================================================
--
-- 1. Kontrak T-042 menyebut "metadata 11 surat_template", sementara
--    SEED_DATA.md §3 — dokumen yang justru dirujuk kontrak itu — menyebut
--    tujuh varian bertemplate, dan empat kode sisanya memakai form generik.
--    Skema memihak SEED_DATA: `surat_template.storage_key` bersifat NOT NULL,
--    sehingga kode tanpa berkas template tidak dapat didaftarkan tanpa
--    mengarang nama berkas. Yang diseed: TUJUH.
--
-- 2. Kontrak meminta menyeed "9 divisi preset" dan "6 preset tujuan surat",
--    tetapi tidak ada tabel untuk keduanya, dan app_config wajib tepat lima
--    key. Keduanya dibuatkan tabel referensi di bawah — bukan konstanta di
--    kode — supaya kedua lane dapat membacanya dan Admin dapat menyuntingnya
--    kelak tanpa deployment.
--
-- Sumber: docs/ai/SEED_DATA.md · PRD §4.2, F-4.2, F-5.3 · DESIGN_SYSTEM §2.4 · ADR-013

-- ===========================================================================
-- TABEL REFERENSI BARU
-- ===========================================================================

CREATE TABLE IF NOT EXISTS divisi_preset (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama     TEXT    NOT NULL UNIQUE,
  deskripsi TEXT   NOT NULL,
  urutan   INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE divisi_preset IS
  'Tawaran divisi saat pembentukan kepanitiaan. Dapat ditambah/dikurangi per acara (ADR-013).';

CREATE TABLE IF NOT EXISTS tujuan_surat_preset (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label    TEXT    NOT NULL UNIQUE,
  -- Boleh kosong: preset "Lainnya" memang mengosongkan kedua kolom supaya
  -- pengguna mengisinya sendiri.
  nama     TEXT,
  alamat   TEXT,
  urutan   INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE tujuan_surat_preset IS
  'Isian otomatis dropdown tujuan surat. Hasilnya tetap dapat disunting pengguna (PRD F-4.2).';

-- RLS untuk kedua tabel baru. Loop di 015b sudah berjalan sebelum tabel ini
-- ada, jadi keduanya harus diurus di sini — dan `npm run rls:coverage` akan
-- berteriak bila terlewat.
--
-- Setiap policy didahului DROP ... IF EXISTS. PostgreSQL tidak mengenal
-- CREATE OR REPLACE POLICY, sehingga tanpa itu migrasi ini gagal saat
-- dijalankan ulang — dan kontrak T-042 menuntutnya idempoten.
ALTER TABLE divisi_preset       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tujuan_surat_preset ENABLE ROW LEVEL SECURITY;

-- Matriks PRD §5.1: data referensi organisasi — semua membaca, Admin mengelola.
DROP POLICY IF EXISTS divisi_preset_select ON divisi_preset;
CREATE POLICY divisi_preset_select ON divisi_preset FOR SELECT USING (true);
DROP POLICY IF EXISTS divisi_preset_insert ON divisi_preset;
CREATE POLICY divisi_preset_insert ON divisi_preset FOR INSERT WITH CHECK (has_role('ADMIN'));
DROP POLICY IF EXISTS divisi_preset_update ON divisi_preset;
CREATE POLICY divisi_preset_update ON divisi_preset FOR UPDATE USING (has_role('ADMIN'));
DROP POLICY IF EXISTS divisi_preset_delete ON divisi_preset;
CREATE POLICY divisi_preset_delete ON divisi_preset FOR DELETE USING (has_role('ADMIN'));

-- Sekum ikut mengelola preset tujuan surat karena dialah pemilik proses
-- persuratan dan yang paling tahu redaksi jabatan yang benar.
DROP POLICY IF EXISTS tujuan_surat_preset_select ON tujuan_surat_preset;
CREATE POLICY tujuan_surat_preset_select ON tujuan_surat_preset FOR SELECT USING (true);
DROP POLICY IF EXISTS tujuan_surat_preset_insert ON tujuan_surat_preset;
CREATE POLICY tujuan_surat_preset_insert ON tujuan_surat_preset FOR INSERT
  WITH CHECK (has_role('ADMIN','SEKUM'));
DROP POLICY IF EXISTS tujuan_surat_preset_update ON tujuan_surat_preset;
CREATE POLICY tujuan_surat_preset_update ON tujuan_surat_preset FOR UPDATE
  USING (has_role('ADMIN','SEKUM'));
DROP POLICY IF EXISTS tujuan_surat_preset_delete ON tujuan_surat_preset;
CREATE POLICY tujuan_surat_preset_delete ON tujuan_surat_preset FOR DELETE
  USING (has_role('ADMIN','SEKUM'));

-- ===========================================================================
-- DEPARTEMEN — 6 baris
-- ===========================================================================
-- Warna wajib sama persis dengan token --dept-* di app/globals.css. Master
-- Gantt dan badge departemen mengambil warna dari kolom ini, sementara CSS
-- memegang salinannya untuk elemen statis; keduanya harus tidak pernah
-- berbeda. `npm run seed` membandingkannya karakter per karakter.
--
-- ON CONFLICT memperbarui WARNA dan URUTAN saja, tidak menyentuh NAMA.
-- Warna adalah token desain yang dimiliki DESIGN_SYSTEM; nama adalah data
-- organisasi yang boleh disesuaikan Admin dan tidak boleh ditimpa seed.

INSERT INTO departemen (kode, nama, warna, urutan) VALUES
  ('KAD',     'Kaderisasi',                 '#1E90FF', 1),
  ('MIKAT',   'Minat dan Bakat',            '#00B4D8', 2),
  ('INT',     'Internal',                   '#F59E0B', 3),
  ('EKS',     'Eksternal',                  '#F87171', 4),
  ('KOMINFO', 'Komunikasi dan Informasi',   '#A3E635', 5),
  ('RND',     'Riset and Development',      '#A78BFA', 6)
ON CONFLICT (kode) DO UPDATE
  SET warna = EXCLUDED.warna, urutan = EXCLUDED.urutan;

-- ===========================================================================
-- app_config — tepat 5 key
-- ===========================================================================
-- Sudah diisi migrasi 013. Diulang di sini supaya berkas seed ini lengkap
-- dibaca sebagai satu daftar, dengan DO NOTHING agar nilai yang sudah
-- disesuaikan Admin tidak tertimpa.
--
-- Tepat lima, tidak lebih. durasi_persiapan_min/max sengaja TIDAK dibuat:
-- rentang 15-45 hari adalah aturan keras yang ditegakkan CHECK constraint
-- (ADR-008). Menyimpannya juga di sini menciptakan keadaan di mana Admin
-- mengubah nilai, aplikasi menerimanya, lalu database tetap menolak.

INSERT INTO app_config (key, value) VALUES
  ('kode_administrasi',      '"UN43.3.7"'::JSONB),
  ('kode_kegiatan_default',  '"HMIF"'::JSONB),
  ('kota_default',           '"Cilegon"'::JSONB),
  ('deadline_warning_hari',  '7'::JSONB),
  ('deadline_critical_hari', '3'::JSONB)
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- surat_template — 7 varian bertemplate
-- ===========================================================================
-- storage_key menunjuk berkas .docx yang diunggah T-055. Sampai berkasnya ada,
-- barisnya sudah terdaftar supaya form surat punya daftar varian yang benar
-- sejak awal.
--
-- Empat kode surat lain (01, 06, 07, 09) memakai form generik dan sengaja
-- TIDAK didaftarkan di sini — storage_key bersifat NOT NULL, dan mengarang
-- nama berkas untuk sesuatu yang tidak ada hanya menunda kebingungan.

INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema) VALUES
  ('02', 'KETERANGAN_AKTIF',    'Surat Keterangan Aktif Organisasi',
         'template/surat-02-keterangan-aktif.docx',    '{}'::JSONB),
  ('03', 'ASPIRASI',            'Surat Pemberitahuan Aspirasi',
         'template/surat-03-aspirasi.docx',            '{}'::JSONB),
  ('04', 'UNDANGAN_PEMATERI',   'Surat Undangan Pemateri',
         'template/surat-04-undangan-pemateri.docx',   '{}'::JSONB),
  ('04', 'UNDANGAN_SAMBUTAN',   'Surat Undangan Sambutan',
         'template/surat-04-undangan-sambutan.docx',   '{}'::JSONB),
  ('05', 'PEMINJAMAN_BARANG',   'Surat Peminjaman Barang',
         'template/surat-05-peminjaman-barang.docx',   '{}'::JSONB),
  ('05', 'PEMINJAMAN_RUANGAN',  'Surat Peminjaman Ruangan',
         'template/surat-05-peminjaman-ruangan.docx',  '{}'::JSONB),
  ('08', 'KERJA_SAMA',          'Surat Kerja Sama',
         'template/surat-08-kerja-sama.docx',          '{}'::JSONB)
ON CONFLICT (kode_surat, varian, versi) DO NOTHING;

-- ===========================================================================
-- DIVISI PRESET — 9 baris (ADR-013)
-- ===========================================================================

INSERT INTO divisi_preset (nama, deskripsi, urutan) VALUES
  ('Acara',      'Rundown, teknis pelaksanaan, koordinasi sesi',       1),
  ('Konsumsi',   'Konsumsi panitia dan peserta',                       2),
  ('Humas',      'Relasi eksternal, pemateri, tamu undangan',          3),
  ('Peralatan',  'Perlengkapan, venue, transportasi',                  4),
  ('PDD',        'Publikasi, dekorasi, dokumentasi',                   5),
  ('P3K',        'Kesehatan dan keselamatan peserta',                  6),
  ('Sekretaris', 'Administrasi acara, persuratan, notulensi',          7),
  ('Bendahara',  'Keuangan acara, RAB, verifikasi awal nota',          8),
  ('Komdis',     'Ketertiban dan kedisiplinan peserta',                9)
ON CONFLICT (nama) DO NOTHING;

-- ===========================================================================
-- PRESET TUJUAN SURAT — 6 pilihan (PRD F-4.2)
-- ===========================================================================
-- "di Tempat" dipakai untuk tujuan di lingkungan kampus.
--
-- Redaksi jabatan di bawah adalah bentuk baku pada arsip surat HMIF, tetapi
-- PRD hanya menetapkan DAFTAR presetnya. SEED_DATA.md meminta konfirmasi
-- redaksi persis ke Sekretaris Umum pada T-054 sebelum dianggap final —
-- karena itu tabel ini dapat disunting Sekum tanpa perlu deployment.

INSERT INTO tujuan_surat_preset (label, nama, alamat, urutan) VALUES
  ('BEM FT UNTIRTA',               'Ketua BEM FT UNTIRTA',                                  'di Tempat', 1),
  ('DPM FT UNTIRTA',               'Ketua DPM FT UNTIRTA',                                  'di Tempat', 2),
  ('Kepala Bagian Sekretariat FT', 'Kepala Bagian Sekretariat Fakultas Teknik UNTIRTA',     'di Tempat', 3),
  ('Ketua Jurusan',                'Ketua Jurusan Teknik Informatika FT UNTIRTA',           'di Tempat', 4),
  ('Wakil Dekan III',              'Wakil Dekan III Fakultas Teknik UNTIRTA',               'di Tempat', 5),
  -- Sengaja kosong: pengguna mengisinya sendiri.
  ('Lainnya (isi manual)',         NULL,                                                     NULL,       6)
ON CONFLICT (label) DO NOTHING;
