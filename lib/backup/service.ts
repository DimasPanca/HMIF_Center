/**
 * service — orkestrasi backup tiga lapis (SYSTEM_DESIGN §15.1). SERVER-ONLY.
 *
 *   mulaiBackup    baris `backup` BERJALAN (di dalam transaksi ber-audit)
 *   prosesBackup   menulis bundel, memverifikasi, lalu SUKSES/GAGAL
 *   jalankanBackup keduanya berurutan — cron & pra-restore
 *
 * ===========================================================================
 * TIDAK ADA BUNDEL SETENGAH JADI YANG TAMPAK SUKSES (kontrak 6)
 * ===========================================================================
 * 1. Setiap berkas diunggah, lalu SELURUHNYA diunduh ulang dan dicocokkan
 *    SHA-256-nya dengan manifest.
 * 2. `manifest.json` ditulis paling akhir — bundel tanpa manifest = tidak
 *    pernah selesai.
 * 3. Baris baru menjadi SUKSES setelah manifest pun terbaca ulang identik.
 * Kegagalan di langkah mana pun: berkas yang sempat terunggah dihapus,
 * baris menjadi GAGAL dengan pesan (constraint `backup_gagal_wajib_pesan`).
 * Backup yang terputus di tengah (fungsi serverless habis waktu) ditandai
 * GAGAL oleh `tandaiTerhenti` setelah `BATAS_BERJALAN_MS`.
 *
 * Progres disimpan di kolom `manifest` selama BERJALAN (`{ progres }`) dan
 * diganti manifest final saat SUKSES — UI Admin membacanya (kontrak 7).
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-110 · PRD F-16.1 · SYSTEM_DESIGN §15.1
 */

import { gzipSync } from 'node:zlib';

import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { eksporRabXlsx } from '@/lib/rab/excel-export';
import { dataEksporRabSistem } from '@/lib/rab/service';
import { buatAdapter, storage as storageBawaan } from '@/lib/storage';
import type { StorageAdapter } from '@/lib/storage/adapter';
import { keys } from '@/lib/storage/keys';

import {
  DAFTAR_MODUL,
  MODUL_BACKUP,
  bacaTabel,
  daftarSuratXlsx,
  pgDump,
  susunDumpSql,
  susunModul,
  tabelTanpaModul,
  migrasiTerakhir,
  versiSkema,
  type IsiTabel,
} from './export-modul';
import {
  FORMAT_MANIFEST,
  JALUR,
  MIME,
  entriBerkas,
  slug,
  verifikasiBerkas,
  type BerkasManifest,
  type Manifest,
} from './manifest';
import { zipStorage } from './zip-storage';

if (typeof window !== 'undefined') {
  throw new Error('lib/backup/service.ts adalah modul server-only.');
}

export type JenisBackup = 'OTOMATIS' | 'MANUAL' | 'PRA_RESTORE';

/** PRD F-16.2 / T-111 kontrak 4: backup manual per hari kalender WIB. */
export const BATAS_MANUAL_PER_HARI = 3;

/** Lebih lama dari ini masih BERJALAN = fungsinya sudah mati di tengah jalan. */
export const BATAS_BERJALAN_MS = 20 * 60_000;

export type TahapBackup =
  'MULAI' | 'DUMP' | 'MODUL' | 'EKSPOR' | 'ARSIP' | 'VERIFIKASI' | 'MANIFEST';

export interface Progres {
  tahap: TahapBackup;
  /** 0–100, perkiraan kasar per tahap. */
  persen: number;
  pesan: string;
}

const BOBOT: Record<TahapBackup, number> = {
  MULAI: 0,
  DUMP: 5,
  MODUL: 20,
  EKSPOR: 45,
  ARSIP: 55,
  VERIFIKASI: 85,
  MANIFEST: 97,
};

/** Sumber data — dapat diganti di test tanpa database/storage sungguhan. */
export interface SumberBackup {
  storage: Pick<StorageAdapter, 'put' | 'get' | 'list' | 'delete'>;
  versiSkema(): string;
  migrasiTerakhir(): Promise<string>;
  tabelTanpaModul(): Promise<string[]>;
  bacaTabel(nama: string): Promise<IsiTabel>;
  pgDump(): Promise<{ sql: Buffer } | { gagal: string }>;
  daftarAcara(): Promise<{ id: string; nama_acara: string }[]>;
  eksporRab(kepanitiaanId: string): Promise<Buffer | null>;
  daftarSurat(): Promise<{ xlsx: Buffer }>;
  /** Tujuan sinkronisasi kedua (Google Drive) — `null` bila `GDRIVE_ENABLED` bukan `true`. */
  drive: Pick<StorageAdapter, 'put'> | null;
}

/** Tempat status backup dicatat — baris `backup` + audit. */
export interface CatatanBackup {
  progres(id: string, p: Progres): Promise<void>;
  sukses(id: string, manifest: Manifest, ukuran: number): Promise<void>;
  gagal(id: string, pesan: string): Promise<void>;
  /** Hasil sinkronisasi Drive — kegagalannya PERINGATAN, backup tetap SUKSES (T-111). */
  sinkron(id: string, hasil: { ok: boolean; pesan: string }): Promise<void>;
}

export function sumberBawaan(): SumberBackup {
  return {
    storage: storageBawaan,
    versiSkema,
    migrasiTerakhir,
    tabelTanpaModul,
    bacaTabel,
    pgDump: () => pgDump(),
    daftarAcara: () =>
      db.kepanitiaan.findMany({
        orderBy: { created_at: 'asc' },
        select: { id: true, nama_acara: true },
      }),
    eksporRab: async (id) => {
      const d = await dataEksporRabSistem(id);
      return d ? eksporRabXlsx(d) : null;
    },
    daftarSurat: () => daftarSuratXlsx(),
    drive: process.env.GDRIVE_ENABLED === 'true' ? buatAdapter('gdrive') : null,
  };
}

async function audit(
  aksi: string,
  id: string,
  nilai: Record<string, unknown>,
  userId: string | null,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO audit_log (user_id, aksi, entitas, entitas_id, nilai_baru, user_agent, periode_id)
    VALUES (${userId}::uuid, ${aksi}, 'backup', ${id}, ${nilai as Prisma.InputJsonValue}::jsonb, 'sistem', periode_aktif())
  `;
}

export function catatanBawaan(): CatatanBackup {
  return {
    async progres(id, p) {
      await db.backup.updateMany({
        where: { id, status: 'BERJALAN' },
        data: { manifest: { progres: { ...p } } },
      });
    },
    async sukses(id, manifest, ukuran) {
      // Hanya dari BERJALAN: baris yang sudah ditandai terhenti tidak boleh
      // "hidup kembali" — pemanggil lalu membersihkan bundelnya.
      const r = await db.backup.updateMany({
        where: { id, status: 'BERJALAN' },
        data: {
          status: 'SUKSES',
          manifest: manifest as unknown as Prisma.InputJsonValue,
          ukuran_bytes: BigInt(ukuran),
          completed_at: new Date(),
        },
      });
      if (r.count !== 1)
        throw new Error('Backup sudah tidak berstatus BERJALAN (ditandai terhenti).');
      const b = await db.backup.findUniqueOrThrow({
        where: { id },
        select: { jenis: true, dibuat_oleh: true },
      });
      await audit(
        'BACKUP',
        id,
        {
          jenis: b.jenis,
          status: 'SUKSES',
          ukuran_bytes: ukuran,
          versi_skema: manifest.versiSkema,
          migrasi: manifest.migrasiTerakhir,
        },
        b.dibuat_oleh,
      );
    },
    async gagal(id, pesan) {
      const b = await db.backup.update({
        where: { id },
        data: { status: 'GAGAL', error_message: pesan.slice(0, 2000), completed_at: new Date() },
        select: { jenis: true, dibuat_oleh: true },
      });
      await audit(
        'BACKUP',
        id,
        { jenis: b.jenis, status: 'GAGAL', pesan: pesan.slice(0, 500) },
        b.dibuat_oleh,
      );
    },
    async sinkron(id, hasil) {
      // Disimpan di kolom manifest DB (bukan manifest.json yang ber-checksum)
      // di bawah key `sinkron` — scripts/verify-backup.ts mengabaikannya.
      const nilai = { gdrive: { ...hasil, pada: new Date().toISOString() } };
      await db.$executeRaw`
        UPDATE backup SET manifest = manifest || jsonb_build_object('sinkron', ${nilai as Prisma.InputJsonValue}::jsonb)
        WHERE id = ${id}::uuid`;
      await audit('BACKUP_SINKRON', id, { tujuan: 'gdrive', ...hasil }, null);
    },
  };
}

/** Backup BERJALAN yang melewati batas waktu → GAGAL. Mengembalikan jumlahnya. */
export async function tandaiTerhenti(sekarang = new Date()): Promise<number> {
  const r = await db.backup.updateMany({
    where: {
      status: 'BERJALAN',
      created_at: { lt: new Date(sekarang.getTime() - BATAS_BERJALAN_MS) },
    },
    data: {
      status: 'GAGAL',
      error_message: 'Backup terhenti sebelum selesai (proses melewati batas waktu).',
      completed_at: sekarang,
    },
  });
  return r.count;
}

export type HasilMulai =
  { ok: true; id: string } | { ok: false; kode: 'KONFLIK' | 'BATAS_HARIAN'; pesan: string };

/**
 * Membuat baris BERJALAN. Dipanggil di dalam `withAuditContext` (manual) atau
 * `withServiceContext` (cron/pra-restore) supaya audit memuat pelaku & IP.
 * Satu backup pada satu waktu: menulis dump selagi backup lain menulis dump
 * hanya menggandakan beban database.
 */
export async function mulaiBackup(
  tx: TxKlien,
  opts: { jenis: JenisBackup; userId?: string | null },
): Promise<HasilMulai> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hmif_backup'))`;
  const batas = new Date(Date.now() - BATAS_BERJALAN_MS);
  const jalan = await tx.backup.findFirst({
    where: { status: 'BERJALAN', created_at: { gte: batas } },
    select: { id: true },
  });
  if (jalan)
    return {
      ok: false,
      kode: 'KONFLIK',
      pesan: 'Backup lain sedang berjalan. Tunggu sampai selesai.',
    };

  // T-111 kontrak 4: backup manual maksimal 3 per hari kalender WIB — setiap
  // percobaan dihitung (yang gagal pun membebani database dan storage).
  if (opts.jenis === 'MANUAL') {
    const [n] = await tx.$queryRaw<{ jumlah: number }[]>`
      SELECT count(*)::int AS jumlah FROM backup
      WHERE jenis = 'MANUAL' AND created_at >= (hari_ini_jakarta()::timestamp AT TIME ZONE 'Asia/Jakarta')`;
    if ((n?.jumlah ?? 0) >= BATAS_MANUAL_PER_HARI) {
      return {
        ok: false,
        kode: 'BATAS_HARIAN',
        pesan: `Backup manual dibatasi ${BATAS_MANUAL_PER_HARI} kali per hari. Coba lagi besok.`,
      };
    }
  }

  const id = crypto.randomUUID();
  const periode = await tx.$queryRaw<{ id: string | null }[]>`SELECT periode_aktif() AS id`;
  await tx.backup.create({
    data: {
      id,
      jenis: opts.jenis,
      status: 'BERJALAN',
      storage_key: keys.backupPrefix(id),
      periode_id: periode[0]?.id ?? null,
      dibuat_oleh: opts.userId ?? null,
      manifest: { progres: { tahap: 'MULAI', persen: 0, pesan: 'Menyiapkan backup' } },
    },
  });
  await tx.$executeRaw`
    INSERT INTO audit_log (user_id, aksi, entitas, entitas_id, nilai_baru, ip_address, user_agent, periode_id)
    VALUES (${opts.userId ?? null}::uuid, 'BACKUP_MULAI', 'backup', ${id}, ${{ jenis: opts.jenis } as Prisma.InputJsonValue}::jsonb,
            nullif(current_setting('app.ip', true), '')::inet, nullif(current_setting('app.user_agent', true), ''), periode_aktif())
  `;
  return { ok: true, id };
}

export type HasilBackup =
  | { ok: true; id: string; manifest: Manifest; ukuran: number; peringatan: string | null }
  | { ok: false; id: string; pesan: string };

/**
 * Menulis bundel untuk baris yang sudah BERJALAN. Tidak pernah melempar:
 * kegagalan apa pun dicatat sebagai GAGAL dan dikembalikan.
 */
export async function prosesBackup(
  id: string,
  jenis: JenisBackup,
  sumber: SumberBackup = sumberBawaan(),
  catatan: CatatanBackup = catatanBawaan(),
): Promise<HasilBackup> {
  const terunggah: string[] = [];
  const berkas: BerkasManifest[] = [];
  const jumlahRecord: Record<string, number> = {};
  const keterbatasan: string[] = [];

  const lapor = async (tahap: TahapBackup, pesan: string, dalam = 0) => {
    const urut = Object.keys(BOBOT) as TahapBackup[];
    const berikut = BOBOT[urut[urut.indexOf(tahap) + 1] ?? 'MANIFEST'] ?? 100;
    const persen = Math.min(99, Math.round(BOBOT[tahap] + (berikut - BOBOT[tahap]) * dalam));
    await catatan.progres(id, { tahap, persen, pesan }).catch(() => undefined);
  };
  const unggah = async (jalur: string, data: Buffer, mime: string) => {
    const key = keys.backupBerkas(id, jalur);
    await sumber.storage.put(key, data, mime, { upsert: true });
    terunggah.push(key);
    berkas.push(entriBerkas(jalur, data));
  };

  try {
    const dibuatPada = new Date().toISOString();
    const versi = sumber.versiSkema();
    const migrasi = await sumber.migrasiTerakhir();
    const meta = { versiSkema: versi, migrasiTerakhir: migrasi, dibuatPada };

    const liar = await sumber.tabelTanpaModul();
    if (liar.length) {
      // Tabel baru yang lupa didaftarkan tetap ikut dump fallback, tetapi tidak
      // punya JSON modul — lebih baik ketahuan di manifest daripada hilang diam-diam.
      keterbatasan.push(`Tabel tanpa modul JSON (hanya di dump): ${liar.join(', ')}.`);
    }

    // LAPIS 1 — pg_dump bila tersedia.
    await lapor('DUMP', 'Membuat dump database');
    const dump = await sumber.pgDump();
    const metode = 'sql' in dump ? 'pg_dump' : 'sql_per_tabel';
    if ('sql' in dump) await unggah(JALUR.dump, gzipSync(dump.sql), MIME.gzip);
    else {
      keterbatasan.push(
        `pg_dump tidak dipakai (${dump.gagal}); dump berisi DATA per tabel tanpa DDL — ` +
          `pulihkan ke database yang sudah dimigrasi sampai ${migrasi}.`,
      );
    }

    // LAPIS 2 — JSON per modul. Isi tabel disimpan untuk dump fallback.
    const semuaTabel: IsiTabel[] = [];
    for (const [i, modul] of DAFTAR_MODUL.entries()) {
      await lapor('MODUL', `Mengekspor modul ${modul}`, i / DAFTAR_MODUL.length);
      const tabel: IsiTabel[] = [];
      for (const t of MODUL_BACKUP[modul]) tabel.push(await sumber.bacaTabel(t));
      await unggah(JALUR.modul(modul), susunModul(modul, tabel, meta), MIME.json);
      jumlahRecord[modul] = tabel.reduce((n, t) => n + t.jumlah, 0);
      if (metode === 'sql_per_tabel') semuaTabel.push(...tabel);
    }
    if (metode === 'sql_per_tabel') {
      for (const t of liar) semuaTabel.push(await sumber.bacaTabel(t));
      await unggah(
        JALUR.dump,
        gzipSync(Buffer.from(susunDumpSql(semuaTabel, meta), 'utf8')),
        MIME.gzip,
      );
    }

    // LAPIS 2b — Excel format template asli.
    const acara = await sumber.daftarAcara();
    const dipakai = new Set<string>();
    for (const [i, a] of acara.entries()) {
      await lapor('EKSPOR', `Ekspor RAB ${a.nama_acara}`, i / Math.max(1, acara.length));
      const xlsx = await sumber.eksporRab(a.id);
      if (!xlsx) continue;
      // Nama acara dapat berulang antar-periode — tambahkan potongan id.
      let s = slug(a.nama_acara);
      if (dipakai.has(s)) s = `${s}-${a.id.slice(0, 8)}`;
      dipakai.add(s);
      await unggah(JALUR.rab(s), xlsx, MIME.xlsx);
    }
    await unggah(JALUR.daftarSurat, (await sumber.daftarSurat()).xlsx, MIME.xlsx);

    // LAPIS 3 — arsip berkas storage.
    await lapor('ARSIP', 'Mengarsipkan berkas storage');
    const arsip = await zipStorage(
      sumber.storage,
      (nomor, zip) => unggah(JALUR.arsip(nomor), zip, MIME.zip),
      {
        onProgres: (n, total) => {
          if (n % 25 === 0) void lapor('ARSIP', `Mengarsipkan berkas ${n}/${total}`, n / total);
        },
      },
    );

    // Verifikasi ulang SELURUH berkas dari storage sebelum menulis manifest.
    await lapor('VERIFIKASI', `Memverifikasi ${berkas.length} berkas`);
    const cek = await verifikasiBerkas({ files: berkas }, (p) =>
      sumber.storage.get(keys.backupBerkas(id, p)),
    );
    if (!cek.ok)
      throw new Error(
        `Verifikasi gagal: ${cek.rusak.map((r) => `${r.path} (${r.sebab})`).join('; ')}`,
      );

    const manifest: Manifest = {
      format: FORMAT_MANIFEST,
      backupId: id,
      versiSkema: versi,
      migrasiTerakhir: migrasi,
      dibuatPada,
      jenis,
      dump: { metode, tabel: metode === 'pg_dump' ? [] : semuaTabel.map((t) => t.nama) },
      files: berkas,
      jumlahRecord,
      jumlahBerkasStorage: arsip.jumlah,
      volumeArsip: arsip.volume,
      keterbatasan: [
        ...keterbatasan,
        'Tabel backup dan _migrasi tidak ikut dipulihkan: riwayat backup dan migrasi milik sistem tujuan.',
      ],
    };
    await lapor('MANIFEST', 'Menulis manifest');
    const isiManifest = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    const keyManifest = keys.backupBerkas(id, JALUR.manifest);
    await sumber.storage.put(keyManifest, isiManifest, MIME.json, { upsert: true });
    terunggah.push(keyManifest);
    if (!(await sumber.storage.get(keyManifest)).equals(isiManifest))
      throw new Error('Verifikasi gagal: manifest.json terbaca berbeda.');

    const ukuran = berkas.reduce((n, f) => n + f.size, 0) + isiManifest.length;
    await catatan.sukses(id, manifest, ukuran);

    // Sinkronisasi Google Drive SETELAH sukses di Supabase Storage: gagalnya
    // hanya peringatan — salinan utama sudah aman dan terverifikasi.
    let peringatan: string | null = null;
    if (sumber.drive) {
      try {
        for (const p of [...berkas.map((f) => f.path), JALUR.manifest]) {
          const key = keys.backupBerkas(id, p);
          await sumber.drive.put(
            key,
            await sumber.storage.get(key),
            p.endsWith('.json') ? MIME.json : 'application/octet-stream',
            { upsert: true },
          );
        }
        await catatan
          .sinkron(id, { ok: true, pesan: `${berkas.length + 1} berkas tersalin ke Google Drive` })
          .catch(() => undefined);
      } catch (e) {
        peringatan = `Sinkronisasi Google Drive gagal: ${e instanceof Error ? e.message : String(e)}`;
        await catatan.sinkron(id, { ok: false, pesan: peringatan }).catch(() => undefined);
      }
    }
    return { ok: true, id, manifest, ukuran, peringatan };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    // Bersihkan: tidak boleh ada bundel parsial yang tertinggal.
    await Promise.all(terunggah.map((k) => sumber.storage.delete(k).catch(() => undefined)));
    await catatan.gagal(id, pesan || 'Backup gagal tanpa pesan.').catch(() => undefined);
    return { ok: false, id, pesan };
  }
}

/** Cron & pra-restore: mulai lalu proses dalam satu panggilan. */
export async function jalankanBackup(
  mulai: (fn: (tx: TxKlien) => Promise<HasilMulai>) => Promise<HasilMulai>,
  opts: { jenis: JenisBackup; userId?: string | null },
): Promise<HasilBackup | Extract<HasilMulai, { ok: false }>> {
  await tandaiTerhenti();
  const m = await mulai((tx) => mulaiBackup(tx, opts));
  if (!m.ok) return m;
  return prosesBackup(m.id, opts.jenis);
}

export interface RingkasBackup {
  id: string;
  jenis: JenisBackup;
  status: 'BERJALAN' | 'SUKSES' | 'GAGAL';
  dibuat_oleh: string | null;
  created_at: string;
  completed_at: string | null;
  ukuran_bytes: number | null;
  error_message: string | null;
  progres: Progres | null;
  versi_skema: string | null;
  migrasi_terakhir: string | null;
  jumlah_berkas: number | null;
  jumlah_record: number | null;
  keterbatasan: string[];
  /** Peringatan non-fatal, mis. sinkronisasi Google Drive gagal. */
  peringatan: string | null;
}

export async function daftarBackup(batas = 50): Promise<RingkasBackup[]> {
  await tandaiTerhenti();
  const baris = await db.backup.findMany({
    orderBy: { created_at: 'desc' },
    take: batas,
    select: {
      id: true,
      jenis: true,
      status: true,
      created_at: true,
      completed_at: true,
      ukuran_bytes: true,
      error_message: true,
      manifest: true,
      app_user: { select: { nama_lengkap: true } },
    },
  });
  return baris.map((b) => {
    const m = (b.manifest ?? {}) as Partial<Manifest> & {
      progres?: Progres;
      sinkron?: { gdrive?: { ok: boolean; pesan: string } };
    };
    return {
      id: b.id,
      jenis: b.jenis,
      status: b.status,
      dibuat_oleh: b.app_user?.nama_lengkap ?? null,
      created_at: b.created_at.toISOString(),
      completed_at: b.completed_at?.toISOString() ?? null,
      ukuran_bytes: b.ukuran_bytes === null ? null : Number(b.ukuran_bytes),
      error_message: b.error_message,
      progres: b.status === 'BERJALAN' ? (m.progres ?? null) : null,
      versi_skema: m.versiSkema ?? null,
      migrasi_terakhir: m.migrasiTerakhir ?? null,
      jumlah_berkas: m.files ? m.files.length + 1 : null,
      jumlah_record: m.jumlahRecord
        ? Object.values(m.jumlahRecord).reduce((x, y) => x + y, 0)
        : null,
      keterbatasan: m.keterbatasan ?? [],
      peringatan: m.sinkron?.gdrive && !m.sinkron.gdrive.ok ? m.sinkron.gdrive.pesan : null,
    };
  });
}
