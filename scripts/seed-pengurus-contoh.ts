/**
 * Data Pengurus CONTOH untuk DB dev (keputusan pemilik 2026-10-15) — supaya
 * Surat Keterangan Aktif massal dan daftar hadir notulensi dapat dicoba
 * sebelum data asli diimpor.
 *
 *     npx tsx scripts/seed-pengurus-contoh.ts           isi (idempoten)
 *     npx tsx scripts/seed-pengurus-contoh.ts --hapus   hapus semua data contoh
 *
 * Berlabel jelas supaya tak tertukar dengan data asli: nama berakhiran
 * " (Contoh)" dan NIM berawalan 980000 — bukan pola NIM UNTIRTA (3337…).
 * Hanya menyentuh baris berlabel itu; data pengurus lain tidak disentuh.
 */

import fs from 'node:fs';
import path from 'node:path';

import postgres from 'postgres';

const AKAR = path.resolve(import.meta.dirname, '..');
const tulis = (s: string) => process.stdout.write(`${s}\n`);

function env(): Record<string, string | undefined> {
  const e: Record<string, string> = {};
  const f = path.join(AKAR, '.env.local');
  if (fs.existsSync(f)) {
    for (const b of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const i = b.indexOf('=');
      if (i > 0 && !b.trimStart().startsWith('#')) e[b.slice(0, i).trim()] = b.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return { ...e, ...process.env };
}

const AWALAN_NIM = '980000';
const LABEL = ' (Contoh)';

const NAMA = [
  'Adit Saputra', 'Bunga Lestari', 'Citra Ayu', 'Dimas Wibowo', 'Eka Pratiwi', 'Fajar Nugroho', 'Gita Maharani', 'Hendra Kurniawan',
  'Indah Permata', 'Joko Susilo', 'Kirana Dewi', 'Lukman Hakim', 'Maya Sari', 'Nanda Putra', 'Oktavia Rahma', 'Putri Anggraini',
  'Qori Ramadhan', 'Rizki Firmansyah', 'Sinta Wulandari', 'Taufik Hidayat', 'Umi Kalsum', 'Vina Oktaviani', 'Wahyu Setiawan',
  'Yusuf Maulana', 'Zahra Aulia', 'Bagas Prakoso', 'Dewi Safitri', 'Galih Saputro', 'Laras Ayuningtyas', 'Rendi Kusuma',
];

async function main(): Promise<number> {
  const e = env();
  const url = e.DIRECT_URL ?? e.DATABASE_URL;
  if (!url) {
    tulis('  GAGAL — DIRECT_URL/DATABASE_URL tidak ada.');
    return 1;
  }
  const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} });
  try {
    if (process.argv.includes('--hapus')) {
      const r = await sql`DELETE FROM pengurus WHERE nim LIKE ${AWALAN_NIM + '%'} AND nama_lengkap LIKE ${'%' + LABEL}`;
      tulis(`  ${r.count} pengurus contoh dihapus.`);
      return 0;
    }
    const [p] = await sql<{ id: string; nama: string }[]>`SELECT id::text, nama FROM periode WHERE status = 'AKTIF' LIMIT 1`;
    if (!p) {
      tulis('  GAGAL — tidak ada periode AKTIF.');
      return 1;
    }
    const dept = await sql<{ id: string; nama: string }[]>`SELECT id::text, nama FROM departemen WHERE is_active ORDER BY urutan`;
    let baru = 0;
    for (const [i, nama] of NAMA.entries()) {
      const d = dept[i % Math.max(1, dept.length)];
      const kadept = i < dept.length;
      const r = await sql`
        INSERT INTO pengurus (periode_id, nama_lengkap, nim, jabatan, departemen_id, angkatan, is_aktif)
        VALUES (${p.id}::uuid, ${nama + LABEL}, ${AWALAN_NIM + String(i + 1).padStart(4, '0')},
                ${kadept ? `Kepala Departemen ${d?.nama ?? ''}`.trim() : `Staff Departemen ${d?.nama ?? ''}`.trim()},
                ${d?.id ?? null}::uuid, ${kadept ? 2022 : 2023 + (i % 2)}, true)
        ON CONFLICT (periode_id, nim) DO NOTHING`;
      baru += r.count;
    }
    tulis(`  Periode "${p.nama}": ${baru} pengurus contoh ditambahkan, ${NAMA.length - baru} sudah ada.`);
    tulis('  Hapus kapan saja: npx tsx scripts/seed-pengurus-contoh.ts --hapus');
    return 0;
  } finally {
    await sql.end();
  }
}

main().then(
  (k) => process.exit(k),
  (err) => {
    process.stderr.write(`GALAT: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
