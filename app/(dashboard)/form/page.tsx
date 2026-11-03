import { notFound, redirect } from 'next/navigation';

import { DaftarForm } from '@/components/form/DaftarForm';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { pengelolaTemplate, pimpinanPenulis } from '@/lib/form/akses';
import { acaraUntukBuat, daftarForm } from '@/lib/form/service';

export const dynamic = 'force-dynamic';

export default async function HalamanFormulir() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'form.read')) notFound();

  const [forms, acara] = await Promise.all([daftarForm(konteks), acaraUntukBuat(konteks)]);
  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem]">
        <DaftarForm forms={forms} bolehBuat={pimpinanPenulis(konteks.roles) || acara.length > 0} bolehTemplate={pengelolaTemplate(konteks.roles)} />
      </div>
    </main>
  );
}
