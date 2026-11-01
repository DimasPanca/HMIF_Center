import { notFound, redirect } from 'next/navigation';

import { WizardFormBaru } from '@/components/form/WizardFormBaru';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { pimpinanPenulis } from '@/lib/form/akses';
import { acaraUntukBuat } from '@/lib/form/service';
import { daftarTemplate } from '@/lib/form/template';

export const dynamic = 'force-dynamic';

export default async function HalamanFormBaru({ searchParams }: { searchParams: Promise<{ acara?: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'form.create')) notFound();

  const [acara, templates, { acara: acaraAwal }] = await Promise.all([acaraUntukBuat(konteks), daftarTemplate(), searchParams]);
  const bolehOrganisasi = pimpinanPenulis(konteks.roles);
  if (!bolehOrganisasi && acara.length === 0) notFound();

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <WizardFormBaru templates={templates} acara={acara} bolehOrganisasi={bolehOrganisasi} acaraAwal={typeof acaraAwal === 'string' ? acaraAwal : null} />
    </main>
  );
}
