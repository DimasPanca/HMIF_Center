/**
 * import-modul — impor `modules/{modul}.json` hasil backup ke database
 * (PRD F-16.3). SERVER-ONLY.
 *
 * Tiga strategi, per baris berdasarkan PRIMARY KEY:
 *   TAMBAH  baris baru disisipkan; yang sudah ada (PK atau unik lain) DILEWATI
 *   TIMPA   baris baru disisipkan; yang sudah ada diganti seluruh kolomnya
 *   GABUNG  baris baru disisipkan; yang sudah ada hanya diperbarui pada kolom
 *           yang di backup TIDAK kosong dan berbeda — nilai sekarang yang tak
 *           punya padanan di backup dipertahankan
 * Pratinjau = perhitungan yang sama tanpa menulis (baru / berubah / sama).
 *
 * Kolom yang ditulis = kolom tabel sekarang ∩ kunci di JSON backup, sehingga
 * kolom yang ditambahkan migrasi setelah backup memakai nilai bawaannya.
 * Selama impor `session_replication_role = replica`: trigger domain (alur
 * LPJ, updated_at, audit per baris) tidak ikut campur, supaya data kembali
 * IDENTIK. Constraint CHECK/UNIQUE/EXCLUDE tetap berlaku. Jejaknya dicatat
 * sekali per restore (lib/backup/restore.ts).
 *
 * audit_log append-only (INV-06): modul `audit-log` HANYA boleh TAMBAH —
 * TIMPA/GABUNG berarti menyunting jejak audit, dan trigger penjaganya ikut
 * mati di mode replica.
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-112 · PRD F-16.3 · SYSTEM_DESIGN §15.3
 */

import { z } from 'zod';

import type { TxKlien } from '@/lib/db/with-audit-context';

import { MODUL_BACKUP, type ModulBackup } from './export-modul';

if (typeof window !== 'undefined') {
  throw new Error('lib/backup/import-modul.ts adalah modul server-only.');
}

export const STRATEGI = ['TAMBAH', 'TIMPA', 'GABUNG'] as const;
export type Strategi = (typeof STRATEGI)[number];

export const SkemaModulJson = z.object({
  modul: z.string(),
  versiSkema: z.string().min(1),
  migrasiTerakhir: z.string().min(1),
  dibuatPada: z.string(),
  tabel: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type ModulJson = z.infer<typeof SkemaModulJson>;

export interface RingkasTabel {
  tabel: string;
  /** Baris di berkas backup. */
  total: number;
  /** Belum ada di database → akan/telah disisipkan (TAMBAH: dikurangi bentrok unik lain). */
  baru: number;
  /** Sudah ada dan berbeda → ditimpa/digabung (TAMBAH: dilewati). */
  berubah: number;
  /** Sudah ada dan identik → tidak ada perubahan. */
  sama: number;
  /** Hanya setelah diterapkan: baris yang benar-benar tertulis. */
  tertulis?: number;
}

/**
 * Validasi berkas modul sebelum apa pun disentuh (F-16.3 "Validasi skema"):
 * bentuk JSON, nama modul, tabel milik modulnya, dan versi skema.
 */
export function validasiModul(
  modul: ModulBackup,
  isi: unknown,
  versiSistem: string,
): { ok: true; data: ModulJson } | { ok: false; pesan: string } {
  const p = SkemaModulJson.safeParse(isi);
  if (!p.success)
    return {
      ok: false,
      pesan: `Berkas modul ${modul} tidak sesuai skema export: ${p.error.issues[0]?.message ?? 'bentuk salah'}.`,
    };
  if (p.data.modul !== modul)
    return { ok: false, pesan: `Berkas berisi modul "${p.data.modul}", bukan "${modul}".` };
  if (p.data.versiSkema !== versiSistem) {
    return {
      ok: false,
      pesan: `Versi skema tidak cocok: backup v${p.data.versiSkema}, sistem v${versiSistem}.`,
    };
  }
  const dikenal = new Set<string>(MODUL_BACKUP[modul]);
  const asing = Object.keys(p.data.tabel).filter((t) => !dikenal.has(t));
  if (asing.length)
    return { ok: false, pesan: `Tabel ${asing.join(', ')} bukan bagian modul ${modul}.` };
  return { ok: true, data: p.data };
}

export function strategiSah(modul: ModulBackup, strategi: Strategi): string | null {
  return modul === 'audit-log' && strategi !== 'TAMBAH'
    ? 'Audit log bersifat append-only (INV-06): hanya strategi Tambah yang diizinkan.'
    : null;
}

const POLA_IDENT = /^[a-z_][a-z0-9_]*$/;
function q(nama: string): string {
  if (!POLA_IDENT.test(nama)) throw new Error(`Identifier tidak sah: ${nama}`);
  return `"${nama}"`;
}

async function strukturTabel(
  tx: TxKlien,
  tabel: string,
): Promise<{ kolom: string[]; pk: string[]; serial: string[] }> {
  const baris = await tx.$queryRawUnsafe<{ attname: string; pk: boolean; serial: boolean }[]>(
    `SELECT a.attname,
            coalesce(a.attnum = ANY (i.indkey), false) AS pk,
            coalesce(pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%', false) AS serial
       FROM pg_attribute a
       LEFT JOIN pg_index i ON i.indrelid = a.attrelid AND i.indisprimary
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      ORDER BY a.attnum`,
    `public.${q(tabel)}`,
  );
  return {
    kolom: baris.map((b) => b.attname),
    pk: baris.filter((b) => b.pk).map((b) => b.attname),
    serial: baris.filter((b) => b.serial).map((b) => b.attname),
  };
}

/**
 * Pratinjau atau terapkan satu tabel. `tx` WAJIB transaksi yang sudah
 * `SET LOCAL session_replication_role = replica` (lihat `imporModul`).
 */
async function imporTabel(
  tx: TxKlien,
  tabel: string,
  baris: Record<string, unknown>[],
  strategi: Strategi,
  terapkan: boolean,
): Promise<RingkasTabel> {
  const t = q(tabel);
  // Tabel kosong di backup: tidak ada yang disisipkan atau dibandingkan (dan
  // tidak ada kunci JSON untuk dicocokkan dengan kolom).
  if (!baris.length)
    return { tabel, total: 0, baru: 0, berubah: 0, sama: 0, ...(terapkan ? { tertulis: 0 } : {}) };
  const { kolom: semua, pk, serial } = await strukturTabel(tx, tabel);
  if (!pk.length)
    throw new Error(`Tabel ${tabel} tanpa primary key — tidak dapat diimpor per baris.`);
  const dariBackup = new Set(baris.flatMap((b) => Object.keys(b)));
  const kolom = semua.filter((k) => dariBackup.has(k));
  for (const k of pk)
    if (!kolom.includes(k))
      throw new Error(`Kolom kunci ${tabel}.${k} tidak ada di berkas backup.`);
  const bukanKolom = semua.filter((k) => !kolom.includes(k));
  const daftar = kolom.map(q).join(', ');
  const tmp = q(`_imp_${tabel}`);

  await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tmp}`);
  await tx.$executeRawUnsafe(
    `CREATE TEMP TABLE ${tmp} (LIKE public.${t} INCLUDING DEFAULTS) ON COMMIT DROP`,
  );
  if (baris.length) {
    await tx.$executeRawUnsafe(
      `INSERT INTO ${tmp} (${daftar}) SELECT ${daftar} FROM jsonb_populate_recordset(NULL::public.${t}, $1::text::jsonb)`,
      JSON.stringify(baris),
    );
  }

  const gabung = pk.map((k) => `i.${q(k)} = e.${q(k)}`).join(' AND ');
  const sisa = `ARRAY[${bukanKolom.map((k) => `'${k}'`).join(',')}]::text[]`;
  // GABUNG hanya "berubah" bila ada kolom backup yang TIDAK kosong dan berbeda.
  const sumber =
    strategi === 'GABUNG' ? `jsonb_strip_nulls(to_jsonb(i) - ${sisa})` : `(to_jsonb(i) - ${sisa})`;
  const beda = `EXISTS (SELECT 1 FROM jsonb_each(${sumber}) x WHERE to_jsonb(e) -> x.key IS DISTINCT FROM x.value)`;
  const [r] = await tx.$queryRawUnsafe<{ baru: number; berubah: number; sama: number }[]>(
    `SELECT count(*) FILTER (WHERE e.ctid IS NULL)::int AS baru,
            count(*) FILTER (WHERE e.ctid IS NOT NULL AND ${beda})::int AS berubah,
            count(*) FILTER (WHERE e.ctid IS NOT NULL AND NOT ${beda})::int AS sama
       FROM ${tmp} i LEFT JOIN public.${t} e ON ${gabung}`,
  );
  const ringkas: RingkasTabel = {
    tabel,
    total: baris.length,
    baru: r!.baru,
    berubah: r!.berubah,
    sama: r!.sama,
  };
  if (!terapkan) return ringkas;

  const nonPk = kolom.filter((k) => !pk.includes(k));
  const target = pk.map(q).join(', ');
  const aksi =
    strategi === 'TAMBAH' || !nonPk.length
      ? 'ON CONFLICT DO NOTHING'
      : `ON CONFLICT (${target}) DO UPDATE SET ${nonPk
          .map((k) =>
            strategi === 'TIMPA'
              ? `${q(k)} = EXCLUDED.${q(k)}`
              : `${q(k)} = COALESCE(EXCLUDED.${q(k)}, ${t}.${q(k)})`,
          )
          .join(', ')}`;
  const tertulis = await tx.$executeRawUnsafe(
    `INSERT INTO public.${t} AS ${t} (${daftar}) SELECT ${daftar} FROM ${tmp} ${aksi}`,
  );
  for (const s of serial) {
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('public.${t}', '${s}'), greatest(coalesce((SELECT max(${q(s)}) FROM public.${t}), 0), 1))`,
    );
  }
  return { ...ringkas, tertulis };
}

/**
 * Pratinjau (`terapkan: false`) atau impor satu modul. Dipanggil di dalam
 * transaksi; satu modul = satu transaksi, sehingga kegagalan di tengah
 * modul tidak meninggalkan setengah modul.
 */
export async function imporModul(
  tx: TxKlien,
  data: ModulJson,
  strategi: Strategi,
  opsi: { terapkan: boolean },
): Promise<RingkasTabel[]> {
  const modul = data.modul as ModulBackup;
  const tolak = strategiSah(modul, strategi);
  if (tolak) throw new Error(tolak);
  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
  const hasil: RingkasTabel[] = [];
  // Urutan MODUL_BACKUP (induk dulu) — FK memang mati di mode replica, tetapi
  // laporan lebih mudah dibaca dalam urutan yang sama dengan berkasnya.
  for (const tabel of MODUL_BACKUP[modul]) {
    const baris = data.tabel[tabel];
    if (!baris) continue;
    hasil.push(await imporTabel(tx, tabel, baris, strategi, opsi.terapkan));
  }
  return hasil;
}
