-- 017_triggers — lapisan trigger: jejak audit dan stempel waktu.
--
-- ===========================================================================
-- TENTANG TRIGGER AUDIT
-- ===========================================================================
-- Kontrak T-041 meminta memasang fn_audit() pada 12 tabel. Itu SUDAH terjadi
-- di migrasi 014c, karena fungsi dan pemasangannya memang satu kesatuan —
-- memisahkannya berarti ada jeda migrasi di mana fungsi audit ada tetapi tidak
-- mencatat apa pun.
--
-- Berkas ini karena itu TIDAK memasang ulang. Menyalin daftar 12 tabel ke dua
-- tempat melahirkan dua daftar yang akan berbeda diam-diam. Yang dilakukan di
-- sini adalah MEMERIKSA bahwa keduabelasnya benar-benar terpasang, dan gagal
-- keras bila tidak — sehingga berkas bernama 017_triggers tetap menjadi tempat
-- yang benar untuk dilihat orang, tanpa menjadi sumber kebenaran kedua.
--
-- Sumber: SYSTEM_DESIGN §14.1 · docs/ai/tasks/P1-fondasi.md T-041 · INV-07

DO $$
DECLARE
  v_terpasang INT;
  v_hilang    TEXT;
BEGIN
  SELECT count(*)::INT INTO v_terpasang
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE p.proname = 'fn_audit' AND NOT t.tgisinternal;

  IF v_terpasang <> 12 THEN
    SELECT string_agg(x, ', ') INTO v_hilang
    FROM unnest(ARRAY['proker','proker_lock','surat','rab_item','rab_meta','nota',
                      'user_role','periode','kepanitiaan','divisi','lpj','app_user']) x
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_proc p  ON p.oid = t.tgfoid
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE p.proname = 'fn_audit' AND c.relname = x AND NOT t.tgisinternal);

    RAISE EXCEPTION
      'Trigger audit terpasang pada % tabel, seharusnya 12. Belum terpasang: %. Perbaiki di 014c_functions_audit.sql',
      v_terpasang, COALESCE(v_hilang, '(daftar cocok tetapi jumlah tidak)');
  END IF;
END $$;

-- ===========================================================================
-- STEMPEL WAKTU updated_at
-- ===========================================================================
-- Tambahan di luar kontrak T-041, karena ini cacat nyata yang ditemukan saat
-- memeriksa lapisan trigger dan tempatnya memang di berkas ini.
--
-- 18 tabel memiliki kolom `updated_at NOT NULL DEFAULT now()`, tetapi tidak
-- ada satu pun yang memeliharanya. Diukur langsung: sebuah baris `periode`
-- disunting, dan `updated_at`-nya tidak bergerak sedikit pun.
--
-- Beberapa fungsi domain memang menulis `updated_at = now()` sendiri
-- (setujui_proker, alokasi_nomor_surat), tetapi UPDATE biasa dari aplikasi
-- tidak. Akibatnya kolom itu berbohong: ia menunjukkan kapan baris DIBUAT,
-- bukan kapan terakhir diubah.
--
-- Yang rusak karenanya tidak berteriak, dan itu yang membuatnya berbahaya:
--   - tampilan "terakhir disunting" menunjukkan tanggal yang salah
--   - backup inkremental melewatkan baris yang berubah (ADR-016)
--   - deteksi konflik penyuntingan bersamaan kehilangan dasarnya
--
-- BEFORE, bukan AFTER. Nilainya harus sudah terpasang pada NEW sebelum
-- trigger audit (yang AFTER) menyalin barisnya — kalau tidak, `nilai_baru` di
-- audit_log akan memuat stempel waktu yang lama.

-- Memakai now(), yang di PostgreSQL berarti WAKTU MULAI TRANSAKSI, bukan waktu
-- saat pernyataan dijalankan. Konsekuensinya: baris yang dibuat lalu disunting
-- di dalam SATU transaksi akan punya created_at dan updated_at yang persis
-- sama.
--
-- Itu disengaja dan benar — transaksi bersifat atomik, jadi secara logis
-- semuanya memang terjadi pada satu titik waktu. clock_timestamp() akan
-- memberi presisi lebih halus tetapi menjadi tidak konsisten dengan DEFAULT
-- now() pada kolomnya sendiri.
--
-- Yang perlu diingat saat menulis test: `updated_at` tidak akan terlihat
-- bergerak di dalam satu transaksi. Ujilah dengan menyisipkan baris ber-
-- updated_at lama secara eksplisit, lalu perbarui.

CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_set_updated_at IS
  'BEFORE UPDATE, wajib berjalan sebelum fn_audit() agar nilai_baru memuat stempel waktu yang benar.';

-- Dipasang lewat katalog, bukan daftar manual. Setiap tabel yang kelak
-- menambahkan kolom updated_at akan ikut terpelihara begitu migrasi ini
-- dijalankan ulang pada database kosong — dan daftar manual pasti tertinggal.
--
-- surat_counter sengaja TIDAK dikecualikan walau alokasi_nomor_surat sudah
-- menulis updated_at sendiri: hasilnya sama, dan pengecualian hanya menambah
-- aturan yang harus diingat.

DO $$
DECLARE
  t TEXT;
  n INT := 0;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_class pc     ON pc.relname = c.table_name
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
    WHERE c.table_schema = 'public'
      AND c.column_name  = 'updated_at'
      AND pc.relkind     = 'r'
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_updated_at_%1$s
         BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()', t);
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Tidak ada tabel ber-updated_at yang ditemukan — kueri katalog salah';
  END IF;

  RAISE NOTICE 'trg_updated_at terpasang pada % tabel', n;
END $$;
