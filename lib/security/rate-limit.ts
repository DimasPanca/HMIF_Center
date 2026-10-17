/**
 * rate-limit — satu tabel batas (SYSTEM_DESIGN §18.3) + penghitung bersama.
 *
 * AMAN DI EDGE: tidak mengimpor lib/db. Penghitung `rate_limit_cek` (migrasi
 * 050) dipanggil lewat PostgREST dengan kunci service role, sehingga
 * middleware (edge) dan route handler (node) memakai SATU implementasi.
 *
 *   Endpoint                Batas               Ditegakkan di
 *   /api/auth/login         5 / 15 mnt email+IP lib/auth/rate-limit.ts (audit_log, T-045)
 *   /api/images/upload      30 / jam per user   route upload (baris `image`, T-098)
 *   /api/surat/approve      100 / jam per user  `cekBatas` di route approve & batch (T-113)
 *   /api/backup             3 / hari (WIB)      lib/backup/service.ts mulaiBackup (T-111)
 *   umum                    300 / mnt per IP    middleware.ts `cekBatas` (T-113)
 *
 * Gagal menghubungi penghitung = DIBUKA (fail-open) dan dicatat ke log:
 * pembatas yang tidak terjangkau tidak boleh mematikan seluruh aplikasi.
 * Batas umum hanya aktif di produksi — server dev tidak menghadap internet,
 * dan gate e2e paralel dari localhost melampaui 300/menit dengan wajar
 * (SECURITY_AUDIT.md, mitigasi M-03).
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-113 kontrak 2 · SYSTEM_DESIGN §18.3
 */

export const BATAS = {
  login: { batas: 5, jendelaDetik: 15 * 60 },
  uploadGambar: { batas: 30, jendelaDetik: 60 * 60 },
  approveSurat: { batas: 100, jendelaDetik: 60 * 60 },
  backupManualPerHari: { batas: 3, jendelaDetik: 24 * 60 * 60 },
  umum: { batas: 300, jendelaDetik: 60 },
} as const;

export interface HasilBatas {
  ok: boolean;
  jumlah: number;
  batas: number;
  sisaDetik: number;
  /** true bila penghitung tidak terjangkau dan permintaan dibiarkan lewat. */
  dibuka?: boolean;
}

/** IP klien dari header proxy Vercel; kosong → 'tanpa-ip'. */
export function ipDari(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || headers.get('x-real-ip')?.trim() || 'tanpa-ip';
}

/**
 * Menaikkan penghitung `kunci` pada jendela berjalan dan melaporkan apakah
 * masih di bawah `batas`. Satu permintaan HTTP ke PostgREST.
 */
export async function cekBatas(
  kunci: string,
  batas: number,
  jendelaDetik: number,
): Promise<HasilBatas> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rahasia = process.env.SUPABASE_SECRET_KEY;
  const buka: HasilBatas = { ok: true, jumlah: 0, batas, sisaDetik: 0, dibuka: true };
  if (!url || !rahasia) return buka;
  try {
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/rate_limit_cek`, {
      method: 'POST',
      headers: { apikey: rahasia, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_kunci: kunci.slice(0, 200),
        p_batas: batas,
        p_jendela_detik: jendelaDetik,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = (await r.json()) as {
      ok: boolean;
      jumlah: number;
      batas: number;
      sisa_detik: number;
    };
    return { ok: d.ok, jumlah: d.jumlah, batas: d.batas, sisaDetik: d.sisa_detik };
  } catch (e) {
    console.warn(
      `[rate-limit] penghitung tidak terjangkau (${kunci.split(':')[0]}): ${e instanceof Error ? e.message : String(e)}`,
    );
    return buka;
  }
}

/** Badan & header 429 berbentuk K-02 — dipakai middleware dan route. */
export function respons429(h: HasilBatas, pesan: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code: 'TERLALU_BANYAK_PERMINTAAN', message: pesan } }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Retry-After': String(Math.max(1, h.sisaDetik)),
      },
    },
  );
}

/**
 * Origin permintaan yang mengubah data harus sama dengan host aplikasi
 * (CSRF, SYSTEM_DESIGN §18.1). Browser selalu mengirim `Origin` untuk POST
 * lintas situs; permintaan tanpa Origin (skrip server, cron) tidak berasal
 * dari halaman lain sehingga dibiarkan — sesinya tetap diperiksa.
 */
export function originSah(method: string, headers: Headers, hostSendiri: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true;
  const origin = headers.get('origin');
  if (!origin || origin === 'null') return origin !== 'null';
  try {
    const host = new URL(origin).host;
    const diteruskan = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    return host === hostSendiri || (!!diteruskan && host === diteruskan);
  } catch {
    return false;
  }
}
