import { Lock, Clock3, CheckCircle2, FileQuestion } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { IsiForm } from '@/components/form/IsiForm';
import { buttonVariants } from '@/components/ui/button';
import { konteksSaatIni } from '@/lib/auth/guard';
import { formUntukIsi } from '@/lib/form/respons';

export const dynamic = 'force-dynamic';

// Token ada di URL: jangan bocor lewat Referer, jangan diindeks mesin pencari.
export const metadata: Metadata = {
  title: 'Formulir — HMIF Center',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

function Pesan({ ikon, judul, isi, aksi }: { ikon: React.ReactNode; judul: string; isi: string; aksi?: React.ReactNode }) {
  return (
    <div role="status" className="rounded-md border border-default bg-panel p-6 text-center" data-testid="form-pesan">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-subtle text-secondary">{ikon}</div>
      <h1 className="mt-3 text-[20px] leading-7 font-semibold text-primary">{judul}</h1>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-secondary">{isi}</p>
      {aksi}
    </div>
  );
}

export default async function HalamanIsiForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await formUntukIsi(token, await konteksSaatIni());

  let isi: React.ReactNode;
  if (!form) {
    isi = <Pesan ikon={<FileQuestion className="size-5" />} judul="Form tidak ditemukan" isi="Tautan ini salah atau form sudah dihapus. Minta tautan terbaru ke panitia." />;
  } else if (form.tertutup) {
    isi = <Pesan ikon={<Clock3 className="size-5" />} judul={form.judul} isi={form.tertutup} />;
  } else if (form.perlu_login) {
    isi = (
      <Pesan
        ikon={<Lock className="size-5" />}
        judul={form.judul}
        isi="Form ini khusus pengguna HMIF Center. Masuk dulu dengan akun Anda, lalu Anda akan kembali ke halaman ini."
        aksi={
          <Link href={`/login?next=${encodeURIComponent(`/f/${token}`)}`} className={buttonVariants({ className: 'mt-5' })}>
            Masuk untuk mengisi
          </Link>
        }
      />
    );
  } else if (form.sudah_mengisi) {
    isi = <Pesan ikon={<CheckCircle2 className="size-5" />} judul={form.judul} isi="Anda sudah mengisi form ini. Setiap akun hanya dapat mengirim satu jawaban." />;
  } else {
    isi = <IsiForm form={form} />;
  }

  return (
    <main className="min-h-dvh bg-subtle px-4 py-6 text-primary sm:py-10">
      <div className="mx-auto w-full max-w-[42rem]">
        <div className="mb-4 flex items-center gap-2.5 px-1">
          <Image src="/logo-hmif.png" alt="" width={28} height={28} />
          <span className="text-[12px] leading-4 font-semibold tracking-[0.14em] text-secondary uppercase">HMIF Center · Formulir</span>
        </div>
        {isi}
        <p className="mt-6 px-1 text-center text-[12px] leading-4 text-tertiary">
          Jangan pernah mengirim password lewat formulir. Data dikelola HMIF FT UNTIRTA.
        </p>
      </div>
    </main>
  );
}
