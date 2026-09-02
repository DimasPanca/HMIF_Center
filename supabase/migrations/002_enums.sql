-- 002_enums — seluruh tipe enum domain.
--
-- Enum dipakai, bukan TEXT bebas, karena status adalah aturan bisnis: nilai di
-- luar daftar tidak boleh pernah tersimpan. Kolom TEXT membuat typo lolos ke
-- database dan baru ketahuan berbulan-bulan kemudian saat query status gagal
-- mencocokkan apa pun.
--
-- 12 enum berasal dari SYSTEM_DESIGN §4.1; tiga sisanya menggantikan kolom TEXT
-- bebas pada dokumen yang sama (lihat catatan di bawah masing-masing).
--
-- Sumber: SYSTEM_DESIGN §4.1 · ADR-015

-- ---------------------------------------------------------------------------
-- Peran & organisasi
-- ---------------------------------------------------------------------------

-- Delapan peran. ADMIN bersifat teknis dan berada di luar struktur organisasi;
-- BPH bersifat read-only mutlak dan tidak pernah memperoleh hak tulis (INV-03).
CREATE TYPE role_code AS ENUM (
  'ADMIN', 'KETUA', 'WAKIL', 'SEKUM', 'BENDUM',
  'KADEPT', 'ANGGOTA', 'BPH'
);

CREATE TYPE periode_status AS ENUM ('AKTIF', 'ARSIP', 'PERSIAPAN');

-- ---------------------------------------------------------------------------
-- Program kerja
-- ---------------------------------------------------------------------------

-- Hanya TERJADWAL yang mengunci kalender (INV-10). BERKALA bebas bentrok dengan
-- apa pun; RESPONSIF butuh approval tetapi tidak mengunci.
CREATE TYPE proker_kategori AS ENUM ('TERJADWAL', 'BERKALA', 'RESPONSIF');

-- MENUNGGU_APPROVAL_REVISI dibedakan dari MENUNGGU_APPROVAL karena selama revisi
-- menunggu keputusan, kunci kalender yang LAMA tetap dipertahankan (INV-13).
-- Menyamakan keduanya berarti proker kehilangan kuncinya di tengah proses, dan
-- departemen lain bisa menyerobot tanggal itu.
CREATE TYPE proker_status AS ENUM (
  'DRAFT', 'MENUNGGU_APPROVAL', 'MENUNGGU_APPROVAL_REVISI',
  'DISETUJUI', 'BERJALAN', 'SELESAI', 'DITOLAK', 'PERLU_REVISI', 'DIBATALKAN'
);

-- ---------------------------------------------------------------------------
-- Persuratan
-- ---------------------------------------------------------------------------

-- DIBATALKAN ada dan tidak dihapus: nomor surat yang dibatalkan tidak pernah
-- didaur ulang, sehingga barisnya harus tetap hidup sebagai jejak audit (INV-16).
CREATE TYPE surat_status AS ENUM (
  'DRAFT', 'MENUNGGU_APPROVAL', 'DISETUJUI', 'TERBIT', 'DITOLAK', 'DIBATALKAN'
);

-- ---------------------------------------------------------------------------
-- Keuangan
-- ---------------------------------------------------------------------------

CREATE TYPE rab_status AS ENUM (
  'DRAFT', 'DIAJUKAN', 'DISETUJUI', 'REALISASI', 'SELESAI'
);

CREATE TYPE nota_status AS ENUM (
  'DIUNGGAH', 'MENUNGGU_VERIFIKASI', 'TERVERIFIKASI',
  'DITOLAK', 'PERLU_PERBAIKAN'
);

-- Menggantikan kolom TEXT bebas pada SYSTEM_DESIGN §4.10 (ADR-015).
-- LPJ butuh persetujuan dua tahap: Bendahara Umum lalu Ketua. Dengan TEXT bebas,
-- urutan itu tidak dapat ditegakkan database.
CREATE TYPE lpj_status AS ENUM (
  'DRAFT', 'DIAJUKAN', 'DISETUJUI_BENDUM', 'FINAL'
);

-- ---------------------------------------------------------------------------
-- Progres & kendala
-- ---------------------------------------------------------------------------

CREATE TYPE kendala_status AS ENUM ('TERBUKA', 'SEDANG_DITANGANI', 'SELESAI');
CREATE TYPE prioritas      AS ENUM ('RENDAH', 'SEDANG', 'TINGGI', 'KRITIS');
CREATE TYPE kanban_kolom   AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');

-- ---------------------------------------------------------------------------
-- Kesekretariatan & berkas
-- ---------------------------------------------------------------------------

CREATE TYPE kehadiran AS ENUM ('HADIR', 'IZIN', 'SAKIT', 'ALFA');

-- Menentukan kualitas kompresi gambar master: DOKUMEN memakai kualitas 93 dan
-- resize lebih konservatif agar teks pada nota tetap terbaca saat dicetak,
-- FOTO memakai 90 (PRD F-11.2).
CREATE TYPE image_kind AS ENUM ('FOTO', 'DOKUMEN');

-- ---------------------------------------------------------------------------
-- Backup
-- ---------------------------------------------------------------------------

-- Menggantikan kolom TEXT bebas pada SYSTEM_DESIGN §4.11.
-- Pembedaan ini menentukan retensi: hanya OTOMATIS yang boleh dihapus job
-- pembersihan; MANUAL dan PRA_RESTORE disimpan selamanya (ADR-016).
CREATE TYPE backup_jenis  AS ENUM ('OTOMATIS', 'MANUAL', 'PRA_RESTORE');
CREATE TYPE backup_status AS ENUM ('BERJALAN', 'SUKSES', 'GAGAL');
