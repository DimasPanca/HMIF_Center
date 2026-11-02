import { redirect } from 'next/navigation';

import { LaporBug } from '@/components/bug/LaporBug';
import { konteksSaatIni } from '@/lib/auth/guard';
import { daftarLaporan } from '@/lib/bug/service';

export const dynamic = 'force-dynamic';

/** Lapor bug (ADR-060 §5) — semua peran. Daftar di kanan hanya laporan milik pengguna. */
export default async function LaporBugPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) redirect('/login');
  const semua = await daftarLaporan(konteks);
  return <LaporBug laporan={semua.filter((l) => l.pelapor.id === konteks.sesi.userId)} />;
}
