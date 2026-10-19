'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const KUERI_HP = '(max-width: 767.98px)';

function langgananLayar(cb: () => void) {
  const mq = window.matchMedia(KUERI_HP);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** true di layar HP (< 768px). Server & render pertama: false (tampilan lebar). */
export function useLayarHp(): boolean {
  return useSyncExternalStore(
    langgananLayar,
    () => window.matchMedia(KUERI_HP).matches,
    () => false,
  );
}

// Preferensi tampilan per perangkat, dibagi semua komponen di halaman yang
// memakai kunci yang sama (mis. bilah alat Gantt mengikuti pilihan Daftar/Grafik).
const nilai = new Map<string, string | null>();
const pendengar = new Map<string, Set<() => void>>();

function baca(kunci: string): string | null {
  if (!nilai.has(kunci)) {
    try {
      nilai.set(kunci, window.localStorage.getItem(kunci));
    } catch {
      nilai.set(kunci, null);
    }
  }
  return nilai.get(kunci) ?? null;
}

function tulis(kunci: string, v: string) {
  nilai.set(kunci, v);
  try {
    window.localStorage.setItem(kunci, v);
  } catch {
    // Tetap berlaku untuk sesi ini.
  }
  pendengar.get(kunci)?.forEach((f) => f());
}

function langgananPilihan(kunci: string) {
  return (cb: () => void) => {
    const set = pendengar.get(kunci) ?? new Set();
    set.add(cb);
    pendengar.set(kunci, set);
    return () => set.delete(cb);
  };
}

/**
 * Tampilan komponen lebar (Gantt, papan Kanban, panel filter) di HP (ADR-037):
 * bawaannya tampilan khusus HP tanpa gulir ke samping; pengguna boleh beralih
 * dan pilihannya diingat per perangkat. Di layar lebar selalu `lebar`.
 */
export function useTampilanHp<T extends string>(kunci: string, hp: T, lebar: T): [T, (v: T) => void, boolean] {
  const layarHp = useLayarHp();
  const subscribe = useMemo(() => langgananPilihan(kunci), [kunci]);
  const tersimpan = useSyncExternalStore(subscribe, () => baca(kunci), () => null);
  const pilihan = tersimpan === hp || tersimpan === lebar ? (tersimpan as T) : null;
  const ubah = useCallback((v: T) => tulis(kunci, v), [kunci]);
  return [layarHp ? (pilihan ?? hp) : lebar, ubah, layarHp];
}
