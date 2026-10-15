import { notFound, redirect } from 'next/navigation';

import { SuratForm } from '@/components/surat/SuratForm';
import { muatAcara } from '@/lib/acara/service';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { STATUS_DAPAT_DISUNTING, detailDraft } from '@/lib/surat/draft';
import { DAFTAR_JENIS, type JenisSurat } from '@/lib/surat/field-schemas';
import { bacaKetuaHimpunan, bacaKonfigSurat, bacaPresetTujuan } from '@/lib/surat/konfig';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ id?: string; jenis?: string; acara?: string }>;
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

  const { id, jenis, acara } = await searchParams;
  const [konfig, preset, ketua] = await Promise.all([
    bacaKonfigSurat(),
    bacaPresetTujuan(),
    bacaKetuaHimpunan(konteks.periodeId),
  ]);

  let awal = null;
  let alasanPenolakan: string | null = null;
  if (id) {
    const draft = /^[0-9a-f-]{36}$/i.test(id) ? await detailDraft(konteks, id, konfig) : null;
    // Draft orang lain, periode lain, atau sudah diajukan: bukan halaman ini.
    // Surat DITOLAK boleh dibuka pembuatnya untuk diperbaiki (USER_FLOW §11.2).
    if (!draft || !STATUS_DAPAT_DISUNTING.includes(draft.status)) notFound();
    awal = { id: draft.id, nilai: draft.nilai };
    alasanPenolakan = draft.status === 'DITOLAK' ? draft.alasan_penolakan : null;
  }

  const jenisAwal = DAFTAR_JENIS.includes(jenis as JenisSurat) ? (jenis as JenisSurat) : undefined;

  // "Buat Surat untuk acara ini" (T-084): kode kegiatan & nama acara dari kepanitiaan,
  // dibaca di server dengan aturan baca yang sama dengan ruang kerja acara.
  const sumberAcara = !awal && acara && /^[0-9a-f-]{36}$/i.test(acara) ? await muatAcara(konteks, acara) : null;
  const isianAwal = sumberAcara
    ? {
        kode_kegiatan: sumberAcara.kode_kegiatan ?? undefined,
        data_dinamis: { nama_kegiatan: sumberAcara.nama_acara, ...(sumberAcara.tema ? { tema_kegiatan: sumberAcara.tema } : {}) },
      }
    : undefined;

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">{awal ? 'Lanjutkan draft surat' : 'Buat surat'}</h1>
          <p className="mt-1 text-[13px] text-secondary">
            Nomor surat ditetapkan saat surat disetujui. Draft tersimpan otomatis.
          </p>
        </header>
        <SuratForm
          konfig={konfig}
          preset={preset}
          awal={awal}
          jenisAwal={jenisAwal}
          ketua={ketua}
          alasanPenolakan={alasanPenolakan}
          isianAwal={isianAwal}
        />
      </div>
    </main>
  );
}
