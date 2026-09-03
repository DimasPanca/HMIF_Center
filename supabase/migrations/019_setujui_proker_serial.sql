-- 019_setujui_proker_serial — menyerialkan approval proker per periode.
--
-- ===========================================================================
-- APA YANG DIPERBAIKI
-- ===========================================================================
-- Versi 014a sudah menjamin hal yang paling penting: dua proker TERJADWAL
-- beririsan TIDAK PERNAH sama-sama terkunci. Itu dijaga EXCLUDE constraint dan
-- tetap berlaku tanpa migrasi ini (INV-09).
--
-- Yang tidak dijaga adalah CARA kegagalannya sampai ke pengguna. Diukur oleh
-- `scripts/stress-anti-bentrok.ts` (T-066) terhadap database sungguhan: pada
-- DUA approval yang benar-benar bersamaan, pesaing yang kalah berakhir dengan
--
--     40P01  deadlock detected
--     while checking exclusion constraint on tuple (0,1) in relation "proker_lock"
--
-- pada dua dari tiga jalan. Penyebabnya bukan bug melainkan sifat pemeriksaan
-- EXCLUDE constraint: masing-masing transaksi menyisipkan barisnya, melihat
-- baris lawan yang belum di-commit, lalu MENUNGGU keputusan lawan. Keduanya
-- saling menunggu, dan PostgreSQL memutus siklusnya dengan membunuh salah satu.
--
-- Deadlock bukan `exclusion_violation`, jadi blok EXCEPTION di 014a tidak
-- menangkapnya. Akibatnya bagi pengguna:
--
--   - approver menerima error 500, bukan panel konflik;
--   - prokernya tetap MENUNGGU_APPROVAL, bukan PERLU_REVISI;
--   - daftar konflik tidak pernah terbentuk, sehingga ia tidak tahu tanggal
--     mana yang menghalangi.
--
-- PRD F-5.2 Acceptance Criteria menuntut sebaliknya, kata per kata:
--
--   > Dua Kadept submit proker bentrok pada detik yang sama -> hanya satu
--   > berhasil, satunya mendapat pesan konflik
--
-- "Hanya satu berhasil" sudah terpenuhi. "Mendapat pesan konflik" belum.
--
-- Anehnya, sepuluh approval serentak justru selalu lulus: yang pertama
-- menyisipkan lebih dulu dan sembilan sisanya mengantre di belakang SATU baris,
-- sehingga tidak ada siklus. Kasus dua pesaing — yang paling mungkin terjadi
-- di organisasi dengan enam departemen — justru satu-satunya yang rusak.
--
-- ===========================================================================
-- PERBAIKANNYA: ADVISORY LOCK PER PERIODE
-- ===========================================================================
-- Idiom yang sama sudah dipakai `alokasi_nomor_surat` (014b) untuk alasan yang
-- sama, dan alasan itu berlaku persis di sini: approval adalah blok
-- baca-lalu-tulis yang keatomikannya tidak dapat dijamin satu pernyataan.
--
-- Dengan kunci ini, approval kedua MENUNGGU approval pertama selesai, lalu
-- INSERT-nya gagal seketika dengan exclusion_violation yang memang ditangkap
-- blok EXCEPTION — pesan konflik lengkap, status PERLU_REVISI, tanpa deadlock.
--
-- Kuncinya berbasis periode, bukan global: periode berbeda tidak saling
-- memblokir. Biaya throughput-nya nihil dalam praktik — approval proker terjadi
-- beberapa puluh kali per kepengurusan, bukan beberapa kali per detik.
--
-- URUTAN PENGAMBILAN KUNCI PENTING dan tidak boleh dibalik: row lock pada
-- proker LEBIH DULU, baru advisory lock. Semua pemanggil mengambilnya dalam
-- urutan yang sama, sehingga tidak ada siklus yang mungkin terbentuk. Membalik
-- urutannya mengembalikan deadlock lewat pintu lain.
--
-- Advisory lock ini BUKAN pengganti EXCLUDE constraint. Ia hanya membuat
-- penolakannya rapi. Constraint tetap satu-satunya yang menjamin (INV-09), dan
-- tetap bekerja seandainya seseorang menghapus baris PERFORM di bawah.
--
-- Sumber: docs/ai/tasks/P3-proker-gantt.md T-066 · PRD F-5.2 · ADR-022
--         014a_functions_proker.sql · 014b_functions_surat.sql · INV-09, INV-13

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
  -- Keduanya keluar SEBELUM advisory lock: mereka tidak menyentuh proker_lock
  -- sama sekali, jadi tidak ada gunanya membuat mereka mengantre di belakang
  -- approval TERJADWAL yang sedang berjalan.
  IF v_proker.kategori <> 'TERJADWAL' THEN
    UPDATE proker SET
      status         = 'DISETUJUI',
      disetujui_oleh = p_approver_id,
      disetujui_at   = now(),
      updated_at     = now()
    WHERE id = p_proker_id;

    RETURN jsonb_build_object('ok', true, 'locked', false, 'kategori', v_proker.kategori);
  END IF;

  -- =====================================================================
  -- SERIALISASI PER PERIODE — lihat kepala berkas ini.
  --
  -- Tanpa baris ini, dua approval yang bersamaan saling menunggu di dalam
  -- pemeriksaan EXCLUDE constraint dan salah satunya dibunuh sebagai
  -- deadlock (40P01) — kode yang TIDAK ditangkap blok EXCEPTION di bawah,
  -- sehingga approver menerima 500 alih-alih daftar konflik.
  --
  -- Transaction-scoped: dilepas sendiri saat transaksi berakhir, termasuk
  -- bila terjadi error.
  -- =====================================================================
  PERFORM pg_advisory_xact_lock(hashtextextended(v_proker.periode_id::TEXT, 1));

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
  'Satu-satunya jalur yang boleh mengisi proker_lock. Aplikasi dilarang INSERT langsung ke tabel itu. Diserialkan advisory lock per periode (019, ADR-022) supaya approval bersamaan menghasilkan pesan konflik, bukan deadlock.';
