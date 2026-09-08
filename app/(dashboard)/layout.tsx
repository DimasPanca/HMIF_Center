import { redirect } from 'next/navigation';

import { Sidebar, type JumlahApproval } from '@/components/layout/Sidebar';
import { konteksSaatIni } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { daftarPeriode } from '@/lib/periode/service';

export const dynamic = 'force-dynamic';

async function hitungApproval(
  periodeId: string,
  roles: readonly string[],
): Promise<JumlahApproval> {
  const baris = await db.v_antrian_approval.findMany({
    where: { periode_id: periodeId },
    select: { approver_roles: true, jenis: true },
  });

  return baris.reduce<JumlahApproval>(
    (jumlah, item) => {
      if (!item.approver_roles.some((role) => roles.includes(role))) return jumlah;
      if (item.jenis === 'PROKER') jumlah.proker += 1;
      if (item.jenis === 'SURAT') jumlah.surat += 1;
      return jumlah;
    },
    { proker: 0, surat: 0 },
  );
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) {
    redirect('/login');
  }

  const [semuaPeriode, jumlahApproval] = await Promise.all([
    daftarPeriode(),
    hitungApproval(konteks.periodeId, konteks.roles),
  ]);

  return (
    <Sidebar
      email={konteks.sesi.email}
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
