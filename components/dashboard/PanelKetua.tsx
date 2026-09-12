import { muatPanel } from '@/app/api/dashboard/data';
import type { Konteks } from '@/lib/auth/guard';

import { PanelDashboard, type PanelPeranProps } from './PanelDashboard';

export async function PanelKetua({ konteks, kunci }: PanelPeranProps & { konteks: Konteks }) {
  const kartu = (await muatPanel('ketua', konteks)).filter((item) => kunci.includes(item.kunci));
  return <PanelDashboard kartu={kartu} panel="ketua" judul="Panel Ketua dan Wakil" />;
}
