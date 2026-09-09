/**
 * Menyiapkan fixture proker terkunci untuk gate E2E wizard (T-068).
 *
 * Dijalankan oleh pemegang kunci penuh, setelah `npm run seed:e2e-auth`:
 *
 *     npm run seed:e2e-proker
 *
 * ===========================================================================
 * KENAPA FIXTURE INI PERLU
 * ===========================================================================
 * Gate `e2e/wizard-proker-1-3.spec.ts` menguji "Selesai bila 1": peringatan
 * konflik harus muncul SEBELUM pengguna dapat lanjut. Untuk itu harus ada
 * minimal satu proker TERJADWAL yang MENGUNCI kalender pada rentang yang
 * ditabrak wizard uji. Tanpa data terkunci, test itu SKIP (gagal palsu), dan
 * target "0 skipped" tidak tercapai.
 *
 * Kunci kalender HANYA lahir lewat `setujui_proker()` (migrasi 004: proker_lock
 * "tidak pernah lewat INSERT langsung"). Maka seed ini menempuh jalur nyata:
 * menaruh satu proker MENUNGGU_APPROVAL lalu menyetujuinya, sehingga
 * EXCLUDE constraint dan proker_lock terisi persis seperti di produksi.
 *
 * Rentang terkunci = [mulai persiapan, hari-H terakhir + 1) (INV-11). Fixture
 * memakai persiapan 2026-11-06 … hari-H 2026-12-07 supaya beririsan dengan
 * tanggal yang diisi test konflik (lihat kepala gate).
 *
 * Idempoten: proker fixture dihapus dulu berdasarkan nama penanda (cascade ke
 * proker_lock lewat ON DELETE CASCADE), lalu dibuat & disetujui ulang. Perlu
 * diulang setelah `npm run db:reset`.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-068 · docs/ai/WIZARD_PROKER_CONTRACT.md §3
 *         · migrasi 004 (proker_lock) · 014a (setujui_proker) · INV-09, INV-11
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

import { AKUN } from '../e2e/fixtures/akun';

const AKAR = path.resolve(import.meta.dirname, '..');
const NL = '\n';
const tulis = (s: string): void => {
  process.stdout.write(s + NL);
};

/** Penanda nama supaya fixture dapat dihapus-ulang tanpa menyentuh proker lain. */
const NAMA_FIXTURE = '[FIXTURE E2E] Proker Terkunci Wizard';

/**
 * Rentang yang harus beririsan dengan tanggal test konflik di gate.
 * Persiapan → hari-H mulai = 30 hari (memenuhi CHECK durasi_persiapan_15_45).
 */
const PERSIAPAN = '2026-11-06';
const HARIH_MULAI = '2026-12-06';
const HARIH_SELESAI = '2026-12-07';

function bacaEnv(): Record<string, string> {
  const berkas = path.join(AKAR, '.env.local');
  if (!fs.existsSync(berkas)) return {};
  const hasil: Record<string, string> = {};
  for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    hasil[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return hasil;
}

async function main(): Promise<void> {
  const env = { ...bacaEnv(), ...process.env };

  if (env.NODE_ENV === 'production') {
    process.stderr.write(
      NL + '  Menolak berjalan dengan NODE_ENV=production.' +
        NL + '  Skrip ini menaruh data uji ke database.' + NL + NL,
    );
    process.exit(1);
  }

  const koneksi = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!koneksi) {
    process.stderr.write(
      NL + '  Butuh DIRECT_URL atau DATABASE_URL.' +
        NL + '  Skrip ini hanya dapat dijalankan pemegang kunci penuh.' + NL + NL,
    );
    process.exit(1);
  }

  tulis('');
  tulis('  seed:e2e-proker — fixture proker terkunci untuk gate wizard');
  tulis('');

  const sql = postgres(koneksi, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });

  try {
    const aktif = await sql<{ id: string; nama: string }[]>`
      SELECT id, nama FROM periode WHERE status = 'AKTIF' LIMIT 1
    `;
    if (!aktif[0]) {
      throw new Error('Tidak ada periode AKTIF. Jalankan `npm run seed:e2e-auth` lebih dulu.');
    }
    const periodeId = aktif[0].id;
    tulis(`    [ada]    periode aktif "${aktif[0].nama}"`);

    const dept = await sql<{ id: string; nama: string }[]>`
      SELECT id, nama FROM departemen ORDER BY urutan LIMIT 1
    `;
    if (!dept[0]) {
      throw new Error('Tidak ada departemen. Jalankan `npm run db:reset` lebih dulu.');
    }
    const deptId = dept[0].id;
    const deptNama = dept[0].nama;

    const admin = await sql<{ id: string }[]>`
      SELECT id FROM app_user WHERE email = ${AKUN.admin.email} LIMIT 1
    `;
    if (!admin[0]) {
      throw new Error(
        `Akun admin ${AKUN.admin.email} belum ada. Jalankan \`npm run seed:e2e-auth\` lebih dulu.`,
      );
    }
    const adminId = admin[0].id;

    // Semua langkah dalam SATU transaksi: set_config(..., true) bersifat
    // transaction-local (sama seperti withAuditContext), dan hapus→buat→setujui
    // menjadi atomik.
    const hasil = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.user_agent', 'seed:e2e-proker', true)`;
      await tx`SELECT set_config('app.periode_id', ${periodeId}, true)`;

      // Idempoten: buang fixture lama (cascade menghapus proker_lock-nya).
      const dibuang = await tx<{ id: string }[]>`
        DELETE FROM proker
        WHERE periode_id = ${periodeId}::uuid AND nama = ${NAMA_FIXTURE}
        RETURNING id
      `;

      const dibuat = await tx<{ id: string }[]>`
        INSERT INTO proker (
          periode_id, departemen_id, nama, kategori, status,
          deskripsi,
          tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
          dibuat_oleh, diajukan_at
        ) VALUES (
          ${periodeId}::uuid, ${deptId}::uuid, ${NAMA_FIXTURE},
          'TERJADWAL', 'MENUNGGU_APPROVAL',
          'Fixture gate wizard: mengunci rentang agar cek konflik punya tabrakan.',
          ${PERSIAPAN}::date, ${HARIH_MULAI}::date, ${HARIH_SELESAI}::date,
          ${adminId}::uuid, now()
        )
        RETURNING id
      `;
      const prokerId = dibuat[0]!.id;

      const r = await tx<{ setujui_proker: { ok: boolean; locked?: boolean; reason?: string } }[]>`
        SELECT setujui_proker(${prokerId}::uuid, ${adminId}::uuid)
      `;
      return { prokerId, dibuang: dibuang.length, r: r[0]!.setujui_proker };
    });

    if (!hasil.r.ok) {
      throw new Error(
        `setujui_proker menolak fixture (reason=${hasil.r.reason ?? '?'}). ` +
          'Ada kunci lain yang beririsan pada periode ini — bersihkan lalu ulangi.',
      );
    }
    if (!hasil.r.locked) {
      throw new Error('Fixture disetujui tetapi TIDAK mengunci kalender — periksa kategori/tanggal.');
    }

    // Bukti nyata: satu baris proker_lock beririsan dengan rentang uji.
    const lock = await sql<{ rentang: string }[]>`
      SELECT rentang::text AS rentang
      FROM proker_lock
      WHERE proker_id = ${hasil.prokerId}::uuid
    `;

    tulis(
      `    [${hasil.dibuang ? 'ulang' : 'buat '}]   ${NAMA_FIXTURE}  di dept "${deptNama}"`,
    );
    tulis(`    [lock]   proker_lock.rentang = ${lock[0]?.rentang ?? '(?)'}`);
    tulis('');
    tulis('  [ OK ] Siap. Jalankan: npm run test:e2e -- wizard-proker-1-3');
    tulis('');
  } finally {
    await sql.end();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(
    NL + `  seed:e2e-proker gagal: ${e instanceof Error ? e.message : String(e)}` + NL + NL,
  );
  process.exit(1);
});
