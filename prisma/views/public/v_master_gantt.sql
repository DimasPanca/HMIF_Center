SELECT
  d.id AS departemen_id,
  d.nama AS departemen_nama,
  d.warna AS departemen_warna,
  d.urutan AS departemen_urutan,
  p.id AS proker_id,
  p.nama AS proker_nama,
  p.kategori,
  p.status,
  p.tanggal_mulai_persiapan,
  p.tanggal_hari_h_mulai,
  p.tanggal_hari_h_selesai,
  u.nama_lengkap AS pj_nama,
  COALESCE(prog.persen, (0) :: numeric) AS progres
FROM
  (
    (
      (
        proker p
        JOIN departemen d ON ((d.id = p.departemen_id))
      )
      LEFT JOIN app_user u ON ((u.id = p.penanggung_jawab))
    )
    LEFT JOIN LATERAL (
      SELECT
        round(
          (
            (
              100.0 * (
                count(*) FILTER (
                  WHERE
                    (kc.kolom = 'DONE' :: kanban_kolom)
                )
              ) :: numeric
            ) / (NULLIF(count(*), 0)) :: numeric
          )
        ) AS persen
      FROM
        kanban_card kc
      WHERE
        (kc.proker_id = p.id)
    ) prog ON (TRUE)
  )
WHERE
  (
    (
      p.status = ANY (
        ARRAY ['DISETUJUI'::proker_status, 'BERJALAN'::proker_status]
      )
    )
    AND (
      p.periode_id = (
        SELECT
          periode.id
        FROM
          periode
        WHERE
          (periode.status = 'AKTIF' :: periode_status)
      )
    )
  );