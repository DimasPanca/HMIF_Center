import { notFound } from 'next/navigation';

import { KalenderKetersediaan } from '@/components/proker/KalenderKetersediaan';
import type { EntriKalender } from '@/lib/proker/service';

const FIXTURE: EntriKalender[] = [
  {
    jenis: 'TERKUNCI',
    proker_id: 'proker-sync',
    nama_proker: 'SYNCHRONIZE 2026',
    departemen_id: 'dept-kaderisasi',
    nama_departemen: 'Kaderisasi',
    mulai: '2026-11-01',
    selesai: '2026-11-22',
    hari_h_mulai: '2026-11-20',
    hari_h_selesai: '2026-11-22',
    penanggung_jawab: 'Nadia Putri',
    pola_ulang: null,
  },
  {
    jenis: 'BERKALA',
    proker_id: 'proker-rutin',
    nama_proker: 'Latihan Rutin',
    departemen_id: 'dept-minat-bakat',
    nama_departemen: 'Minat & Bakat',
    mulai: '2026-09-01',
    selesai: '2027-06-30',
    hari_h_mulai: null,
    hari_h_selesai: null,
    penanggung_jawab: null,
    pola_ulang: {
      frekuensi: 'MINGGUAN',
      hari: ['SABTU'],
      mulai: '2026-09-01',
      selesai: '2027-06-30',
    },
  },
];

export default function KalenderQaPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <header>
          <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
            Halaman verifikasi nonproduksi
          </p>
          <h1 className="mt-1 text-xl font-semibold">Harness kalender ketersediaan</h1>
        </header>
        <KalenderKetersediaan entriAwal={FIXTURE} bulanAwal="2026-11" />
      </div>
    </main>
  );
}
