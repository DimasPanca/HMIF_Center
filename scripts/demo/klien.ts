/**
 * Klien HTTP bersesi untuk seeder demo.
 *
 * Seeder menjalankan alur aplikasi lewat API sungguhan sebagai pengguna demo
 * (login → cookie → panggilan), sehingga approval, penomoran surat, pembuatan
 * DOCX, verifikasi nota, dsb. berjalan lewat kode produksi yang sama dengan UI
 * dan meninggalkan jejak audit atas nama pengguna itu.
 */

import { request, type APIRequestContext } from '@playwright/test';

import { PASSWORD_DEMO } from './konfig';

export interface Respons {
  status: number;
  ok: boolean;
  /** Badan JSON mentah (`{ok,data}` / `{ok:false,error}`), atau `null`. */
  badan: { ok?: boolean; data?: any; error?: { code?: string; message?: string; details?: unknown } } | null;
  /** `badan.data` — pintasan. */
  data: any;
}

export class GagalApi extends Error {
  constructor(
    readonly konteks: string,
    readonly respons: Respons,
  ) {
    const e = respons.badan?.error;
    super(`${konteks} → HTTP ${respons.status} ${e?.code ?? ''} ${e?.message ?? ''} ${e?.details ? JSON.stringify(e.details).slice(0, 400) : ''}`.trim());
  }
}

let urutIp = 1;

export class Sesi {
  private constructor(
    readonly kunci: string,
    readonly ctx: APIRequestContext,
  ) {}

  static async masuk(baseUrl: string, kunci: string, email: string): Promise<Sesi> {
    // IP sintetis per sesi: batas percobaan login dihitung per email + IP.
    const ip = `10.77.${Math.floor(Date.now() / 1000) % 250}.${urutIp++ % 250}`;
    const ctx = await request.newContext({ baseURL: baseUrl, extraHTTPHeaders: { 'x-forwarded-for': ip }, timeout: 120_000 });
    const s = new Sesi(kunci, ctx);
    const r = await s.panggil('POST', '/api/auth/login', { email, password: PASSWORD_DEMO });
    if (!r.ok) throw new GagalApi(`login ${email}`, r);
    return s;
  }

  async panggil(metode: string, jalur: string, data?: unknown): Promise<Respons> {
    const res = await this.ctx.fetch(jalur, {
      method: metode,
      ...(data !== undefined ? { data: data as object } : {}),
    });
    const teks = await res.text();
    let badan: Respons['badan'] = null;
    try {
      badan = JSON.parse(teks);
    } catch {
      badan = null;
    }
    return { status: res.status(), ok: res.ok(), badan, data: badan?.data };
  }

  get = (jalur: string) => this.panggil('GET', jalur);
  post = (jalur: string, data?: unknown) => this.panggil('POST', jalur, data ?? {});
  put = (jalur: string, data?: unknown) => this.panggil('PUT', jalur, data ?? {});
  patch = (jalur: string, data?: unknown) => this.panggil('PATCH', jalur, data ?? {});
  hapus = (jalur: string) => this.panggil('DELETE', jalur);

  /** Seperti `panggil`, tetapi melempar `GagalApi` bila gagal. */
  async wajib(metode: string, jalur: string, data?: unknown, konteks?: string): Promise<Respons> {
    const r = await this.panggil(metode, jalur, data ?? (metode === 'GET' ? undefined : {}));
    if (!r.ok) throw new GagalApi(konteks ?? `${this.kunci}: ${metode} ${jalur}`, r);
    return r;
  }

  async unggah(jalur: string, multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>): Promise<Respons> {
    const res = await this.ctx.post(jalur, { multipart });
    const teks = await res.text();
    let badan: Respons['badan'] = null;
    try {
      badan = JSON.parse(teks);
    } catch {
      badan = null;
    }
    return { status: res.status(), ok: res.ok(), badan, data: badan?.data };
  }

  async unduh(jalur: string): Promise<{ status: number; ukuran: number; jenis: string }> {
    const res = await this.ctx.get(jalur);
    const buf = await res.body();
    return { status: res.status(), ukuran: buf.length, jenis: res.headers()['content-type'] ?? '' };
  }

  tutup(): Promise<void> {
    return this.ctx.dispose();
  }
}
