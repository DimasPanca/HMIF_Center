import { ArrowLeft, LayoutTemplate, Plus } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { konteksSaatIni } from '@/lib/auth/guard';
import { pengelolaTemplate } from '@/lib/form/akses';
import { INFO_KATEGORI, KATEGORI } from '@/lib/form/skema';
import { daftarTemplate } from '@/lib/form/template';

export const dynamic = 'force-dynamic';

export default async function HalamanTemplateForm() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!pengelolaTemplate(konteks.roles)) notFound();
  const templates = await daftarTemplate({ termasukNonaktif: true });

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[72rem] space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <Link href="/form" className="mt-1 flex size-8 items-center justify-center rounded-sm text-secondary hover:bg-subtle" aria-label="Kembali ke Formulir">
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">Template form</h1>
              <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
                Kerangka pertanyaan siap pakai untuk semua panitia. Mengubah template tidak mengubah form yang sudah dibuat darinya.
              </p>
            </div>
          </div>
          <Link href="/form/template/baru" className={buttonVariants()}>
            <Plus aria-hidden /> Template baru
          </Link>
        </header>

        {KATEGORI.map((k) => {
          const isi = templates.filter((t) => t.kategori === k);
          if (!isi.length) return null;
          return (
            <section key={k}>
              <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-tertiary uppercase">{INFO_KATEGORI[k].label}</h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {isi.map((t) => (
                  <li key={t.id}>
                    <Link href={`/form/template/${t.id}`} className="flex h-full flex-col rounded-md border border-default bg-panel p-4 hover:border-strong" data-testid="kartu-template">
                      <span className="flex items-center gap-2">
                        <LayoutTemplate aria-hidden className="size-4 text-[var(--primary)]" />
                        <span className="flex-1 truncate text-[15px] font-semibold">{t.nama}</span>
                        {t.bawaan && <Badge tone="info">Bawaan</Badge>}
                        {!t.aktif && <Badge tone="neutral">Nonaktif</Badge>}
                      </span>
                      {t.deskripsi && <span className="mt-1 line-clamp-2 text-[13px] leading-5 text-secondary">{t.deskripsi}</span>}
                      <span className="mt-auto pt-3 text-[12px] text-tertiary tabular-nums">
                        {t.jumlah_pertanyaan} pertanyaan · {t.jumlah_bagian} bagian · dipakai {t.dipakai}×
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
