/**
 * export-modul — membaca isi database untuk Lapis 1 (dump SQL) dan Lapis 2
 * (JSON per modul) sekaligus. SERVER-ONLY.
 *
 * Setiap tabel dibaca SEKALI sebagai JSON (`jsonb_agg(to_jsonb(t))`, teks
 * apa adanya dari Postgres — angka NUMERIC tidak pernah melewati `Number`
 * JavaScript), lalu teks yang sama dipakai dua kali:
 *   - modul `{nama}.json`  : `{ modul, versiSkema, dibuatPada, tabel: {…} }`
 *   - dump fallback        : `INSERT … SELECT … FROM jsonb_populate_recordset`
 *
 * Lapis 1 mencoba `pg_dump` lebih dulu (koneksi langsung, DIRECT_URL). Di
 * serverless binary-nya tidak ada → fallback SQL per tabel, dan
 * keterbatasannya ditulis ke manifest: data saja, tanpa DDL — pulihkan ke
 * database yang sudah dimigrasi sampai `migrasiTerakhir`.
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-110 · PRD F-16.1 · SYSTEM_DESIGN §15.1
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import ExcelJS from 'exceljs';

import { db } from '@/lib/db/client';

if (typeof window !== 'undefined') {
  throw new Error('lib/backup/export-modul.ts adalah modul server-only.');
}

/**
 * 12 modul PRD F-16.1 beserta tabelnya. Setiap tabel `public` kecuali
 * `TABEL_DIKECUALIKAN` wajib masuk tepat satu modul — `tabelTanpaModul`
 * memeriksanya terhadap database sungguhan setiap kali backup berjalan.
 */
export const MODUL_BACKUP = {
  users: ['app_user', 'invitation', 'signature'],
  periode: ['periode', 'app_config'],
  departemen: ['departemen', 'divisi_preset', 'ruangan', 'booking_ruangan'],
  prokers: [
    'proker',
    'proker_lock',
    'proker_draft',
    'proker_rencana',
    'proker_revisi',
    'proker_progress_signal',
    'deadline_ringkasan',
    'kanban_card',
    'checklist_template',
    'checklist_template_item',
    'checklist_item',
    'kendala',
    'kendala_reply',
    'kendala_lampiran',
  ],
  gantt: ['gantt_chart', 'gantt_group', 'gantt_task', 'gantt_dependency'],
  kepanitiaan: [
    'kepanitiaan',
    'divisi',
    'divisi_member',
    'job_desk',
    'rundown',
    'peserta',
    'tor',
    'proposal',
    'lpj',
    'dokumen',
  ],
  rab: ['rab_meta', 'rab_section', 'rab_item', 'pemasukan'],
  nota: ['image', 'nota', 'nota_alokasi'],
  surat: ['surat_template', 'surat_counter', 'surat', 'surat_signer', 'tujuan_surat_preset'],
  notulensi: ['notulensi', 'notulensi_attendance', 'notulensi_lampiran', 'action_item'],
  pengurus: ['user_role', 'pengurus'],
  'audit-log': ['audit_log'],
} as const satisfies Record<string, readonly string[]>;

export type ModulBackup = keyof typeof MODUL_BACKUP;
export const DAFTAR_MODUL = Object.keys(MODUL_BACKUP) as ModulBackup[];

/**
 * Tidak ikut dump maupun modul: `_migrasi` milik runner migrasi (dipulihkan
 * dengan menjalankan migrasi), `backup` adalah catatan backup itu sendiri —
 * memulihkannya akan menghapus jejak backup PRA_RESTORE yang baru dibuat;
 * `restore_job` (T-112) adalah riwayat restore itu sendiri.
 */
export const TABEL_DIKECUALIKAN = ['_migrasi', 'backup', 'restore_job'] as const;

export interface IsiTabel {
  nama: string;
  /** Kolom yang ditulis saat pemulihan (kolom GENERATED dilewati). */
  kolom: string[];
  /** Kolom ber-default `nextval` — sequence-nya disetel ulang setelah insert. */
  serial: string[];
  jumlah: number;
  /** `jsonb_pretty(jsonb_agg(...))` — larik JSON baris tabel. */
  json: string;
}

const POLA_IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(nama: string): string {
  if (!POLA_IDENT.test(nama)) throw new Error(`Nama tabel/kolom tidak sah: ${nama}`);
  return `"${nama}"`;
}

/**
 * Versi skema kompatibilitas — `SCHEMA_VERSION` (ENV_SETUP: dinaikkan manual
 * saat skema berubah tidak kompatibel). Restore (T-112) menolak bundel yang
 * versinya berbeda.
 */
export function versiSkema(): string {
  const v = process.env.SCHEMA_VERSION?.trim();
  if (!v)
    throw new Error(
      'SCHEMA_VERSION belum diisi — versi skema backup tidak dapat ditentukan. Jalankan: npm run check:env',
    );
  return v;
}

/** Nama migrasi terakhir yang terpasang — titik migrasi yang dibutuhkan dump data. */
export async function migrasiTerakhir(): Promise<string> {
  const r = await db.$queryRaw<{ nama: string | null }[]>`SELECT max(nama) AS nama FROM _migrasi`;
  const v = r[0]?.nama;
  if (!v) throw new Error('Tabel _migrasi kosong — versi skema tidak dapat ditentukan.');
  return v.replace(/\.sql$/, '');
}

/** Tabel `public` yang tidak dikecualikan dan tidak termasuk modul mana pun. */
export async function tabelTanpaModul(): Promise<string[]> {
  const ada = await db.$queryRaw<{ relname: string }[]>`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`;
  const dikenal = new Set<string>([...TABEL_DIKECUALIKAN, ...Object.values(MODUL_BACKUP).flat()]);
  return ada.map((r) => r.relname).filter((t) => !dikenal.has(t));
}

export async function bacaTabel(nama: string): Promise<IsiTabel> {
  const t = ident(nama);
  const kolom = await db.$queryRawUnsafe<{ attname: string; serial: boolean }[]>(
    `SELECT a.attname,
            coalesce(pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%', false) AS serial
       FROM pg_attribute a
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      ORDER BY a.attnum`,
    `public.${t}`,
  );
  const [isi] = await db.$queryRawUnsafe<{ jumlah: number; json: string }[]>(
    `SELECT count(*)::int AS jumlah,
            jsonb_pretty(coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)) AS json
       FROM public.${t} x`,
  );
  return {
    nama,
    kolom: kolom.map((k) => k.attname),
    serial: kolom.filter((k) => k.serial).map((k) => k.attname),
    jumlah: isi!.jumlah,
    json: isi!.json,
  };
}

export interface MetaBundel {
  versiSkema: string;
  migrasiTerakhir: string;
  dibuatPada: string;
}

/** Isi `modules/{modul}.json`. Disusun sebagai teks supaya JSON dari Postgres tidak di-parse ulang. */
export function susunModul(modul: string, tabel: IsiTabel[], meta: MetaBundel): Buffer {
  const bagian = tabel.map(
    (t) => `    ${JSON.stringify(t.nama)}: ${t.json.replace(/\n/g, '\n    ')}`,
  );
  const teks =
    `{\n  "modul": ${JSON.stringify(modul)},\n  "versiSkema": ${JSON.stringify(meta.versiSkema)},\n` +
    `  "migrasiTerakhir": ${JSON.stringify(meta.migrasiTerakhir)},\n` +
    `  "dibuatPada": ${JSON.stringify(meta.dibuatPada)},\n  "tabel": {\n${bagian.join(',\n')}\n  }\n}\n`;
  return Buffer.from(teks, 'utf8');
}

/** Batas kasar satu pernyataan INSERT dump — pooler Supabase memutus kueri belasan MB. */
export const BATAS_PERNYATAAN = 1_000_000;

/**
 * Memecah larik `jsonb_pretty` (elemen tingkat atas berupa objek yang dibuka
 * `    {` dan ditutup `    }` pada indentasi 4) menjadi beberapa larik
 * ≤ `batas` karakter, TANPA parse ulang — angka NUMERIC tetap apa adanya.
 * Format tak dikenal → satu potong utuh.
 */
export function pecahLarikJson(json: string, batas = BATAS_PERNYATAAN): string[] {
  if (json.length <= batas) return [json];
  const baris = json.split('\n');
  if (baris[0] !== '[' || baris.at(-1) !== ']') return [json];
  const elemen: string[] = [];
  let kini: string[] = [];
  for (const b of baris.slice(1, -1)) {
    kini.push(b);
    if (b === '    }' || b === '    },') {
      elemen.push(kini.join('\n').replace(/,$/, ''));
      kini = [];
    }
  }
  if (kini.length || !elemen.length) return [json];
  const potong: string[] = [];
  let isi: string[] = [];
  let panjang = 0;
  for (const e of elemen) {
    if (isi.length && panjang + e.length > batas) {
      potong.push(`[\n${isi.join(',\n')}\n]`);
      isi = [];
      panjang = 0;
    }
    isi.push(e);
    panjang += e.length + 2;
  }
  potong.push(`[\n${isi.join(',\n')}\n]`);
  return potong;
}

/** Tag dollar-quote yang dijamin tidak muncul di dalam data. */
function tagAman(teks: string): string {
  for (;;) {
    const tag = `$hmif_${randomBytes(6).toString('hex')}$`;
    if (!teks.includes(tag)) return tag;
  }
}

/**
 * Dump fallback: data seluruh tabel sebagai SQL yang dapat dijalankan `psql`
 * pada database ber-skema sama. `session_replication_role = replica`
 * mematikan trigger & pengecekan FK selama pemulihan (setara `pg_dump
 * --disable-triggers`), sehingga urutan tabel tidak penting.
 */
export function susunDumpSql(tabel: IsiTabel[], meta: MetaBundel): string {
  const baris: string[] = [
    '-- HMIF Center — dump data per tabel (fallback tanpa pg_dump)',
    `-- Versi skema : ${meta.versiSkema} (migrasi terakhir ${meta.migrasiTerakhir})`,
    `-- Dibuat      : ${meta.dibuatPada}`,
    '-- Hanya DATA, tanpa DDL. Pulihkan ke database yang sudah dimigrasi sampai migrasi',
    '-- terakhir di atas (npm run db:migrate), lalu: psql "$DIRECT_URL" -f full-dump.sql',
    '',
    'BEGIN;',
    'SET LOCAL session_replication_role = replica;',
    '',
  ];
  for (const t of tabel) {
    const kol = t.kolom.map(ident).join(', ');
    baris.push(`-- ${t.nama}: ${t.jumlah} baris`);
    if (t.jumlah > 0) {
      const tag = tagAman(t.json);
      for (const potong of pecahLarikJson(t.json)) {
        baris.push(
          `INSERT INTO public.${ident(t.nama)} (${kol})\n  SELECT ${kol} FROM jsonb_populate_recordset(NULL::public.${ident(t.nama)}, ${tag}${potong}${tag}::jsonb)\n  ON CONFLICT DO NOTHING;`,
        );
      }
    }
    for (const s of t.serial) {
      baris.push(
        `SELECT setval(pg_get_serial_sequence('public.${ident(t.nama)}', '${s}'), coalesce((SELECT max(${ident(s)}) FROM public.${ident(t.nama)}), 0) + 1, false);`,
      );
    }
    baris.push('');
  }
  baris.push('COMMIT;', '');
  return baris.join('\n');
}

/**
 * `pg_dump` lewat koneksi langsung. `null` + alasan bila binary tak tersedia
 * atau gagal (mis. versi klien lebih tua dari server) — pemanggil memakai
 * fallback dan mencatat alasannya. Kata sandi lewat PGPASSWORD, bukan argumen
 * baris perintah yang terlihat di daftar proses.
 */
export async function pgDump(batasMs = 10 * 60_000): Promise<{ sql: Buffer } | { gagal: string }> {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) return { gagal: 'DIRECT_URL tidak diset' };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { gagal: 'DIRECT_URL tidak dapat diurai' };
  }
  const sandi = decodeURIComponent(u.password);
  u.password = '';
  const bin = process.env.PG_DUMP_PATH || 'pg_dump';

  return new Promise((selesai) => {
    const potongan: Buffer[] = [];
    let galat = '';
    let p: ReturnType<typeof spawn>;
    try {
      p = spawn(
        bin,
        [
          '--no-owner',
          '--no-privileges',
          '--schema=public',
          '--format=plain',
          `--dbname=${u.toString()}`,
        ],
        {
          env: { ...process.env, PGPASSWORD: sandi, PGSSLMODE: 'require' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch (e) {
      selesai({
        gagal: `pg_dump tidak dapat dijalankan: ${e instanceof Error ? e.message : String(e)}`,
      });
      return;
    }
    const pewaktu = setTimeout(() => p.kill('SIGKILL'), batasMs);
    p.stdout!.on('data', (b: Buffer) => potongan.push(b));
    p.stderr!.on('data', (b: Buffer) => {
      galat = (galat + b.toString()).slice(-500);
    });
    p.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(pewaktu);
      selesai({
        gagal:
          e.code === 'ENOENT'
            ? 'binary pg_dump tidak tersedia di lingkungan ini'
            : `pg_dump gagal: ${e.message}`,
      });
    });
    p.on('close', (kode) => {
      clearTimeout(pewaktu);
      if (kode === 0 && potongan.length) selesai({ sql: Buffer.concat(potongan) });
      else
        selesai({ gagal: `pg_dump keluar dengan kode ${kode}: ${galat.trim() || 'tanpa pesan'}` });
    });
  });
}

// ---------------------------------------------------------------------------
// exports/daftar-surat.xlsx — register surat seluruh periode
// ---------------------------------------------------------------------------

const KOLOM_SURAT = [
  ['Periode', 14],
  ['Nomor Surat', 34],
  ['Tanggal', 12],
  ['Perihal', 40],
  ['Tujuan', 32],
  ['Status', 14],
  ['Kode', 8],
  ['Acara / Departemen', 28],
  ['Dibuat oleh', 24],
  ['Disetujui oleh', 24],
] as const;

export async function daftarSuratXlsx(): Promise<{ xlsx: Buffer; jumlah: number }> {
  const baris = await db.surat.findMany({
    orderBy: [
      { periode: { tanggal_mulai: 'asc' } },
      { tanggal_surat: 'asc' },
      { nomor_urut: 'asc' },
      { created_at: 'asc' },
    ],
    select: {
      nomor_lengkap: true,
      tanggal_surat: true,
      perihal: true,
      tujuan_nama: true,
      status: true,
      kode_surat: true,
      periode: { select: { nama: true } },
      kepanitiaan: { select: { nama_acara: true } },
      departemen: { select: { nama: true } },
      app_user_surat_dibuat_olehToapp_user: { select: { nama_lengkap: true } },
      app_user_surat_disetujui_olehToapp_user: { select: { nama_lengkap: true } },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HMIF Center';
  const ws = wb.addWorksheet('Daftar Surat');
  ws.columns = KOLOM_SURAT.map(([header, width]) => ({ header, width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const s of baris) {
    ws.addRow([
      s.periode.nama,
      s.nomor_lengkap ?? '(belum bernomor)',
      s.tanggal_surat.toISOString().slice(0, 10),
      s.perihal,
      s.tujuan_nama,
      s.status,
      s.kode_surat,
      s.kepanitiaan?.nama_acara ?? s.departemen?.nama ?? '',
      s.app_user_surat_dibuat_olehToapp_user.nama_lengkap,
      s.app_user_surat_disetujui_olehToapp_user?.nama_lengkap ?? '',
    ]);
  }
  return { xlsx: Buffer.from(await wb.xlsx.writeBuffer()), jumlah: baris.length };
}
