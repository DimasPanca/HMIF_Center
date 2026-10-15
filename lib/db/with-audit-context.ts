/**
 * Konteks audit — mengisi app.ip, app.user_agent, dan app.periode_id sebelum
 * mutasi berjalan, supaya trigger `fn_audit()` mencatat siapa dan dari mana.
 *
 * ===========================================================================
 * SATU KOREKSI TERHADAP SYSTEM_DESIGN §14.2
 * ===========================================================================
 * Contoh di dokumen berbentuk:
 *
 *     return await db.$transaction(async tx => {
 *       await tx.$executeRaw`SELECT set_config('app.ip', ${ip}, true)`;
 *       ...
 *       return await fn();          // <- fn TIDAK menerima tx
 *     });
 *
 * Bentuk itu tidak bekerja, dan gagalnya diam-diam.
 *
 * `set_config(..., true)` bersifat TRANSACTION-LOCAL: nilainya hanya berlaku
 * pada koneksi yang menjalankan transaksi itu. Karena `fn()` dipanggil tanpa
 * `tx`, seluruh kueri di dalamnya memakai klien global — koneksi LAIN dari
 * pool — yang tidak pernah melihat setelan tadi.
 *
 * Akibatnya baris audit tetap terbentuk, tetapi `ip_address`, `user_agent`,
 * dan `periode_id`-nya NULL. Tidak ada error, tidak ada peringatan; jejak
 * audit hanya kehilangan justru bagian yang membuatnya berguna sebagai bukti.
 *
 * Karena itu `fn` di sini WAJIB menerima `tx` dan memakainya. Tipenya
 * memaksakan hal itu — pemanggil tidak bisa lupa.
 *
 * Sumber: SYSTEM_DESIGN §14.2 · PRD M15 · INV-07 · K-09
 */

import type { Prisma } from '@prisma/client';
import { db } from './client';

if (typeof window !== 'undefined') {
  throw new Error('lib/db/with-audit-context.ts adalah modul server-only.');
}

/** Klien transaksi Prisma — sama seperti `db`, tanpa perintah tingkat koneksi. */
export type TxKlien = Prisma.TransactionClient;

interface Konteks {
  ip: string;
  userAgent: string;
  periodeId: string | null;
  userId: string | null;
}

/**
 * Siapa yang melakukan mutasi — cukup bentuk `{ sesi: { userId } }` supaya
 * `guard.konteks` dapat diteruskan apa adanya. `null` HANYA untuk jalur yang
 * memang tanpa sesi (aktivasi undangan publik).
 */
export type Pelaku = { sesi: { userId: string } } | null;

/**
 * IP peminta dari header proxy.
 *
 * `x-forwarded-for` dapat berisi rantai "klien, proxy1, proxy2"; yang pertama
 * adalah klien aslinya. Vercel juga mengirim `x-real-ip`.
 *
 * Nilai yang tidak diketahui dikembalikan sebagai STRING KOSONG, bukan
 * '0.0.0.0'. Alamat palsu yang terlihat sah lebih buruk daripada ketiadaan
 * data: saat menelusuri insiden, '0.0.0.0' menyamarkan "tidak tahu" menjadi
 * "berasal dari sana". Migrasi 014c mengubah string kosong menjadi NULL.
 */
function ambilIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const pertama = fwd.split(',')[0]?.trim();
    if (pertama) return pertama;
  }
  return req.headers.get('x-real-ip')?.trim() ?? '';
}

/** Periode AKTIF, atau null bila belum ada. */
export async function idPeriodeAktif(tx: TxKlien): Promise<string | null> {
  const baris = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1
  `;
  return baris[0]?.id ?? null;
}

async function pasangKonteks(tx: TxKlien, k: Konteks): Promise<void> {
  // Ketiganya transaction-local (argumen ketiga `true`), sehingga otomatis
  // hilang saat transaksi berakhir dan tidak pernah bocor ke request lain
  // yang kebetulan memakai koneksi pool yang sama.
  await tx.$executeRaw`SELECT set_config('app.ip', ${k.ip}, true)`;
  await tx.$executeRaw`SELECT set_config('app.user_agent', ${k.userAgent}, true)`;
  await tx.$executeRaw`SELECT set_config('app.periode_id', ${k.periodeId ?? ''}, true)`;
  // Dibaca konteks_user_id() (migrasi 028): koneksi aplikasi tidak membawa JWT,
  // jadi tanpa ini audit_log.user_id selalu NULL (INV-07).
  await tx.$executeRaw`SELECT set_config('app.user_id', ${k.userId ?? ''}, true)`;
}

/**
 * Menjalankan mutasi dengan konteks audit dari sebuah request.
 *
 *     await withAuditContext(req, guard.konteks, async (tx) => {
 *       await tx.proker.update({ where: { id }, data: { nama } });
 *     });
 *
 * `pelaku` WAJIB dan tidak opsional: parameter opsional adalah cara bug lama
 * terulang — setiap route yang lupa mengisinya menulis audit tanpa pelaku.
 *
 * `tx` WAJIB dipakai untuk seluruh kueri di dalamnya. Memakai `db` global di
 * sana berarti kueri berjalan di koneksi lain tanpa konteks audit — dan
 * jejaknya kehilangan IP serta user agent tanpa satu pun error.
 */
export async function withAuditContext<T>(
  req: Request,
  pelaku: Pelaku,
  fn: (tx: TxKlien) => Promise<T>,
  /**
   * Batas waktu transaksi (ms). Bawaan Prisma 5 detik cukup untuk satu
   * mutasi; operasi massal (T-064: 30 surat diajukan atau disetujui dalam
   * satu transaksi) melampauinya ke DB jarak jauh dan diputus di tengah.
   */
  opsi?: { timeout?: number },
): Promise<T> {
  const ip = ambilIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';
  const userId = pelaku?.sesi.userId ?? null;

  return db.$transaction(
    async (tx) => {
      const periodeId = await idPeriodeAktif(tx);
      await pasangKonteks(tx, { ip, userAgent, periodeId, userId });
      return fn(tx);
    },
    opsi?.timeout ? { timeout: opsi.timeout, maxWait: 10_000 } : undefined,
  );
}

/**
 * Versi untuk cron dan skrip administratif, yang tidak punya request.
 *
 * `user_agent` diisi 'sistem' supaya baris audit dari pekerjaan otomatis dapat
 * dibedakan dari tindakan pengguna saat penelusuran. `ip` dibiarkan kosong —
 * cron memang tidak datang dari alamat mana pun, dan mengarang '0.0.0.0'
 * hanya menyamarkan ketiadaan itu.
 *
 * `user_id` pada baris audit akan NULL karena tidak ada pelaku. Itu bukan
 * kegagalan melainkan keterangan bahwa pelakunya sistem — lihat
 * `konteks_user_id()` di migrasi 014c.
 */
export async function withServiceContext<T>(fn: (tx: TxKlien) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    const periodeId = await idPeriodeAktif(tx);
    await pasangKonteks(tx, { ip: '', userAgent: 'sistem', periodeId, userId: null });
    return fn(tx);
  });
}
