/**
 * rls-coverage — memeriksa cakupan Row Level Security.
 *
 * Tiga hal yang diperiksa, masing-masing menutup satu cara RLS gagal diam-diam:
 *
 *   1. TABEL TANPA RLS AKTIF.
 *      Tabel yang terlewat adalah tabel yang terbuka penuh bagi siapa pun
 *      yang memegang kredensial `authenticated`.
 *
 *   2. TABEL BER-RLS TAPI TANPA POLICY SAMA SEKALI.
 *      Ini menutup total, bukan membuka. Aman, tetapi hampir selalu berarti
 *      seseorang lupa — dan gejalanya di aplikasi adalah "data hilang".
 *
 *   3. BPH PADA POLICY TULIS (INV-03).
 *      BPH adalah peran pengawas: baca di mana-mana, tulis di mana pun tidak.
 *      Satu penyebutan 'BPH' pada policy INSERT/UPDATE/DELETE membatalkan itu.
 *
 * Juga memeriksa hak tabel: policy tidak pernah dievaluasi bila role
 * `authenticated` tidak punya GRANT apa pun.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-038 · PRD §5.1 · INV-01, INV-03
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const AKAR = path.resolve(import.meta.dirname, '..');

/** Tabel infrastruktur, bukan tabel domain. */
const BUKAN_DOMAIN = new Set(['_migrasi']);

/** Operasi yang dihitung sebagai "tulis". */
const TULIS = new Set(['INSERT', 'UPDATE', 'DELETE', 'ALL']);

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

interface BarisTabel {
  tabel: string;
  rls: boolean;
  policy: number;
}

interface BarisPolicy {
  tabel: string;
  nama: string;
  perintah: string;
  ekspresi: string;
}

async function utama(): Promise<void> {
  const env = { ...bacaEnv(), ...process.env };
  const koneksi = env.DIRECT_URL ?? env.DATABASE_URL;

  if (!koneksi) {
    process.stderr.write('\n  DIRECT_URL/DATABASE_URL belum diisi. Jalankan: npm run check:env\n\n');
    process.exit(1);
  }

  const sql = postgres(koneksi, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  let keluar = 0;

  try {
    const tabel = (await sql<BarisTabel[]>`
      SELECT c.relname                                        AS tabel,
             c.relrowsecurity                                 AS rls,
             (SELECT count(*)::INT FROM pg_policy p WHERE p.polrelid = c.oid) AS policy
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `).filter((t) => !BUKAN_DOMAIN.has(t.tabel));

    const policy = await sql<BarisPolicy[]>`
      SELECT c.relname AS tabel,
             p.polname AS nama,
             CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                           ELSE 'ALL' END AS perintah,
             COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
               || ' ' || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') AS ekspresi
      FROM pg_policy p
      JOIN pg_class c     ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY c.relname, p.polname
    `;

    const hakAuth = await sql<{ n: number }[]>`
      SELECT count(*)::INT AS n
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'authenticated'
    `;

    const tanpaRls    = tabel.filter((t) => !t.rls);
    const tanpaPolicy = tabel.filter((t) => t.rls && t.policy === 0);
    const bphTulis    = policy.filter(
      (p) => TULIS.has(p.perintah) && /'BPH'/i.test(p.ekspresi),
    );
    const tulisTerbuka = policy.filter(
      (p) => TULIS.has(p.perintah) && /^\s*true\s*$/.test(p.ekspresi.trim()),
    );

    const lebar = Math.max(...tabel.map((t) => t.tabel.length), 10);

    process.stdout.write(`\n  rls-coverage — ${tabel.length} tabel domain\n\n`);

    for (const t of tabel) {
      const tanda = !t.rls ? '[TIDAK]' : t.policy === 0 ? '[KOSONG]' : '[ OK ]';
      const ket   = !t.rls
        ? 'RLS tidak aktif'
        : t.policy === 0
          ? 'RLS aktif tanpa policy — tertutup total'
          : `${t.policy} policy`;
      process.stdout.write(`    ${tanda.padEnd(9)}${t.tabel.padEnd(lebar + 2)}${ket}\n`);
    }

    process.stdout.write('\n');

    if (hakAuth[0]!.n === 0) {
      process.stdout.write(
        '  [GAGAL] Role `authenticated` tidak punya GRANT apa pun di schema public.\n' +
        '          RLS baru diperiksa SETELAH hak tabel biasa lolos, jadi seluruh\n' +
        '          policy di atas tidak akan pernah dievaluasi — aplikasi hanya akan\n' +
        '          melihat database kosong.\n\n',
      );
      keluar = 1;
    }

    if (tanpaRls.length > 0) {
      process.stdout.write(`  [GAGAL] ${tanpaRls.length} tabel tanpa RLS aktif:\n`);
      for (const t of tanpaRls) process.stdout.write(`            ${t.tabel}\n`);
      process.stdout.write('\n');
      keluar = 1;
    }

    if (tanpaPolicy.length > 0) {
      process.stdout.write(
        `  [PERIKSA] ${tanpaPolicy.length} tabel ber-RLS tanpa policy (tertutup total):\n`,
      );
      for (const t of tanpaPolicy) process.stdout.write(`            ${t.tabel}\n`);
      process.stdout.write('            Aman, tetapi pastikan itu memang disengaja.\n\n');
    }

    if (bphTulis.length > 0) {
      process.stdout.write(`  [GAGAL] ${bphTulis.length} policy TULIS menyebut BPH (INV-03):\n`);
      for (const p of bphTulis) {
        process.stdout.write(`            ${p.tabel}.${p.nama} (${p.perintah})\n`);
      }
      process.stdout.write('\n');
      keluar = 1;
    }

    if (tulisTerbuka.length > 0) {
      process.stdout.write(`  [GAGAL] ${tulisTerbuka.length} policy TULIS memakai USING (true):\n`);
      for (const p of tulisTerbuka) {
        process.stdout.write(`            ${p.tabel}.${p.nama} (${p.perintah})\n`);
      }
      process.stdout.write('\n');
      keluar = 1;
    }

    const berpolicy = tabel.filter((t) => t.rls && t.policy > 0).length;
    process.stdout.write(
      `  ${berpolicy} tabel berpolicy, ${tanpaRls.length} tanpa RLS, ` +
      `${tanpaPolicy.length} tanpa policy, ${policy.length} policy total\n`,
    );

    if (keluar === 0) {
      process.stdout.write('  [ OK ] Cakupan RLS lengkap, tidak ada BPH pada operasi tulis.\n\n');
    } else {
      process.stdout.write('  [GAGAL] Perbaiki temuan di atas sebelum melanjutkan.\n\n');
    }
  } finally {
    await sql.end();
  }

  process.exit(keluar);
}

utama().catch((e: unknown) => {
  process.stderr.write(`\n  rls-coverage gagal: ${e instanceof Error ? e.message : String(e)}\n\n`);
  process.exit(1);
});
