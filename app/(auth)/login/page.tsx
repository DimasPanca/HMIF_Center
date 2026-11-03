'use client';

import { AlertCircle, ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';

import { LogoLogin, PanelLogin } from '@/components/auth/PanelLogin';

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
    'h-12 w-full rounded-xl border border-[#D4E2F2] bg-white/90 pr-3 pl-10 text-[15px] text-[#0A0F1F] outline-none placeholder:text-[#64748B] transition-[border-color,box-shadow] duration-200 hover:border-[#B5CDE6] focus:border-[#0066A9]/60 focus:shadow-[0_0_0_4px_rgba(30,144,255,0.14),0_8px_28px_rgba(0,102,169,0.12)] disabled:opacity-60 motion-reduce:transition-none';

  return (
    // ADR-064 (revisi): kartu foto Kabinet Vardhana di kiri, form di kanan, di atas gradien putih ke biru
    // HMIF yang lembut (permintaan pemilik). Halaman ini selalu terang.
    <main
      className="grid min-h-dvh text-[#0A0F1F] [color-scheme:light] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
      style={{
        background:
          'radial-gradient(60% 55% at 85% 100%, rgba(30,144,255,0.22) 0%, rgba(30,144,255,0) 100%), radial-gradient(55% 50% at 0% 0%, rgba(0,180,216,0.14) 0%, rgba(0,180,216,0) 100%), linear-gradient(160deg, #FFFFFF 0%, #F3F8FF 45%, #E2EFFD 100%)',
      }}
    >
      <PanelLogin />

      <section className="flex items-center justify-center px-5 pt-6 pb-14 sm:px-8 lg:px-14 lg:py-12">
        <div className="w-full max-w-[23rem]">
          <LogoLogin />
          <p className="mt-8 text-[13px] font-medium text-[#0066A9]">Masuk ke HMIF Center</p>
          <h1 className="mt-1 text-[32px] leading-10 font-semibold tracking-[-0.025em] text-[#0A0F1F]">Selamat datang kembali!</h1>
          <p className="mt-2 text-[15px] leading-6 text-[#475569]">Masukkan email dan kata sandi akun kepengurusan Anda.</p>

          <form
            ref={setFormRef}
            action="/api/auth/login"
            method="post"
            className="mt-9 space-y-5"
            aria-busy={isSubmitting}
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-[13px] font-medium text-[#334155]">
                Email
              </label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#64748B]" />
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
              <label htmlFor="login-password" className="text-[13px] font-medium text-[#334155]">
                Kata sandi
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#64748B]" />
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
              <p className="text-[13px] text-[#475569]">
                Lupa kata sandi? <span className="font-medium text-[#0066A9]">Hubungi Admin HMIF.</span>
              </p>
            </div>

            {errorMessage ? (
              <div
                id="login-error-message"
                data-testid="login-error"
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-[14px] leading-5 text-[#991B1B]"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#DC2626]" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            <Button
              type="submit"
              data-testid="login-submit"
              loading={isSubmitting}
              // Efek kaca (permintaan pemilik): kilap setengah atas menebal dan kilau putih menyapu tombol saat
              // disorot/difokus; saat ditekan tombol sedikit masuk. Lapisan kilap di bawah teks (`-z-10` + `isolate`).
              className="relative isolate h-12 w-full overflow-hidden rounded-xl border border-white/30 bg-[#0A6FC2] bg-[linear-gradient(180deg,#2E8FE6_0%,#0A6FC2_52%,#075DA6_100%)] text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_24px_-10px_rgba(0,102,169,0.6)] transition-[box-shadow,transform,border-color] duration-300 ease-out before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-1/2 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.3),rgba(255,255,255,0.05))] before:opacity-50 before:transition-opacity before:duration-300 after:pointer-events-none after:absolute after:inset-y-0 after:-left-1/2 after:-z-10 after:w-1/3 after:translate-x-[-120%] after:-skew-x-[20deg] after:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)] after:transition-transform after:duration-[900ms] after:ease-in-out hover:border-white/55 hover:bg-[#0A6FC2] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_0_0_1px_rgba(255,255,255,0.14),0_14px_34px_-10px_rgba(30,144,255,0.8)] hover:before:opacity-100 hover:after:translate-x-[520%] focus-visible:ring-[#1E90FF] focus-visible:before:opacity-100 focus-visible:after:translate-x-[520%] active:scale-[0.985] active:bg-[#0A6FC2] active:shadow-[inset_0_2px_10px_rgba(3,6,15,0.28),0_6px_16px_-8px_rgba(30,144,255,0.6)] motion-reduce:transition-none motion-reduce:after:hidden motion-reduce:active:scale-100"
            >
              Masuk
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>

          <p className="mt-10 text-[12px] leading-5 text-[#475569]">
            Akun dibuat oleh Admin HMIF. HMIF Center dibangun oleh Kabinet Vardhana 2026–2027.
          </p>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
