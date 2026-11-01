import { notFound, redirect } from 'next/navigation';

import { EditorForm } from '@/components/form/EditorForm';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { muatForm } from '@/lib/form/service';

export const dynamic = 'force-dynamic';

export default async function HalamanEditorForm({ params }: { params: Promise<{ id: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'form.read')) notFound();
  const { id } = await params;
  const form = await muatForm(konteks, id);
  if (!form) notFound();

  return (
    <main className="min-h-dvh bg-app px-4 pb-10 text-primary sm:px-6">
      <EditorForm form={form} />
    </main>
  );
}
