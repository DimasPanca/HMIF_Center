import { notFound, redirect } from 'next/navigation';

import { SuratForm } from '@/components/surat/SuratForm';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { detailDraft } from '@/lib/surat/draft';
import { DAFTAR_JENIS, type JenisSurat } from '@/lib/surat/field-schemas';
import { bacaKetuaHimpunan, bacaKonfigSurat, bacaPresetTujuan } from '@/lib/surat/konfig';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ id?: string; jenis?: string }>;
}

/**
 * Buat surat (T-058). `?id=` melanjutkan draft milik pengguna; `?jenis=`
 * memilih jenis awal untuk draft baru.
 *
 * Konfigurasi dibaca di sini lalu diteruskan ke form, supaya klien dan route
 * server membangun skema dari nilai yang sama (K-04, ADR-026).
 */
export default async function SuratBaruPage({ searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'surat.create')) notFound();

  const { id, jenis } = await searchParams;
  const [konfig, preset, ketua] = await Promise.all([
    bacaKonfigSurat(),
    bacaPresetTujuan(),
    bacaKetuaHimpunan(konteks.periodeId),
  ]);

  let awal = null;
  if (id) {
    const draft = /^[0-9a-f-]{36}$/i.test(id) ? await detailDraft(konteks, id, konfig) : null;
    // Draft orang lain, periode lain, atau sudah diajukan: bukan halaman ini.
    if (!draft || draft.status !== 'DRAFT') notFound();
    awal = { id: draft.id, nilai: draft.nilai };
  }

  const jenisAwal = DAFTAR_JENIS.includes(jenis as JenisSurat) ? (jenis as JenisSurat) : undefined;

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">{awal ? 'Lanjutkan draft surat' : 'Buat surat'}</h1>
          <p className="mt-1 text-[13px] text-secondary">
            Nomor surat ditetapkan saat surat disetujui. Draft tersimpan otomatis.
          </p>
        </header>
        <SuratForm konfig={konfig} preset={preset} awal={awal} jenisAwal={jenisAwal} ketua={ketua} />
      </div>
    </main>
  );
}
