/**
 * e2e-restore — uji restore end-to-end terhadap bundel backup sungguhan.
 *
 *   npx tsx scripts/e2e-restore.ts [backupId]     (bawaan: backup SUKSES terbaru)
 *
 * Database dev dipakai bersama (dan isinya = produksi berdata dummy), jadi
 * setiap langkah yang MENGHAPUS/MENGGANTI data berjalan di dalam transaksi yang
 * selalu di-ROLLBACK — hasilnya diperiksa di dalam transaksi itu sendiri:
 *
 *   1. checksum seluruh berkas + setiap berkas storage dapat dibuka
 *      (docx/xlsx = ZIP sah, gambar terbaca sharp, json ter-parse)
 *   2. RESTORE PENUH dari full-dump.sql.gz: kosongkan semua tabel → jalankan
 *      dump → isi SETIAP tabel identik dengan modul JSON backup; diukur
 *      (target < 1 jam) — ROLLBACK
 *   3. prokers.json ke tabel proker KOSONG (strategi Tambah) → identik — ROLLBACK
 *   4. strategi Tambah / Timpa / Gabung pada satu baris yang diubah — ROLLBACK
 *   5. versi skema berbeda & audit-log Timpa ditolak dengan pesan jelas
 *
 * Keluar dengan kode 1 bila ada yang gagal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const AKAR = path.resolve(import.meta.dirname, '..');

function muatEnv(): void {
  const f = path.join(AKAR, '.env.local');
  if (!fs.existsSync(f)) return;
  for (const baris of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    if (process.env[k] === undefined)
      process.env[k] = t
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
  }
}

const ROLLBACK = '__ROLLBACK_UJI__';

async function main(): Promise<number> {
  muatEnv();
  const PizZip = (await import('pizzip')).default;
  const sharp = (await import('sharp')).default;
  const { db } = await import('@/lib/db/client');
  const { storage, keys } = await import('@/lib/storage');
  const { DAFTAR_MODUL, MODUL_BACKUP, versiSkema, migrasiTerakhir } =
    await import('@/lib/backup/export-modul');
  const { imporModul, strategiSah, validasiModul } = await import('@/lib/backup/import-modul');
  const { JALUR, verifikasiBerkas } = await import('@/lib/backup/manifest');
  const { cekKecocokan, muatManifest, pulihkanDump } = await import('@/lib/backup/restore');
  const { NAMA_INDEKS } = await import('@/lib/backup/zip-storage');
  type ModulBackup = (typeof DAFTAR_MODUL)[number];

  const gagal: string[] = [];
  const cek = (ok: boolean, label: string) => {
    console.log(`  [${ok ? ' OK ' : 'GAGAL'}] ${label}`);
    if (!ok) gagal.push(label);
  };
  const detik = (t: number) => `${((Date.now() - t) / 1000).toFixed(1)} dtk`;

  const id =
    process.argv[2] ??
    (
      await db.backup.findFirst({
        where: { status: 'SUKSES' },
        orderBy: { created_at: 'desc' },
        select: { id: true },
      })
    )?.id;
  if (!id) {
    console.error(
      '  Tidak ada backup SUKSES. Jalankan dulu: npx tsx scripts/verify-backup.ts --jalankan',
    );
    return 1;
  }
  console.log(`  Backup ${id}`);
  const m = await muatManifest(id);
  const sistem = { versiSkema: versiSkema(), migrasiTerakhir: await migrasiTerakhir() };
  const tolak = cekKecocokan(m, sistem, 'PENUH');
  cek(tolak === null, `bundel cocok untuk restore penuh${tolak ? `: ${tolak}` : ''}`);
  if (tolak) return 1;

  // 1. Checksum + berkas dapat dibuka.
  let t0 = Date.now();
  const isi = new Map<string, Buffer>();
  const v = await verifikasiBerkas(m, async (p) => {
    const b = await storage.get(keys.backupBerkas(id, p));
    isi.set(p, b);
    return b;
  });
  cek(v.ok, `${m.files.length} berkas cocok checksum (${detik(t0)})`);
  let dibuka = 0;
  const korup: string[] = [];
  for (let n = 1; n <= m.volumeArsip; n++) {
    const zip = new PizZip(isi.get(JALUR.arsip(n))!);
    const indeks = JSON.parse(zip.file(NAMA_INDEKS)!.asText()) as { key: string }[];
    for (const e of indeks) {
      const b = zip.file(e.key)!.asNodeBuffer();
      try {
        if (/\.(docx|xlsx)$/i.test(e.key)) new PizZip(b).file('[Content_Types].xml')!.asText();
        else if (/\.(jpe?g|png|webp)$/i.test(e.key)) await sharp(b).metadata();
        else if (/\.json$/i.test(e.key)) JSON.parse(b.toString('utf8'));
        dibuka++;
      } catch {
        korup.push(e.key);
      }
    }
  }
  cek(
    korup.length === 0 && dibuka === m.jumlahBerkasStorage,
    `${dibuka} berkas storage dapat dibuka${korup.length ? ` (korup: ${korup.join(', ')})` : ''}`,
  );

  const modulJson = new Map<ModulBackup, { tabel: Record<string, unknown[]> }>();
  for (const modul of DAFTAR_MODUL)
    modulJson.set(modul, JSON.parse(isi.get(JALUR.modul(modul))!.toString('utf8')));

  /** Isi tabel identik dengan larik JSON backup (urutan diabaikan). */
  const SAMA = (t: string) => `
    SELECT (SELECT coalesce(jsonb_agg(x ORDER BY x::text), '[]'::jsonb) FROM jsonb_array_elements($1::text::jsonb) x)
         = (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), '[]'::jsonb) FROM public."${t}" r) AS sama`;

  // 2. Restore penuh dari .sql.gz — di-rollback.
  t0 = Date.now();
  const sql = gunzipSync(isi.get(JALUR.dump)!).toString('utf8');
  const tidakSama: string[] = [];
  const hasilDump = await pulihkanDump(m, sql, {
    kering: true,
    periksa: async (tx) => {
      for (const modul of DAFTAR_MODUL) {
        for (const t of MODUL_BACKUP[modul]) {
          const rows = modulJson.get(modul)!.tabel[t] ?? [];
          if (t === 'audit_log') {
            // audit_log tidak dikosongkan (INV-06): setiap baris backup harus ADA & identik.
            const [r] = await tx.unsafe<{ n: number }[]>(
              `SELECT count(*)::int AS n FROM jsonb_array_elements($1::text::jsonb) x
                 LEFT JOIN audit_log a ON a.id = (x->>'id')::bigint
                WHERE to_jsonb(a) IS DISTINCT FROM x`,
              [JSON.stringify(rows)],
            );
            if (r!.n) tidakSama.push(`audit_log (${r!.n} baris)`);
            continue;
          }
          const [r] = await tx.unsafe<{ sama: boolean }[]>(SAMA(t), [JSON.stringify(rows)]);
          if (!r!.sama) tidakSama.push(t);
        }
      }
    },
  });
  cek(
    tidakSama.length === 0,
    `restore penuh dari .sql.gz: ${hasilDump.tabelDikosongkan} tabel dikosongkan & dipulihkan identik${tidakSama.length ? ` (beda: ${tidakSama.join(', ')})` : ''} — di-rollback`,
  );
  const durasiPenuh = (Date.now() - t0) / 1000;
  cek(durasiPenuh < 3600, `durasi restore database ${durasiPenuh.toFixed(1)} dtk (< 1 jam)`);

  // 3. prokers.json ke tabel kosong.
  const vProker = validasiModul('prokers', modulJson.get('prokers'), sistem.versiSkema);
  cek(vProker.ok, 'prokers.json lolos validasi skema');
  if (vProker.ok) {
    const beda: string[] = [];
    let ringkas = '';
    await db
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
          for (const t of MODUL_BACKUP.prokers)
            await tx.$executeRawUnsafe(`DELETE FROM public."${t}"`);
          const h = await imporModul(tx, vProker.data, 'TAMBAH', { terapkan: true });
          ringkas = h.map((x) => `${x.tabel} ${x.tertulis}`).join(', ');
          for (const t of MODUL_BACKUP.prokers) {
            const [r] = await tx.$queryRawUnsafe<{ sama: boolean }[]>(
              SAMA(t),
              JSON.stringify(vProker.data.tabel[t] ?? []),
            );
            if (!r!.sama) beda.push(t);
          }
          throw new Error(ROLLBACK);
        },
        { timeout: 300_000, maxWait: 20_000 },
      )
      .catch((e: Error) => {
        if (e.message !== ROLLBACK) throw e;
      });
    cek(
      beda.length === 0,
      `prokers.json → tabel kosong menghasilkan proker identik (${ringkas})${beda.length ? ` beda: ${beda.join(', ')}` : ''} — di-rollback`,
    );
  }

  // 4. Strategi pada satu proker yang diubah di database.
  const proker = (vProker.ok ? (vProker.data.tabel.proker ?? []) : [])[0] as
    Record<string, unknown> | undefined;
  if (vProker.ok && proker) {
    const kosong = Object.keys(proker).find(
      (k) => proker[k] === null && ['deskripsi', 'alasan_penolakan', 'catatan'].includes(k),
    );
    const hasil: Record<string, { nama: string; lain: string | null; ringkas: string }> = {};
    for (const s of ['TAMBAH', 'TIMPA', 'GABUNG'] as const) {
      await db
        .$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
            await tx.$executeRawUnsafe(
              `UPDATE proker SET nama = 'DIUBAH-UJI' WHERE id = $1::uuid`,
              proker.id,
            );
            if (kosong)
              await tx.$executeRawUnsafe(
                `UPDATE proker SET "${kosong}" = 'nilai-lokal' WHERE id = $1::uuid`,
                proker.id,
              );
            const h = await imporModul(tx, { ...vProker.data, tabel: { proker: [proker] } }, s, {
              terapkan: true,
            });
            const [r] = await tx.$queryRawUnsafe<{ nama: string; lain: string | null }[]>(
              `SELECT nama, ${kosong ? `"${kosong}"` : 'NULL'}::text AS lain FROM proker WHERE id = $1::uuid`,
              proker.id,
            );
            hasil[s] = { ...r!, ringkas: `berubah ${h[0]!.berubah}, tertulis ${h[0]!.tertulis}` };
            throw new Error(ROLLBACK);
          },
          { timeout: 120_000 },
        )
        .catch((e: Error) => {
          if (e.message !== ROLLBACK) throw e;
        });
    }
    cek(
      hasil.TAMBAH!.nama === 'DIUBAH-UJI',
      `Tambah melewati baris yang sudah ada (${hasil.TAMBAH!.ringkas})`,
    );
    cek(
      hasil.TIMPA!.nama === proker.nama && (!kosong || hasil.TIMPA!.lain === null),
      `Timpa mengganti seluruh kolom (${hasil.TIMPA!.ringkas})`,
    );
    cek(
      hasil.GABUNG!.nama === proker.nama && (!kosong || hasil.GABUNG!.lain === 'nilai-lokal'),
      `Gabung memperbarui kolom berbeda, mempertahankan nilai lokal di kolom kosong backup${kosong ? ` (${kosong})` : ''} (${hasil.GABUNG!.ringkas})`,
    );
  }

  // 5. Penolakan.
  const salahVersi = cekKecocokan({ ...m, versiSkema: '0' }, sistem, 'MODUL');
  cek(
    !!salahVersi &&
      salahVersi.includes('backup v0') &&
      salahVersi.includes(`sistem v${sistem.versiSkema}`),
    `versi skema berbeda ditolak: "${salahVersi}"`,
  );
  cek(!!strategiSah('audit-log', 'TIMPA'), 'audit-log hanya boleh Tambah (INV-06)');

  await db.$disconnect();
  console.log(
    gagal.length
      ? `\n  ${gagal.length} pemeriksaan GAGAL.`
      : `\n  Restore end-to-end terverifikasi (database tidak diubah — seluruh uji di-rollback).`,
  );
  return gagal.length ? 1 : 0;
}

main().then(
  (k) => process.exit(k),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
