'use client';

import { AlertCircle, ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';

import { PanelLogin } from '@/components/auth/PanelLogin';

import { Button } from '@/components/ui/button';

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

  const kolom =
    'h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-3 pl-10 text-[15px] text-white outline-none placeholder:text-[#64748B] transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/20 focus:border-[#1E90FF]/70 focus:bg-[#0B1A3A]/60 focus:shadow-[0_0_0_1px_rgba(30,144,255,0.45),0_0_32px_rgba(30,144,255,0.45)] disabled:opacity-60 motion-reduce:transition-none';

  return (
    // ADR-064 (revisi): gaya referensi pemilik dalam palet HMIF — navy gelap dengan pendar biru dari
    // bawah, panel pemandangan di kiri, form bercahaya di kanan. Halaman ini selalu gelap.
    <main
      className="grid min-h-dvh text-white lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]"
      style={{ background: 'radial-gradient(120% 75% at 72% 115%, #0066A9 0%, #0B2A66 38%, #060B1A 72%, #03050C 100%)' }}
    >
      <PanelLogin />

      <section className="flex items-center justify-center px-5 pt-6 pb-14 sm:px-8 lg:px-14 lg:py-12">
        <div className="w-full max-w-[23rem]">
          <p className="text-[13px] font-medium text-[#94A3B8]">Masuk ke HMIF Center</p>
          <h2 className="mt-1 text-[32px] leading-10 font-semibold tracking-[-0.025em] text-white">Selamat datang kembali!</h2>
          <p className="mt-2 text-[15px] leading-6 text-[#94A3B8]">Masukkan email dan kata sandi akun kepengurusan Anda.</p>

          <form
            ref={setFormRef}
            action="/api/auth/login"
            method="post"
            className="mt-9 space-y-5"
            aria-busy={isSubmitting}
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-[13px] font-medium text-[#94A3B8]">
                Email
              </label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#7C8BA6]" />
                <input
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
                  className={kolom}
                  onChange={clearError}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-[13px] font-medium text-[#94A3B8]">
                Kata sandi
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#7C8BA6]" />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  data-testid="login-password"
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi…"
                  minLength={8}
                  required
                  disabled={isSubmitting}
                  aria-describedby={errorMessage ? 'login-error-message' : undefined}
                  className={kolom}
                  onChange={clearError}
                />
              </div>
              <p className="text-[13px] text-[#94A3B8]">
                Lupa kata sandi? <span className="text-[#7CC4FF]">Hubungi Admin HMIF.</span>
              </p>
            </div>

            {errorMessage ? (
              <div
                id="login-error-message"
                data-testid="login-error"
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-xl border border-[#F87171]/40 bg-[#F87171]/10 p-3 text-[14px] leading-5 text-[#FECACA]"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#F87171]" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            <Button
              type="submit"
              data-testid="login-submit"
              loading={isSubmitting}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#070B16] bg-[linear-gradient(180deg,#161D31_0%,#05070D_100%)] text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-white/25 hover:bg-[#0B1222] focus-visible:ring-[#1E90FF]"
            >
              Masuk
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>

          <p className="mt-10 text-[12px] leading-5 text-[#64748B]">
            Akun dibuat oleh Admin HMIF. HMIF Center dibangun oleh Kabinet Vardhana 2026–2027.
          </p>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
