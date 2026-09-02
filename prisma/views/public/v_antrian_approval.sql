SELECT
  'PROKER' :: text AS jenis,
  p.id AS entitas_id,
  p.periode_id,
  p.nama AS judul,
  d.nama AS asal,
  u.nama_lengkap AS pengaju,
  p.diajukan_at AS diajukan_pada,
  ARRAY ['KETUA'::role_code, 'WAKIL'::role_code] AS approver_roles,
  (
    p.status = 'MENUNGGU_APPROVAL_REVISI' :: proker_status
  ) AS revisi
FROM
  (
    (
      proker p
      JOIN departemen d ON ((d.id = p.departemen_id))
    )
    LEFT JOIN app_user u ON ((u.id = p.dibuat_oleh))
  )
WHERE
  (
    p.status = ANY (
      ARRAY ['MENUNGGU_APPROVAL'::proker_status, 'MENUNGGU_APPROVAL_REVISI'::proker_status]
    )
  )
UNION
ALL
SELECT
  'SURAT' :: text AS jenis,
  s.id AS entitas_id,
  s.periode_id,
  s.perihal AS judul,
  COALESCE(d.nama, 'Pengurus Harian' :: text) AS asal,
  u.nama_lengkap AS pengaju,
  s.created_at AS diajukan_pada,
  ARRAY ['KETUA'::role_code, 'WAKIL'::role_code, 'SEKUM'::role_code] AS approver_roles,
  false AS revisi
FROM
  (
    (
      surat s
      LEFT JOIN departemen d ON ((d.id = s.departemen_id))
    )
    LEFT JOIN app_user u ON ((u.id = s.dibuat_oleh))
  )
WHERE
  (s.status = 'MENUNGGU_APPROVAL' :: surat_status);