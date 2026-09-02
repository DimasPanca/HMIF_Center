-- Test migrasi 002 — 15 enum ada, dengan label dan jumlah yang persis.
--
-- Yang diperiksa bukan sekadar "enum ada", melainkan LABEL-nya persis. Salah
-- satu huruf pada nilai enum membuat seluruh query status gagal mencocokkan,
-- dan kegagalannya senyap: query mengembalikan nol baris, bukan error.
--
-- Sumber: docs/ai/tasks/P1-fondasi.md T-021 · SYSTEM_DESIGN §4.1 · ADR-015, ADR-016

DO $$
DECLARE
  v_harap  TEXT[];
  v_nyata  TEXT[];
  v_nama   TEXT;
  v_jumlah INT;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Label persis, satu per satu enum
  --    Dibandingkan sebagai array terurut supaya urutan deklarasi tidak ikut
  --    menentukan lulus/gagal, tetapi isinya tetap harus sama persis.
  ---------------------------------------------------------------------------
  FOR v_nama, v_harap IN
    SELECT * FROM (VALUES
      ('role_code',       ARRAY['ADMIN','ANGGOTA','BENDUM','BPH','KADEPT','KETUA','SEKUM','WAKIL']),
      ('periode_status',  ARRAY['AKTIF','ARSIP','PERSIAPAN']),
      ('proker_kategori', ARRAY['BERKALA','RESPONSIF','TERJADWAL']),
      ('proker_status',   ARRAY['BERJALAN','DIBATALKAN','DISETUJUI','DITOLAK','DRAFT',
                                'MENUNGGU_APPROVAL','MENUNGGU_APPROVAL_REVISI','PERLU_REVISI','SELESAI']),
      ('surat_status',    ARRAY['DIBATALKAN','DISETUJUI','DITOLAK','DRAFT','MENUNGGU_APPROVAL','TERBIT']),
      ('rab_status',      ARRAY['DIAJUKAN','DISETUJUI','DRAFT','REALISASI','SELESAI']),
      ('nota_status',     ARRAY['DITOLAK','DIUNGGAH','MENUNGGU_VERIFIKASI','PERLU_PERBAIKAN','TERVERIFIKASI']),
      ('lpj_status',      ARRAY['DIAJUKAN','DISETUJUI_BENDUM','DRAFT','FINAL']),
      ('kendala_status',  ARRAY['SEDANG_DITANGANI','SELESAI','TERBUKA']),
      ('prioritas',       ARRAY['KRITIS','RENDAH','SEDANG','TINGGI']),
      ('kanban_kolom',    ARRAY['DONE','IN_PROGRESS','REVIEW','TODO']),
      ('kehadiran',       ARRAY['ALFA','HADIR','IZIN','SAKIT']),
      ('image_kind',      ARRAY['DOKUMEN','FOTO']),
      ('backup_jenis',    ARRAY['MANUAL','OTOMATIS','PRA_RESTORE']),
      ('backup_status',   ARRAY['BERJALAN','GAGAL','SUKSES'])
    ) AS t(nama, harap)
  LOOP
    SELECT array_agg(e.enumlabel::TEXT ORDER BY e.enumlabel) INTO v_nyata
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = v_nama;

    ASSERT v_nyata IS NOT NULL, format('Enum %s tidak ada', v_nama);
    ASSERT v_nyata = v_harap,
      format('Enum %s tidak cocok.%s  diharapkan: %s%s  ternyata  : %s',
             v_nama, chr(10), array_to_string(v_harap, ', '),
             chr(10), array_to_string(v_nyata, ', '));
  END LOOP;

  ---------------------------------------------------------------------------
  -- 2. Jumlah total enum domain
  --    Menangkap enum yang tidak sengaja ditambahkan di luar daftar.
  ---------------------------------------------------------------------------
  SELECT count(*)::INT INTO v_jumlah
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE t.typtype = 'e' AND n.nspname = 'public';

  ASSERT v_jumlah = 15,
    format('Ada %s enum di schema public, seharusnya 15', v_jumlah);

  ---------------------------------------------------------------------------
  -- 3. Nilai di luar daftar benar-benar ditolak
  --    Inilah alasan memakai enum, bukan TEXT. Bila cast ini berhasil,
  --    tipe yang terbentuk bukan enum dan seluruh jaminan integritas hilang.
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM 'KETUA_PALSU'::role_code;
    RAISE EXCEPTION 'Nilai di luar daftar DITERIMA oleh role_code — bukan enum';
  EXCEPTION
    WHEN invalid_text_representation THEN NULL;  -- benar
  END;

  ---------------------------------------------------------------------------
  -- 4. Status yang paling mudah tertukar, dipastikan ada
  ---------------------------------------------------------------------------
  ASSERT 'MENUNGGU_APPROVAL_REVISI'::proker_status IS NOT NULL,
    'proker_status kehilangan MENUNGGU_APPROVAL_REVISI — kunci lama akan lepas saat revisi (INV-13)';
  ASSERT 'DISETUJUI_BENDUM'::lpj_status IS NOT NULL,
    'lpj_status kehilangan DISETUJUI_BENDUM — approval dua tahap tidak dapat ditegakkan (ADR-015)';
  ASSERT 'PRA_RESTORE'::backup_jenis IS NOT NULL,
    'backup_jenis kehilangan PRA_RESTORE — jaring pengaman restore hilang (ADR-016)';

  RAISE NOTICE 'OK 002_enums — 15 enum, label persis, nilai di luar daftar ditolak';
END $$;
