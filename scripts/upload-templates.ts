/**
 * upload-templates — mengunggah 11 template DOCX ke bucket privat dan
 * mendaftarkan 7 template surat di `surat_template`.
 *
 *   npx tsx scripts/upload-templates.ts           terapkan
 *   npx tsx scripts/upload-templates.ts --kering  hanya tampilkan rencana
 *
 * Idempoten: jalan kedua tanpa perubahan berkas tidak mengunggah dan tidak
 * menulis apa pun. Berkas atau field_schema yang berubah menghasilkan VERSI
 * BARU, tidak pernah menimpa versi lama — surat yang terbit dengan versi lama
 * harus tetap dapat di-generate ulang persis seperti aslinya.
 *
 * Urutan untuk satu template surat: unggah berkas ke key versi baru, baca ulang
 * dan cocokkan hash-nya, BARU tulis baris database dalam satu transaksi. Bila
 * transaksi gagal, yang tersisa hanyalah berkas tanpa rujukan di key yang belum
 * dipakai siapa pun; jalan berikutnya memakainya ulang.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-055 · ADR-027
 */

import fs from 'node:fs';
import path from 'node:path';
// Hanya tipe: tidak memuat modulnya, jadi aman diimpor sebelum env dimuat.
import type { BarisTemplate } from '@/lib/surat/template-registry';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERING = process.argv.includes('--kering');

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
      process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

async function main(): Promise<number> {
  muatEnv();
  const { storage, keys: storageKeys } = await import('@/lib/storage');
  const { klienLangsung } = await import('@/lib/db/connection');
  const reg = await import('@/lib/surat/template-registry');

  const bacaBerkas = (slug: string) => fs.readFileSync(path.join(AKAR, 'templates', reg.berkasTemplate(slug)));
  const hashDiStorage = async (kunci: string) =>
    (await storage.exists(kunci)) ? reg.hashIsi(await storage.get(kunci)) : null;

  /** Unggah lalu baca ulang: hash yang tidak cocok berarti berkas di storage bukan yang kita kirim. */
  async function unggahTerverifikasi(kunci: string, isi: Buffer, upsert: boolean) {
    await storage.put(kunci, isi, reg.MIME_DOCX, { upsert });
    const kembali = await hashDiStorage(kunci);
    if (kembali !== reg.hashIsi(isi)) throw new Error(`Verifikasi unggahan ${kunci} gagal: hash tidak cocok.`);
  }

  console.log(`\n  upload-templates${KERING ? ' (kering — tidak ada yang ditulis)' : ''}\n`);

  const sql = klienLangsung();
  let gagal = 0;
  const hitung: Record<string, number> = {};

  try {
    // --- 7 template surat ---------------------------------------------------
    for (const t of reg.TEMPLATE_SURAT) {
      const isi = bacaBerkas(t.slug);
      const { kode_surat, varian, nama } = reg.identitasSurat(t);
      const fieldSchema = reg.fieldSchemaUntuk(t);

      const baris = (await sql`
        SELECT id, versi, storage_key, field_schema, is_active
        FROM surat_template WHERE kode_surat = ${kode_surat} AND varian = ${varian}
      `) as unknown as (BarisTemplate & { is_active: boolean })[];

      const aktif = baris.filter((b) => b.is_active);
      if (aktif.length > 1) {
        console.log(`  [GAGAL] ${t.slug}: ${aktif.length} baris aktif untuk ${kode_surat}/${varian} — perbaiki manual dulu.`);
        gagal++;
        continue;
      }
      const satu = aktif[0] ?? null;

      const rencana = reg.rencanakanSurat({
        slug: t.slug,
        aktif: satu,
        versiTertinggi: Math.max(0, ...baris.map((b) => b.versi)),
        hashBerkas: reg.hashIsi(isi),
        hashTersimpan: satu ? await hashDiStorage(satu.storage_key) : null,
        fieldSchema,
      });
      hitung[rencana.aksi] = (hitung[rencana.aksi] ?? 0) + 1;
      console.log(`  [${rencana.aksi.padEnd(10)}] ${kode_surat}/${varian.padEnd(20)} v${rencana.versi}  ${rencana.kunci}`);

      if (KERING || rencana.aksi === 'TETAP') continue;

      // Key tujuan belum dirujuk baris mana pun, jadi menimpanya aman.
      await unggahTerverifikasi(rencana.kunci, isi, true);

      await sql.begin(async (tx) => {
        if (rencana.aksi === 'ADOPSI') {
          await tx`UPDATE surat_template
                   SET storage_key = ${rencana.kunci}, field_schema = ${tx.json(fieldSchema as never)}
                   WHERE id = ${rencana.id}`;
        } else {
          if (rencana.aksi === 'VERSI_BARU') {
            await tx`UPDATE surat_template SET is_active = false WHERE id = ${rencana.dariId}`;
          }
          await tx`INSERT INTO surat_template (kode_surat, varian, nama, storage_key, field_schema, versi, is_active)
                   VALUES (${kode_surat}, ${varian}, ${nama}, ${rencana.kunci},
                           ${tx.json(fieldSchema as never)}, ${rencana.versi}, true)`;
        }
      });
    }

    // --- 4 template dokumen acara -----------------------------------------
    for (const t of [...reg.TEMPLATE_DOKUMEN, reg.TEMPLATE_UMUM]) {
      const b = reg.sebagaiBerversi(t);
      const isi = bacaBerkas(b.slug);
      const kunci = storageKeys.template(b.slug, b.versi);
      const rencana = reg.rencanakanDokumen(t, reg.hashIsi(isi), await hashDiStorage(kunci));
      hitung[rencana.aksi] = (hitung[rencana.aksi] ?? 0) + 1;
      console.log(`  [${rencana.aksi.padEnd(10)}] ${b.label.padEnd(23)} v${b.versi}  ${kunci}`);

      if (rencana.aksi === 'DITOLAK') {
        console.log(`               ${rencana.alasan}`);
        gagal++;
      } else if (rencana.aksi === 'UNGGAH' && !KERING) {
        // upsert false: versi dokumen yang sudah ada tidak boleh ditimpa.
        await unggahTerverifikasi(kunci, isi, false);
      }
    }

    // Aset stempel (SYSTEM_DESIGN §12.2: aset/stempel-hmif.png). Dibaca generator
    // dari storage, bukan dari public/, supaya tidak bergantung pada berkas apa
    // yang ikut terbundel ke fungsi serverless.
    {
      const isi = fs.readFileSync(path.join(AKAR, 'public', 'stempel-hmif.png'));
      const kunci = storageKeys.aset('stempel-hmif.png');
      const sama = (await hashDiStorage(kunci)) === reg.hashIsi(isi);
      const aksi = sama ? 'TETAP' : 'UNGGAH';
      hitung[aksi] = (hitung[aksi] ?? 0) + 1;
      console.log(`  [${aksi.padEnd(10)}] ${'ASET stempel'.padEnd(23)}     ${kunci}`);
      if (!sama && !KERING) {
        await storage.put(kunci, isi, 'image/png', { upsert: true });
        if ((await hashDiStorage(kunci)) !== reg.hashIsi(isi)) throw new Error(`Verifikasi unggahan ${kunci} gagal.`);
      }
    }
  } finally {
    await sql.end();
  }

  const ringkas = Object.entries(hitung).map(([a, n]) => `${n} ${a}`).join(', ');
  console.log(`\n  ${gagal ? 'GAGAL' : 'LULUS'} — ${ringkas}\n`);
  return gagal ? 1 : 0;
}

main().then(
  (kode) => process.exit(kode),
  (e) => {
    console.error('\n  GALAT:', e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
