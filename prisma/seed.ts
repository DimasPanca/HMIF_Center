/**
 * seed — memverifikasi data referensi, dan opsional mengisi data contoh.
 *
 * Data referensi sesungguhnya diseed migrasi `018_seed.sql`, bukan berkas ini.
 * Alasannya: seed yang berjalan sebagai bagian migrasi ikut terjaga checksum
 * dan urutannya, sedangkan skrip terpisah bisa lupa dijalankan.
 *
 * Yang dikerjakan berkas ini:
 *
 *   1. MEMASTIKAN data referensi benar-benar ada dan berjumlah tepat.
 *   2. MEMBANDINGKAN warna departemen dengan token CSS, karakter per karakter.
 *      SEED_DATA.md mewajibkan keduanya sama persis; tanpa pemeriksaan ini,
 *      "wajib sama" hanya imbauan. Bila salah satu berubah, batang Gantt yang
 *      diwarnai dari database akan berbeda dari badge yang diwarnai dari CSS,
 *      dan tidak ada yang error — hanya terlihat salah.
 *   3. Dengan flag --dev, mengisi data contoh untuk pengembangan.
 *
 * Memakai postgres.js, bukan Prisma client. Prisma baru masuk pada T-043;
 * letak berkas mengikuti kontrak T-042.
 *
 * Sumber: docs/ai/SEED_DATA.md · docs/ai/tasks/P1-fondasi.md T-042
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const AKAR = path.resolve(import.meta.dirname, '..');
const DEV = process.argv.includes('--dev');

/** Pemetaan token CSS ke kode departemen. */
const TOKEN_DEPT: Record<string, string> = {
  kaderisasi: 'KAD',
  mikat:      'MIKAT',
  internal:   'INT',
  eksternal:  'EKS',
  kominfo:    'KOMINFO',
  rnd:        'RND',
};

const JUMLAH = {
  departemen:          6,
  app_config:          5,
  surat_template:      7,
  divisi_preset:       9,
  tujuan_surat_preset: 6,
} as const;

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

/** Warna --dept-* dari app/globals.css, huruf besar untuk perbandingan. */
function warnaDariCss(): Record<string, string> {
  const berkas = path.join(AKAR, 'app', 'globals.css');
  if (!fs.existsSync(berkas)) return {};
  const isi = fs.readFileSync(berkas, 'utf8');
  const hasil: Record<string, string> = {};
  // Hanya token dasar; varian --dept-*-fill tidak disimpan di database.
  const pola = /--dept-([a-z0-9]+):\s*(#[0-9A-Fa-f]{6})\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = pola.exec(isi)) !== null) {
    const kode = TOKEN_DEPT[m[1]!];
    if (kode) hasil[kode] = m[2]!.toUpperCase();
  }
  return hasil;
}

async function utama(): Promise<void> {
  const env = { ...bacaEnv(), ...process.env };
  const koneksi = env.DIRECT_URL ?? env.DATABASE_URL;

  if (!koneksi) {
    process.stderr.write(NL + '  DIRECT_URL/DATABASE_URL belum diisi. Jalankan: npm run check:env' + NL + NL);
    process.exit(1);
  }

  if (DEV && env.NODE_ENV === 'production') {
    process.stderr.write(
      NL + '  --dev menolak berjalan dengan NODE_ENV=production.' +
      NL + '  Data contoh tidak boleh masuk ke database sungguhan.' + NL + NL,
    );
    process.exit(1);
  }

  const sql = postgres(koneksi, { ssl: 'require', max: 1, connect_timeout: 30, onnotice: () => {} });
  let keluar = 0;

  try {
    tulis('');
    tulis('  seed — memeriksa data referensi');
    tulis('');

    // ---------------------------------------------------------------------
    // 1. Jumlah baris
    // ---------------------------------------------------------------------
    const aktual: Record<string, number> = {};
    for (const tabel of Object.keys(JUMLAH)) {
      const r = await sql.unsafe<{ n: number }[]>(`SELECT count(*)::INT AS n FROM ${tabel}`);
      aktual[tabel] = r[0]!.n;
    }

    for (const [tabel, harus] of Object.entries(JUMLAH)) {
      const ada = aktual[tabel]!;
      const ok = ada === harus;
      if (!ok) keluar = 1;
      tulis(`    ${(ok ? '[ OK ]' : '[GAGAL]').padEnd(9)}${tabel.padEnd(22)}${ada} baris` +
            (ok ? '' : `  (seharusnya ${harus})`));
    }

    // ---------------------------------------------------------------------
    // 2. Warna departemen versus token CSS
    // ---------------------------------------------------------------------
    tulis('');
    const css = warnaDariCss();
    const db = await sql<{ kode: string; warna: string }[]>`
      SELECT kode, upper(warna) AS warna FROM departemen ORDER BY urutan
    `;

    if (Object.keys(css).length === 0) {
      tulis('    [PERIKSA] app/globals.css tidak terbaca — warna tidak dapat dibandingkan.');
      tulis('              Berkas itu milik lane ui; jalankan ulang setelah sinkron.');
    } else {
      let beda = 0;
      for (const d of db) {
        const dariCss = css[d.kode];
        if (!dariCss) {
          tulis(`    [PERIKSA] ${d.kode.padEnd(9)}tidak punya token --dept-* di globals.css`);
          continue;
        }
        if (dariCss !== d.warna) {
          beda++;
          keluar = 1;
          tulis(`    [GAGAL]  ${d.kode.padEnd(9)}database ${d.warna}  vs  CSS ${dariCss}`);
        }
      }
      if (beda === 0) {
        tulis(`    [ OK ]   warna 6 departemen cocok karakter per karakter dengan globals.css`);
      } else {
        tulis('');
        tulis('             Batang Gantt mengambil warna dari database, badge departemen');
        tulis('             dari CSS. Bila berbeda, keduanya tampil beda warna tanpa');
        tulis('             satu pun error. Samakan di 018_seed.sql atau globals.css.');
      }
    }

    // ---------------------------------------------------------------------
    // 3. Tidak ada data personal
    // ---------------------------------------------------------------------
    tulis('');
    const personal = await sql<{ n: number }[]>`SELECT count(*)::INT AS n FROM app_user`;
    if (!DEV && personal[0]!.n > 0) {
      tulis(`    [PERIKSA] app_user berisi ${personal[0]!.n} baris.`);
      tulis('              Seed referensi tidak pernah membuat pengguna; baris ini');
      tulis('              datang dari undangan, import, atau seed --dev.');
    } else if (!DEV) {
      tulis('    [ OK ]   tidak ada data personal, sesuai rancangan');
    }

    // ---------------------------------------------------------------------
    // 4. Data contoh pengembangan
    // ---------------------------------------------------------------------
    if (DEV) {
      tulis('');
      tulis('  --dev: mengisi data contoh');
      tulis('');
      const dibuat = await seedDev(sql);
      for (const b of dibuat) tulis(`    ${b}`);
    }

    tulis('');
    tulis(keluar === 0
      ? '  [ OK ] Data referensi lengkap dan konsisten.'
      : '  [GAGAL] Perbaiki temuan di atas.');
    tulis('');
  } finally {
    await sql.end();
  }

  process.exit(keluar);
}

/**
 * Data contoh untuk pengembangan. Idempoten lewat email dan nama yang tetap.
 *
 * Seluruh nama, NIM, dan email di sini jelas-jelas fiktif. Memakai data
 * pengurus sungguhan sebagai contoh berarti menyalin data pribadi ke setiap
 * mesin pengembang dan setiap dump database.
 */
async function seedDev(sql: postgres.Sql): Promise<string[]> {
  const catatan: string[] = [];

  const [periode] = await sql<{ id: string }[]>`
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES ('Contoh 2026/2027', '2026-09-01', '2027-08-31', 'PERSIAPAN')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  let periodeId = periode?.id;
  if (!periodeId) {
    const ada = await sql<{ id: string }[]>`
      SELECT id FROM periode WHERE nama = 'Contoh 2026/2027'
    `;
    periodeId = ada[0]?.id;
  }
  if (!periodeId) return ['[GAGAL] periode contoh tidak dapat dibuat'];

  const aktif = await sql<{ id: string }[]>`SELECT id FROM periode WHERE status = 'AKTIF'`;
  if (aktif.length === 0) {
    await sql`SELECT aktifkan_periode(${periodeId}::uuid)`;
    catatan.push('periode contoh diaktifkan, counter nomor surat disiapkan');
  } else {
    catatan.push('sudah ada periode AKTIF — periode contoh dibiarkan PERSIAPAN');
  }

  const peran = [
    ['ADMIN',   'Contoh Admin',            null],
    ['KETUA',   'Contoh Ketua Umum',       null],
    ['WAKIL',   'Contoh Wakil Ketua',      null],
    ['SEKUM',   'Contoh Sekretaris Umum',  null],
    ['BENDUM',  'Contoh Bendahara Umum',   null],
    ['KADEPT',  'Contoh Kepala Departemen', 'KAD'],
    ['ANGGOTA', 'Contoh Anggota',          'KAD'],
    ['BPH',     'Contoh Pengawas',         null],
  ] as const;

  let n = 0;
  for (const [role, nama, kodeDept] of peran) {
    const email = `${role.toLowerCase()}@contoh.test`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO app_user (id, nama_lengkap, nim, email)
      VALUES (gen_random_uuid(), ${nama}, ${'000000' + String(1000 + n).slice(1)}, ${email})
      ON CONFLICT (email) DO UPDATE SET nama_lengkap = EXCLUDED.nama_lengkap
      RETURNING id
    `;
    const deptId = kodeDept
      ? (await sql<{ id: string }[]>`SELECT id FROM departemen WHERE kode = ${kodeDept}`)[0]?.id ?? null
      : null;

    await sql`
      INSERT INTO user_role (user_id, periode_id, role, departemen_id)
      VALUES (${u!.id}, ${periodeId}, ${role}::role_code, ${deptId})
      ON CONFLICT DO NOTHING
    `;
    n++;
  }
  catatan.push(`${n} pengguna contoh, satu per role — seluruhnya fiktif (@contoh.test)`);

  // Tiga proker TERJADWAL dengan rentang yang TIDAK bertabrakan. Kalau
  // bertabrakan, EXCLUDE constraint akan menolaknya saat disetujui dan data
  // contoh menjadi tidak dapat dipakai mencoba alur approval (INV-09).
  const [dept] = await sql<{ id: string }[]>`SELECT id FROM departemen WHERE kode = 'KAD'`;
  const [pembuat] = await sql<{ id: string }[]>`
    SELECT id FROM app_user WHERE email = 'kadept@contoh.test'
  `;

  const proker = [
    ['Contoh Acara Ganjil',  '2026-10-01', '2026-10-20', '2026-10-22'],
    ['Contoh Acara Genap',   '2027-01-05', '2027-01-25', '2027-01-27'],
    ['Contoh Acara Penutup', '2027-04-01', '2027-04-20', '2027-04-22'],
  ] as const;

  let p = 0;
  for (const [nama, mulai, hMulai, hSelesai] of proker) {
    const hasil = await sql`
      INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                          tanggal_mulai_persiapan, tanggal_hari_h_mulai,
                          tanggal_hari_h_selesai, dibuat_oleh)
      SELECT ${periodeId}, ${dept!.id}, ${nama}, 'TERJADWAL', 'DRAFT',
             ${mulai}::date, ${hMulai}::date, ${hSelesai}::date, ${pembuat!.id}
      WHERE NOT EXISTS (SELECT 1 FROM proker WHERE nama = ${nama})
      RETURNING id
    `;
    if (hasil.length > 0) p++;
  }
  catatan.push(`${p} proker contoh dibuat, rentang tanggalnya tidak saling bertabrakan`);

  return catatan;
}

utama().catch((e: unknown) => {
  process.stderr.write(NL + `  seed gagal: ${e instanceof Error ? e.message : String(e)}` + NL + NL);
  process.exit(1);
});
