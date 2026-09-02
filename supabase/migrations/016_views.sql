-- 016_views — view agregat untuk halaman utama dan antrian kerja.
--
-- ===========================================================================
-- SETIAP VIEW DI BERKAS INI WAJIB security_invoker = true.
-- ===========================================================================
-- View PostgreSQL berjalan dengan hak PEMILIKNYA, bukan hak penanya. Seluruh
-- view di sini dimiliki `postgres`, yang ber-BYPASSRLS. Tanpa opsi itu, satu
-- view saja cukup untuk membatalkan seluruh 180 policy di migrasi 015b:
-- siapa pun yang boleh membacanya akan melihat semua baris, termasuk milik
-- departemen dan divisi lain.
--
-- `npm run rls:coverage` menolak view yang melanggar ini.
--
-- Tidak ada MATERIALIZED VIEW di sini, dan itu disengaja. Skala organisasi ini
-- puluhan proker per periode, bukan puluhan ribu; materialized view hanya
-- menambah satu hal lagi yang bisa basi tanpa memberi apa pun.
--
-- Sumber: SYSTEM_DESIGN §10.4 · PRD M2, F-5.5 · docs/ai/tasks/P1-fondasi.md T-040

-- ---------------------------------------------------------------------------
-- MASTER GANTT — halaman utama
-- ---------------------------------------------------------------------------
-- Satu baris per proker yang sedang berjalan, sudah bergabung dengan
-- departemen, penanggung jawab, dan progres kanbannya.
--
-- Hanya proker DISETUJUI dan BERJALAN yang muncul. Draft dan yang ditolak
-- tidak pernah tampil di kalender bersama — menampilkannya akan membuat
-- departemen lain mengira tanggal itu sudah diambil (PRD F-5.5).

CREATE OR REPLACE VIEW v_master_gantt WITH (security_invoker = true) AS
SELECT
  d.id           AS departemen_id,
  d.nama         AS departemen_nama,
  d.warna        AS departemen_warna,
  d.urutan       AS departemen_urutan,
  p.id           AS proker_id,
  p.nama         AS proker_nama,
  p.kategori,
  p.status,
  p.tanggal_mulai_persiapan,
  p.tanggal_hari_h_mulai,
  p.tanggal_hari_h_selesai,
  u.nama_lengkap AS pj_nama,
  COALESCE(prog.persen, 0) AS progres
FROM proker p
JOIN departemen d   ON d.id = p.departemen_id
LEFT JOIN app_user u ON u.id = p.penanggung_jawab
LEFT JOIN LATERAL (
  -- Progres dihitung dari kartu Kanban proker itu. NULLIF menjaga proker yang
  -- belum punya kartu sama sekali dari pembagian nol — hasilnya NULL, lalu
  -- COALESCE menjadikannya 0.
  SELECT ROUND(
    100.0 * COUNT(*) FILTER (WHERE kc.kolom = 'DONE') / NULLIF(COUNT(*), 0)
  ) AS persen
  FROM kanban_card kc
  WHERE kc.proker_id = p.id
) prog ON true
WHERE p.status IN ('DISETUJUI', 'BERJALAN')
  AND p.periode_id = (SELECT id FROM periode WHERE status = 'AKTIF');

COMMENT ON VIEW v_master_gantt IS
  'Kalender bersama halaman utama. Hanya periode AKTIF, hanya proker DISETUJUI/BERJALAN.';

-- ---------------------------------------------------------------------------
-- ANTRIAN APPROVAL
-- ---------------------------------------------------------------------------
-- Menyatukan dua jenis permohonan yang menunggu keputusan, beserta SIAPA yang
-- berhak memutuskannya. Daftar approver-nya berbeda dan itu bukan kebetulan:
--
--   proker  Ketua atau Wakil          (PRD §5.2)
--   surat   Ketua, Wakil, atau Sekum  (PRD §5.2)
--
-- Kolom `approver_roles` di sini hanya untuk MENAMPILKAN dan menyaring.
-- Penegakannya ada di policy proker_lock_insert dan surat_counter_update
-- (INV-05); jangan pernah menjadikan kolom ini sebagai dasar izin.

CREATE OR REPLACE VIEW v_antrian_approval WITH (security_invoker = true) AS
SELECT
  'PROKER'::TEXT                              AS jenis,
  p.id                                        AS entitas_id,
  p.periode_id,
  p.nama                                      AS judul,
  d.nama                                      AS asal,
  u.nama_lengkap                              AS pengaju,
  p.diajukan_at                               AS diajukan_pada,
  ARRAY['KETUA','WAKIL']::role_code[]         AS approver_roles,
  (p.status = 'MENUNGGU_APPROVAL_REVISI')     AS revisi
FROM proker p
JOIN departemen d    ON d.id = p.departemen_id
LEFT JOIN app_user u ON u.id = p.dibuat_oleh
WHERE p.status IN ('MENUNGGU_APPROVAL', 'MENUNGGU_APPROVAL_REVISI')

UNION ALL

SELECT
  'SURAT'::TEXT                               AS jenis,
  s.id                                        AS entitas_id,
  s.periode_id,
  s.perihal                                   AS judul,
  COALESCE(d.nama, 'Pengurus Harian')         AS asal,
  u.nama_lengkap                              AS pengaju,
  s.created_at                                AS diajukan_pada,
  ARRAY['KETUA','WAKIL','SEKUM']::role_code[] AS approver_roles,
  false                                       AS revisi
FROM surat s
LEFT JOIN departemen d ON d.id = s.departemen_id
LEFT JOIN app_user u   ON u.id = s.dibuat_oleh
WHERE s.status = 'MENUNGGU_APPROVAL';

COMMENT ON VIEW v_antrian_approval IS
  'Daftar tampilan saja. approver_roles TIDAK menegakkan apa pun — penegakannya di policy (INV-05).';

-- ---------------------------------------------------------------------------
-- RINGKASAN RAB — rencana versus aktual per divisi
-- ---------------------------------------------------------------------------
-- Dua sisi yang dibandingkan bendahara:
--
--   rencana  jumlah seluruh rab_item pada divisi itu
--   aktual   jumlah alokasi nota yang SUDAH TERVERIFIKASI
--
-- Nota yang belum diverifikasi sengaja tidak dihitung. Memasukkannya membuat
-- angka realisasi naik-turun mengikuti unggahan yang belum tentu sah, dan
-- bendahara kehilangan satu-satunya angka yang bisa dipegang.

CREATE OR REPLACE VIEW v_ringkasan_rab WITH (security_invoker = true) AS
SELECT
  dv.id                                  AS divisi_id,
  dv.nama                                AS divisi_nama,
  k.id                                   AS kepanitiaan_id,
  k.nama_acara,
  COALESCE(rencana.total, 0)             AS total_rencana,
  COALESCE(aktual.total, 0)              AS total_aktual,
  COALESCE(rencana.total, 0) - COALESCE(aktual.total, 0) AS sisa,
  -- Persentase serapan. NULLIF menjaga divisi yang belum menyusun RAB dari
  -- pembagian nol.
  ROUND(
    100.0 * COALESCE(aktual.total, 0) / NULLIF(rencana.total, 0), 1
  )                                      AS serapan_persen,
  COALESCE(jml.nota, 0)                  AS jumlah_nota_terverifikasi
FROM divisi dv
JOIN kepanitiaan k ON k.id = dv.kepanitiaan_id
LEFT JOIN LATERAL (
  SELECT SUM(ri.total) AS total
  FROM rab_section rs
  JOIN rab_item ri ON ri.section_id = rs.id
  WHERE rs.divisi_id = dv.id
) rencana ON true
LEFT JOIN LATERAL (
  SELECT SUM(na.nominal) AS total
  FROM nota n
  JOIN nota_alokasi na ON na.nota_id = n.id
  WHERE n.divisi_id = dv.id AND n.status = 'TERVERIFIKASI'
) aktual ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS nota
  FROM nota n
  WHERE n.divisi_id = dv.id AND n.status = 'TERVERIFIKASI'
) jml ON true;

COMMENT ON VIEW v_ringkasan_rab IS
  'Rencana versus aktual per divisi. Aktual hanya menghitung nota TERVERIFIKASI.';

-- ---------------------------------------------------------------------------
-- INDEKS PENDUKUNG
-- ---------------------------------------------------------------------------
-- v_master_gantt menyaring proker berdasarkan periode dan status pada setiap
-- pemuatan halaman utama, lalu menghitung progres dari kanban_card per proker.
-- Dua indeks parsial itu yang membuatnya tidak memindai seluruh tabel.

CREATE INDEX IF NOT EXISTS proker_gantt_aktif
  ON proker (periode_id, departemen_id)
  WHERE status IN ('DISETUJUI', 'BERJALAN');

CREATE INDEX IF NOT EXISTS kanban_card_proker
  ON kanban_card (proker_id)
  WHERE proker_id IS NOT NULL;
