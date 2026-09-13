'use client';

import { useSyncExternalStore } from 'react';

import type { StatusKoneksiRealtime } from '@/lib/realtime/use-master-gantt-realtime';

let status: StatusKoneksiRealtime = 'menghubungkan';
const pendengar = new Set<() => void>();

function berlangganan(pendengarBaru: () => void): () => void {
  pendengar.add(pendengarBaru);
  return () => pendengar.delete(pendengarBaru);
}

function statusSaatIni(): StatusKoneksiRealtime {
  return status;
}

export function aturStatusRealtime(baru: StatusKoneksiRealtime): void {
  if (status === baru) return;
  status = baru;
  pendengar.forEach((beriTahu) => beriTahu());
}

export function useStatusRealtime(): StatusKoneksiRealtime {
  return useSyncExternalStore(berlangganan, statusSaatIni, () => 'menghubungkan');
}
