/**
 * check-env — memvalidasi seluruh environment variable yang dibutuhkan sistem.
 *
 *   npx tsx scripts/check-env.ts        (sebelum scaffold selesai)
 *   npm run check:env                   (setelah T-010)
 *
 * Perilaku: mengumpulkan SELURUH masalah lebih dulu, baru mencetaknya sekaligus.
 * Berhenti di variable pertama yang salah membuat orang memperbaiki satu per satu
 * dan menjalankan ulang lima kali — itu yang ingin dihindari di sini.
 *
 * Catatan implementasi: validator ditulis tanpa dependency karena skrip ini
 * harus bisa jalan sebelum `npm install` pertama (T-003 mendahului T-009).
 * Zod dipakai untuk validasi domain aplikasi, bukan untuk bootstrap ini.
 *
 * Sumber daftar variable: .env.example · SYSTEM_DESIGN §20.1 · ADR-010 · ADR-014
 */

import fs from 'node:fs';
import path from 'node:path';

type Aturan = {
  nama: string;
  wajib: boolean;
  jenis?: 'url' | 'postgres' | 'angka' | 'boolean';
  pilihan?: string[];
  /** Wajib hanya bila kondisi ini terpenuhi. */
  wajibBila?: (env: Record<string, string>) => boolean;
  catatan?: string;
  rahasia?: boolean;
};

const ATURAN: Aturan[] = [
  // Database
  { nama: 'DATABASE_URL', wajib: true, jenis: 'postgres', rahasia: true,
    catatan: 'connection pooler, port 6543' },
  { nama: 'DIRECT_URL', wajib: true, jenis: 'postgres', rahasia: true,
    catatan: 'koneksi langsung/session untuk migrasi, port 5432' },

  // Supabase
  { nama: 'NEXT_PUBLIC_SUPABASE_URL', wajib: true, jenis: 'url' },
  { nama: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', wajib: true },
  { nama: 'SUPABASE_SERVICE_ROLE_KEY', wajib: true, rahasia: true,
    catatan: 'server-only, jangan diimpor di client component' },

  // Storage
  { nama: 'STORAGE_DRIVER', wajib: true, pilihan: ['supabase', 'gdrive', 'local', 's3'] },
  { nama: 'STORAGE_BUCKET_PRIVATE', wajib: true },
  { nama: 'STORAGE_BUCKET_PUBLIC', wajib: true },

  // Google Drive — hanya wajib bila diaktifkan
  { nama: 'GDRIVE_ENABLED', wajib: true, jenis: 'boolean' },
  { nama: 'GDRIVE_SERVICE_ACCOUNT_JSON', wajib: false, rahasia: true,
    wajibBila: (e) => e.GDRIVE_ENABLED === 'true' },
  { nama: 'GDRIVE_BACKUP_FOLDER_ID', wajib: false,
    wajibBila: (e) => e.GDRIVE_ENABLED === 'true' },

  // PDF — ADR-010
  { nama: 'PDF_ENABLED', wajib: true, jenis: 'boolean' },
  { nama: 'GOTENBERG_URL', wajib: false, jenis: 'url',
    wajibBila: (e) => e.PDF_ENABLED === 'true' && !e.SOFFICE_PATH,
    catatan: 'wajib bila PDF_ENABLED=true dan SOFFICE_PATH kosong' },
  { nama: 'SOFFICE_PATH', wajib: false },

  // Aplikasi
  { nama: 'NEXT_PUBLIC_APP_URL', wajib: true, jenis: 'url' },
  { nama: 'CRON_SECRET', wajib: true, rahasia: true },
  { nama: 'SCHEMA_VERSION', wajib: true, jenis: 'angka' },

  // Upload — ADR-014
  { nama: 'MAX_UPLOAD_BYTES', wajib: true, jenis: 'angka' },
];

/** Membaca .env.local tanpa dependency. Mendukung komentar, kutip, dan nilai kosong. */
function bacaEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const hasil: Record<string, string> = {};
  for (const baris of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#')) continue;
    const pisah = t.indexOf('=');
    if (pisah === -1) continue;
    const kunci = t.slice(0, pisah).trim();
    let nilai = t.slice(pisah + 1).trim();
    if (
      (nilai.startsWith('"') && nilai.endsWith('"')) ||
      (nilai.startsWith("'") && nilai.endsWith("'"))
    ) {
      nilai = nilai.slice(1, -1);
    }
    hasil[kunci] = nilai;
  }
  return hasil;
}

function periksaJenis(a: Aturan, nilai: string): string | null {
  switch (a.jenis) {
    case 'url':
      try {
        const u = new URL(nilai);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return `harus URL http/https, dapat "${u.protocol}"`;
        }
      } catch {
        return `bukan URL yang sah: "${nilai}"`;
      }
      return null;
    case 'postgres':
      return /^postgres(ql)?:\/\/.+/.test(nilai)
        ? null
        : 'harus diawali postgresql:// atau postgres://';
    case 'angka':
      return /^\d+$/.test(nilai) ? null : `harus bilangan bulat, dapat "${nilai}"`;
    case 'boolean':
      return nilai === 'true' || nilai === 'false'
        ? null
        : `harus "true" atau "false", dapat "${nilai}"`;
    default:
      return null;
  }
}

function jalankan(): number {
  const root = path.resolve(process.cwd());
  const fileEnv = path.join(root, '.env.local');
  const dariFile = bacaEnvFile(fileEnv);
  // process.env menang atas .env.local (mis. nilai dari Vercel atau CI).
  const env: Record<string, string> = { ...dariFile };
  for (const a of ATURAN) {
    const dariProses = process.env[a.nama];
    if (dariProses !== undefined && dariProses !== '') env[a.nama] = dariProses;
  }

  const kurang: Aturan[] = [];
  const salah: { aturan: Aturan; pesan: string }[] = [];

  for (const a of ATURAN) {
    const nilai = env[a.nama] ?? '';
    const wajib = a.wajib || (a.wajibBila?.(env) ?? false);

    if (!nilai) {
      if (wajib) kurang.push(a);
      continue;
    }
    const pesanJenis = periksaJenis(a, nilai);
    if (pesanJenis) salah.push({ aturan: a, pesan: pesanJenis });
    else if (a.pilihan && !a.pilihan.includes(nilai)) {
      salah.push({ aturan: a, pesan: `harus salah satu dari ${a.pilihan.join(' | ')}, dapat "${nilai}"` });
    }
  }

  // Pemeriksaan silang yang tidak tertangkap per-variable.
  const lintas: string[] = [];
  if (env.DATABASE_URL && env.DIRECT_URL && env.DATABASE_URL === env.DIRECT_URL) {
    lintas.push(
      'DATABASE_URL dan DIRECT_URL bernilai sama. Migrasi tidak boleh lewat transaction pooler — ' +
        'DIRECT_URL harus memakai koneksi langsung/session (port 5432).'
    );
  }
  if (env.PDF_ENABLED === 'false' && env.GOTENBERG_URL) {
    lintas.push('GOTENBERG_URL terisi tetapi PDF_ENABLED=false, jadi PDF tetap dinonaktifkan (ADR-010).');
  }

  console.log('\n  check-env — HMIF Center');
  console.log(`  Sumber : ${fs.existsSync(fileEnv) ? fileEnv : '.env.local (TIDAK DITEMUKAN)'}`);
  console.log(`  Diperiksa: ${ATURAN.length} variable\n`);

  if (kurang.length) {
    console.error(`  KURANG (${kurang.length}):`);
    for (const a of kurang) {
      const ket = a.catatan ? `  — ${a.catatan}` : '';
      console.error(`    - ${a.nama}${ket}`);
    }
    console.error('');
  }

  if (salah.length) {
    console.error(`  TIDAK SAH (${salah.length}):`);
    for (const s of salah) console.error(`    - ${s.aturan.nama}: ${s.pesan}`);
    console.error('');
  }

  if (lintas.length) {
    console.error(`  PERINGATAN (${lintas.length}):`);
    for (const p of lintas) console.error(`    - ${p}`);
    console.error('');
  }

  if (kurang.length || salah.length) {
    console.error('  GAGAL. Lengkapi .env.local — panduan: docs/ai/ENV_SETUP.md\n');
    return 1;
  }

  const terisi = ATURAN.filter((a) => env[a.nama]);
  console.log(`  LULUS. ${terisi.length}/${ATURAN.length} variable terisi, seluruh yang wajib sah.`);
  if (lintas.length) console.log('  (ada peringatan di atas, tidak memblokir)');
  console.log('');
  return 0;
}

process.exit(jalankan());
