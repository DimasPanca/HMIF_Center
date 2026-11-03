import { notFound, redirect } from 'next/navigation';

import { GuideApp } from '@/components/guide/GuideApp';
import { konteksSaatIni } from '@/lib/auth/guard';
import { dokumenUntuk, muatGuide } from '@/lib/guide/sumber';

export const dynamic = 'force-dynamic';

/** Satu panduan Guide (ADR-060), mis. `/guide/anggota`. Semua panduan boleh dibaca semua peran. */
export default async function GuideDokumenPage({ params }: { params: Promise<{ dok: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) redirect('/login');
  const { dok } = await params;
  const dokumen = await muatGuide();
  if (!dokumen.some((d) => d.id === dok)) notFound();
  return <GuideApp dokumen={dokumen} aktifId={dok} untukAnda={dokumenUntuk(konteks.roles)} />;
}
