import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { TorEditor } from '@/components/tor/TorEditor';
import { muatAcara } from '@/lib/acara/service';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { dokumenTorTerakhir } from '@/lib/tor/generate';
import { muatTor } from '@/lib/tor/service';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Editor TOR 14 bagian (T-094, PRD F-10.1) — di bawah ruang kerja acara. */
export default async function TorPage({ params }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'kepanitiaan.read')) notFound();

  const { id } = await params;
  if (!POLA_UUID.test(id)) notFound();
  const [acara, tor, dokumen] = await Promise.all([
    muatAcara(konteks, id),
    muatTor(konteks, id),
    dokumenTorTerakhir(konteks, id),
  ]);
  if (!acara || !tor) notFound();

  return (
    <main className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6" data-testid="halaman-tor">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <header className="pt-4">
          <nav aria-label="Breadcrumb" className="text-[12px] text-secondary">
            <Link href="/acara" className="hover:underline">
              Acara
            </Link>
            {' / '}
            <Link href={`/acara/${acara.id}?tab=tor`} className="hover:underline">
              {acara.nama_acara}
            </Link>
            {' / TOR'}
          </nav>
          <h1 className="mt-1 text-2xl font-semibold">Term of Reference</h1>
          <p className="text-[13px] text-secondary">{acara.nama_acara}</p>
        </header>
        <TorEditor
          awal={tor}
          hariH={acara.hari_h_mulai}
          dokumenTerakhir={dokumen?.created_at.toISOString() ?? null}
        />
      </div>
    </main>
  );
}
