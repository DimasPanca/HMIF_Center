import { muatPanel } from '@/app/api/dashboard/data';
import type { Konteks } from '@/lib/auth/guard';

import { PanelDashboard, type PanelPeranProps } from './PanelDashboard';

export async function PanelAdmin({ konteks, kunci }: PanelPeranProps & { konteks: Konteks }) {
  const kartu = (await muatPanel('admin', konteks)).filter((item) => kunci.includes(item.kunci));
  return <PanelDashboard kartu={kartu} panel="admin" judul="Panel Admin" />;
}
