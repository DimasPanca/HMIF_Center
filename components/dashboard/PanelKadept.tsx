import { muatPanel } from '@/app/api/dashboard/data';
import type { Konteks } from '@/lib/auth/guard';
import { konteksDeadline } from '@/lib/deadline-config';

import { PanelDashboard, type PanelPeranProps } from './PanelDashboard';

export async function PanelKadept({ konteks, kunci }: PanelPeranProps & { konteks: Konteks }) {
  const [semua, tenggat] = await Promise.all([muatPanel('kadept', konteks), konteksDeadline()]);
  const kartu = semua.filter((item) => kunci.includes(item.kunci));
  return <PanelDashboard kartu={kartu} panel="kadept" tenggat={tenggat} judul="Panel Kepala Departemen" />;
}
