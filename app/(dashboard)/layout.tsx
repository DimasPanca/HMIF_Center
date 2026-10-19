import { redirect } from 'next/navigation';

import { Sidebar, type JumlahApproval } from '@/components/layout/Sidebar';
import { konteksSaatIni, type Konteks } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import type { FaktaMenu } from '@/lib/navigasi/menu';
import { daftarPeriode } from '@/lib/periode/service';

export const dynamic = 'force-dynamic';

async function hitungApproval(konteks: Konteks & { periodeId: string }): Promise<JumlahApproval> {
  const [baris, nota] = await Promise.all([
    db.v_antrian_approval.findMany({
      where: { periode_id: konteks.periodeId },
      select: { approver_roles: true, jenis: true },
    }),
    // Antrean Bendahara: nota yang menunggu verifikasi di acara periode ini.
    can(konteks.roles, 'nota.verify')
      ? db.nota.count({
          where: { status: 'MENUNGGU_VERIFIKASI', divisi: { kepanitiaan: { proker: { periode_id: konteks.periodeId } } } },
        })
      : Promise.resolve(0),
  ]);

  return baris.reduce<JumlahApproval>(
    (jumlah, item) => {
      if (!item.approver_roles.some((role) => konteks.roles.includes(role))) return jumlah;
      if (item.jenis === 'PROKER') jumlah.proker += 1;
      if (item.jenis === 'SURAT') jumlah.surat += 1;
      return jumlah;
    },
    { proker: 0, surat: 0, nota },
  );
}

/** Fakta kecil penentu tautan menu: kode departemen pengguna dan apakah ia panitia acara. */
async function faktaMenu(konteks: Konteks & { periodeId: string }): Promise<FaktaMenu> {
  const userId = konteks.sesi.userId;
  const [dept, panitia] = await Promise.all([
    konteks.departemenIds.length
      ? db.departemen.findMany({ where: { id: { in: konteks.departemenIds } }, select: { kode: true }, orderBy: { kode: 'asc' } })
      : Promise.resolve([]),
    db.$queryRaw<{ ada: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM kepanitiaan k
        JOIN proker p ON p.id = k.proker_id AND p.periode_id = ${konteks.periodeId}::uuid
        LEFT JOIN divisi d ON d.kepanitiaan_id = k.id
        LEFT JOIN divisi_member m ON m.divisi_id = d.id
        WHERE k.ketua_pelaksana = ${userId}::uuid OR d.koordinator_id = ${userId}::uuid OR m.user_id = ${userId}::uuid
      ) AS ada`,
  ]);
  return { kodeDepartemen: dept.map((d) => d.kode), panitia: panitia[0]?.ada ?? false };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) {
    redirect('/login');
  }
  const k = konteks as Konteks & { periodeId: string };

  const [semuaPeriode, jumlahApproval, fakta] = await Promise.all([daftarPeriode(), hitungApproval(k), faktaMenu(k)]);

  return (
    <Sidebar
      email={konteks.sesi.email}
      fakta={fakta}
      jumlahApproval={jumlahApproval}
      nama={konteks.sesi.namaLengkap}
      periode={semuaPeriode.map(({ id, nama, status }) => ({ id, nama, status }))}
      periodeAktifId={konteks.periodeId}
      roles={konteks.roles}
    >
      {children}
    </Sidebar>
  );
}
