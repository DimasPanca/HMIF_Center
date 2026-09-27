-- 028_audit_pelaku — audit_log.user_id terisi untuk mutasi lewat aplikasi (INV-07).
--
-- Sebelum migrasi ini, konteks_user_id() (014c) hanya membaca auth.uid(). Koneksi
-- aplikasi (Prisma, peran pemilik) tidak membawa JWT, sehingga SETIAP mutasi
-- lewat route tercatat tanpa pelaku — IP dan user agent ada, "siapa" tidak.
-- Pada 2026-09-27 di proyek dev: 0 dari 185 baris audit trigger punya user_id.
--
-- withAuditContext() kini menyetel app.user_id (transaction-local) dari sesi
-- yang sudah diverifikasi guard. Urutan pembacaan di bawah disengaja:
--
--   1. auth.uid() lebih dulu. Koneksi ber-JWT (PostgREST/realtime, test RLS)
--      membawa identitas yang ditandatangani Supabase — itu yang paling
--      dipercaya, dan pengguna koneksi itu tidak dapat menyetel app.* sendiri.
--   2. app.user_id sesudahnya, untuk koneksi aplikasi yang tak ber-JWT.
--   3. NULL bila keduanya kosong: cron dan skrip (withServiceContext) — itu
--      keterangan "pelakunya sistem", bukan kegagalan (lihat 013/014c).
--
-- app.user_id yang bukan UUID sengaja MELEMPAR: nilainya hanya berasal dari
-- id sesi Supabase, dan audit yang diam-diam kehilangan pelaku lebih buruk
-- daripada mutasi yang gagal keras.
--
-- Idempotent: CREATE OR REPLACE; trigger yang memanggil fungsi ini tidak
-- perlu dipasang ulang.

CREATE OR REPLACE FUNCTION konteks_user_id() RETURNS UUID AS $$
DECLARE
  v_uid UUID;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    -- Tidak ada JWT, klaimnya rusak, atau schema auth tidak tersedia.
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    v_uid := NULLIF(current_setting('app.user_id', true), '')::UUID;
  END IF;

  RETURN v_uid;
END; $$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION konteks_user_id IS
  'Pelaku mutasi: auth.uid() bila ber-JWT, jika tidak app.user_id dari withAuditContext. NULL = cron/skrip.';
