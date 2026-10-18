'use client';

import { AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function readRedirect(payload: unknown): string | null {
  const root = asObject(payload);
  const data = asObject(root?.data);
  return root?.ok === true && typeof data?.redirect === 'string' ? data.redirect : null;
}

function readErrorMessage(payload: unknown): string | null {
  const root = asObject(payload);
  const error = asObject(root?.error);
  return root?.ok === false && typeof error?.message === 'string' ? error.message : null;
}

function LoginPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const setFormRef = useCallback((node: HTMLFormElement | null) => {
    if (node) node.setAttribute('data-testid', 'login-form');
  }, []);

  function clearError() {
    if (errorMessage) setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: String(formData.get('email') ?? ''),
          password: String(formData.get('password') ?? ''),
          next: new URLSearchParams(window.location.search).get('next'),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const redirect = readRedirect(payload);

      if (response.ok && redirect) {
        window.location.assign(redirect);
        return;
      }

      setErrorMessage(
        readErrorMessage(payload) ?? 'Login belum dapat diproses. Silakan coba lagi.',
      );
    } catch {
      setErrorMessage('Tidak dapat terhubung ke layanan login. Periksa koneksi lalu coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh bg-app text-primary lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <section
        data-testid="login-hero"
        className="relative flex min-h-[17rem] items-end overflow-hidden px-6 py-8 text-white sm:min-h-[20rem] sm:px-10 sm:py-10 lg:min-h-dvh lg:items-center lg:px-14 xl:px-20"
        style={{ background: 'var(--gradient-primary)' }}
      >
        <div className="relative z-10 max-w-xl">
          {/*
            Logo beranimasi (permintaan pemilik 2026-10-17). Video WebM tanpa latar
            (transparan). Poster = logo statis:
            tampil seketika selagi video dimuat dan bila video gagal. Pengguna
            dengan "kurangi gerakan" hanya melihat logo statis.
          */}
          <video
            src="/logo-hmif-animasi.webm"
            poster="/logo-hmif.png"
            autoPlay
            muted
            loop
            playsInline
            aria-label="Logo HMIF Fakultas Teknik UNTIRTA"
            data-testid="login-logo-animasi"
            className="size-[68px] object-contain motion-reduce:hidden sm:size-[84px]"
          />
          <Image
            src="/logo-hmif.png"
            alt="Logo HMIF Fakultas Teknik UNTIRTA"
            width={84}
            height={84}
            priority
            className="hidden h-auto w-[68px] motion-reduce:block sm:w-[84px]"
          />
          <p className="mt-6 text-[11px] leading-4 font-semibold tracking-[0.16em] uppercase">
            Sistem E-Administrasi
          </p>
          <h1 className="mt-2 text-[clamp(2rem,5vw,3.5rem)] leading-[1.04] font-bold tracking-[-0.035em]">
            HMIF Center
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-6 sm:text-[17px] sm:leading-7">
            Satu ruang kerja untuk program, persuratan, dan administrasi Himpunan Mahasiswa
            Informatika FT UNTIRTA.
          </p>
          <div className="mt-6 flex items-center gap-2 text-[13px] leading-[18px] font-medium">
            <ShieldCheck aria-hidden="true" className="size-[18px] shrink-0" />
            <span>Akses aman sesuai peran dan periode kepengurusan.</span>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[26rem]">
          <div>
            <p className="text-[11px] leading-4 font-semibold tracking-[0.14em] text-secondary uppercase">
              Area pengurus
            </p>
            <h2 className="mt-2 text-[28px] leading-9 font-semibold tracking-[-0.02em]">
              Masuk ke akun Anda
            </h2>
            <p className="mt-2 text-[14px] leading-5 text-secondary">
              Gunakan akun kepengurusan yang dikelola oleh Admin.
            </p>
          </div>

          <form
            ref={setFormRef}
            action="/api/auth/login"
            method="post"
            className="mt-8 space-y-5"
            aria-busy={isSubmitting}
            onSubmit={handleSubmit}
          >
            <div className="space-y-1.5">
              <Label htmlFor="login-email" required>
                Email
              </Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                data-testid="login-email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                maxLength={254}
                placeholder="nama@hmif.or.id"
                required
                disabled={isSubmitting}
                aria-describedby={errorMessage ? 'login-error-message' : undefined}
                onChange={clearError}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password" required>
                Password
              </Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                data-testid="login-password"
                autoComplete="current-password"
                placeholder="Masukkan password"
                minLength={8}
                required
                disabled={isSubmitting}
                aria-describedby={errorMessage ? 'login-error-message' : undefined}
                onChange={clearError}
              />
            </div>

            {errorMessage ? (
              <div
                id="login-error-message"
                data-testid="login-error"
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] leading-[18px] text-primary"
              >
                <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0 text-danger" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            <Button
              type="submit"
              data-testid="login-submit"
              className="w-full"
              loading={isSubmitting}
            >
              Masuk
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>

          <p className="mt-6 text-center text-[12px] leading-4 text-secondary">
            Akses bermasalah? Hubungi Admin HMIF.
          </p>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
