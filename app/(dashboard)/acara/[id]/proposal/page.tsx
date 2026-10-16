import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ProposalEditor } from '@/components/proposal/ProposalEditor';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { dokumenProposalTerakhir } from '@/lib/proposal/generate';
import { muatProposal } from '@/lib/proposal/service';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Editor & generator Proposal 8 bagian (T-096, PRD F-10.2). */
export default async function ProposalPage({ params }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'kepanitiaan.read')) notFound();

  const { id } = await params;
  if (!POLA_UUID.test(id)) notFound();
  const [proposal, dokumen] = await Promise.all([
    muatProposal(konteks, id),
    dokumenProposalTerakhir(konteks, id),
  ]);
  if (!proposal) notFound();

  return (
    <main
      className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6"
      data-testid="halaman-proposal"
    >
      <div className="mx-auto max-w-[92rem] space-y-4">
        <header className="pt-4">
          <nav aria-label="Breadcrumb" className="text-[12px] text-secondary">
            <Link href="/acara" className="hover:underline">
              Acara
            </Link>
            {' / '}
            <Link href={`/acara/${id}?tab=proposal`} className="hover:underline">
              {proposal.nama_acara}
            </Link>
            {' / Proposal'}
          </nav>
          <h1 className="mt-1 text-2xl font-semibold">Proposal Kegiatan</h1>
          <p className="text-[13px] text-secondary">{proposal.nama_acara}</p>
        </header>
        <ProposalEditor
          awal={proposal}
          dokumenTerakhir={dokumen?.created_at.toISOString() ?? null}
        />
      </div>
    </main>
  );
}
