-- 015a_rls_helpers — fungsi pembantu Row Level Security.
--
-- Enam fungsi yang dipakai seluruh policy di migrasi 015b. Semuanya
-- SECURITY DEFINER karena harus membaca user_role dan divisi_member tanpa
-- terjerat policy tabel itu sendiri — tanpa itu, policy yang memanggilnya
-- akan memanggil dirinya sendiri tanpa henti.
--
-- Dua aturan yang tidak boleh dilanggar saat menambah helper baru di sini:
--
--   1. Kembalikan ARRAY KOSONG, bukan NULL. Policy memakai bentuk
--      `x = ANY(helper())`. Dengan NULL, seluruh perbandingan menjadi NULL,
--      dan NULL pada klausa USING diperlakukan sebagai FALSE — kebetulan
--      aman, tetapi hanya kebetulan. Bentuk `NOT (x = ANY(NULL))` juga NULL,
--      sehingga policy negatif akan gagal menolak. Array kosong menghasilkan
--      FALSE yang jujur di kedua arah.
--
--   2. Kunci search_path. SECURITY DEFINER berjalan dengan hak pemilik
--      database; tanpa search_path terkunci, pemanggil dapat membuat schema
--      berisi tabel bernama `user_role` miliknya sendiri, menaruhnya di depan
--      search_path, dan fungsi ini akan membaca tabel palsu itu dengan hak
--      penuh. Itu jalan pintas menjadi Admin.
--
-- Sumber: SYSTEM_DESIGN §5.2 · PRD §4.4 · INV-01, INV-02, INV-08

-- ---------------------------------------------------------------------------
-- ROLE
-- ---------------------------------------------------------------------------
-- Selalu dibaca dari periode AKTIF, tidak pernah dari klaim JWT (INV-02).
-- Klien tidak dapat menyuntikkan role: satu-satunya sumber adalah baris
-- user_role di database.

CREATE OR REPLACE FUNCTION auth_roles() RETURNS role_code[] AS $$
  SELECT COALESCE(array_agg(ur.role), ARRAY[]::role_code[])
  FROM user_role ur
  JOIN periode p ON p.id = ur.periode_id AND p.status = 'AKTIF'
  WHERE ur.user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION auth_roles IS
  'Role pengguna pada periode AKTIF. Dibaca dari user_role, tidak pernah dari klaim JWT (INV-02).';

CREATE OR REPLACE FUNCTION has_role(VARIADIC checked role_code[]) RETURNS BOOLEAN AS $$
  SELECT auth_roles() && checked;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- LINGKUP DEPARTEMEN DAN KEPANITIAAN
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION my_departemen() RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(DISTINCT ur.departemen_id), ARRAY[]::UUID[])
  FROM user_role ur
  JOIN periode p ON p.id = ur.periode_id AND p.status = 'AKTIF'
  WHERE ur.user_id = auth.uid() AND ur.departemen_id IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- CATATAN LINGKUP PERIODE (INV-08).
--
-- my_divisi() dan my_kepanitiaan() TIDAK menyaring periode, berbeda dengan
-- auth_roles() dan my_departemen(). Itu disengaja: mode arsip mengizinkan
-- mantan panitia membaca kembali acara periode lalu.
--
-- Konsekuensinya, keduanya TIDAK BOLEH dipakai sendirian pada policy tulis.
-- Policy INSERT/UPDATE/DELETE di 015b wajib menambahkan syarat periode aktif,
-- karena tanpa itu mantan panitia 2025/2026 masih dapat menyunting RAB acara
-- yang sudah diarsipkan.

CREATE OR REPLACE FUNCTION my_divisi() RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(dm.divisi_id), ARRAY[]::UUID[])
  FROM divisi_member dm WHERE dm.user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Keterlibatan dalam kepanitiaan datang dari DUA jalur yang harus digabung:
-- keanggotaan divisi, dan penunjukan sebagai ketua pelaksana. Ketua pelaksana
-- belum tentu terdaftar di divisi mana pun.
--
-- SYSTEM_DESIGN §5.2 menuliskannya sebagai dua SELECT beragregat yang
-- di-UNION. Bentuk itu SALAH dan gagal diam-diam: UNION menghasilkan dua
-- BARIS array, sedangkan fungsi SQL yang mengembalikan UUID[] hanya mengambil
-- baris pertama. Diukur pada T-037 terhadap versi tersebut:
--
--   pengguna yang HANYA ketua pelaksana        -> {}      (seharusnya 1)
--   anggota divisi DAN ketua acara lain        -> 1 dari 2
--
-- Jadi cabang ketua pelaksana tidak pernah ikut sama sekali. Akibatnya ketua
-- pelaksana kehilangan akses ke acaranya sendiri.
--
-- Yang benar adalah menggabungkan HIMPUNAN ID-nya lebih dulu, baru diagregat
-- satu kali.

CREATE OR REPLACE FUNCTION my_kepanitiaan() RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::UUID[])
  FROM (
    SELECT d.kepanitiaan_id AS id
    FROM divisi_member dm
    JOIN divisi d ON d.id = dm.divisi_id
    WHERE dm.user_id = auth.uid()

    UNION

    SELECT k.id
    FROM kepanitiaan k
    WHERE k.ketua_pelaksana = auth.uid()
  ) s;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION my_kepanitiaan IS
  'Gabungan keanggotaan divisi dan peran ketua pelaksana. Tidak menyaring periode — jangan dipakai sendirian pada policy tulis.';

-- ---------------------------------------------------------------------------
-- PIMPINAN
-- ---------------------------------------------------------------------------
-- PERINGATAN: is_pimpinan() memasukkan BPH, dan BPH TIDAK PERNAH boleh
-- menulis (INV-03) maupun muncul sebagai approver (INV-04).
--
-- Fungsi ini hanya menyatakan "berhak melihat lintas departemen". Memakainya
-- pada policy INSERT, UPDATE, atau DELETE akan memberi BPH hak tulis dan
-- melanggar INV-03. Untuk policy tulis, sebutkan role-nya secara eksplisit:
--
--   has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM')

CREATE OR REPLACE FUNCTION is_pimpinan() RETURNS BOOLEAN AS $$
  SELECT has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM','BPH');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION is_pimpinan IS
  'Hak BACA lintas departemen. Termasuk BPH, jadi DILARANG dipakai pada policy tulis (INV-03).';
