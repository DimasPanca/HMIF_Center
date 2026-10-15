/**
 * Kunci lintas-worker untuk gate yang mengubah tanda tangan Ketua uji.
 *
 * Tanda tangan Ketua adalah keadaan GLOBAL di DB dev: `surat-approval`
 * menghapusnya untuk menguji "generate gagal", `surat-massal` membutuhkannya
 * ada. Playwright menjalankan berkas spec paralel di worker berbeda
 * (`fullyParallel`, 2 worker), jadi tanpa kunci keduanya saling merusak hasil.
 *
 * Advisory lock SESI Postgres pada satu koneksi khusus (`max: 1`, koneksi
 * langsung — transaction pooler tidak mempertahankan lock sesi) dipegang
 * sepanjang berkas: dari `beforeAll` sampai `afterAll`. Worker lain menunggu.
 */
import postgres from 'postgres';

const KUNCI = 'e2e:tanda-tangan-ketua';

export interface KunciTtd {
  lepas(): Promise<void>;
}

export async function kunciTtdKetua(url: string): Promise<KunciTtd> {
  const sql = postgres(url, { ssl: 'require', max: 1, idle_timeout: 0, onnotice: () => {} });
  await sql`SELECT pg_advisory_lock(hashtext(${KUNCI}))`;
  return {
    async lepas() {
      await sql`SELECT pg_advisory_unlock(hashtext(${KUNCI}))`.catch(() => undefined);
      await sql.end();
    },
  };
}
