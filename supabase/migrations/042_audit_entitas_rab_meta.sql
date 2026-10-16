-- 042_audit_entitas_rab_meta — entitas_id audit untuk tabel tanpa kolom `id` (T-089).
--
-- fn_audit() (014c) mengambil entitas_id dari kolom `id`. Dari 12 tabel yang
-- diaudit, `rab_meta` satu-satunya yang kunci primernya bukan `id` melainkan
-- `kepanitiaan_id` — sehingga SELURUH jejak penguncian dan pembukaan kunci
-- RAB tercatat dengan entitas_id NULL: alasannya ada, tetapi tidak dapat
-- ditelusuri ke acara mana (ditemukan gate e2e rab-lock).
--
-- Fungsi ini identik dengan 014c kecuali COALESCE entitas_id. Baris lama
-- TIDAK diperbaiki: audit_log append-only (INV-06); nilai_baru/nilai_lama-nya
-- tetap memuat kepanitiaan_id untuk penelusuran manual.
--
-- Idempoten: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION fn_audit() RETURNS TRIGGER AS $$
DECLARE
  v_lama JSONB;
  v_baru JSONB;
  v_aksi TEXT;
BEGIN
  IF    TG_OP = 'INSERT' THEN v_aksi := 'CREATE'; v_baru := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN v_aksi := 'UPDATE'; v_lama := to_jsonb(OLD); v_baru := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN v_aksi := 'DELETE'; v_lama := to_jsonb(OLD);
  END IF;

  -- Tanpa blok EXCEPTION, sengaja (lihat 014c): audit gagal = mutasi gagal.
  INSERT INTO audit_log (
    user_id, periode_id, aksi, entitas, entitas_id,
    nilai_lama, nilai_baru, ip_address, user_agent
  ) VALUES (
    konteks_user_id(),
    NULLIF(current_setting('app.periode_id', true), '')::UUID,
    v_aksi,
    TG_TABLE_NAME,
    -- `id` untuk 11 tabel; `kepanitiaan_id` untuk rab_meta (kunci primernya).
    COALESCE(v_baru->>'id', v_lama->>'id', v_baru->>'kepanitiaan_id', v_lama->>'kepanitiaan_id'),
    v_lama,
    v_baru,
    NULLIF(current_setting('app.ip', true), '')::INET,
    NULLIF(current_setting('app.user_agent', true), '')
  );

  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

COMMENT ON FUNCTION fn_audit IS
  'Trigger audit generik. SECURITY DEFINER agar tetap menulis walau RLS menutup audit_log bagi pemanggil. entitas_id = id, atau kepanitiaan_id untuk rab_meta (042).';
