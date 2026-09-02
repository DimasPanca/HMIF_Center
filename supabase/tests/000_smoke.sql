-- 000_smoke — pemeriksaan paling dasar sebelum test lain berarti apa pun.
--
-- Bila berkas ini gagal, seluruh test setelahnya tidak perlu dipercaya:
-- entah koneksinya salah, versi Postgres tidak memenuhi syarat, extension
-- belum aktif, atau kita tidak punya izin menulis.
--
-- Dijalankan runner dalam transaksi yang selalu di-ROLLBACK, jadi tabel yang
-- dibuat di sini tidak pernah benar-benar tersimpan.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-019

DO $$
DECLARE
  v_versi_teks TEXT;
  v_major      INT;
  v_ext        TEXT[];
  v_kurang     TEXT[];
  v_bisa_tulis BOOLEAN := false;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Versi Postgres minimal 15
  --    daterange + GiST EXCLUDE constraint dan fitur JSONB yang dipakai
  --    sistem ini mensyaratkannya.
  ---------------------------------------------------------------------------
  v_versi_teks := current_setting('server_version');
  v_major := split_part(v_versi_teks, '.', 1)::INT;

  ASSERT v_major >= 15,
    format('PostgreSQL %s terlalu tua; dibutuhkan minimal 15', v_versi_teks);

  ---------------------------------------------------------------------------
  -- 2. Tiga extension wajib
  --    Tanpa btree_gist, EXCLUDE constraint pada proker_lock tidak dapat
  --    dibuat dan seluruh sistem anti-bentrok proker gagal (INV-09).
  ---------------------------------------------------------------------------
  SELECT array_agg(extname ORDER BY extname) INTO v_ext
  FROM pg_extension
  WHERE extname IN ('uuid-ossp', 'btree_gist', 'pg_trgm');

  v_kurang := ARRAY(
    SELECT e FROM unnest(ARRAY['btree_gist', 'pg_trgm', 'uuid-ossp']) AS e
    WHERE e <> ALL (COALESCE(v_ext, ARRAY[]::TEXT[]))
  );

  ASSERT cardinality(v_kurang) = 0,
    format('Extension belum terpasang: %s', array_to_string(v_kurang, ', '));

  ---------------------------------------------------------------------------
  -- 3. Izin menulis di schema public
  --    db:reset membuat ulang schema beserta grant-nya; bila grant hilang,
  --    migrasi berikutnya gagal dengan pesan yang menyesatkan.
  ---------------------------------------------------------------------------
  CREATE TABLE _smoke_tulis (id INT PRIMARY KEY, catatan TEXT);
  INSERT INTO _smoke_tulis VALUES (1, 'bisa menulis');
  SELECT count(*) = 1 INTO v_bisa_tulis FROM _smoke_tulis;
  DROP TABLE _smoke_tulis;

  ASSERT v_bisa_tulis, 'Tidak dapat membuat dan menulis tabel di schema public';

  ---------------------------------------------------------------------------
  -- 4. Mekanisme anti-bentrok benar-benar berfungsi
  --    Extension terpasang belum membuktikan apa pun. Yang dipertaruhkan
  --    adalah apakah EXCLUDE constraint sungguh menolak rentang beririsan.
  ---------------------------------------------------------------------------
  CREATE TABLE _smoke_lock (
    id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    periode_id UUID NOT NULL,
    rentang    DATERANGE NOT NULL,
    CONSTRAINT _smoke_no_overlap
      EXCLUDE USING gist (periode_id WITH =, rentang WITH &&)
  );

  INSERT INTO _smoke_lock (periode_id, rentang)
  VALUES ('11111111-1111-1111-1111-111111111111',
          daterange('2026-11-01', '2026-12-08', '[)'));

  BEGIN
    INSERT INTO _smoke_lock (periode_id, rentang)
    VALUES ('11111111-1111-1111-1111-111111111111',
            daterange('2026-11-20', '2026-11-26', '[)'));
    RAISE EXCEPTION 'EXCLUDE constraint TIDAK menolak rentang beririsan — anti-bentrok rusak';
  EXCEPTION
    WHEN exclusion_violation THEN
      NULL;  -- inilah yang diharapkan
  END;

  -- Rentang bersebelahan (tidak beririsan) harus tetap diterima.
  INSERT INTO _smoke_lock (periode_id, rentang)
  VALUES ('11111111-1111-1111-1111-111111111111',
          daterange('2026-12-08', '2026-12-20', '[)'));

  DROP TABLE _smoke_lock;

  RAISE NOTICE 'OK 000_smoke — PostgreSQL %, extension lengkap, tulis & EXCLUDE berfungsi',
    v_versi_teks;
END $$;
