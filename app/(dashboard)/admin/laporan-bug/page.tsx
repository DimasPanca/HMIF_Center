import { notFound, redirect } from 'next/navigation';

import { AdminLaporanBug } from '@/components/bug/AdminLaporanBug';
import { konteksSaatIni } from '@/lib/auth/guard';
import { adalahAdmin, daftarLaporan } from '@/lib/bug/service';

export const dynamic = 'force-dynamic';

/** Laporan bug untuk Admin (ADR-060 §5). */
export default async function AdminLaporanBugPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) redirect('/login');
  if (!adalahAdmin(konteks)) notFound();
  return <AdminLaporanBug laporan={await daftarLaporan(konteks)} />;
}
