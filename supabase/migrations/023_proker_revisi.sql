-- 023_proker_revisi — snapshot NILAI LAMA sebuah proker saat revisi tanggal
-- (mayor) diajukan, untuk dikembalikan bila revisi ditolak.
--
-- ===========================================================================
-- KENAPA SNAPSHOT, DAN KENAPA HANYA MEDAN MAYOR
-- ===========================================================================
-- Menyunting proker DISETUJUI yang mengubah tanggal/kategori/departemen (MAYOR,
-- USER_FLOW §4.4) memindahkan proker ke MENUNGGU_APPROVAL_REVISI. Sepanjang
-- masa itu, baris `proker` sudah memuat tanggal BARU (yang menunggu persetujuan),
-- tetapi `proker_lock` MASIH memegang rentang LAMA (INV-13) — lihat komentar di
-- lib/proker/service.ts kalenderTerkunci().
--
-- Bila revisi DITOLAK, proker harus kembali ke tanggal lama (§4.4). Rentang lama
-- memang tersimpan di `proker_lock`, tetapi `daterange` tidak menyimpan
-- hari-H MULAI secara terpisah, dan tidak menyimpan kategori/departemen sama
-- sekali. Karena itu nilai lama di-snapshot utuh di sini sebelum yang baru
-- ditulis. Hanya medan MAYOR yang di-snapshot: suntingan minor (deskripsi, dst.)
-- tidak dikembalikan saat revisi ditolak — yang ditolak adalah perubahan tanggal.
--
-- Baris ini muncul HANYA selama MENUNGGU_APPROVAL_REVISI: dibuat saat revisi
-- diajukan, dihapus saat revisi disetujui (setujui_proker memindah kunci) atau
-- ditolak (tolakRevisi mengembalikan tanggal lama). Satu baris per proker.
--
-- Sumber: docs/ai/tasks/P3-proker-gantt.md T-071 · PRD §5.2 no.4 ·
--         USER_FLOW §4.4, §11.1 · INV-13

CREATE TABLE proker_revisi (
  proker_id     UUID PRIMARY KEY REFERENCES proker(id) ON DELETE CASCADE,

  -- Nilai LAMA (sebelum revisi). Tanggal boleh NULL (kategori tak berjadwal),
  -- kategori & departemen selalu ada.
  tanggal_mulai_persiapan DATE,
  tanggal_hari_h_mulai    DATE,
  tanggal_hari_h_selesai  DATE,
  kategori      proker_kategori NOT NULL,
  departemen_id UUID NOT NULL REFERENCES departemen(id),
  pola_ulang    JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE proker_revisi IS
  'Snapshot nilai LAMA proker selama MENUNGGU_APPROVAL_REVISI, untuk revert bila revisi ditolak (T-071). Dihapus saat revisi disetujui atau ditolak.';

-- ---------------------------------------------------------------------------
-- RLS — mengikuti proker
-- ---------------------------------------------------------------------------
-- Tabel lahir setelah loop 015b, jadi RLS diaktifkan eksplisit. Hak tabel untuk
-- `authenticated` otomatis dari ALTER DEFAULT PRIVILEGES 015c.
--
-- Snapshot dibuat oleh pengelola departemen proker (saat mengajukan revisi), dan
-- dibaca/dihapus oleh Ketua/Wakil (saat menyetujui/menolak revisi) atau pengelola
-- itu sendiri. is_pimpinan() TIDAK dipakai pada tulis (INV-03 — BPH tak menulis).

ALTER TABLE proker_revisi ENABLE ROW LEVEL SECURITY;

CREATE POLICY proker_revisi_select ON proker_revisi FOR SELECT
  USING (true);

CREATE POLICY proker_revisi_insert ON proker_revisi FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proker p
      WHERE p.id = proker_id AND kelola_dept(p.departemen_id) AND p.periode_id = periode_aktif()
    )
  );

CREATE POLICY proker_revisi_delete ON proker_revisi FOR DELETE
  USING (
    has_role('ADMIN', 'KETUA', 'WAKIL')
    OR EXISTS (
      SELECT 1 FROM proker p
      WHERE p.id = proker_id AND kelola_dept(p.departemen_id)
    )
  );
