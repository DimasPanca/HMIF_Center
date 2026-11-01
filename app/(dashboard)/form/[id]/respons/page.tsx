import { notFound, redirect } from 'next/navigation';

import { ResponsForm } from '@/components/form/ResponsForm';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { pengelolaTemplate } from '@/lib/form/akses';
import { muatRespons } from '@/lib/form/respons';

export const dynamic = 'force-dynamic';

export default async function HalamanResponsForm({ params }: { params: Promise<{ id: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'form.read')) notFound();
  const { id } = await params;
  const data = await muatRespons(konteks, id);
  if (!data) notFound();

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      {/* Terapkan ke Data Pengurus = Sekum/Admin, sama dengan pengelola template. */}
      <ResponsForm data={data} bolehTerapkan={pengelolaTemplate(konteks.roles)} kembali="/form" />
    </main>
  );
}
