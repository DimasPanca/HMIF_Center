import { notFound, redirect } from 'next/navigation';

import { AuditViewer } from '@/components/audit/AuditViewer';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'audit.read')) notFound();

  return (
    <main data-testid="audit-page" className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Audit log</h1>
            <p className="mt-1 max-w-3xl text-[14px] leading-5 text-secondary">
              Telusuri perubahan penting beserta pelaku, waktu, dan sumber permintaannya. Jejak ini
              bersifat permanen dan tidak menyediakan tindakan ubah maupun hapus.
            </p>
          </div>
        </header>

        <AuditViewer />
      </div>
    </main>
  );
}
