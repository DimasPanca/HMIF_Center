import { Prisma } from '@prisma/client';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type {
  DashboardData,
  ItemDashboard,
  KartuDashboard,
  PanelDashboardKey,
} from '@/components/dashboard/types';
import { panelUntukPeran } from '@/components/dashboard/types';

if (typeof window !== 'undefined') {
  throw new Error('Data dashboard hanya boleh dimuat di server.');
}

type RingkasanRab = {
  divisi_id: string;
  divisi_nama: string;
  nama_acara: string;
  sisa: number;
  total_aktual: number;
  total_rencana: number;
};

function tanggal(nilai: Date | null): string | undefined {
  return nilai?.toISOString().slice(0, 10);
}

function kartu(
  kunci: string,
  panel: PanelDashboardKey,
  judul: string,
  data: ItemDashboard[],
): KartuDashboard {
  return { kunci, panel, judul, tersedia: true, data };
}

function daftarUuid(ids: readonly string[]): Prisma.Sql {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
}

async function antrianApproval(konteks: Konteks, panel: PanelDashboardKey) {
  const semua = await db.v_antrian_approval.findMany({
    where: { periode_id: konteks.periodeId, jenis: 'PROKER' },
    orderBy: { diajukan_pada: 'desc' },
  });
  const data: ItemDashboard[] = semua
    .filter((item) => item.approver_roles.some((role) => konteks.roles.includes(role)))
    .map((item) => ({
      id: item.entitas_id ?? `${item.jenis}-${item.judul}`,
      label: item.judul ?? 'Program kerja tanpa judul',
      keterangan: [item.asal, item.pengaju].filter(Boolean).join(' · ') || undefined,
      tanggal: tanggal(item.diajukan_pada),
      href: item.entitas_id ? `/proker/approval/${item.entitas_id}` : undefined,
      jenis: 'PROKER',
      entitas_id: item.entitas_id ?? undefined,
      status: item.revisi ? 'Revisi menunggu approval' : 'Menunggu approval',
    }));
  return kartu('approval-antrian', panel, 'Antrian approval', data);
}

async function kendalaKritis(panel: PanelDashboardKey, periodeId: string) {
  const data = await db.$queryRaw<
    Array<{
      id: string;
      judul: string;
      asal: string | null;
      created_at: Date;
      status: string;
    }>
  >`
    SELECT k.id, k.judul, COALESCE(d.nama, pd.nama, dv.nama) AS asal,
           k.created_at, k.status::text
    FROM kendala k
    LEFT JOIN departemen d ON d.id = k.departemen_id
    LEFT JOIN proker p ON p.id = k.proker_id
    LEFT JOIN departemen pd ON pd.id = p.departemen_id
    LEFT JOIN divisi dv ON dv.id = k.divisi_id
    WHERE k.periode_id = ${periodeId}::uuid AND k.prioritas = 'KRITIS' AND k.status <> 'SELESAI'
    ORDER BY k.created_at DESC
    LIMIT 6
  `;
  return kartu(
    'kendala-kritis',
    panel,
    'Kendala kritis',
    data.map((item) => ({
      id: item.id,
        href: `/departemen/kendala/${item.id}`,
      label: item.judul,
      keterangan: item.asal ?? 'Lintas organisasi',
      prioritas: 'KRITIS',
      status: item.status,
      tanggal: tanggal(item.created_at),
    })),
  );
}

async function ringkasanRab(periodeId: string): Promise<RingkasanRab[]> {
  return db.$queryRaw<RingkasanRab[]>`
    SELECT v.divisi_id::text, v.divisi_nama, v.nama_acara,
           COALESCE(v.total_rencana, 0)::float8 AS total_rencana,
           COALESCE(v.total_aktual, 0)::float8 AS total_aktual,
           COALESCE(v.sisa, 0)::float8 AS sisa
    FROM v_ringkasan_rab v
    JOIN divisi d ON d.id = v.divisi_id
    JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
    JOIN proker p ON p.id = k.proker_id
    WHERE p.periode_id = ${periodeId}::uuid
    ORDER BY v.nama_acara, v.divisi_nama
  `;
}

async function panelKetua(konteks: Konteks): Promise<KartuDashboard[]> {
  const [approval, kritis, rab, aktivitas] = await Promise.all([
    antrianApproval(konteks, 'ketua'),
    kendalaKritis('ketua', konteks.periodeId),
    ringkasanRab(konteks.periodeId),
    db.$queryRaw<
      Array<{ id: string; aksi: string; entitas: string; created_at: Date; nama: string | null }>
    >`
      SELECT a.id::text, a.aksi, a.entitas, a.created_at, u.nama_lengkap AS nama
      FROM audit_log a
      LEFT JOIN app_user u ON u.id = a.user_id
      WHERE a.periode_id = ${konteks.periodeId}::uuid
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 6
    `,
  ]);
  const total = rab.reduce(
    (hasil, item) => ({
      rencana: hasil.rencana + item.total_rencana,
      aktual: hasil.aktual + item.total_aktual,
      sisa: hasil.sisa + item.sisa,
    }),
    { rencana: 0, aktual: 0, sisa: 0 },
  );
  return [
    approval,
    kritis,
    kartu('keuangan-ringkas', 'ketua', 'Ringkasan keuangan seluruh acara', [
      { id: 'rencana', label: 'Total rencana', nilai: total.rencana, format: 'rupiah' },
      { id: 'aktual', label: 'Total aktual', nilai: total.aktual, format: 'rupiah' },
      { id: 'sisa', label: 'Sisa anggaran', nilai: total.sisa, format: 'rupiah' },
    ]),
    kartu(
      'aktivitas-terbaru',
      'ketua',
      'Aktivitas terbaru',
      aktivitas.map((item) => ({
        id: item.id,
        label: `${item.aksi.replaceAll('_', ' ')} · ${item.entitas.replaceAll('_', ' ')}`,
        keterangan: item.nama ?? 'Sistem',
        tanggal: tanggal(item.created_at),
      })),
    ),
  ];
}

async function panelSekum(konteks: Konteks): Promise<KartuDashboard[]> {
  const awalBulan = new Date();
  awalBulan.setUTCDate(1);
  awalBulan.setUTCHours(0, 0, 0, 0);
  const awalBerikutnya = new Date(
    Date.UTC(awalBulan.getUTCFullYear(), awalBulan.getUTCMonth() + 1, 1),
  );

  const [approval, surat, notulensi, counter] = await Promise.all([
    antrianApproval(konteks, 'sekum'),
    db.surat.findMany({
      where: {
        periode_id: konteks.periodeId,
        status: 'TERBIT',
        tanggal_surat: { gte: awalBulan, lt: awalBerikutnya },
      },
      select: { id: true, nomor_lengkap: true, perihal: true, tanggal_surat: true },
      orderBy: { tanggal_surat: 'desc' },
      take: 6,
    }),
    db.notulensi.findMany({
      where: { periode_id: konteks.periodeId },
      select: { id: true, judul: true, tanggal: true, tempat: true },
      orderBy: [{ tanggal: 'desc' }, { created_at: 'desc' }],
      take: 6,
    }),
    db.surat_counter.findUnique({
      where: { periode_id: konteks.periodeId },
      select: { nomor_terakhir: true, updated_at: true },
    }),
  ]);

  return [
    approval,
    kartu(
      'surat-terbit-bulan',
      'sekum',
      'Surat terbit bulan ini',
      surat.map((item) => ({
        id: item.id,
        label: item.perihal,
        keterangan: item.nomor_lengkap ?? 'Nomor belum tersedia',
        tanggal: tanggal(item.tanggal_surat),
      })),
    ),
    kartu(
      'notulensi-terakhir',
      'sekum',
      'Notulensi terakhir',
      notulensi.map((item) => ({
        id: item.id,
        label: item.judul,
        keterangan: item.tempat ?? 'Tempat tidak dicatat',
        tanggal: tanggal(item.tanggal),
      })),
    ),
    kartu('nomor-surat-terakhir', 'sekum', 'Nomor surat terakhir digunakan', [
      {
        id: 'nomor-terakhir',
        label: 'Nomor urut terakhir',
        nilai: counter?.nomor_terakhir ?? 0,
        format: 'angka',
        tanggal: tanggal(counter?.updated_at ?? null),
      },
    ]),
  ];
}

async function panelBendum(konteks: Konteks): Promise<KartuDashboard[]> {
  const [rab, nota, lpj] = await Promise.all([
    ringkasanRab(konteks.periodeId),
    db.$queryRaw<Array<{ id: string; nama_acara: string; total: number; created_at: Date }>>`
      SELECT n.id, k.nama_acara, n.total_nota::float8 AS total, n.created_at
      FROM nota n
      JOIN divisi d ON d.id = n.divisi_id
      JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
      JOIN proker p ON p.id = k.proker_id
      WHERE p.periode_id = ${konteks.periodeId}::uuid
        AND n.status = 'MENUNGGU_VERIFIKASI'
      ORDER BY n.created_at DESC
      LIMIT 6
    `,
    db.$queryRaw<Array<{ status: string; jumlah: number }>>`
      SELECT l.status::text, count(*)::int AS jumlah
      FROM lpj l
      JOIN kepanitiaan k ON k.id = l.kepanitiaan_id
      JOIN proker p ON p.id = k.proker_id
      WHERE p.periode_id = ${konteks.periodeId}::uuid
      GROUP BY l.status
      ORDER BY l.status
    `,
  ]);

  return [
    kartu(
      'rab-rekap',
      'bendum',
      'Rekap RAB acara aktif',
      rab.slice(0, 6).map((item) => ({
        id: item.divisi_id,
        label: `${item.nama_acara} · ${item.divisi_nama}`,
        nilai: item.total_rencana,
        format: 'rupiah',
      })),
    ),
    kartu(
      'nota-verifikasi',
      'bendum',
      'Nota menunggu verifikasi',
      nota.map((item) => ({
        id: item.id,
        label: item.nama_acara,
        nilai: item.total,
        format: 'rupiah',
        tanggal: tanggal(item.created_at),
        status: 'Menunggu verifikasi',
      })),
    ),
    kartu(
      'sisa-anggaran',
      'bendum',
      'Sisa anggaran per acara',
      rab.slice(0, 6).map((item) => ({
        id: item.divisi_id,
        label: `${item.nama_acara} · ${item.divisi_nama}`,
        nilai: item.sisa,
        format: 'rupiah',
      })),
    ),
    kartu(
      'lpj-progres',
      'bendum',
      'Progres LPJ',
      lpj.map((item) => ({
        id: item.status,
        label: item.status.replaceAll('_', ' '),
        nilai: item.jumlah,
        format: 'angka',
      })),
    ),
  ];
}

async function panelKadept(konteks: Konteks): Promise<KartuDashboard[]> {
  if (konteks.departemenIds.length === 0) {
    return [
      kartu('proker-departemen', 'kadept', 'Program kerja departemen', []),
      kartu('kanban-ringkas', 'kadept', 'Kanban ringkas', []),
      kartu('kendala-terbuka', 'kadept', 'Kendala terbuka', []),
      kartu('deadline-terdekat', 'kadept', 'Deadline terdekat', []),
    ];
  }
  const ids = daftarUuid(konteks.departemenIds);
  const [proker, kanban, kendala, deadline] = await Promise.all([
    db.proker.findMany({
      where: { periode_id: konteks.periodeId, departemen_id: { in: konteks.departemenIds } },
      select: { id: true, nama: true, status: true, tanggal_hari_h_selesai: true },
      orderBy: { updated_at: 'desc' },
      take: 6,
    }),
    db.$queryRaw<Array<{ kolom: string; jumlah: number }>>`
      SELECT k.kolom::text, count(*)::int AS jumlah
      FROM kanban_card k
      LEFT JOIN proker p ON p.id = k.proker_id
      WHERE k.departemen_id IN (${ids})
        AND (p.periode_id = ${konteks.periodeId}::uuid OR k.proker_id IS NULL)
      GROUP BY k.kolom
      ORDER BY k.kolom
    `,
    db.$queryRaw<Array<{ id: string; judul: string; prioritas: string; status: string }>>`
      SELECT k.id, k.judul, k.prioritas::text, k.status::text
      FROM kendala k
      LEFT JOIN proker p ON p.id = k.proker_id
      WHERE k.departemen_id IN (${ids}) AND k.status <> 'SELESAI'
        AND k.periode_id = ${konteks.periodeId}::uuid
      ORDER BY k.prioritas DESC, k.created_at DESC
      LIMIT 6
    `,
    db.$queryRaw<Array<{ id: string; judul: string; deadline: Date; kolom: string }>>`
      SELECT k.id, k.judul, k.deadline, k.kolom::text
      FROM kanban_card k
      LEFT JOIN proker p ON p.id = k.proker_id
      WHERE k.departemen_id IN (${ids}) AND k.deadline IS NOT NULL
        AND k.kolom <> 'DONE'
        AND (p.periode_id = ${konteks.periodeId}::uuid OR k.proker_id IS NULL)
      ORDER BY k.deadline
      LIMIT 6
    `,
  ]);

  return [
    kartu(
      'proker-departemen',
      'kadept',
      'Program kerja departemen',
      proker.map((item) => ({
        id: item.id,
        label: item.nama,
        status: item.status,
        tanggal: tanggal(item.tanggal_hari_h_selesai),
        href: `/proker/${item.id}`,
      })),
    ),
    kartu(
      'kanban-ringkas',
      'kadept',
      'Kanban ringkas',
      kanban.map((item) => ({
        id: item.kolom,
        label: item.kolom.replaceAll('_', ' '),
        nilai: item.jumlah,
        format: 'angka',
      })),
    ),
    kartu(
      'kendala-terbuka',
      'kadept',
      'Kendala terbuka',
      kendala.map((item) => ({
        id: item.id,
        href: `/departemen/kendala/${item.id}`,
        label: item.judul,
        prioritas: item.prioritas,
        status: item.status,
      })),
    ),
    kartu(
      'deadline-terdekat',
      'kadept',
      'Deadline terdekat',
      deadline.map((item) => ({
        id: item.id,
        label: item.judul,
        status: item.kolom,
        deadline: tanggal(item.deadline),
      })),
    ),
  ];
}

async function panelAnggota(konteks: Konteks): Promise<KartuDashboard[]> {
  const [tugas, kendala] = await Promise.all([
    db.kanban_card.findMany({
      where: { assignee_id: konteks.sesi.userId, kolom: { not: 'DONE' } },
      select: { id: true, judul: true, kolom: true, prioritas: true, deadline: true },
      orderBy: [{ deadline: 'asc' }, { updated_at: 'desc' }],
      take: 8,
    }),
    db.kendala.findMany({
      where: { periode_id: konteks.periodeId, assignee_id: konteks.sesi.userId, status: { not: 'SELESAI' } },
      select: { id: true, judul: true, status: true, prioritas: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 6,
    }),
  ]);
  const tugasData = tugas.map((item) => ({
    id: item.id,
    label: item.judul,
    status: item.kolom,
    prioritas: item.prioritas,
    deadline: tanggal(item.deadline),
  }));
  return [
    kartu('tugas-saya', 'anggota', 'Tugas saya', tugasData),
    kartu(
      'deadline-terdekat',
      'anggota',
      'Deadline terdekat',
      tugasData.filter((item) => item.deadline).slice(0, 6),
    ),
    kartu(
      'kendala-saya',
      'anggota',
      'Kendala yang ditugaskan kepada saya',
      kendala.map((item) => ({
        id: item.id,
        href: `/departemen/kendala/${item.id}`,
        label: item.judul,
        status: item.status,
        prioritas: item.prioritas,
        tanggal: tanggal(item.created_at),
      })),
    ),
  ];
}

async function panelBph(konteks: Konteks): Promise<KartuDashboard[]> {
  const [departemen, kendala, kepatuhan] = await Promise.all([
    db.$queryRaw<Array<{ id: string; nama: string; jumlah: number; berjalan: number; terlambat: number | null; kritis: number | null }>>`
      SELECT d.id, d.nama, count(p.id)::int AS jumlah,
             count(p.id) FILTER (WHERE p.status = 'BERJALAN')::int AS berjalan,
             r.terlambat, r.kritis
      FROM departemen d
      LEFT JOIN proker p ON p.departemen_id = d.id AND p.periode_id = ${konteks.periodeId}::uuid
      LEFT JOIN deadline_ringkasan r ON r.departemen_id = d.id
      WHERE d.is_active
      GROUP BY d.id, d.nama, d.urutan, r.terlambat, r.kritis
      ORDER BY d.urutan
    `,
    db.$queryRaw<Array<{ id: string; judul: string; prioritas: string; asal: string | null }>>`
      SELECT k.id, k.judul, k.prioritas::text, COALESCE(d.nama, pd.nama, dv.nama) AS asal
      FROM kendala k
      LEFT JOIN departemen d ON d.id = k.departemen_id
      LEFT JOIN proker p ON p.id = k.proker_id
      LEFT JOIN departemen pd ON pd.id = p.departemen_id
      LEFT JOIN divisi dv ON dv.id = k.divisi_id
      WHERE k.periode_id = ${konteks.periodeId}::uuid AND k.status <> 'SELESAI'
      ORDER BY k.prioritas DESC, k.created_at DESC
      LIMIT 8
    `,
    db.$queryRaw<Array<{ on_track: number; telat: number }>>`
      SELECT
        count(*) FILTER (
          WHERE status IN ('DISETUJUI','BERJALAN')
            AND (tanggal_hari_h_selesai IS NULL OR tanggal_hari_h_selesai >= hari_ini_jakarta())
        )::int AS on_track,
        count(*) FILTER (
          WHERE status IN ('DISETUJUI','BERJALAN')
            AND tanggal_hari_h_selesai < hari_ini_jakarta()
        )::int AS telat
      FROM proker
      WHERE periode_id = ${konteks.periodeId}::uuid
    `,
  ]);
  const statistik = kepatuhan[0] ?? { on_track: 0, telat: 0 };
  const total = statistik.on_track + statistik.telat;

  return [
    kartu(
      'ringkasan-departemen',
      'bph',
      'Ringkasan seluruh departemen',
      departemen.map((item) => ({
        id: item.id,
        label: item.nama,
        // Agregat tenggat disegarkan cron harian (deadline_ringkasan, T-083).
        keterangan: [
          `${item.berjalan} sedang berjalan`,
          item.terlambat ? `${item.terlambat} tugas terlambat` : null,
          item.kritis ? `${item.kritis} tugas kritis` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        nilai: item.jumlah,
        format: 'angka',
      })),
    ),
    kartu(
      'kendala-lintas',
      'bph',
      'Kendala terbuka lintas departemen',
      kendala.map((item) => ({
        id: item.id,
        href: `/departemen/kendala/${item.id}`,
        label: item.judul,
        keterangan: item.asal ?? 'Lintas organisasi',
        prioritas: item.prioritas,
      })),
    ),
    kartu('statistik-kepatuhan', 'bph', 'Statistik kepatuhan proker', [
      { id: 'on-track', label: 'Tepat jalur', nilai: statistik.on_track, format: 'angka' },
      { id: 'telat', label: 'Terlambat', nilai: statistik.telat, format: 'angka' },
      {
        id: 'persentase',
        label: 'Kepatuhan',
        nilai: total === 0 ? 0 : Math.round((statistik.on_track / total) * 100),
        format: 'persen',
      },
    ]),
  ];
}

async function panelAdmin(konteks: Konteks): Promise<KartuDashboard[]> {
  const [kesehatan, pengguna, backup, audit] = await Promise.all([
    db.$queryRaw<Array<{ waktu: Date }>>`SELECT now() AS waktu`,
    db.$queryRaw<Array<{ aktif: number; total: number }>>`
      SELECT count(DISTINCT u.id)::int AS total,
             count(DISTINCT u.id) FILTER (WHERE u.is_active)::int AS aktif
      FROM app_user u
      JOIN user_role r ON r.user_id = u.id
      WHERE r.periode_id = ${konteks.periodeId}::uuid
    `,
    db.backup.findFirst({
      where: { OR: [{ periode_id: konteks.periodeId }, { periode_id: null }] },
      select: { id: true, jenis: true, status: true, created_at: true, completed_at: true },
      orderBy: { created_at: 'desc' },
    }),
    db.$queryRaw<
      Array<{ id: string; aksi: string; entitas: string; created_at: Date; nama: string | null }>
    >`
      SELECT a.id::text, a.aksi, a.entitas, a.created_at, u.nama_lengkap AS nama
      FROM audit_log a
      LEFT JOIN app_user u ON u.id = a.user_id
      WHERE a.periode_id = ${konteks.periodeId}::uuid
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 6
    `,
  ]);
  const statistik = pengguna[0] ?? { aktif: 0, total: 0 };

  return [
    kartu('sistem-kesehatan', 'admin', 'Kesehatan sistem', [
      {
        id: 'database',
        label: 'Database terhubung',
        status: 'Operasional',
        tanggal: tanggal(kesehatan[0]?.waktu ?? null),
      },
    ]),
    kartu('statistik-user', 'admin', 'Statistik pengguna', [
      { id: 'total', label: 'Pengguna periode aktif', nilai: statistik.total, format: 'angka' },
      { id: 'aktif', label: 'Akun aktif', nilai: statistik.aktif, format: 'angka' },
      {
        id: 'nonaktif',
        label: 'Akun nonaktif',
        nilai: Math.max(0, statistik.total - statistik.aktif),
        format: 'angka',
      },
    ]),
    kartu(
      'backup-terakhir',
      'admin',
      'Status backup terakhir',
      backup
        ? [
            {
              id: backup.id,
              label: `Backup ${backup.jenis}`,
              status: backup.status,
              tanggal: tanggal(backup.completed_at ?? backup.created_at),
            },
          ]
        : [],
    ),
    kartu(
      'audit-terbaru',
      'admin',
      'Audit log terbaru',
      audit.map((item) => ({
        id: item.id,
        label: `${item.aksi.replaceAll('_', ' ')} · ${item.entitas.replaceAll('_', ' ')}`,
        keterangan: item.nama ?? 'Sistem',
        tanggal: tanggal(item.created_at),
        href: '/admin/audit',
      })),
    ),
  ];
}

export async function muatPanel(
  panel: PanelDashboardKey,
  konteks: Konteks,
): Promise<KartuDashboard[]> {
  switch (panel) {
    case 'ketua':
      return panelKetua(konteks);
    case 'sekum':
      return panelSekum(konteks);
    case 'bendum':
      return panelBendum(konteks);
    case 'kadept':
      return panelKadept(konteks);
    case 'anggota':
      return panelAnggota(konteks);
    case 'bph':
      return panelBph(konteks);
    case 'admin':
      return panelAdmin(konteks);
  }
}

export async function muatDashboard(konteks: Konteks): Promise<DashboardData> {
  const panel = panelUntukPeran(konteks.roles);
  const hasil = await Promise.all(panel.map((nama) => muatPanel(nama, konteks)));
  const gabungan: Record<string, KartuDashboard> = {};
  for (const daftar of hasil) {
    for (const item of daftar) gabungan[item.kunci] ??= item;
  }
  const approval = gabungan['approval-antrian'];
  const badgeApproval = approval?.tersedia ? approval.data.length : 0;

  return {
    peran: konteks.roles,
    lingkup: { departemenIds: konteks.departemenIds, userId: konteks.sesi.userId },
    badgeApproval,
    kartu: gabungan,
  };
}
