import { notFound } from 'next/navigation';

import { Sidebar } from '@/components/layout/Sidebar';
import { ROLES, type RoleCode } from '@/lib/auth/permissions';

interface PageProps {
  searchParams: Promise<{ role?: string | string[]; kode?: string; panitia?: string }>;
}

function bacaRoles(nilai: string | string[] | undefined): RoleCode[] {
  const mentah = Array.isArray(nilai) ? nilai.join(',') : (nilai ?? '');
  const diminta = mentah.split(',').map((role) => role.trim().toUpperCase());
  return [...new Set(diminta.filter((role): role is RoleCode => ROLES.includes(role as RoleCode)))];
}

export default async function SidebarHarness({ searchParams }: PageProps) {
  if (process.env.NODE_ENV === 'production') notFound();

  const q = await searchParams;
  const roles = bacaRoles(q.role);
  // `?kode=EKS` meniru Kadept/Anggota satu departemen; `?panitia=1` meniru anggota panitia acara.
  const fakta = { kodeDepartemen: q.kode ? [q.kode.toUpperCase()] : [], panitia: q.panitia === '1' };

  return (
    <Sidebar
      email="harness@uji.test"
      fakta={fakta}
      jumlahApproval={{ proker: 3, surat: 7, nota: 4 }}
      nama="Pengguna Uji"
      periode={[{ id: 'periode-uji', nama: 'Periode Uji', status: 'AKTIF' }]}
      periodeAktifId="periode-uji"
      roles={roles}
    >
      <main className="p-6">
        <h1 className="text-xl font-semibold">Harness sidebar</h1>
        <p className="mt-2 text-[13px] text-secondary">Role: {roles.join(', ') || 'tanpa role'}</p>
      </main>
    </Sidebar>
  );
}
