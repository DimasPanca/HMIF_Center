import { muatPanel } from '@/app/api/dashboard/data';
import type { Konteks } from '@/lib/auth/guard';

import { PanelDashboard, type PanelPeranProps } from './PanelDashboard';

export async function PanelSekum({ konteks, kunci }: PanelPeranProps & { konteks: Konteks }) {
  const kartu = (await muatPanel('sekum', konteks)).filter((item) => kunci.includes(item.kunci));
  return <PanelDashboard kartu={kartu} panel="sekum" judul="Panel Sekretaris Umum" />;
}
