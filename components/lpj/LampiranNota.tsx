/**
 * Pratinjau lampiran nota LPJ (T-105 kontrak 3): seluruh nota terverifikasi
 * per divisi beserta keterangan item RAB & nominal. Di LAYAR memakai
 * thumbnail (ringan); di DOKUMEN yang disematkan selalu MASTER (INV-19) —
 * preview/thumbnail tidak pernah masuk LPJ.
 */

import { Card } from '@/components/ui/card';

export interface KartuLampiran {
  id: string;
  divisi: string;
  keterangan: string;
  thumbUrl: string;
}

export function LampiranNota({ nota }: { nota: KartuLampiran[] }) {
  const divisi = [...new Set(nota.map((n) => n.divisi))];
  return (
    <Card className="space-y-3 p-4" data-testid="lpj-lampiran-nota" data-jumlah={nota.length}>
      <div>
        <h2 className="text-[15px] font-semibold">Lampiran nota (otomatis)</h2>
        <p className="text-[12px] text-secondary">
          {nota.length} nota terverifikasi. Dokumen LPJ memuat berkas asli (master) setiap nota,
          bukan pratinjau ini.
        </p>
      </div>
      {divisi.length === 0 ? (
        <p className="text-[13px] text-secondary">Belum ada nota terverifikasi.</p>
      ) : null}
      {divisi.map((d) => (
        <section key={d} aria-label={`Nota divisi ${d}`}>
          <h3 className="mb-1 text-[13px] font-semibold">{d}</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
            {nota
              .filter((n) => n.divisi === d)
              .map((n) => (
                <li
                  key={n.id}
                  className="flex gap-2 rounded-sm border border-default p-2"
                  data-testid="lpj-lampiran-kartu"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail pipeline T-097 */}
                  <img
                    src={n.thumbUrl}
                    alt={`Nota ${n.keterangan}`}
                    loading="lazy"
                    width={64}
                    height={64}
                    className="size-16 shrink-0 rounded-sm object-cover"
                  />
                  <span className="min-w-0 text-[12px] text-secondary">{n.keterangan}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}
