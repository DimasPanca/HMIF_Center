import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { PanelAdmin } from '@/components/dashboard/PanelAdmin';
import { PanelAnggota } from '@/components/dashboard/PanelAnggota';
import { PanelBendum } from '@/components/dashboard/PanelBendum';
import { PanelBPH } from '@/components/dashboard/PanelBPH';
import { PanelDashboardSkeleton } from '@/components/dashboard/PanelDashboard';
import { PanelKadept } from '@/components/dashboard/PanelKadept';
import { PanelKetua } from '@/components/dashboard/PanelKetua';
import { PanelSekum } from '@/components/dashboard/PanelSekum';
import { PantauKendalaKritis } from '@/components/dashboard/PantauKendalaKritis';
import {
  alokasiKartu,
  panelUntukPeran,
  type PanelDashboardKey,
} from '@/components/dashboard/types';
import { MasterGantt } from '@/components/gantt/MasterGantt';
import { konteksSaatIni, type Konteks } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/** Peran yang melihat kartu kendala Kritis/lintas (T-082 #4). */
const PEMANTAU_KRITIS = new Set<string>(['KETUA', 'WAKIL', 'BPH', 'ADMIN']);

function panel(nama: PanelDashboardKey, konteks: Konteks, kunci: readonly string[]): ReactNode {
  switch (nama) {
    case 'ketua':
      return <PanelKetua konteks={konteks} kunci={kunci} />;
    case 'sekum':
      return <PanelSekum konteks={konteks} kunci={kunci} />;
    case 'bendum':
      return <PanelBendum konteks={konteks} kunci={kunci} />;
    case 'kadept':
      return <PanelKadept konteks={konteks} kunci={kunci} />;
    case 'anggota':
      return <PanelAnggota konteks={konteks} kunci={kunci} />;
    case 'bph':
      return <PanelBPH konteks={konteks} kunci={kunci} />;
    case 'admin':
      return <PanelAdmin konteks={konteks} kunci={kunci} />;
  }
}

export default async function BerandaPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');

  const daftarPanel = panelUntukPeran(konteks.roles);
  const alokasi = alokasiKartu(daftarPanel);

  return (
    <main className="min-h-dvh space-y-8 bg-app p-4 text-primary sm:p-6">
      <MasterGantt
        key={konteks.periodeId}
        periodeId={konteks.periodeId}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null}
        supabaseKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null}
      />

      {konteks.roles.some((r) => PEMANTAU_KRITIS.has(r)) ? (
        <PantauKendalaKritis
          periodeId={konteks.periodeId}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null}
          supabaseKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null}
        />
      ) : null}

      <div data-testid="dashboard" className="space-y-8">
        {daftarPanel.map((nama) => {
          const kunci = alokasi[nama] ?? [];
          return (
            <Suspense
              key={nama}
              fallback={<PanelDashboardSkeleton panel={nama} jumlahKartu={kunci.length} />}
            >
              {panel(nama, konteks, kunci)}
            </Suspense>
          );
        })}
      </div>
    </main>
  );
}
