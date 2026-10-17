import { afterEach, describe, expect, it, vi } from 'vitest';

import { BATAS, cekBatas, ipDari, originSah, respons429 } from '@/lib/security/rate-limit';

const H = (o: Record<string, string>) => new Headers(o);

describe('security: verifikasi Origin (CSRF)', () => {
  it('GET/HEAD/OPTIONS selalu lolos', () => {
    expect(originSah('GET', H({ origin: 'https://penyerang.test' }), 'hmif.test')).toBe(true);
    expect(originSah('OPTIONS', H({ origin: 'https://penyerang.test' }), 'hmif.test')).toBe(true);
  });

  it('mutasi dari origin sendiri lolos, dari situs lain ditolak', () => {
    expect(originSah('POST', H({ origin: 'https://hmif.test' }), 'hmif.test')).toBe(true);
    expect(originSah('DELETE', H({ origin: 'https://penyerang.test' }), 'hmif.test')).toBe(false);
    expect(originSah('PATCH', H({ origin: 'https://hmif.test.penyerang.test' }), 'hmif.test')).toBe(
      false,
    );
    expect(originSah('POST', H({ origin: 'bukan url' }), 'hmif.test')).toBe(false);
  });

  it('Origin "null" (iframe sandbox, file://) ditolak; tanpa Origin (bukan browser) lolos', () => {
    expect(originSah('POST', H({ origin: 'null' }), 'hmif.test')).toBe(false);
    expect(originSah('POST', H({}), 'hmif.test')).toBe(true);
  });

  it('host di balik proxy dicocokkan dengan x-forwarded-host', () => {
    expect(
      originSah(
        'POST',
        H({
          origin: 'https://hmif-center.vercel.app',
          'x-forwarded-host': 'hmif-center.vercel.app',
        }),
        'localhost:3000',
      ),
    ).toBe(true);
  });
});

describe('security: rate limit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('batas sesuai SYSTEM_DESIGN §18.3', () => {
    expect(BATAS.login).toEqual({ batas: 5, jendelaDetik: 900 });
    expect(BATAS.uploadGambar).toEqual({ batas: 30, jendelaDetik: 3600 });
    expect(BATAS.approveSurat).toEqual({ batas: 100, jendelaDetik: 3600 });
    expect(BATAS.backupManualPerHari.batas).toBe(3);
    expect(BATAS.umum).toEqual({ batas: 300, jendelaDetik: 60 });
  });

  it('IP diambil dari entri pertama x-forwarded-for', () => {
    expect(ipDari(H({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(ipDari(H({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(ipDari(H({}))).toBe('tanpa-ip');
  });

  it('memanggil rate_limit_cek lewat PostgREST dengan kunci service, dan meneruskan hasilnya', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_uji');
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, jumlah: 101, batas: 100, sisa_detik: 42 })),
    );
    vi.stubGlobal('fetch', f);
    const h = await cekBatas('approve-surat:u1', 100, 3600);
    expect(h).toEqual({ ok: false, jumlah: 101, batas: 100, sisaDetik: 42 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/rate_limit_cek');
    expect((init.headers as Record<string, string>).apikey).toBe('sb_secret_uji');
    expect(JSON.parse(init.body as string)).toEqual({
      p_kunci: 'approve-surat:u1',
      p_batas: 100,
      p_jendela_detik: 3600,
    });
  });

  it('penghitung tak terjangkau → fail-open (dibuka), bukan memblokir aplikasi', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'k');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('ECONNRESET'))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await cekBatas('umum:1.2.3.4', 300, 60)).toMatchObject({ ok: true, dibuka: true });
  });

  it('respons 429 berbentuk K-02 dengan Retry-After', async () => {
    const r = respons429({ ok: false, jumlah: 301, batas: 300, sisaDetik: 17 }, 'Terlalu banyak.');
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('17');
    expect(await r.json()).toEqual({
      ok: false,
      error: { code: 'TERLALU_BANYAK_PERMINTAAN', message: 'Terlalu banyak.' },
    });
  });
});
