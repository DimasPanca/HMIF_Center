SELECT
  dv.id AS divisi_id,
  dv.nama AS divisi_nama,
  k.id AS kepanitiaan_id,
  k.nama_acara,
  COALESCE(rencana.total, (0) :: numeric) AS total_rencana,
  COALESCE(aktual.total, (0) :: numeric) AS total_aktual,
  (
    COALESCE(rencana.total, (0) :: numeric) - COALESCE(aktual.total, (0) :: numeric)
  ) AS sisa,
  round(
    (
      (100.0 * COALESCE(aktual.total, (0) :: numeric)) / NULLIF(rencana.total, (0) :: numeric)
    ),
    1
  ) AS serapan_persen,
  COALESCE(jml.nota, (0) :: bigint) AS jumlah_nota_terverifikasi
FROM
  (
    (
      (
        (
          divisi dv
          JOIN kepanitiaan k ON ((k.id = dv.kepanitiaan_id))
        )
        LEFT JOIN LATERAL (
          SELECT
            sum(ri.total) AS total
          FROM
            (
              rab_section rs
              JOIN rab_item ri ON ((ri.section_id = rs.id))
            )
          WHERE
            (rs.divisi_id = dv.id)
        ) rencana ON (TRUE)
      )
      LEFT JOIN LATERAL (
        SELECT
          sum(na.nominal) AS total
        FROM
          (
            nota n
            JOIN nota_alokasi na ON ((na.nota_id = n.id))
          )
        WHERE
          (
            (n.divisi_id = dv.id)
            AND (n.status = 'TERVERIFIKASI' :: nota_status)
          )
      ) aktual ON (TRUE)
    )
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS nota
      FROM
        nota n
      WHERE
        (
          (n.divisi_id = dv.id)
          AND (n.status = 'TERVERIFIKASI' :: nota_status)
        )
    ) jml ON (TRUE)
  );