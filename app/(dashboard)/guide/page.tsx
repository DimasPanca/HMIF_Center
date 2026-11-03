import { redirect } from 'next/navigation';

import { GuideApp } from '@/components/guide/GuideApp';
import { konteksSaatIni } from '@/lib/auth/guard';
import { dokumenUntuk, muatGuide } from '@/lib/guide/sumber';

export const dynamic = 'force-dynamic';

/** Guide (ADR-060): dibuka di Panduan Umum; pencarian mencakup seluruh panduan. */
export default async function GuidePage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) redirect('/login');
  return <GuideApp dokumen={await muatGuide()} aktifId="umum" untukAnda={dokumenUntuk(konteks.roles)} />;
}
