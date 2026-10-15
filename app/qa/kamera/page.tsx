import { notFound } from 'next/navigation';

import { HarnessKamera } from './HarnessKamera';

/**
 * Harness e2e kamera nota (T-100) — nonproduksi, tanpa sesi.
 *
 *   /qa/kamera
 *
 * Halaman upload nota sungguhan (`/keuangan/nota/upload`) milik T-101; sampai
 * itu ada, gate `kamera-nota` dan `scripts/bench-bundle.ts` mengukur komponen
 * yang sama di sini. Kontrak selector: kepala e2e/kamera-nota.spec.ts.
 */
export default function HarnessKameraPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="min-h-dvh bg-app p-4 text-primary">
      <h1 className="mb-4 text-center text-lg font-semibold">Foto nota</h1>
      <HarnessKamera />
    </main>
  );
}
