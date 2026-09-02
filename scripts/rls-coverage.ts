/**
 * rls-coverage — memeriksa cakupan Row Level Security.
 *
 * Enam hal yang diperiksa. Masing-masing menutup satu cara RLS gagal tanpa
 * menimbulkan error — dan itulah yang membuatnya berbahaya: gejalanya bukan
 * aplikasi yang rusak, melainkan aplikasi yang tampak baik-baik saja.
 *
 *   1. TABEL TANPA RLS AKTIF.
 *      Terbuka penuh bagi siapa pun yang memegang kredensial `authenticated`.
 *
 *   2. TABEL TANPA GRANT untuk `authenticated`.
 *      RLS baru diperiksa SETELAH hak tabel biasa lolos. Tanpa GRANT, policy
 *      tabel itu tidak pernah dievaluasi dan aplikasi melihatnya kosong.
 *
 *   3. TIDAK ADA HAK BAWAAN (ALTER DEFAULT PRIVILEGES).
 *      `GRANT ... ON ALL TABLES` hanya mengenai tabel yang ada saat itu.
 *      Tanpa hak bawaan, setiap tabel dan view dari migrasi berikutnya lahir
 *      tanpa hak apa pun bagi aplikasi.
 *
 *   4. VIEW TANPA security_invoker.
 *      View berjalan dengan hak PEMILIKNYA. Pemiliknya `postgres`, yang
 *      ber-BYPASSRLS — jadi view biasa menembus seluruh policy.
 *
 *   5. BPH PADA POLICY TULIS (INV-03).
 *      BPH adalah peran pengawas: baca di mana-mana, tulis di mana pun tidak.
 *
 *   6. USING (true) PADA POLICY TULIS.
 *      Policy tulis yang tidak membatasi apa pun.
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

const NL = '\n';

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
  hak: number;
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
    process.stderr.write(
      NL + '  DIRECT_URL/DATABASE_URL belum diisi. Jalankan: npm run check:env' + NL + NL,
    );
    process.exit(1);
  }

  const sql = postgres(koneksi, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  const tulis = (s: string): void => {
    process.stdout.write(s + NL);
  };
  let keluar = 0;

  try {
    const tabel = (
      await sql<BarisTabel[]>`
        SELECT c.relname        AS tabel,
               c.relrowsecurity AS rls,
               (SELECT count(*)::INT FROM pg_policy p WHERE p.polrelid = c.oid) AS policy,
               (SELECT count(*)::INT FROM information_schema.role_table_grants g
                 WHERE g.table_schema = 'public'
                   AND g.table_name   = c.relname
                   AND g.grantee      = 'authenticated')                         AS hak
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
      `
    ).filter((t) => !BUKAN_DOMAIN.has(t.tabel));

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

    const hakBawaan = await sql<{ n: number }[]>`
      SELECT count(*)::INT AS n
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
      WHERE n.nspname = 'public'
        AND d.defaclobjtype = 'r'
        AND array_to_string(d.defaclacl, ',') LIKE '%authenticated=%'
    `;

    const viewTembus = await sql<{ nama: string }[]>`
      SELECT c.relname AS nama
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'v'
        AND NOT COALESCE((
          SELECT o.option_value = 'true'
          FROM pg_options_to_table(c.reloptions) o
          WHERE o.option_name = 'security_invoker'
        ), false)
      ORDER BY c.relname
    `;

    const tanpaRls     = tabel.filter((t) => !t.rls);
    const tanpaHak     = tabel.filter((t) => t.hak === 0);
    const tanpaPolicy  = tabel.filter((t) => t.rls && t.policy === 0);
    const bphTulis     = policy.filter((p) => TULIS.has(p.perintah) && /'BPH'/i.test(p.ekspresi));
    const tulisTerbuka = policy.filter(
      (p) => TULIS.has(p.perintah) && /^\s*true\s*$/.test(p.ekspresi.trim()),
    );

    const lebar = Math.max(...tabel.map((t) => t.tabel.length), 10);

    tulis('');
    tulis(`  rls-coverage — ${tabel.length} tabel domain`);
    tulis('');

    for (const t of tabel) {
      const tanda = !t.rls
        ? '[TIDAK]'
        : t.hak === 0
          ? '[NOHAK]'
          : t.policy === 0
            ? '[KOSONG]'
            : '[ OK ]';
      const ket = !t.rls
        ? 'RLS tidak aktif'
        : t.hak === 0
          ? 'tanpa GRANT — policy tidak pernah dievaluasi'
          : t.policy === 0
            ? 'RLS aktif tanpa policy — tertutup total'
            : `${t.policy} policy`;
      tulis(`    ${tanda.padEnd(9)}${t.tabel.padEnd(lebar + 2)}${ket}`);
    }

    tulis('');

    if (tanpaRls.length > 0) {
      tulis(`  [GAGAL] ${tanpaRls.length} tabel tanpa RLS aktif:`);
      for (const t of tanpaRls) tulis(`            ${t.tabel}`);
      tulis('');
      keluar = 1;
    }

    if (tanpaHak.length > 0) {
      tulis(`  [GAGAL] ${tanpaHak.length} tabel tanpa GRANT untuk role authenticated:`);
      for (const t of tanpaHak) tulis(`            ${t.tabel}`);
      tulis('          RLS baru diperiksa SETELAH hak tabel biasa lolos, sehingga');
      tulis('          policy tabel ini tidak pernah dievaluasi. Aplikasi hanya');
      tulis('          akan melihatnya kosong.');
      tulis('');
      keluar = 1;
    }

    if (hakBawaan[0]!.n === 0) {
      tulis('  [GAGAL] Tidak ada ALTER DEFAULT PRIVILEGES untuk authenticated.');
      tulis('          Tabel dan view dari migrasi BERIKUTNYA akan lahir tanpa hak');
      tulis('          apa pun. Lihat supabase/migrations/015c_default_privileges.sql');
      tulis('');
      keluar = 1;
    }

    if (viewTembus.length > 0) {
      tulis(`  [GAGAL] ${viewTembus.length} view tanpa security_invoker:`);
      for (const v of viewTembus) tulis(`            ${v.nama}`);
      tulis('          View berjalan dengan hak PEMILIKNYA. Karena pemiliknya');
      tulis('          postgres yang ber-BYPASSRLS, view ini menembus seluruh policy.');
      tulis('          Perbaikan: CREATE VIEW ... WITH (security_invoker = true)');
      tulis('');
      keluar = 1;
    }

    if (bphTulis.length > 0) {
      tulis(`  [GAGAL] ${bphTulis.length} policy TULIS menyebut BPH (INV-03):`);
      for (const p of bphTulis) tulis(`            ${p.tabel}.${p.nama} (${p.perintah})`);
      tulis('');
      keluar = 1;
    }

    if (tulisTerbuka.length > 0) {
      tulis(`  [GAGAL] ${tulisTerbuka.length} policy TULIS memakai USING (true):`);
      for (const p of tulisTerbuka) tulis(`            ${p.tabel}.${p.nama} (${p.perintah})`);
      tulis('');
      keluar = 1;
    }

    if (tanpaPolicy.length > 0) {
      tulis(`  [PERIKSA] ${tanpaPolicy.length} tabel ber-RLS tanpa policy (tertutup total):`);
      for (const t of tanpaPolicy) tulis(`            ${t.tabel}`);
      tulis('            Aman, tetapi pastikan itu memang disengaja.');
      tulis('');
    }

    const berpolicy = tabel.filter((t) => t.rls && t.policy > 0).length;
    tulis(
      `  ${berpolicy} tabel berpolicy, ${tanpaRls.length} tanpa RLS, ` +
        `${tanpaHak.length} tanpa GRANT, ${policy.length} policy total`,
    );

    if (keluar === 0) {
      tulis('  [ OK ] Cakupan RLS lengkap, hak bawaan terpasang, tidak ada BPH pada tulis.');
      tulis('');
    } else {
      tulis('  [GAGAL] Perbaiki temuan di atas sebelum melanjutkan.');
      tulis('');
    }
  } finally {
    await sql.end();
  }

  process.exit(keluar);
}

utama().catch((e: unknown) => {
  process.stderr.write(
    NL + `  rls-coverage gagal: ${e instanceof Error ? e.message : String(e)}` + NL + NL,
  );
  process.exit(1);
});
