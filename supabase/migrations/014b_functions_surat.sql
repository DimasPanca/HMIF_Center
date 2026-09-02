-- 014b_functions_surat — alokasi nomor surat dan pergantian periode.
--
-- Nomor surat adalah identitas resmi organisasi. Dua surat bernomor sama
-- merusak jejak audit secara permanen: tidak bisa diperbaiki tanpa membatalkan
-- dokumen yang sudah beredar, dan nomor yang dibatalkan tidak boleh didaur
-- ulang (INV-16).
--
-- Sumber: SYSTEM_DESIGN §7.2, §7.3, §7.4 · PRD F-4.1 · ADR-001, ADR-003 · INV-14..INV-17

-- ---------------------------------------------------------------------------
-- ALOKASI NOMOR
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION alokasi_nomor_surat(
  p_surat_id UUID,
  p_approver UUID
) RETURNS TEXT AS $$
DECLARE
  v_surat        surat%ROWTYPE;
  v_next         INTEGER;
  v_bulan_romawi TEXT;
  v_kode_adm     TEXT;
  v_nomor        TEXT;
  v_lock_key     BIGINT;
BEGIN
  SELECT * INTO v_surat FROM surat WHERE id = p_surat_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Surat tidak ditemukan: %', p_surat_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- IDEMPOTEN. Bila surat sudah bernomor, kembalikan nomor yang sama tanpa
  -- menaikkan counter. Ini penting karena approval bisa di-retry: request
  -- timeout lalu diulang tidak boleh menghabiskan dua nomor.
  IF v_surat.nomor_urut IS NOT NULL THEN
    RETURN v_surat.nomor_lengkap;
  END IF;

  IF v_surat.status <> 'MENUNGGU_APPROVAL' THEN
    RAISE EXCEPTION 'Surat berstatus % — nomor hanya dialokasikan saat approval (INV-14)',
      v_surat.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- =====================================================================
  -- ADVISORY LOCK PER PERIODE (INV-15) — lapis kedua dari tiga.
  --
  -- Nomor kembar dicegah oleh tiga hal yang saling menopang. Pembagiannya
  -- diukur, bukan diasumsikan: 20 approval serentak lewat transaction pooler
  -- dijalankan terhadap tiga varian fungsi ini.
  --
  --   1. Index unik parsial surat_nomor_unik_per_periode (migrasi 009).
  --      Benteng terakhir. Saat pola baca-lalu-tulis diuji tanpa kunci apa
  --      pun, 18 dari 20 approval DITOLAK index ini. Itu perilaku yang
  --      diinginkan: nomor kembar gagal keras, tidak pernah diam-diam masuk.
  --
  --   2. UPDATE ... SET nomor_terakhir = nomor_terakhir + 1 RETURNING
  --      di bawah. Bentuk ini atomik: row lock pada baris counter membuat
  --      transaksi lain menunggu lalu membaca ulang nilai terbaru. Inilah
  --      yang menanggung beban sehari-hari — 20 approval serentak lulus
  --      bahkan ketika advisory lock sengaja dilepas.
  --
  --   3. Advisory lock ini. Ia menyerialkan SELURUH blok alokasi, bukan
  --      hanya satu pernyataan. Nilainya terbukti pada varian naif:
  --      pola baca-lalu-tulis yang gagal 18 kali tanpa kunci ini menjadi
  --      lulus 20/20 dengannya. Artinya ia melindungi dari refactor yang
  --      memecah keatomikan poin 2 — dan itu refactor yang wajar dilakukan
  --      orang yang tidak tahu bahwa bentuk UPDATE-nya yang menyelamatkan.
  --
  -- JANGAN menghapusnya dengan alasan "sudah aman tanpa itu". Benar bahwa
  -- test hari ini tetap hijau tanpanya; yang hilang adalah jaring pengaman
  -- untuk perubahan berikutnya.
  --
  -- Kuncinya berbasis periode, bukan global: periode berbeda tidak saling
  -- memblokir, sehingga arsip lama tetap dapat diproses tanpa menunggu.
  --
  -- Bersifat transaction-scoped, jadi otomatis dilepas saat transaksi
  -- berakhir — termasuk bila terjadi error.
  -- =====================================================================
  v_lock_key := hashtextextended(v_surat.periode_id::TEXT, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Baris counter dibuat bila belum ada, dimulai dari nomor_surat_awal - 1
  -- sehingga alokasi pertama menghasilkan tepat nomor_surat_awal (ADR-003).
  INSERT INTO surat_counter (periode_id, nomor_terakhir)
  VALUES (v_surat.periode_id,
          (SELECT nomor_surat_awal - 1 FROM periode WHERE id = v_surat.periode_id))
  ON CONFLICT (periode_id) DO NOTHING;

  UPDATE surat_counter
     SET nomor_terakhir = nomor_terakhir + 1,
         updated_at     = now()
   WHERE periode_id = v_surat.periode_id
  RETURNING nomor_terakhir INTO v_next;

  -- Bulan Romawi, bukan angka. Acceptance criteria PRD F-4.1 menyebut Oktober
  -- secara khusus: harus X, bukan 10.
  v_bulan_romawi := (ARRAY['I','II','III','IV','V','VI',
                           'VII','VIII','IX','X','XI','XII']
                    )[EXTRACT(MONTH FROM v_surat.tanggal_surat)::INT];

  -- Kode administrasi dibaca dari konfigurasi, tidak di-hardcode (ADR-001),
  -- supaya koreksi nilainya cukup satu baris app_config tanpa ubah kode.
  SELECT value #>> '{}' INTO v_kode_adm FROM app_config WHERE key = 'kode_administrasi';
  v_kode_adm := COALESCE(v_kode_adm, 'UN43.3.7');

  -- KODE / URUT / ADMINISTRASI / KEGIATAN / ROMAWI / TAHUN
  -- Nomor urut di-pad tiga digit: 001, bukan 1.
  v_nomor := format('%s/%s/%s/%s/%s/%s',
    v_surat.kode_surat,
    lpad(v_next::TEXT, 3, '0'),
    v_kode_adm,
    v_surat.kode_kegiatan,
    v_bulan_romawi,
    EXTRACT(YEAR FROM v_surat.tanggal_surat)::INT
  );

  UPDATE surat SET
    nomor_urut        = v_next,
    bulan_romawi      = v_bulan_romawi,
    tahun             = EXTRACT(YEAR FROM v_surat.tanggal_surat)::INT,
    kode_administrasi = v_kode_adm,
    nomor_lengkap     = v_nomor,
    status            = 'DISETUJUI',
    disetujui_oleh    = p_approver,
    disetujui_at      = now(),
    updated_at        = now()
  WHERE id = p_surat_id;

  RETURN v_nomor;
END; $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION alokasi_nomor_surat IS
  'Satu-satunya jalur alokasi nomor (INV-15). Dilarang menghitung nomor di TypeScript. Idempoten terhadap retry.';

-- ---------------------------------------------------------------------------
-- ALOKASI MASSAL
-- ---------------------------------------------------------------------------
-- Untuk Surat Keterangan Aktif Organisasi yang diterbitkan untuk puluhan
-- mahasiswa sekaligus (PRD F-4.2).
--
-- Advisory lock bersifat transaction-scoped, sehingga SELURUH batch berada di
-- balik satu kunci. Nomor yang dihasilkan dijamin berurutan tanpa disela
-- permohonan lain — penting karena surat massal biasanya dicetak berurutan
-- dan nomor yang meloncat akan terlihat mencurigakan saat audit.

CREATE OR REPLACE FUNCTION alokasi_nomor_batch(
  p_surat_ids UUID[],
  p_approver  UUID
) RETURNS TABLE (surat_id UUID, nomor TEXT) AS $$
DECLARE
  v_id UUID;
BEGIN
  IF array_length(p_surat_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF array_length(p_surat_ids, 1) > 50 THEN
    RAISE EXCEPTION 'Batch % surat melebihi batas 50 — pecah menjadi beberapa batch',
      array_length(p_surat_ids, 1)
      USING ERRCODE = 'program_limit_exceeded';
  END IF;

  FOREACH v_id IN ARRAY p_surat_ids LOOP
    RETURN QUERY SELECT v_id, alokasi_nomor_surat(v_id, p_approver);
  END LOOP;
END; $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- PERGANTIAN PERIODE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION aktifkan_periode(p_periode_id UUID) RETURNS JSONB AS $$
DECLARE
  v_lama    UUID;
  v_awal    INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM periode WHERE id = p_periode_id) THEN
    RAISE EXCEPTION 'Periode tidak ditemukan: %', p_periode_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_lama FROM periode WHERE status = 'AKTIF';

  -- Arsipkan yang lama LEBIH DULU. Index periode_hanya_satu_aktif menolak dua
  -- periode aktif, jadi urutan terbalik akan gagal di tengah jalan.
  IF v_lama IS NOT NULL AND v_lama <> p_periode_id THEN
    UPDATE periode SET status = 'ARSIP', updated_at = now() WHERE id = v_lama;
  END IF;

  UPDATE periode SET status = 'AKTIF', updated_at = now() WHERE id = p_periode_id;

  -- Counter periode baru dimulai dari nomor_surat_awal - 1, sehingga surat
  -- pertama bernomor tepat nomor_surat_awal — default 001 (ADR-003).
  SELECT nomor_surat_awal INTO v_awal FROM periode WHERE id = p_periode_id;

  INSERT INTO surat_counter (periode_id, nomor_terakhir)
  VALUES (p_periode_id, v_awal - 1)
  ON CONFLICT (periode_id) DO NOTHING;

  RETURN jsonb_build_object(
    'periode_baru',  p_periode_id,
    'periode_lama',  v_lama,
    'nomor_pertama', v_awal
  );
END; $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aktifkan_periode IS
  'Mengarsipkan periode aktif lama lalu mengaktifkan yang baru, dan menyiapkan counter nomor suratnya (ADR-003).';
