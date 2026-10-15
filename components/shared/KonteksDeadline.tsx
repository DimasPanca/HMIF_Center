'use client';

/**
 * Ambang & "hari ini" deadline untuk komponen klien (T-083). Diisi halaman
 * server dari `lib/deadline-config.ts`; tanpa provider dipakai ambang bawaan
 * dan tanggal Jakarta saat render.
 */

import * as React from 'react';

import { AMBANG_BAWAAN, type AmbangDeadline } from '@/lib/deadline';

interface NilaiDeadline {
  ambang: AmbangDeadline;
  hariIni?: string;
}

const Konteks = React.createContext<NilaiDeadline>({ ambang: AMBANG_BAWAAN });

export function KonteksDeadline({ nilai, children }: { nilai: NilaiDeadline; children: React.ReactNode }) {
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

export function useKonteksDeadline(): NilaiDeadline {
  return React.useContext(Konteks);
}
