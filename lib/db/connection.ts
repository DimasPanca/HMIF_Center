/**
 * Koneksi database — server-only.
 *
 * Dua connection string dengan peran berbeda, dan menukarnya menimbulkan
 * kegagalan yang sulit dilacak:
 *
 *   DATABASE_URL   transaction pooler, port 6543  -> runtime aplikasi
 *   DIRECT_URL     session pooler,     port 5432  -> migrasi, introspeksi, skrip admin
 *
 * Kenapa dibedakan: fungsi serverless membuka banyak koneksi pendek, dan
 * transaction pooler memang dirancang untuk itu. Sebaliknya migrasi butuh satu
 * sesi yang stabil — `CREATE EXTENSION`, advisory lock, dan `SET` tingkat sesi
 * tidak berperilaku benar di balik transaction pooler.
 *
 * Sumber: SYSTEM_DESIGN §20.1 · docs/ai/ENV_SETUP.md §1.2 · docs/ai/tasks/P1-fondasi.md T-019
 */

import postgres from 'postgres';

// Modul ini menyentuh kredensial database. Ia tidak boleh pernah ikut ke bundle
// browser. Penjaga ini melengkapi `npm run check:secrets`, yang memeriksa
// berkas "use client" secara statis — di sini penjagaannya saat runtime.
if (typeof window !== 'undefined') {
  throw new Error(
    'lib/db/connection.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.',
  );
}

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) {
    throw new Error(`Environment variable ${nama} belum diisi. Jalankan: npm run check:env`);
  }
  return nilai;
}

/**
 * Klien runtime lewat transaction pooler.
 *
 * `prepare: false` WAJIB dan bukan preferensi: transaction pooler memberi
 * koneksi backend yang berbeda-beda antar-perintah, sehingga prepared statement
 * yang dibuat di satu koneksi tidak ditemukan di koneksi berikutnya. Gejalanya
 * error "prepared statement does not exist" yang muncul acak di bawah beban —
 * jenis kegagalan yang tidak pernah terlihat saat pengembangan.
 */
function buatKlienRuntime() {
  return postgres(wajib('DATABASE_URL'), {
    ssl: 'require',
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
}

type KlienSql = ReturnType<typeof buatKlienRuntime>;

// Singleton. Tanpa ini, hot reload Next.js membuat pool baru setiap kali berkas
// berubah sampai kuota koneksi Supabase habis.
const global_ = globalThis as unknown as { __hmifSql?: KlienSql };
let lokal: KlienSql | undefined;

function klien(): KlienSql {
  if (global_.__hmifSql) return global_.__hmifSql;
  lokal ??= buatKlienRuntime();
  if (process.env.NODE_ENV !== 'production') global_.__hmifSql = lokal;
  return lokal;
}

/**
 * MALAS, bukan langsung. Koneksi baru dibuat saat `sql` pertama kali dipakai.
 *
 * Versi pertama berbunyi `export const sql = global_.__hmifSql ?? buatKlienRuntime()`,
 * dan itu memanggil `wajib('DATABASE_URL')` saat modulnya DIIMPOR. Akibatnya
 * setiap berkas yang mengimpor apa pun dari sini — termasuk yang hanya butuh
 * `klienLangsung` atau sekadar tipe — meledak di lingkungan yang env-nya belum
 * lengkap, dan `next build` gagal dengan pesan yang menunjuk ke dalam
 * node_modules.
 *
 * Ini kejadian KEEMPAT dari pola yang sama; tiga sebelumnya `lib/storage/index.ts`,
 * `lib/storage/supabase-adapter.ts`, dan `lib/db/client.ts`. Tiga yang pertama
 * ketahuan karena worktree lane ui sengaja tidak memegang kredensial penuh —
 * detektor yang hilang sejak kedua lane memegangnya. Yang ini ketahuan oleh
 * `npm run check:lazy-env`, yang dibuat justru untuk menggantikan detektor itu.
 *
 * Kegagalannya tetap keras dan tetap menyebut nama variabelnya — hanya terjadi
 * pada saat yang benar, yaitu saat database sungguh-sungguh dipakai.
 *
 * Proxy membungkus FUNGSI, bukan objek: `sql` dipakai sebagai tagged template
 * (`` sql`SELECT 1` ``) sekaligus sebagai objek (`sql.end()`), jadi jebakan
 * `apply` dan `get` dua-duanya diperlukan.
 */
export const sql: KlienSql = new Proxy(function () {} as unknown as KlienSql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (klien() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop: string | symbol) {
    const k = klien();
    const nilai = Reflect.get(k as object, prop) as unknown;
    return typeof nilai === 'function' ? nilai.bind(k) : nilai;
  },
});

/**
 * Klien sesi langsung untuk migrasi dan skrip administratif.
 *
 * Sengaja BUKAN singleton: pemanggil membukanya, memakainya, lalu menutupnya
 * sendiri. Membiarkan koneksi sesi menganggur menahan slot yang jumlahnya
 * terbatas di tier gratis.
 *
 *   const db = klienLangsung();
 *   try { await db`...` } finally { await db.end() }
 */
export function klienLangsung() {
  return postgres(wajib('DIRECT_URL'), {
    ssl: 'require',
    max: 1,
    idle_timeout: 10,
    connect_timeout: 30,
    onnotice: () => {},
  });
}

/** Informasi server untuk pemeriksaan kesehatan. */
export async function infoServer(): Promise<{ versi: string; major: number; database: string }> {
  const rows = (await sql`
    SELECT current_setting('server_version') AS versi, current_database() AS database
  `) as unknown as { versi: string; database: string }[];

  const versi = rows[0]?.versi ?? '0';
  return { versi, major: parseInt(versi, 10), database: rows[0]?.database ?? '' };
}
