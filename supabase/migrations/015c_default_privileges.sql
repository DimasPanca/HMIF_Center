-- 015c_default_privileges — hak bawaan untuk objek yang belum dibuat.
--
-- Memperbaiki cacat pada 015b yang baru terlihat setelah diuji.
--
-- 015b memberi hak dengan `GRANT ... ON ALL TABLES IN SCHEMA public`. Perintah
-- itu bekerja sekali, atas tabel yang ADA pada saat itu. Diukur langsung:
--
--   GRANT authenticated pada tabel lama (proker)  -> 4 hak
--   GRANT authenticated pada tabel yang baru dibuat -> 0 hak
--
-- Artinya setiap tabel dan VIEW dari migrasi 016 dan seterusnya akan lahir
-- tanpa hak apa pun bagi aplikasi. Gejalanya bukan error, melainkan halaman
-- yang selalu kosong — jenis kegagalan yang paling lama dicari, karena
-- policy-nya terlihat benar dan datanya jelas ada di database.
--
-- ALTER DEFAULT PRIVILEGES menutup itu untuk selamanya: objek apa pun yang
-- kelak dibuat oleh `postgres` di schema public otomatis memperoleh hak yang
-- sama. Migrasi selalu berjalan sebagai `postgres`, jadi cakupannya tepat.
--
-- Berlaku surut? TIDAK. ALTER DEFAULT PRIVILEGES hanya mengenai objek yang
-- dibuat SETELAHNYA. Karena itu GRANT eksplisit di bawah tetap dijalankan
-- sekali lagi untuk objek yang sudah ada — sekaligus menutup celah bila
-- migrasi ini dijalankan pada database yang sudah berisi.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-038 · INV-01

-- ---------------------------------------------------------------------------
-- HAK UNTUK OBJEK YANG SUDAH ADA
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_log FROM authenticated;
REVOKE ALL ON _migrasi FROM authenticated;

-- ---------------------------------------------------------------------------
-- HAK BAWAAN UNTUK OBJEK YANG BELUM DIBUAT
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- anon tidak pernah memperoleh apa pun, termasuk pada objek yang belum ada.
-- Seluruh sistem ini internal kepengurusan dan menuntut login.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- ===========================================================================
-- PERINGATAN UNTUK T-040 (VIEW)
-- ===========================================================================
-- View di PostgreSQL dijalankan dengan hak PEMILIKNYA, bukan hak penanya.
-- Karena seluruh view di sini akan dimiliki `postgres` yang ber-BYPASSRLS,
-- sebuah view biasa akan MENEMBUS seluruh policy di 015b: siapa pun yang
-- boleh membaca view itu akan melihat semua baris, termasuk milik departemen
-- dan divisi lain.
--
-- Setiap view yang membaca tabel ber-RLS WAJIB dibuat dengan:
--
--   CREATE VIEW nama_view WITH (security_invoker = true) AS ...
--
-- Tanpa opsi itu, seluruh pekerjaan RLS di 015b tidak berlaku lewat view.
-- ===========================================================================
