/**
 * Klien Supabase browser untuk Realtime, dimuat MALAS.
 *
 * `@supabase/ssr` + `supabase-js` (auth, realtime, postgrest, storage) ±61 KB
 * gzip. Diimpor statis dari Master Gantt dan pemantau kendala, keduanya masuk
 * bundle awal beranda dan membuatnya 256 KB — anggaran SYSTEM_DESIGN §19.1
 * 180 KB (T-114). Realtime baru dibutuhkan SETELAH chart tampil, jadi klien
 * dimuat lewat `import()` dan beranda tidak menunggunya.
 *
 * `createBrowserClient` sudah singleton di browser: kedua pemanggil berbagi
 * satu klien dan satu soket.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export function muatKlienRealtime(url: string, key: string): Promise<SupabaseClient> {
  return import('@supabase/ssr').then(({ createBrowserClient }) => createBrowserClient(url, key));
}
