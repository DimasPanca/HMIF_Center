import { notFound, redirect } from 'next/navigation';

import { EditorTemplate } from '@/components/form/EditorTemplate';
import { konteksSaatIni } from '@/lib/auth/guard';
import { pengelolaTemplate } from '@/lib/form/akses';
import { muatTemplate } from '@/lib/form/template';

export const dynamic = 'force-dynamic';

/** `/form/template/baru` = template kosong; selain itu id template. */
export default async function HalamanEditorTemplate({ params }: { params: Promise<{ id: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!pengelolaTemplate(konteks.roles)) notFound();
  const { id } = await params;

  const t = id === 'baru' ? null : await muatTemplate(id);
  if (id !== 'baru' && !t) notFound();

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <EditorTemplate
        awal={
          t
            ? { id: t.id, nama: t.nama, kategori: t.kategori, deskripsi: t.deskripsi, aktif: t.aktif, bawaan: t.bawaan, dipakai: t.dipakai, isi: t.isi }
            : { id: null, nama: '', kategori: 'LAINNYA', deskripsi: '', aktif: true, bawaan: false, dipakai: 0, isi: null }
        }
      />
    </main>
  );
}
