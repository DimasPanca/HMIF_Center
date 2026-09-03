-- Test 021 — sisi anti-bentrok yang deterministik, pendamping T-066.
--
-- ===========================================================================
-- BERKAS INI TIDAK MENGUJI KONKURENSI, DAN MEMANG TIDAK BISA
-- ===========================================================================
-- Runner `npm run db:test` menjalankan setiap berkas di dalam SATU transaksi.
-- Race condition yang dijaga EXCLUDE constraint hanya muncul antara transaksi
-- yang BERBEDA: di dalam satu transaksi, INSERT kedua melihat INSERT pertama
-- sebagai barisnya sendiri dan gagal seketika. Hasilnya kebetulan sama, yang
-- terbukti bukan hal yang sama — test seperti itu akan tetap hijau seandainya
-- constraint diganti pemeriksaan aplikasi biasa.
--
-- Konkurensi sungguhan diuji `scripts/stress-anti-bentrok.ts`, yang membuka
-- koneksi terpisah per pesaing dan menahan semuanya di satu barrier.
--
-- Yang dikunci DI SINI adalah tiga hal yang deterministik dan justru paling
-- mudah rusak diam-diam saat seseorang menyunting 014a/019:
--
--   1. advisory lock per periode benar-benar dipasang, dan HANYA untuk
--      TERJADWAL (migrasi 019 — tanpanya, dua approval bersamaan berakhir
--      deadlock alih-alih pesan konflik);
--   2. batas rentang inklusif di kedua ujung, diuji lewat approval sungguhan
--      dan bukan lewat cek_konflik_proker saja (INV-11);
--   3. revisi yang DISETUJUI memindahkan kunci — satu kunci, rentang baru,
--      rentang lama benar-benar bebas (INV-13 sisi sebaliknya; sisi "revisi
--      DITOLAK" sudah dikunci 014a_proker_fn).
--
-- Sumber: docs/ai/tasks/P3-proker-gantt.md T-066 · PRD F-5.2 · SYSTEM_DESIGN §6.4
--         ADR-022 · INV-09, INV-11, INV-13

DO $$
DECLARE
  v_periode UUID;
  v_dept_a  UUID;
  v_dept_b  UUID;
  v_user    UUID := '21212121-2121-4121-8121-212121212121';
  v_pA      UUID;
  v_pB      UUID;
  v_pC      UUID;
  v_pD      UUID;
  v_hasil   JSONB;
  v_jumlah  INT;
  v_rentang TEXT;
  v_kunci   BIGINT;
  v_dipegang BOOLEAN;
BEGIN
  ---------------------------------------------------------------------------
  -- Data dasar
  ---------------------------------------------------------------------------
  INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
  VALUES ('Uji Konkuren 2029', '2029-09-01', '2030-08-31', 'AKTIF') RETURNING id INTO v_periode;

  INSERT INTO departemen (kode, nama, warna) VALUES ('KKA', 'Konkuren A', '#1E90FF')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode RETURNING id INTO v_dept_a;
  INSERT INTO departemen (kode, nama, warna) VALUES ('KKB', 'Konkuren B', '#A3E635')
  ON CONFLICT (kode) DO UPDATE SET kode = EXCLUDED.kode RETURNING id INTO v_dept_b;

  INSERT INTO app_user (id, nama_lengkap, nim, email)
  VALUES (v_user, 'Ketua Konkuren', '3337229021', 'konkuren@example.test');

  ---------------------------------------------------------------------------
  -- 1. ADVISORY LOCK PER PERIODE DIPASANG UNTUK TERJADWAL (migrasi 019)
  --
  --    Kalau baris PERFORM di 019 hilang, seluruh test lain di berkas ini
  --    tetap hijau — dan yang kembali adalah deadlock pada dua approval
  --    bersamaan, sesuatu yang tidak pernah terlihat di lingkungan satu
  --    pengguna. Karena itu keberadaan kuncinya diuji langsung.
  ---------------------------------------------------------------------------
  v_kunci := hashtextextended(v_periode::TEXT, 1);

  SELECT count(*)::INT INTO v_jumlah FROM pg_locks
  WHERE locktype = 'advisory' AND ((classid::BIGINT << 32) | objid::BIGINT) = v_kunci
    AND pid = pg_backend_pid();
  ASSERT v_jumlah = 0, 'Advisory lock periode sudah dipegang sebelum approval mana pun';

  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_a, 'SYNCHRONIZE', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2029-11-01', '2029-12-06', '2029-12-07', v_user)
  RETURNING id INTO v_pA;

  v_hasil := setujui_proker(v_pA, v_user);
  ASSERT (v_hasil->>'ok')::BOOLEAN, format('Approval proker A gagal: %s', v_hasil);

  -- Kunci bersifat transaction-scoped, jadi masih dipegang sampai transaksi
  -- test ini berakhir.
  SELECT EXISTS (
    SELECT 1 FROM pg_locks
    WHERE locktype = 'advisory' AND ((classid::BIGINT << 32) | objid::BIGINT) = v_kunci
      AND pid = pg_backend_pid()
  ) INTO v_dipegang;
  ASSERT v_dipegang,
    'setujui_proker TIDAK memasang advisory lock per periode — dua approval bersamaan akan berakhir deadlock, bukan pesan konflik (migrasi 019, ADR-022)';

  ---------------------------------------------------------------------------
  -- 2. BERKALA KELUAR SEBELUM ADVISORY LOCK
  --
  --    Proker yang tidak menyentuh proker_lock tidak boleh ikut mengantre di
  --    belakang approval TERJADWAL. Diuji lewat periode LAIN supaya kuncinya
  --    berbeda dari yang sudah dipegang di atas.
  ---------------------------------------------------------------------------
  DECLARE
    v_periode2 UUID;
    v_kunci2   BIGINT;
  BEGIN
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Uji Konkuren 2030', '2030-09-01', '2031-08-31', 'PERSIAPAN')
    RETURNING id INTO v_periode2;
    v_kunci2 := hashtextextended(v_periode2::TEXT, 1);

    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, pola_ulang, dibuat_oleh)
    VALUES (v_periode2, v_dept_b, 'Latihan Rutin', 'BERKALA', 'MENUNGGU_APPROVAL',
            '{"frekuensi":"MINGGUAN","hari":["SABTU"]}'::JSONB, v_user)
    RETURNING id INTO v_pD;

    v_hasil := setujui_proker(v_pD, v_user);
    ASSERT (v_hasil->>'ok')::BOOLEAN, 'Proker BERKALA gagal disetujui';
    ASSERT NOT (v_hasil->>'locked')::BOOLEAN, 'Proker BERKALA ikut mengunci kalender';

    SELECT EXISTS (
      SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory' AND ((classid::BIGINT << 32) | objid::BIGINT) = v_kunci2
        AND pid = pg_backend_pid()
    ) INTO v_dipegang;
    ASSERT NOT v_dipegang,
      'Approval BERKALA memasang advisory lock periode — ia tidak menyentuh proker_lock dan tidak boleh memblokir approval TERJADWAL';
  END;

  ---------------------------------------------------------------------------
  -- 3. BATAS RENTANG LEWAT APPROVAL SUNGGUHAN (INV-11)
  --
  --    014a_proker_fn sudah menguji batas ini lewat cek_konflik_proker. Yang
  --    diuji di sini jalur yang sesungguhnya menolak: EXCLUDE constraint.
  --    Keduanya bisa berbeda — fungsi pengecekan memakai daterange yang
  --    dibentuk pemanggilnya, constraint memakai rentang yang tersimpan.
  ---------------------------------------------------------------------------
  -- B mulai persiapan PERSIS di hari terakhir A (7 Des 2029).
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_b, 'Batas Tepat', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2029-12-07', '2029-12-27', '2029-12-28', v_user)
  RETURNING id INTO v_pB;

  v_hasil := setujui_proker(v_pB, v_user);
  ASSERT NOT (v_hasil->>'ok')::BOOLEAN,
    'Proker yang mulai persis di hari terakhir proker lain DITERIMA — hari terakhir tidak ikut terkunci (INV-11)';
  ASSERT v_hasil->>'reason' = 'KONFLIK', format('reason: %s', v_hasil->>'reason');

  -- Sehari sesudahnya harus lolos: batas atas tidak boleh terlalu longgar.
  INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                      dibuat_oleh)
  VALUES (v_periode, v_dept_b, 'Batas Lewat', 'TERJADWAL', 'MENUNGGU_APPROVAL',
          '2029-12-08', '2029-12-28', '2029-12-29', v_user)
  RETURNING id INTO v_pC;

  v_hasil := setujui_proker(v_pC, v_user);
  ASSERT (v_hasil->>'ok')::BOOLEAN,
    format('Proker yang mulai sehari setelah proker lain DITOLAK — batas atas terlalu longgar: %s', v_hasil);

  ---------------------------------------------------------------------------
  -- 4. REVISI DISETUJUI — KUNCI BERPINDAH, BUKAN BERTAMBAH (INV-13)
  --
  --    014a_proker_fn menguji sisi sebaliknya: revisi DITOLAK, kunci lama
  --    selamat. Yang belum terkunci adalah jalur suksesnya, dan di sanalah
  --    kesalahan "kunci lama tertinggal" akan muncul — tanggal yang sudah
  --    ditinggalkan memblokir departemen lain selamanya, tanpa satu pun
  --    proker yang mengakuinya.
  ---------------------------------------------------------------------------
  UPDATE proker SET
    tanggal_mulai_persiapan = '2030-03-01',
    tanggal_hari_h_mulai    = '2030-03-21',
    tanggal_hari_h_selesai  = '2030-03-22',
    status                  = 'MENUNGGU_APPROVAL_REVISI'
  WHERE id = v_pA;

  v_hasil := setujui_proker(v_pA, v_user);
  ASSERT (v_hasil->>'ok')::BOOLEAN, format('Revisi yang tidak bentrok DITOLAK: %s', v_hasil);

  SELECT count(*)::INT INTO v_jumlah FROM proker_lock WHERE proker_id = v_pA;
  ASSERT v_jumlah = 1, format('Proker memegang %s kunci setelah revisi, seharusnya tepat 1', v_jumlah);

  SELECT rentang::TEXT INTO v_rentang FROM proker_lock WHERE proker_id = v_pA;
  ASSERT v_rentang = '[2030-03-01,2030-03-23)',
    format('Kunci masih memakai rentang lama: %s', v_rentang);

  -- Rentang lama harus benar-benar bebas.
  SELECT count(*)::INT INTO v_jumlah
  FROM cek_konflik_proker(v_periode, '2029-11-01', '2029-12-07');
  ASSERT v_jumlah = 0,
    format('Rentang lama masih terkunci setelah revisi disetujui (%s konflik) — kunci lama tertinggal', v_jumlah);

  ---------------------------------------------------------------------------
  -- 5. TIDAK ADA DUA KUNCI BERIRISAN, APA PUN YANG TERJADI DI ATAS
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah
  FROM proker_lock l1
  JOIN proker_lock l2 ON l1.periode_id = l2.periode_id AND l1.id < l2.id AND l1.rentang && l2.rentang;
  ASSERT v_jumlah = 0, format('Ada %s pasang kunci beririsan di proker_lock (INV-09)', v_jumlah);

  RAISE NOTICE 'OK 021_konflik_konkuren - advisory lock terpasang untuk TERJADWAL saja, batas rentang inklusif lewat approval, revisi memindahkan kunci';
END $$;
