import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { NotaForm, type PerbaikanNota } from '@/components/nota/NotaForm';
import { BelumTersedia } from '@/components/acara/BelumTersedia';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { urlGambarNota } from '@/lib/images/url-gambar';
import { divisiUntukUpload, notaUntukPerbaikan } from '@/lib/nota/service';
import { tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ perbaiki?: string | string[] }>;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Upload nota (T-101, USER_FLOW §7.1) — juga memperbaiki nota yang dikembalikan (`?perbaiki=`). */
export default async function UploadNotaPage({ searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'nota.create')) notFound();

  const sp = await searchParams;
  const idPerbaiki = Array.isArray(sp.perbaiki) ? sp.perbaiki[0] : sp.perbaiki;
  let perbaikan: PerbaikanNota | null = null;
  if (idPerbaiki) {
    const n = POLA_UUID.test(idPerbaiki) ? await notaUntukPerbaikan(konteks, idPerbaiki) : null;
    if (!n) notFound();
    perbaikan = {
      id: n.id,
      alasan_penolakan: n.alasan_penolakan,
      isian: n.isian,
      urlPratinjau: (await urlGambarNota(n.gambar)).previewUrl,
    };
  }
  const divisi = await divisiUntukUpload(konteks);

  return (
    <main
      className="min-h-dvh bg-app px-4 pb-6 text-primary sm:px-6"
      data-testid="halaman-upload-nota"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="pt-4">
          <nav aria-label="Breadcrumb" className="text-[12px] text-secondary">
            <Link href="/keuangan/nota" className="hover:underline">
              Nota
            </Link>
            {perbaikan ? ' / Perbaiki nota' : ' / Upload'}
          </nav>
          <h1 className="mt-1 text-2xl font-semibold">
            {perbaikan ? 'Perbaiki nota' : 'Upload nota'}
          </h1>
          <p className="text-[13px] text-secondary">
            Pilih item RAB dulu, lalu foto notanya. Total alokasi harus sama dengan total nota.
          </p>
        </header>
        {divisi.length === 0 ? (
          <BelumTersedia
            testid="nota-tanpa-divisi"
            ikon="nota"
            judul="Anda belum terdaftar di divisi mana pun"
            penjelasan="Nota diunggah panitia divisi acara yang sedang berjalan. Minta Ketua Pelaksana menambahkan Anda ke divisi."
            aksi={{ label: 'Lihat acara', href: '/acara' }}
          />
        ) : (
          <NotaForm divisi={divisi} hariIni={tanggalHariIniJakarta()} perbaikan={perbaikan} />
        )}
      </div>
    </main>
  );
}
