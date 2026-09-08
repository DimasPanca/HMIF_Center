import { ArrowLeft, CheckCircle2, FileImage, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { POST as unggahTandaTangan } from '@/app/api/users/me/signature/route';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { konteksSaatIni } from '@/lib/auth/guard';
import type { RoleCode } from '@/lib/auth/permissions';
import { DETIK_SIGNED_URL, keys, storage } from '@/lib/storage';

const ROLE_PENGUNGGAH = new Set<RoleCode>(['KETUA', 'WAKIL', 'SEKUM']);

const LABEL_ROLE: Record<RoleCode, string> = {
  ADMIN: 'Admin',
  KETUA: 'Ketua',
  WAKIL: 'Wakil',
  SEKUM: 'Sekum',
  BENDUM: 'Bendum',
  KADEPT: 'Kepala Departemen',
  ANGGOTA: 'Anggota',
  BPH: 'BPH',
};

const PESAN_GAGAL: Record<string, string> = {
  TIDAK_TERAUTENTIKASI: 'Sesi tidak ditemukan atau sudah berakhir.',
  AKUN_NONAKTIF: 'Akun Anda dinonaktifkan. Hubungi Admin.',
  TIDAK_ADA_PERIODE: 'Belum ada periode kepengurusan yang aktif.',
  TIDAK_BERWENANG: 'Hanya Ketua, Wakil, atau Sekum yang dapat mengunggah tanda tangan.',
  FILE_TIDAK_VALID: 'Berkas harus berupa PNG yang sah dengan ukuran maksimum 2 MB.',
  UNGGAH_GAGAL: 'Tanda tangan belum dapat disimpan. Silakan coba kembali.',
};

interface ProfilPageProps {
  searchParams: Promise<{ unggah?: string; kode?: string }>;
}

async function simpanTandaTangan(formData: FormData) {
  'use server';

  const headerSaatIni = await headers();
  const headerAudit = new Headers();
  for (const nama of ['user-agent', 'x-forwarded-for', 'x-real-ip']) {
    const nilai = headerSaatIni.get(nama);
    if (nilai) headerAudit.set(nama, nilai);
  }

  let tujuan = '/profil?unggah=gagal&kode=UNGGAH_GAGAL';
  try {
    const response = await unggahTandaTangan(
      new Request('http://hmif.internal/api/users/me/signature', {
        method: 'POST',
        headers: headerAudit,
        body: formData,
      }),
    );

    if (response.ok) {
      tujuan = '/profil?unggah=sukses';
    } else {
      const body = (await response.json()) as { error?: { code?: unknown } };
      const kode = typeof body.error?.code === 'string' ? body.error.code : 'UNGGAH_GAGAL';
      tujuan = `/profil?unggah=gagal&kode=${encodeURIComponent(kode)}`;
    }
  } catch {
    // Pesan generik sudah dipasang pada tujuan awal dan tidak membocorkan detail server.
  }

  redirect(tujuan);
}

export default async function ProfilPage({ searchParams }: ProfilPageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) redirect('/login?next=/profil');

  const { unggah, kode } = await searchParams;
  const bolehUnggah = konteks.roles.some((role) => ROLE_PENGUNGGAH.has(role));
  const key = keys.ttd(konteks.sesi.userId);
  const hasSignature = await storage.exists(key);
  const signatureUrl = hasSignature ? await storage.getSignedUrl(key, DETIK_SIGNED_URL) : null;
  const pesanGagal = kode ? (PESAN_GAGAL[kode] ?? PESAN_GAGAL.UNGGAH_GAGAL) : null;

  return (
    <main data-testid="profil-page" className="min-h-dvh bg-app text-primary">
      <header className="border-b border-default bg-panel">
        <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="text-[14px] leading-5 font-semibold">HMIF Center</p>
            <p className="text-[11px] leading-4 text-tertiary">Profil saya</p>
          </div>
          <Link
            href="/"
            className="inline-flex h-[34px] items-center gap-1.5 rounded-sm border border-transparent px-[14px] text-[14px] leading-5 font-medium text-secondary outline-none transition-[background-color,color,box-shadow] duration-fast hover:bg-subtle hover:text-primary focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] motion-reduce:transition-none"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Beranda
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="max-w-2xl">
          <p className="text-[11px] leading-4 font-semibold tracking-wide text-tertiary uppercase">
            Akun dan identitas
          </p>
          <h1 className="mt-2 text-2xl leading-8 font-semibold">Profil & tanda tangan</h1>
          <p className="mt-2 text-[14px] leading-5 text-secondary">
            Kelola tanda tangan yang digunakan server saat membuat dokumen resmi HMIF.
          </p>
        </div>

        {unggah === 'sukses' ? (
          <div
            role="status"
            data-testid="signature-success"
            className="mt-6 flex items-start gap-2 rounded-sm border border-[var(--success)] bg-[var(--success-subtle)] p-3 text-[13px] leading-[18px]"
          >
            <CheckCircle2 aria-hidden="true" className="mt-px size-4 shrink-0 text-success" />
            Tanda tangan berhasil disimpan.
          </div>
        ) : null}

        {unggah === 'gagal' ? (
          <div
            role="alert"
            data-testid="signature-error"
            className="mt-6 rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] leading-[18px]"
          >
            {pesanGagal}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Informasi akun</CardTitle>
              <CardDescription>Identitas dari akun yang sedang digunakan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-4 text-[13px] leading-[18px]">
                <div>
                  <dt className="font-medium text-secondary">Nama lengkap</dt>
                  <dd className="mt-1 font-medium">{konteks.sesi.namaLengkap}</dd>
                </div>
                <div>
                  <dt className="font-medium text-secondary">Email</dt>
                  <dd className="mt-1 break-all">{konteks.sesi.email}</dd>
                </div>
                <div>
                  <dt className="font-medium text-secondary">Peran aktif</dt>
                  <dd className="mt-2 flex flex-wrap gap-1.5">
                    {konteks.roles.length > 0 ? (
                      konteks.roles.map((role) => <Badge key={role}>{LABEL_ROLE[role]}</Badge>)
                    ) : (
                      <span className="text-secondary">Belum memiliki peran</span>
                    )}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Tanda tangan digital</CardTitle>
                  <CardDescription className="mt-1">
                    Tersimpan privat dan hanya dipakai oleh proses server.
                  </CardDescription>
                </div>
                <Badge tone={hasSignature ? 'success' : 'neutral'} data-testid="signature-status">
                  {hasSignature ? 'Sudah tersedia' : 'Belum tersedia'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex min-h-44 items-center justify-center rounded-sm border border-dashed border-strong bg-subtle p-5">
                {signatureUrl ? (
                  // Signed URL hanya dirender untuk pemilik akun dan berumur lima menit.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatureUrl}
                    alt={`Tanda tangan ${konteks.sesi.namaLengkap}`}
                    data-testid="signature-preview"
                    className="max-h-32 max-w-full object-contain"
                  />
                ) : (
                  <div className="max-w-sm text-center">
                    <FileImage aria-hidden="true" className="mx-auto size-10 text-tertiary" />
                    <p className="mt-3 text-[14px] leading-5 font-medium">Belum ada tanda tangan</p>
                    <p className="mt-1 text-[12px] leading-4 text-secondary">
                      Unggah PNG transparan agar tanda tangan dapat dipasang pada dokumen resmi.
                    </p>
                  </div>
                )}
              </div>

              {bolehUnggah ? (
                <form
                  action={simpanTandaTangan}
                  data-testid="signature-form"
                  className="mt-5 space-y-3"
                >
                  <div>
                    <Label htmlFor="signature-file" required>
                      Berkas tanda tangan
                    </Label>
                    <Input
                      id="signature-file"
                      name="file"
                      type="file"
                      accept="image/png,.png"
                      required
                      data-testid="signature-input"
                      aria-describedby="signature-help"
                      className="mt-1 p-0 file:mr-3 file:h-full file:border-0 file:border-r file:border-[var(--border-default)] file:bg-[var(--bg-subtle)] file:px-3 file:text-[13px] file:font-medium file:text-[var(--text-primary)]"
                    />
                    <p id="signature-help" className="mt-1 text-[12px] leading-4 text-secondary">
                      PNG transparan, maksimum 2 MB. Berkas lama akan diganti.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-4">
                    <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-secondary">
                      <ShieldCheck aria-hidden="true" className="size-4 text-success" />
                      Disimpan di bucket privat
                    </span>
                    <Button type="submit" data-testid="signature-submit">
                      <Upload aria-hidden="true" />
                      {hasSignature ? 'Ganti tanda tangan' : 'Unggah tanda tangan'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-5 rounded-sm border border-default bg-muted p-3 text-[13px] leading-[18px] text-secondary">
                  Unggah tanda tangan hanya tersedia untuk Ketua, Wakil, dan Sekum.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
