import { notFound, redirect } from 'next/navigation';

import { AntrianNota } from '@/components/nota/AntrianNota';
import { NotaDetailSplit } from '@/components/nota/NotaDetailSplit';
import { VerifikasiAksi } from '@/components/nota/VerifikasiAksi';
import { Card } from '@/components/ui/card';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { antrianNota, detailNota } from '@/lib/nota/verifikasi';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ nota?: string | string[] }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifikasi nota (T-102, USER_FLOW §7.2): antrian ber-THUMBNAIL di kiri,
 * nota terpilih (`?nota=`) berdampingan PREVIEW ⟷ data di kanan.
 */
export default async function VerifikasiNotaPage({ searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'nota.verify')) notFound();

  const sp = await searchParams;
  const idPilih = Array.isArray(sp.nota) ? sp.nota[0] : sp.nota;
  const pilihSah = idPilih && POLA_UUID.test(idPilih) ? idPilih : null;
  // Nota terpilih diketahui → antrian & detail dimuat paralel (bench galeri < 2 detik).
  const [grup, detailPilih] = await Promise.all([
    antrianNota(konteks),
    pilihSah ? detailNota(konteks, pilihSah) : Promise.resolve(null),
  ]);
  const urutan = grup.flatMap((g) => g.nota.map((n) => n.id));
  const aktif = pilihSah ?? urutan[0] ?? null;
  const detail = pilihSah ? detailPilih : aktif ? await detailNota(konteks, aktif) : null;
  const sisa = urutan.filter((id) => id !== aktif);
  const berikutnya =
    aktif && urutan.includes(aktif)
      ? (urutan[urutan.indexOf(aktif) + 1] ?? sisa[0] ?? null)
      : (sisa[0] ?? null);

  return (
    <main
      className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6"
      data-testid="halaman-verifikasi-nota"
    >
      <div className="mx-auto max-w-[92rem] space-y-4">
        <header className="pt-4">
          <h1 className="text-2xl font-semibold">Verifikasi nota</h1>
          <p className="text-[13px] text-secondary">
            {urutan.length} nota menunggu. Bandingkan gambar dengan data yang diinput sebelum
            menyetujui.
          </p>
        </header>
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,26rem)_1fr]">
          <aside
            aria-label="Antrian nota"
            className="lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
          >
            <AntrianNota grup={grup} aktif={aktif} />
          </aside>
          <section aria-label="Detail nota">
            {detail ? (
              <NotaDetailSplit
                nota={detail}
                aksi={
                  detail.status === 'MENUNGGU_VERIFIKASI' ? (
                    <VerifikasiAksi
                      notaId={detail.id}
                      berikutnya={berikutnya}
                      bolehSetujui={detail.total_alokasi === detail.total_nota}
                    />
                  ) : (
                    <p
                      className="border-t border-default pt-3 text-[13px] text-secondary"
                      data-testid="verifikasi-sudah-diproses"
                    >
                      Nota ini berstatus {detail.status}.
                    </p>
                  )
                }
              />
            ) : (
              <Card className="p-6 text-center text-[13px] text-secondary">
                Pilih nota dari antrian.
              </Card>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
