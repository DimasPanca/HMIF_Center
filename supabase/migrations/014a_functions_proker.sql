-- 014a_functions_proker — fungsi domain untuk anti-bentrok proker.
--
-- Tiga fungsi:
--   cek_konflik_proker     pengecekan PREVENTIF, untuk memberi tahu lebih awal
--   setujui_proker         penegakan ATOMIK, satu-satunya jalur mengunci kalender
--   lepas_kunci_selesai    lifecycle harian, dijalankan cron
--
-- Pembagian antara dua fungsi pertama penting dan sering disalahpahami:
-- cek_konflik_proker hanya memberi tahu, ia TIDAK menjamin apa pun. Antara saat
-- ia dipanggil dan saat approval dieksekusi, departemen lain bisa saja menyetujui
-- proker di rentang yang sama. Yang menjamin adalah EXCLUDE constraint di dalam
-- setujui_proker (INV-09).
--
-- Sumber: SYSTEM_DESIGN §6.3, §6.4, §6.5 · PRD F-5.2, F-5.4 · INV-09, INV-10, INV-11, INV-13

-- ---------------------------------------------------------------------------
-- PENGECEKAN PREVENTIF
-- ---------------------------------------------------------------------------
-- Dipakai wizard proker saat user memilih tanggal, dan oleh panel konflik pada
-- halaman approval. Mengembalikan detail lengkap supaya pesan yang muncul bisa
-- menyebut proker dan departemen mana yang menghalangi — bukan sekadar
-- "tanggal tidak tersedia".

CREATE OR REPLACE FUNCTION cek_konflik_proker(
  p_periode_id UUID,
  p_mulai      DATE,
  p_selesai    DATE,
  p_exclude_id UUID DEFAULT NULL
) RETURNS TABLE (
  proker_id       UUID,
  nama_proker     TEXT,
  nama_departemen TEXT,
  rentang_mulai   DATE,
  rentang_selesai DATE
) AS $$
  SELECT
    p.id,
    p.nama,
    d.nama,
    lower(pl.rentang),
    -- Rentang disimpan '[)' eksklusif di ujung atas, jadi tanggal terakhir
    -- yang benar-benar terkunci adalah upper - 1.
    (upper(pl.rentang) - 1)::DATE
  FROM proker_lock pl
  JOIN proker p     ON p.id = pl.proker_id
  JOIN departemen d ON d.id = p.departemen_id
  WHERE pl.periode_id = p_periode_id
    -- daterange(mulai, selesai + 1, '[)') membuat kedua ujung inklusif (INV-11).
    AND pl.rentang && daterange(p_mulai, p_selesai + 1, '[)')
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id);
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION cek_konflik_proker IS
  'Pengecekan preventif untuk UX. TIDAK menjamin apa pun — penjaminnya EXCLUDE constraint di setujui_proker (INV-09).';

-- ---------------------------------------------------------------------------
-- APPROVAL — satu-satunya jalur yang boleh mengunci kalender
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION setujui_proker(
  p_proker_id   UUID,
  p_approver_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_proker  proker%ROWTYPE;
  v_rentang DATERANGE;
  v_konflik JSONB;
BEGIN
  -- FOR UPDATE mengunci baris proker sampai transaksi selesai. Tanpa ini, dua
  -- approval atas proker YANG SAMA bisa berjalan bersamaan dan keduanya lolos
  -- pemeriksaan status.
  SELECT * INTO v_proker FROM proker WHERE id = p_proker_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proker tidak ditemukan: %', p_proker_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_proker.status NOT IN ('MENUNGGU_APPROVAL', 'MENUNGGU_APPROVAL_REVISI') THEN
    RAISE EXCEPTION 'Proker berstatus % — hanya yang menunggu approval dapat disetujui',
      v_proker.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- BERKALA dan RESPONSIF disetujui tanpa mengunci kalender (INV-10).
  -- BERKALA memang bebas bentrok dengan apa pun; RESPONSIF bersifat insidental
  -- dan boleh berjalan bersamaan dengan acara lain.
  IF v_proker.kategori <> 'TERJADWAL' THEN
    UPDATE proker SET
      status         = 'DISETUJUI',
      disetujui_oleh = p_approver_id,
      disetujui_at   = now(),
      updated_at     = now()
    WHERE id = p_proker_id;

    RETURN jsonb_build_object('ok', true, 'locked', false, 'kategori', v_proker.kategori);
  END IF;

  -- Rentang terkunci membentang dari mulai persiapan sampai HARI TERAKHIR acara,
  -- inklusif di kedua ujung (INV-11).
  v_rentang := daterange(
    v_proker.tanggal_mulai_persiapan,
    v_proker.tanggal_hari_h_selesai + 1,
    '[)'
  );

  BEGIN
    -- Pada jalur REVISI, kunci lama dilepas lebih dulu supaya rentang barunya
    -- tidak bentrok dengan dirinya sendiri.
    --
    -- Bila INSERT di bawah gagal, sub-transaksi ini ikut dibatalkan sehingga
    -- DELETE-nya URUNG — kunci lama tetap berlaku (INV-13). Itu disengaja:
    -- proker tidak boleh kehilangan kuncinya hanya karena revisinya ditolak,
    -- karena di jeda itu departemen lain bisa menyerobot tanggalnya.
    DELETE FROM proker_lock WHERE proker_id = p_proker_id;

    -- =====================================================================
    -- INI TITIK PENEGAKANNYA (INV-09).
    -- Bila rentangnya beririsan dengan proker terjadwal lain pada periode
    -- yang sama, EXCLUDE constraint melempar exclusion_violation (23P01).
    -- Tidak ada jalan lain untuk menembusnya.
    -- =====================================================================
    INSERT INTO proker_lock (proker_id, periode_id, rentang)
    VALUES (p_proker_id, v_proker.periode_id, v_rentang);

  EXCEPTION WHEN exclusion_violation THEN
    -- Kumpulkan detail konflik supaya approver tahu persis apa yang menghalangi.
    SELECT jsonb_agg(jsonb_build_object(
             'proker',     k.nama_proker,
             'departemen', k.nama_departemen,
             'mulai',      k.rentang_mulai,
             'selesai',    k.rentang_selesai))
      INTO v_konflik
      FROM cek_konflik_proker(
             v_proker.periode_id,
             v_proker.tanggal_mulai_persiapan,
             v_proker.tanggal_hari_h_selesai,
             p_proker_id) k;

    UPDATE proker SET status = 'PERLU_REVISI', updated_at = now()
    WHERE id = p_proker_id;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'KONFLIK',
      'konflik', COALESCE(v_konflik, '[]'::JSONB)
    );
  END;

  UPDATE proker SET
    status         = 'DISETUJUI',
    disetujui_oleh = p_approver_id,
    disetujui_at   = now(),
    updated_at     = now()
  WHERE id = p_proker_id;

  RETURN jsonb_build_object('ok', true, 'locked', true, 'rentang', v_rentang::TEXT);
END; $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION setujui_proker IS
  'Satu-satunya jalur yang boleh mengisi proker_lock. Aplikasi dilarang INSERT langsung ke tabel itu.';

-- ---------------------------------------------------------------------------
-- LIFECYCLE HARIAN — dijalankan /api/cron/harian (ADR-009)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION lepas_kunci_selesai() RETURNS JSONB AS $$
DECLARE
  v_selesai INTEGER;
  v_lepas   INTEGER;
  v_jalan   INTEGER;
BEGIN
  -- 1. Acara yang hari terakhirnya sudah lewat dinyatakan SELESAI.
  UPDATE proker SET status = 'SELESAI', updated_at = now()
  WHERE status = 'BERJALAN'
    AND tanggal_hari_h_selesai < CURRENT_DATE;
  GET DIAGNOSTICS v_selesai = ROW_COUNT;

  -- 2. Kunci dilepas untuk proker yang sudah selesai atau dibatalkan.
  --    Tanpa langkah ini, kalender tetap terkunci oleh acara yang sudah
  --    berlalu dan departemen lain tidak bisa memakai tanggalnya.
  DELETE FROM proker_lock pl
  USING proker p
  WHERE pl.proker_id = p.id
    AND p.status IN ('SELESAI', 'DIBATALKAN');
  GET DIAGNOSTICS v_lepas = ROW_COUNT;

  -- 3. Proker yang masa persiapannya sudah tiba dinyatakan BERJALAN.
  --    Kuncinya TETAP ada — yang berubah hanya statusnya.
  UPDATE proker SET status = 'BERJALAN', updated_at = now()
  WHERE status = 'DISETUJUI'
    AND tanggal_mulai_persiapan <= CURRENT_DATE;
  GET DIAGNOSTICS v_jalan = ROW_COUNT;

  RETURN jsonb_build_object(
    'jadi_selesai',  v_selesai,
    'kunci_dilepas', v_lepas,
    'jadi_berjalan', v_jalan
  );
END; $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION lepas_kunci_selesai IS
  'Idempoten: dijalankan dua kali dalam sehari tidak menimbulkan efek ganda (ADR-009).';
