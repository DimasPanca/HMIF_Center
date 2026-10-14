/**
 * stress-nomor-surat — membuktikan penomoran surat anti-duplikat dengan
 * koneksi database yang benar-benar berjalan bersamaan.
 *
 *   npx tsx scripts/stress-nomor-surat.ts
 *
 * ===========================================================================
 * KENAPA TIDAK LEWAT `npm run db:test`
 * ===========================================================================
 * Runner test SQL menjalankan tiap berkas dalam SATU transaksi yang selalu
 * di-ROLLBACK. Advisory lock per periode (INV-15) hanya bermakna bila
 * transaksi-transaksi BERBEDA berebut counter yang sama sebelum salah satunya
 * commit. Di dalam satu transaksi, panggilan kedua sudah memegang kuncinya
 * sendiri — test seperti itu tetap hijau seandainya kuncinya dihapus.
 * `supabase/tests/020_nomor_konkuren.sql` menguji sisi yang deterministik.
 *
 * ===========================================================================
 * 50 KLIEN LEWAT TRANSACTION POOLER, BUKAN 50 SESI BACKEND
 * ===========================================================================
 * Project ini dibatasi max_connections = 60, dengan ±15 dipakai layanan
 * Supabase sendiri. Lima puluh sesi backend yang memegang transaksi terbuka
 * bersamaan tidak muat, dan barrier yang menunggu kelimapuluhnya membuka
 * transaksi akan macet selamanya di session pooler.
 *
 * Karena itu tiap pesaing adalah klien terpisah (koneksi TCP sendiri, `max: 1`)
 * ke DATABASE_URL — transaction pooler, jalur yang sama persis dengan route
 * approval di produksi. Pooler membagi backend per transaksi, sehingga
 * transaksi yang menunggu kunci benar-benar berebut seperti approval sungguhan
 * pada jam sibuk. Seberapa banyak yang tumpang tindih DIUKUR dan dilaporkan,
 * bukan diklaim.
 *
 * ===========================================================================
 * DATA UJI DI-COMMIT, JADI WAJIB DIBERESKAN
 * ===========================================================================
 * Pesaing di koneksi lain tak dapat melihat baris yang belum di-commit, jadi
 * data uji nyata-nyata masuk database. Seluruhnya bertanda `T057` dan dihapus
 * di blok `finally`, termasuk sisa jalan sebelumnya yang gagal di tengah.
 *
 * Periode uji berstatus PERSIAPAN dan **`aktifkan_periode` tidak pernah
 * dipanggil**: fungsi itu mengarsipkan periode aktif yang sedang dipakai.
 * `alokasi_nomor_surat` membuat baris counter-nya sendiri, terlepas dari status
 * periode, sehingga counter periode aktif tidak pernah tersentuh.
 *
 * Baris `audit_log` yang ditinggalkan insert/update/delete surat uji tidak
 * dapat dihapus (append-only, INV-06) — itu disengaja dan tidak berbahaya.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-057 · PRD F-4.1 · SYSTEM_DESIGN §7.2
 *         INV-14, INV-15, INV-16
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const AKAR = process.cwd();
const TANDA = 'T057';
const JUMLAH_PARALEL = 50;
const JUMLAH_BATCH = 30;
/** Oktober: nomor harus memuat `X`, bukan `10` (PRD F-4.1). */
const TANGGAL = '2029-10-15';

// ---------------------------------------------------------------------------
// Lingkungan
// ---------------------------------------------------------------------------

function bacaEnv(): Record<string, string> {
  const f = path.join(AKAR, '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(f)) {
    for (const baris of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const t = baris.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      env[t.slice(0, i).trim()] = t
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }
  for (const k of Object.keys(process.env)) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env;
}

type Sql = ReturnType<typeof postgres>;

function buatKoneksi(conn: string): Sql {
  // max:1 → satu klien = satu koneksi TCP sendiri. prepare:false wajib di
  // balik transaction pooler (backend berganti antar transaksi).
  return postgres(conn, {
    ssl: 'require',
    max: 1,
    connect_timeout: 30,
    idle_timeout: 20,
    prepare: false,
    onnotice: () => {},
  });
}

// ---------------------------------------------------------------------------
// Assertion
// ---------------------------------------------------------------------------

let lulus = 0;
const gagal: string[] = [];

function periksa(kondisi: boolean, pesan: string): void {
  if (kondisi) {
    lulus++;
    console.log(`      OK   ${pesan}`);
  } else {
    gagal.push(pesan);
    console.log(`      XX   ${pesan}`);
  }
}

/**
 * Menahan `jumlah` pekerja sampai semuanya tiba, lalu melepas seluruhnya.
 * Pekerja tiba SETELAH koneksinya hidup, sehingga yang dilepas bersamaan adalah
 * permintaan approval — bukan jabat tangan TLS.
 */
function barrier(jumlah: number) {
  let tiba = 0;
  let lepas!: () => void;
  const pintu = new Promise<void>((r) => (lepas = r));
  return {
    async tunggu(): Promise<void> {
      if (++tiba === jumlah) lepas();
      return pintu;
    },
  };
}

/** Banyaknya interval [mulai, selesai] yang tumpang tindih pada satu titik waktu. */
function tumpangTindihMaks(interval: { mulai: number; selesai: number }[]): number {
  const titik = interval.flatMap((i) => [
    { t: i.mulai, d: 1 },
    { t: i.selesai, d: -1 },
  ]);
  // Selesai diurutkan sebelum mulai pada waktu yang sama: bersentuhan bukan tumpang tindih.
  titik.sort((a, b) => a.t - b.t || a.d - b.d);
  let kini = 0;
  let maks = 0;
  for (const p of titik) maks = Math.max(maks, (kini += p.d));
  return maks;
}

// ---------------------------------------------------------------------------
// Data uji
// ---------------------------------------------------------------------------

interface Dasar {
  periode: string;
  user: string;
  template: string;
}

async function bersihkan(sql: Sql): Promise<void> {
  // surat_signer ikut terhapus lewat ON DELETE CASCADE; surat_counter ikut
  // periodenya. Urutan mengikuti arah foreign key.
  await sql`DELETE FROM surat WHERE perihal LIKE ${TANDA + '%'}`;
  await sql`DELETE FROM periode WHERE nama LIKE ${TANDA + '%'}`;
  await sql`DELETE FROM app_user WHERE email LIKE ${TANDA.toLowerCase() + '%'}`;
}

async function siapkan(sql: Sql): Promise<Dasar> {
  const [periode] = await sql<{ id: string }[]>`
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES (${TANDA + ' Periode Stress'}, '2029-09-01', '2030-08-31', 'PERSIAPAN')
    RETURNING id`;
  // app_user.id tanpa DEFAULT: ia mencerminkan auth.users. Skrip ini tidak
  // membuat akun auth, jadi id dibangkitkan di sini.
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO app_user (id, nama_lengkap, nim, email)
    VALUES (uuid_generate_v4(), ${TANDA + ' Sekum'}, '9057000001', ${TANDA.toLowerCase() + '.sekum@example.test'})
    RETURNING id`;
  // Template sungguhan, hanya dirujuk — tidak dibuat atau diubah.
  const [template] = await sql<{ id: string }[]>`
    SELECT id FROM surat_template WHERE kode_surat = '05' AND is_active ORDER BY versi DESC LIMIT 1`;
  if (!template) throw new Error('Tidak ada surat_template kode 05 yang aktif. Jalankan scripts/upload-templates.ts.');
  return { periode: periode!.id, user: user!.id, template: template.id };
}

async function buatSurat(sql: Sql, d: Dasar, jumlah: number, label: string, status = 'MENUNGGU_APPROVAL') {
  const baris = Array.from({ length: jumlah }, (_, i) => ({
    periode_id: d.periode,
    template_id: d.template,
    kode_surat: '05',
    kode_kegiatan: TANDA,
    tanggal_surat: TANGGAL,
    perihal: `${TANDA} ${label} ${i + 1}`,
    tujuan_nama: 'Uji',
    tujuan_alamat: 'di Tempat',
    dibuat_oleh: d.user,
    status,
  }));
  const r = await sql<{ id: string }[]>`INSERT INTO surat ${sql(baris)} RETURNING id`;
  return r.map((x) => x.id);
}

async function counter(sql: Sql, d: Dasar): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    SELECT nomor_terakhir AS n FROM surat_counter WHERE periode_id = ${d.periode}`;
  return r?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Pesaing
// ---------------------------------------------------------------------------

interface Hasil {
  nomor?: string;
  errcode?: string;
  pesan?: string;
  mulai: number;
  selesai: number;
}

/**
 * Satu approval: koneksi sendiri, tunggu barrier, lalu satu transaksi
 * BEGIN → alokasi_nomor_surat → COMMIT. Nilai kembalian baru nyata setelah commit.
 */
async function pesaing(conn: string, suratId: string, approver: string, gerbang: { tunggu(): Promise<void> }): Promise<Hasil> {
  const sql = buatKoneksi(conn);
  let mulai = 0;
  try {
    await sql`SELECT 1`; // koneksi benar-benar hidup sebelum barrier
    await gerbang.tunggu();
    mulai = performance.now();
    const nomor = await sql.begin(async (tx) => {
      const [r] = await tx<{ nomor: string }[]>`
        SELECT alokasi_nomor_surat(${suratId}::uuid, ${approver}::uuid) AS nomor`;
      return r!.nomor;
    });
    return { nomor, mulai, selesai: performance.now() };
  } catch (e) {
    // Melempar adalah KEGAGALAN (approver menerima 500). Kodenya dicatat supaya
    // laporan menyebut penyebab — 23505 unique violation, 40P01 deadlock, dst.
    const err = e as { code?: string; message?: string };
    return { errcode: err.code ?? 'TIDAK_DIKETAHUI', pesan: err.message, mulai, selesai: performance.now() };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

function berurutan(urut: number[], dari: number, jumlah: number): boolean {
  const s = [...urut].sort((a, b) => a - b);
  return s.length === jumlah && s.every((n, i) => n === dari + i);
}

// ---------------------------------------------------------------------------
// Skenario
// ---------------------------------------------------------------------------

async function skenarioParalel(sql: Sql, conn: string, d: Dasar): Promise<void> {
  console.log(`\n  1. ${JUMLAH_PARALEL} approval paralel, ${JUMLAH_PARALEL} klien terpisah\n`);
  const ids = await buatSurat(sql, d, JUMLAH_PARALEL, 'paralel');
  const awal = await counter(sql, d);

  const gerbang = barrier(JUMLAH_PARALEL);
  const t0 = performance.now();
  const hasil = await Promise.all(ids.map((id) => pesaing(conn, id, d.user, gerbang)));
  const durasi = performance.now() - t0;

  const galat = hasil.filter((h) => h.errcode);
  const nomor = hasil.flatMap((h) => (h.nomor ? [h.nomor] : []));
  const overlap = tumpangTindihMaks(hasil.filter((h) => h.mulai > 0));

  console.log(`           selesai dalam ${Math.round(durasi)} ms; tumpang tindih maksimum ${overlap} transaksi`);
  periksa(galat.length === 0, `tidak ada exception (${galat.length})`);
  for (const g of galat.slice(0, 5)) console.log(`             ${g.errcode}: ${g.pesan}`);
  periksa(overlap >= 2, `transaksi benar-benar tumpang tindih, bukan berurutan (maks ${overlap})`);
  periksa(new Set(nomor).size === JUMLAH_PARALEL, `${JUMLAH_PARALEL} nomor unik (dapat ${new Set(nomor).size})`);

  const db = await sql<{ nomor_urut: number; nomor_lengkap: string; status: string }[]>`
    SELECT nomor_urut, nomor_lengkap, status::text FROM surat WHERE id = ANY(${ids}::uuid[])`;
  periksa(
    berurutan(db.map((r) => r.nomor_urut), awal + 1, JUMLAH_PARALEL),
    `nomor urut ${awal + 1}…${awal + JUMLAH_PARALEL} tanpa lompatan dan tanpa kembar`,
  );
  periksa((await counter(sql, d)) === awal + JUMLAH_PARALEL, `counter naik tepat ${JUMLAH_PARALEL}`);
  periksa(db.every((r) => r.status === 'DISETUJUI'), 'seluruh surat berstatus DISETUJUI');
  periksa(
    db.every((r) => r.nomor_lengkap.endsWith(`/${TANDA}/X/2029`)),
    'bulan Oktober tercetak X, bukan 10',
  );
  periksa(
    nomor.every((n) => db.some((r) => r.nomor_lengkap === n)),
    'nomor yang dikembalikan ke pemanggil = nomor yang tersimpan',
  );
}

async function skenarioBatch(sql: Sql, d: Dasar): Promise<void> {
  console.log(`\n  2. Batch ${JUMLAH_BATCH} surat dalam satu transaksi\n`);
  const ids = await buatSurat(sql, d, JUMLAH_BATCH, 'batch');
  const awal = await counter(sql, d);

  const r = await sql.begin(
    (tx) => tx<{ surat_id: string; nomor: string }[]>`
      SELECT surat_id::text, nomor FROM alokasi_nomor_batch(${ids}::uuid[], ${d.user}::uuid)`,
  );
  const db = await sql<{ id: string; nomor_urut: number }[]>`
    SELECT id::text, nomor_urut FROM surat WHERE id = ANY(${ids}::uuid[])`;

  periksa(r.length === JUMLAH_BATCH, `${JUMLAH_BATCH} nomor dikembalikan (${r.length})`);
  periksa(berurutan(db.map((x) => x.nomor_urut), awal + 1, JUMLAH_BATCH), `nomor urut ${awal + 1}…${awal + JUMLAH_BATCH} berurutan`);
  // Urutan nomor mengikuti urutan larik masukan — surat massal dicetak berurutan.
  const urutPerId = new Map(db.map((x) => [x.id, x.nomor_urut]));
  periksa(
    ids.every((id, i) => urutPerId.get(id) === awal + 1 + i),
    'nomor mengikuti urutan surat di larik masukan',
  );
}

async function skenarioDraftDibatalkan(sql: Sql, d: Dasar): Promise<void> {
  console.log('\n  3. Draft dibatalkan tidak menghabiskan nomor\n');
  const [id] = await buatSurat(sql, d, 1, 'draft', 'DRAFT');
  const awal = await counter(sql, d);

  await sql`UPDATE surat SET status = 'DIBATALKAN' WHERE id = ${id!}`;
  periksa((await counter(sql, d)) === awal, 'membatalkan draft tidak menaikkan counter');

  let ditolak = false;
  try {
    await sql.begin((tx) => tx`SELECT alokasi_nomor_surat(${id!}::uuid, ${d.user}::uuid)`);
  } catch {
    ditolak = true;
  }
  periksa(ditolak, 'surat DIBATALKAN tidak dapat memperoleh nomor (INV-14)');
  periksa((await counter(sql, d)) === awal, 'alokasi yang ditolak tidak menaikkan counter');

  const [s] = await sql<{ nomor_urut: number | null }[]>`SELECT nomor_urut FROM surat WHERE id = ${id!}`;
  periksa(s?.nomor_urut === null, 'surat dibatalkan tetap tanpa nomor');
}

async function skenarioIdempoten(sql: Sql, conn: string, d: Dasar): Promise<void> {
  console.log('\n  4. Alokasi berulang pada surat yang sama → nomor identik\n');
  const [id] = await buatSurat(sql, d, 1, 'idempoten');
  const awal = await counter(sql, d);

  const satu = await pesaing(conn, id!, d.user, barrier(1));
  const dua = await pesaing(conn, id!, d.user, barrier(1));
  periksa(!!satu.nomor && satu.nomor === dua.nomor, `dua panggilan berurutan → nomor sama (${satu.nomor})`);
  periksa((await counter(sql, d)) === awal + 1, 'counter hanya naik satu');

  // Retry serentak: approval yang di-klik ganda atau di-retry dua tab sekaligus.
  const [id2] = await buatSurat(sql, d, 1, 'retry-serentak');
  const awal2 = await counter(sql, d);
  const g = barrier(10);
  const h = await Promise.all(Array.from({ length: 10 }, () => pesaing(conn, id2!, d.user, g)));
  const unik = new Set(h.map((x) => x.nomor ?? `galat:${x.errcode}`));
  periksa(unik.size === 1 && !h.some((x) => x.errcode), `10 retry serentak → satu nomor yang sama (${[...unik].join(', ')})`);
  periksa((await counter(sql, d)) === awal2 + 1, 'counter hanya naik satu walau 10 retry serentak');
}

/** Penutup: tidak boleh ada dua surat dengan nomor sama di periode mana pun. */
async function tidakAdaKembar(sql: Sql): Promise<void> {
  console.log('\n  Penutup\n');
  const kembar = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (
      SELECT periode_id, nomor_urut FROM surat WHERE nomor_urut IS NOT NULL
      GROUP BY 1, 2 HAVING count(*) > 1
    ) x`;
  periksa(kembar[0]!.n === 0, `tidak ada nomor urut kembar di seluruh tabel (${kembar[0]!.n})`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const env = bacaEnv();
  // Pesaing lewat transaction pooler (jalur produksi); persiapan & pemeriksaan
  // lewat session pooler supaya tidak ikut mengantre di pool yang sama.
  const connPesaing = env.DATABASE_URL;
  const connAdmin = env.DIRECT_URL || env.DATABASE_URL;
  if (!connPesaing || !connAdmin) {
    console.error('\n  DATABASE_URL/DIRECT_URL belum diisi. Jalankan: npm run check:env\n');
    process.exit(1);
  }

  console.log('\n  stress-nomor-surat — klien paralel sungguhan lewat transaction pooler');

  const sql = buatKoneksi(connAdmin);
  try {
    await bersihkan(sql);
    const d = await siapkan(sql);
    const counterAktifSebelum = await sql<{ n: number }[]>`
      SELECT c.nomor_terakhir AS n FROM surat_counter c JOIN periode p ON p.id = c.periode_id WHERE p.status = 'AKTIF'`;

    await skenarioParalel(sql, connPesaing, d);
    await skenarioBatch(sql, d);
    await skenarioDraftDibatalkan(sql, d);
    await skenarioIdempoten(sql, connPesaing, d);
    await tidakAdaKembar(sql);

    const counterAktifSesudah = await sql<{ n: number }[]>`
      SELECT c.nomor_terakhir AS n FROM surat_counter c JOIN periode p ON p.id = c.periode_id WHERE p.status = 'AKTIF'`;
    periksa(
      JSON.stringify(counterAktifSebelum) === JSON.stringify(counterAktifSesudah),
      'counter periode AKTIF tidak tersentuh',
    );
  } finally {
    await bersihkan(sql).catch((e) => {
      console.error(`\n  PERINGATAN: pembersihan gagal, data uji ${TANDA} mungkin tertinggal.`);
      console.error(`  ${(e as Error).message}`);
    });
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  console.log(`\n  ${lulus} lulus, ${gagal.length} gagal\n`);
  if (gagal.length) {
    console.log('  KEGAGALAN:');
    gagal.forEach((g) => console.log(`    ${g}`));
    console.log('');
    process.exit(1);
  }
}

void main();
