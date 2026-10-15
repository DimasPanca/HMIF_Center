import { muatPanel } from '@/app/api/dashboard/data';
import type { Konteks } from '@/lib/auth/guard';
import { konteksDeadline } from '@/lib/deadline-config';

import { PanelDashboard, type PanelPeranProps } from './PanelDashboard';

export async function PanelAnggota({ konteks, kunci }: PanelPeranProps & { konteks: Konteks }) {
  const [semua, tenggat] = await Promise.all([muatPanel('anggota', konteks), konteksDeadline()]);
  const kartu = semua.filter((item) => kunci.includes(item.kunci));
  return <PanelDashboard kartu={kartu} panel="anggota" tenggat={tenggat} judul="Panel Anggota" />;
}
