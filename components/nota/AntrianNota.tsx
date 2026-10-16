/**
 * Antrian nota menunggu verifikasi (T-102 kontrak 1, 2, 7): dikelompokkan per
 * acara lalu divisi; setiap kartu memakai THUMBNAIL (≤400px, lazy) — tidak
 * pernah preview apalagi master (SYSTEM_DESIGN §9.5).
 */

import Link from 'next/link';

import { NotaImage } from '@/components/nota/NotaImage';
import type { GrupAntrian } from '@/lib/nota/verifikasi';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

export function AntrianNota({ grup, aktif }: { grup: GrupAntrian[]; aktif: string | null }) {
  const jumlah = grup.reduce((s, g) => s + g.nota.length, 0);
  if (jumlah === 0) {
    return (
      <p
        className="rounded-sm border border-dashed border-default p-6 text-center text-[13px] text-secondary"
        data-testid="antrian-kosong"
      >
        Tidak ada nota yang menunggu verifikasi.
      </p>
    );
  }
  return (
    <div className="space-y-4" data-testid="antrian-nota" data-jumlah={jumlah}>
      {grup.map((g) => (
        <section
          key={g.divisi.id}
          aria-labelledby={`antrian-${g.divisi.id}`}
          data-testid="antrian-grup"
        >
          <h2 id={`antrian-${g.divisi.id}`} className="mb-2 text-[13px] font-semibold">
            {g.acara.nama}{' '}
            <span className="font-normal text-secondary">
              · {g.divisi.nama} · {g.nota.length} nota
            </span>
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
            {g.nota.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/keuangan/nota/verifikasi?nota=${n.id}`}
                  scroll={false}
                  aria-current={aktif === n.id ? 'true' : undefined}
                  className={cn(
                    'flex gap-2 rounded-sm border p-2 hover:bg-subtle',
                    aktif === n.id ? 'border-[var(--border-focus)] bg-subtle' : 'border-default',
                  )}
                  data-testid="antrian-kartu"
                  data-nota-id={n.id}
                >
                  <NotaImage gambar={n.gambar} varian="thumb" className="shrink-0" />
                  <span className="min-w-0 text-[12px]">
                    <span className="block font-semibold tabular-nums">
                      {formatRupiah(n.total_nota)}
                    </span>
                    <span className="block text-secondary">
                      {formatTanggalPendek(n.tanggal_belanja)}
                    </span>
                    <span className="block truncate text-tertiary">{n.pengunggah}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
