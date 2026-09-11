/**
 * Menyiapkan akun uji untuk gate E2E login.
 *
 * Dijalankan SEKALI oleh pemegang kunci penuh:
 *
 *     npm run seed:e2e-auth
 *
 * Setelah itu akunnya menetap di proyek Supabase pengembangan, dan siapa pun
 * yang hanya memegang NEXT_PUBLIC_* dapat menjalankan `npm run test:e2e --
 * login`. Alasannya di `e2e/fixtures/akun.ts`.
 *
 * Idempoten: dijalankan berkali-kali menghasilkan keadaan yang sama.
 * Perlu diulang setelah `npm run db:reset`, karena reset menghapus schema
 * `public` — baris `app_user` dan `periode` ikut hilang, sementara akun
 * Supabase Auth yang hidup di schema `auth` tetap ada. Login dengan akun
 * yang punya kredensial tetapi tanpa baris `app_user` akan ditolak sebagai
 * kredensial salah, dan gejalanya terbaca seperti bug autentikasi.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-045 · PRD F-1.1
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

import { AKUN, NAMA_PERIODE_UJI, PASSWORD_UJI, type AkunUji } from '../e2e/fixtures/akun';

const AKAR = path.resolve(import.meta.dirname, '..');
const NL = '\n';
const tulis = (s: string): void => {
  process.stdout.write(s + NL);
};

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

interface PenggunaAuth {
  id: string;
  email: string;
}

async function main(): Promise<void> {
  const env = { ...bacaEnv(), ...process.env };

  // Akun uji berpassword tetap tidak boleh pernah lahir di produksi.
  if (env.NODE_ENV === 'production') {
    process.stderr.write(
      NL + '  Menolak berjalan dengan NODE_ENV=production.' +
        NL + '  Skrip ini membuat akun berpassword yang diketahui umum.' + NL + NL,
    );
    process.exit(1);
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY;
  const koneksi = env.DIRECT_URL ?? env.DATABASE_URL;

  if (!url || !secret || !koneksi) {
    process.stderr.write(
      NL + '  Butuh NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, dan DIRECT_URL.' +
        NL + '  Skrip ini memang hanya dapat dijalankan pemegang kunci penuh.' + NL + NL,
    );
    process.exit(1);
  }

  const kepala = {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  };

  async function daftarPengguna(): Promise<Map<string, string>> {
    const r = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: kepala });
    if (!r.ok) throw new Error(`Gagal membaca daftar pengguna: ${r.status} ${await r.text()}`);
    const j = (await r.json()) as { users?: PenggunaAuth[] };
    return new Map((j.users ?? []).map((u) => [u.email.toLowerCase(), u.id]));
  }

  /** Membuat akun bila belum ada; menyetel ulang passwordnya bila sudah. */
  async function pastikanAkun(a: AkunUji, sudahAda: Map<string, string>): Promise<string> {
    const ada = sudahAda.get(a.email.toLowerCase());

    if (ada) {
      // Password disetel ulang supaya keadaannya pasti, apa pun yang terjadi
      // pada akun itu sebelumnya.
      const r = await fetch(`${url}/auth/v1/admin/users/${ada}`, {
        method: 'PUT',
        headers: kepala,
        body: JSON.stringify({ password: PASSWORD_UJI, email_confirm: true }),
      });
      if (!r.ok) throw new Error(`Gagal memperbarui ${a.email}: ${r.status} ${await r.text()}`);
      return ada;
    }

    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: kepala,
      body: JSON.stringify({
        email: a.email,
        password: PASSWORD_UJI,
        // Tanpa ini, Supabase menuntut konfirmasi lewat surat yang tidak akan
        // pernah sampai — domain .test tidak dapat diresolusi.
        email_confirm: true,
      }),
    });
    if (!r.ok) throw new Error(`Gagal membuat ${a.email}: ${r.status} ${await r.text()}`);
    const j = (await r.json()) as PenggunaAuth;
    return j.id;
  }

  tulis('');
  tulis('  seed:e2e-auth — akun uji untuk gate login');
  tulis('');

  const sudahAda = await daftarPengguna();
  const sql = postgres(koneksi, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });

  try {
    // --- periode aktif ----------------------------------------------------
    // Tanpa ini, login akun yang benar pun ditolak TIDAK_ADA_PERIODE dan
    // seluruh skenario jalur bahagia gagal karena sebab yang tidak diuji.
    const aktif = await sql<{ id: string; nama: string }[]>`
      SELECT id, nama FROM periode WHERE status = 'AKTIF' LIMIT 1
    `;

    let periodeId: string;
    if (aktif[0]) {
      periodeId = aktif[0].id;
      tulis(`    [ada]    periode aktif "${aktif[0].nama}" dipakai apa adanya`);
    } else {
      const baru = await sql<{ id: string }[]>`
        INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
        VALUES (${NAMA_PERIODE_UJI}, '2026-09-01', '2027-08-31', 'PERSIAPAN')
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      const id =
        baru[0]?.id ??
        (await sql<{ id: string }[]>`SELECT id FROM periode WHERE nama = ${NAMA_PERIODE_UJI}`)[0]!
          .id;
      await sql`SELECT aktifkan_periode(${id}::uuid)`;
      periodeId = id;
      tulis(`    [buat]   periode "${NAMA_PERIODE_UJI}" dibuat dan diaktifkan`);
    }

    const dept = await sql<{ id: string }[]>`SELECT id FROM departemen ORDER BY urutan LIMIT 1`;
    if (!dept[0]) {
      throw new Error('Tidak ada departemen. Jalankan `npm run db:reset` lebih dulu.');
    }

    // --- akun --------------------------------------------------------------
    for (const [kunci, a] of Object.entries(AKUN)) {
      const userId = await pastikanAkun(a, sudahAda);
      const baru = !sudahAda.has(a.email.toLowerCase());

      if (a.role === null) {
        // Sengaja TIDAK dibuatkan baris app_user — itulah yang diuji.
        await sql`DELETE FROM user_role WHERE user_id = ${userId}::uuid`;
        await sql`DELETE FROM app_user  WHERE id      = ${userId}::uuid`;
        tulis(`    [${baru ? 'buat' : 'ada '}]   ${a.email.padEnd(28)} auth saja, tanpa app_user`);
        continue;
      }

      await sql`
        INSERT INTO app_user (id, nama_lengkap, nim, email, is_active)
        VALUES (${userId}::uuid, ${a.namaLengkap}, ${a.nim}, ${a.email}, ${a.aktif})
        ON CONFLICT (id) DO UPDATE
          SET nama_lengkap = EXCLUDED.nama_lengkap,
              is_active    = EXCLUDED.is_active
      `;

      // ANGGOTA dan KADEPT melekat pada satu departemen (CONSTRAINT
      // `role_dept_wajib`, migrasi 003); role lintas-organisasi tidak boleh
      // punya departemen. Tanpa cabang KADEPT ini, INSERT-nya melanggar CHECK.
      const berdepartemen = a.role === 'ANGGOTA' || a.role === 'KADEPT';
      await sql`
        INSERT INTO user_role (user_id, periode_id, role, departemen_id)
        VALUES (${userId}::uuid, ${periodeId}::uuid, ${a.role}::role_code,
                ${berdepartemen ? dept[0].id : null}::uuid)
        ON CONFLICT DO NOTHING
      `;

      tulis(
        `    [${baru ? 'buat' : 'ada '}]   ${a.email.padEnd(28)}` +
          `${a.role.padEnd(9)}${a.aktif ? 'aktif' : 'NONAKTIF'}  (${kunci})`,
      );
    }

    tulis('');
    tulis(`    password seluruh akun: ${PASSWORD_UJI}`);
    tulis('');
    tulis('  [ OK ] Siap. Jalankan: npm run test:e2e -- login');
    tulis('');
  } finally {
    await sql.end();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(
    NL + `  seed:e2e-auth gagal: ${e instanceof Error ? e.message : String(e)}` + NL + NL,
  );
  process.exit(1);
});
