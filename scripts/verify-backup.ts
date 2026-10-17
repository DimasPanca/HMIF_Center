/**
 * verify-backup — memeriksa ulang satu bundel backup dari storage.
 *
 *   npx tsx scripts/verify-backup.ts <backupId>
 *   npx tsx scripts/verify-backup.ts --jalankan     buat backup MANUAL dulu, lalu periksa
 *
 * Yang diperiksa (T-110 "Selesai bila"):
 *   1. baris `backup` SUKSES dan manifest di DB = `manifest.json` di storage
 *   2. struktur PRD F-16.1 lengkap (dump, 12 modul, daftar surat, arsip)
 *   3. setiap berkas: ukuran + SHA-256 cocok dengan manifest
 *   4. dump dapat di-gunzip; setiap modul JSON valid dan jumlah record-nya
 *      sama dengan manifest; setiap berkas di dalam ZIP cocok dengan indeksnya
 *
 * Keluar dengan kode 1 bila ada satu pun yang gagal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const AKAR = path.resolve(import.meta.dirname, '..');

/** Env dimuat SEBELUM modul aplikasi diimpor, karena keduanya membaca env saat dipakai. */
function muatEnv(): void {
  const f = path.join(AKAR, '.env.local');
  if (!fs.existsSync(f)) return;
  for (const baris of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    if (process.env[k] === undefined) {
      process.env[k] = t
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }
}

function kanonik(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(kanonik).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${kanonik((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x);
}

async function main(): Promise<number> {
  muatEnv();
  const { db } = await import('@/lib/db/client');
  const { storage, keys } = await import('@/lib/storage');
  const { DAFTAR_MODUL } = await import('@/lib/backup/export-modul');
  const { JALUR, SkemaManifest, berkasHilang, verifikasiBerkas } =
    await import('@/lib/backup/manifest');
  const { periksaArsip } = await import('@/lib/backup/zip-storage');

  let id = process.argv[2];
  if (!id) {
    console.error('Pemakaian: npx tsx scripts/verify-backup.ts <backupId> | --jalankan');
    return 2;
  }
  if (id === '--jalankan') {
    const { jalankanBackup } = await import('@/lib/backup/service');
    const { withServiceContext } = await import('@/lib/db/with-audit-context');
    const mulai = Date.now();
    const h = await jalankanBackup((fn) => withServiceContext(fn), { jenis: 'MANUAL' });
    if (!h.ok) {
      console.error(`  [GAGAL] backup: ${h.pesan}`);
      return 1;
    }
    id = h.id;
    console.log(`  backup ${id} selesai dalam ${((Date.now() - mulai) / 1000).toFixed(1)} detik`);
  }

  const gagal: string[] = [];
  const cek = (ok: boolean, label: string) => {
    console.log(`  [${ok ? ' OK ' : 'GAGAL'}] ${label}`);
    if (!ok) gagal.push(label);
  };

  const baris = await db.backup.findUnique({ where: { id } });
  if (!baris) {
    console.error(`  Backup ${id} tidak ditemukan.`);
    return 1;
  }
  cek(
    baris.status === 'SUKSES',
    `status ${baris.status}${baris.error_message ? ` — ${baris.error_message}` : ''}`,
  );

  const isiManifest = await storage.get(keys.backupBerkas(id, JALUR.manifest)).catch(() => null);
  if (!isiManifest) {
    cek(false, 'manifest.json ada di storage');
    return 1;
  }
  const parse = SkemaManifest.safeParse(JSON.parse(isiManifest.toString('utf8')));
  cek(parse.success, 'manifest.json sesuai skema');
  if (!parse.success) return 1;
  const m = parse.data;
  // jsonb mengurutkan ulang key — bandingkan bentuk kanonik.
  cek(kanonik(baris.manifest) === kanonik(m), 'manifest di DB identik dengan manifest.json');
  cek(
    Number(baris.ukuran_bytes) === m.files.reduce((n, f) => n + f.size, 0) + isiManifest.length,
    'ukuran_bytes = Σ berkas + manifest',
  );

  const hilang = berkasHilang(m, DAFTAR_MODUL);
  cek(
    hilang.length === 0,
    `struktur PRD F-16.1 lengkap${hilang.length ? ` (hilang: ${hilang.join(', ')})` : ''}`,
  );
  cek(
    m.files.some((f) => f.path.startsWith('exports/rab-')),
    'ekspor RAB per acara ada',
  );

  const unduhan = new Map<string, Buffer>();
  const v = await verifikasiBerkas(m, async (p) => {
    const b = await storage.get(keys.backupBerkas(id, p));
    unduhan.set(p, b);
    return b;
  });
  for (const r of v.rusak) cek(false, `${r.path}: ${r.sebab}`);
  cek(v.ok, `${m.files.length} berkas cocok checksum SHA-256`);

  const dump = unduhan.get(JALUR.dump);
  if (dump) {
    const sql = gunzipSync(dump).toString('utf8');
    cek(
      sql.length > 0,
      `dump ${m.dump.metode}: ${(sql.length / 1024).toFixed(0)} KB SQL setelah gunzip`,
    );
  }
  for (const modul of DAFTAR_MODUL) {
    const b = unduhan.get(JALUR.modul(modul));
    if (!b) continue;
    const j = JSON.parse(b.toString('utf8')) as {
      tabel: Record<string, unknown[]>;
      versiSkema: string;
      migrasiTerakhir: string;
    };
    const n = Object.values(j.tabel).reduce((x, rows) => x + rows.length, 0);
    cek(
      n === m.jumlahRecord[modul] &&
        j.versiSkema === m.versiSkema &&
        j.migrasiTerakhir === m.migrasiTerakhir,
      `modul ${modul}: ${n} record`,
    );
  }
  let berkasArsip = 0;
  const rusakArsip: string[] = [];
  for (let n = 1; n <= m.volumeArsip; n++) {
    const zip = unduhan.get(JALUR.arsip(n));
    if (!zip) {
      rusakArsip.push(JALUR.arsip(n));
      continue;
    }
    const a = periksaArsip(zip);
    berkasArsip += a.jumlah;
    rusakArsip.push(...a.rusak);
  }
  cek(
    rusakArsip.length === 0 && berkasArsip === m.jumlahBerkasStorage,
    `arsip storage: ${berkasArsip} berkas utuh dalam ${m.volumeArsip} volume${rusakArsip.length ? ` (rusak: ${rusakArsip.join(', ')})` : ''}`,
  );
  for (const k of m.keterbatasan) console.log(`  [info] ${k}`);

  await db.$disconnect();
  console.log(
    gagal.length ? `\n  ${gagal.length} pemeriksaan GAGAL.` : `\n  Backup ${id} terverifikasi.`,
  );
  return gagal.length ? 1 : 0;
}

main().then(
  (kode) => process.exit(kode),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
