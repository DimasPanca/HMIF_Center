import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { KendalaDetail } from '@/components/kendala/KendalaDetail';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { boleh, detailKendala, orangRelevan } from '@/lib/kendala/service';

export const dynamic = 'force-dynamic';

export default async function DetailKendalaPage({ params }: { params: Promise<{ id: string }> }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId || !can(konteks.roles, 'kendala.read')) {
    return <main className="p-6 text-[13px] text-danger">Anda tidak berwenang membuka kendala.</main>;
  }
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const k = await detailKendala(konteks, id);
  if (!k) notFound();

  const arsip = k.periode_id !== konteks.periodeId;
  const dept = k.departemen_id;
  const bolehBalas = !arsip && boleh(konteks, 'kendala.create', dept);
  const bolehUbah = !arsip && boleh(konteks, 'kendala.update', dept);
  const orang = bolehBalas || bolehUbah ? await orangRelevan(konteks, dept) : [];

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <p className="text-xs text-secondary">
        <Link href="/departemen/kendala" className="hover:underline">
          Kendala
        </Link>
        {k.kode_departemen ? (
          <>
            {' / '}
            <Link href={`/departemen/${encodeURIComponent(k.kode_departemen)}/kendala`} className="hover:underline">
              {k.nama_departemen}
            </Link>
          </>
        ) : null}
      </p>
      <KendalaDetail
        k={k}
        orang={orang}
        saya={konteks.sesi.userId}
        bolehUbah={bolehUbah}
        bolehBalas={bolehBalas}
        bolehHapus={!arsip && boleh(konteks, 'kendala.delete', dept)}
        bolehLampir={bolehBalas}
        arsip={arsip}
      />
    </main>
  );
}
