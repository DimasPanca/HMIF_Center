-- Test migrasi 001 — extension terpasang DAN benar-benar berfungsi.
--
-- Memeriksa keberadaan baris di pg_extension saja tidak cukup: yang
-- dipertaruhkan adalah apakah operator class-nya dapat dipakai membangun
-- EXCLUDE constraint yang menjadi tumpuan seluruh sistem anti-bentrok.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-020 · ADR-020

DO $$
DECLARE
  v_ada     TEXT[];
  v_kurang  TEXT[];
  v_schema  TEXT;
  v_ditolak BOOLEAN := false;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Ketiganya terpasang
  ---------------------------------------------------------------------------
  SELECT array_agg(extname ORDER BY extname) INTO v_ada
  FROM pg_extension
  WHERE extname IN ('uuid-ossp', 'btree_gist', 'pg_trgm');

  v_kurang := ARRAY(
    SELECT e FROM unnest(ARRAY['btree_gist', 'pg_trgm', 'uuid-ossp']) AS e
    WHERE e <> ALL (COALESCE(v_ada, ARRAY[]::TEXT[]))
  );

  ASSERT cardinality(v_kurang) = 0,
    format('Extension belum terpasang: %s', array_to_string(v_kurang, ', '));

  ---------------------------------------------------------------------------
  -- 2. Berada di schema `extensions`, bukan `public` (ADR-020)
  --    Bila di `public`, db:reset akan menghapusnya dan database hasil reset
  --    tidak dapat dipakai.
  ---------------------------------------------------------------------------
  FOR v_schema IN
    SELECT n.nspname
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('uuid-ossp', 'btree_gist', 'pg_trgm')
  LOOP
    ASSERT v_schema = 'extensions',
      format('Extension berada di schema "%s", seharusnya "extensions" (ADR-020)', v_schema);
  END LOOP;

  ---------------------------------------------------------------------------
  -- 3. uuid_generate_v4() berfungsi — dipakai sebagai DEFAULT primary key
  ---------------------------------------------------------------------------
  ASSERT (SELECT uuid_generate_v4()) IS NOT NULL,
    'uuid_generate_v4() tidak dapat dipanggil';

  ---------------------------------------------------------------------------
  -- 4. pg_trgm berfungsi — dipakai pencarian arsip surat
  ---------------------------------------------------------------------------
  ASSERT (SELECT similarity('kaderisasi', 'kaderisai')) > 0.5,
    'similarity() tidak mengembalikan nilai yang wajar';

  ---------------------------------------------------------------------------
  -- 5. btree_gist benar-benar menegakkan anti-bentrok (INV-09)
  --    Inilah alasan sebenarnya extension ini ada.
  ---------------------------------------------------------------------------
  CREATE TABLE _t001_lock (
    id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    periode_id UUID NOT NULL,
    rentang    DATERANGE NOT NULL,
    CONSTRAINT _t001_no_overlap
      EXCLUDE USING gist (periode_id WITH =, rentang WITH &&)
  );

  INSERT INTO _t001_lock (periode_id, rentang)
  VALUES ('11111111-1111-1111-1111-111111111111',
          daterange('2026-11-01', '2026-12-08', '[)'));

  BEGIN
    INSERT INTO _t001_lock (periode_id, rentang)
    VALUES ('11111111-1111-1111-1111-111111111111',
            daterange('2026-11-20', '2026-11-26', '[)'));
  EXCEPTION
    WHEN exclusion_violation THEN v_ditolak := true;
  END;

  ASSERT v_ditolak,
    'EXCLUDE constraint TIDAK menolak rentang beririsan — anti-bentrok tidak berfungsi';

  -- Periode berbeda boleh beririsan: kunci ber-scope periode, bukan global.
  INSERT INTO _t001_lock (periode_id, rentang)
  VALUES ('22222222-2222-2222-2222-222222222222',
          daterange('2026-11-20', '2026-11-26', '[)'));

  DROP TABLE _t001_lock;

  RAISE NOTICE 'OK 001_extensions — 3 extension di schema extensions, EXCLUDE menolak bentrok';
END $$;
