/**
 * stress-anti-bentrok — membuktikan anti-bentrok proker dengan koneksi database
 * yang benar-benar berjalan bersamaan.
 *
 *   npx tsx scripts/stress-anti-bentrok.ts
 *
 * ===========================================================================
 * KENAPA INI TIDAK BISA DIJALANKAN LEWAT `npm run db:test`
 * ===========================================================================
 * Runner test SQL menjalankan setiap berkas di dalam SATU transaksi yang selalu
 * di-ROLLBACK. Itu tepat untuk hampir semua aturan database di project ini —
 * dan justru mustahil untuk yang satu ini.
 *
 * Race condition yang dijaga EXCLUDE constraint hanya muncul bila dua transaksi
 * yang BERBEDA menyentuh rentang yang beririsan sebelum salah satunya commit.
 * Di dalam satu transaksi, INSERT kedua melihat INSERT pertama sebagai barisnya
 * sendiri dan gagal seketika — hasilnya kebetulan sama, tetapi yang terbukti
 * bukan hal yang sama. Test seperti itu akan tetap hijau seandainya constraint
 * dihapus dan digantikan pemeriksaan aplikasi biasa, karena serialisasi datang
 * dari runner-nya, bukan dari database.
 *
 * Karena itu berkas ini memakai koneksi terpisah per pesaing, membuka transaksi
 * di masing-masing, MENAHAN semuanya di satu barrier, lalu melepasnya
 * bersamaan. `supabase/tests/021_konflik_konkuren.sql` menguji sisi yang memang
 * deterministik; keduanya saling melengkapi dan tidak saling menggantikan.
 *
 * ===========================================================================
 * DATA UJI HARUS DI-COMMIT, DAN KARENA ITU HARUS DIBERESKAN
 * ===========================================================================
 * Pesaing pada koneksi lain tidak dapat melihat baris yang belum di-commit,
 * jadi data uji di sini nyata-nyata masuk ke database. Seluruhnya bertanda
 * `T066` dan dihapus di blok `finally`, termasuk sisa dari jalan sebelumnya
 * yang gagal di tengah.
 *
 * Periode uji sengaja berstatus PERSIAPAN, bukan AKTIF: index
 * `periode_hanya_satu_aktif` mengizinkan paling banyak satu periode aktif di
 * seluruh database, dan fixture E2E sudah memegangnya. `setujui_proker` tidak
 * peduli status periode, jadi tidak ada yang hilang.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-066 · PRD F-5.2 · SYSTEM_DESIGN §6.4
 *         INV-09, INV-11, INV-13
 */

import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const AKAR = process.cwd();
const TANDA = 'T066';

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
  // max:1 supaya satu klien = satu koneksi backend. Tanpa itu `Promise.all`
  // dapat memakai koneksi yang sama secara bergantian, dan yang teruji menjadi
  // urutan pemakaian pool alih-alih perilaku database.
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

// ---------------------------------------------------------------------------
// Barrier
// ---------------------------------------------------------------------------

/**
 * Menahan `jumlah` pekerja sampai semuanya tiba, lalu melepas seluruhnya.
 *
 * Tanpa ini, pekerja pertama sudah selesai commit sebelum pekerja terakhir
 * sempat membuka transaksinya, dan yang teruji adalah eksekusi berurutan yang
 * kebetulan ditulis paralel — persis kekeliruan yang dilarang kontrak T-066.
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

// ---------------------------------------------------------------------------
// Data uji
// ---------------------------------------------------------------------------

interface Dasar {
  periode: string;
  deptA: string;
  deptB: string;
  user: string;
}

async function bersihkan(sql: Sql): Promise<void> {
  // Urutan mengikuti arah foreign key. proker_lock ikut terhapus lewat
  // ON DELETE CASCADE, tetapi dihapus eksplisit supaya kegagalan di langkah
  // berikutnya tidak meninggalkan kunci yang menghalangi jalan berikutnya.
  await sql`DELETE FROM proker_lock WHERE proker_id IN (SELECT id FROM proker WHERE nama LIKE ${TANDA + '%'})`;
  await sql`DELETE FROM proker WHERE nama LIKE ${TANDA + '%'}`;
  await sql`DELETE FROM periode WHERE nama LIKE ${TANDA + '%'}`;
  await sql`DELETE FROM departemen WHERE kode LIKE ${TANDA + '%'}`;
  await sql`DELETE FROM app_user WHERE email LIKE ${TANDA + '%'}`;
}

async function siapkan(sql: Sql): Promise<Dasar> {
  const [periode] = await sql<{ id: string }[]>`
    INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
    VALUES (${TANDA + ' Periode Stress'}, '2029-09-01', '2030-08-31', 'PERSIAPAN')
    RETURNING id`;
  const [deptA] = await sql<{ id: string }[]>`
    INSERT INTO departemen (kode, nama, warna)
    VALUES (${TANDA + '-A'}, ${TANDA + ' Kaderisasi'}, '#1E90FF') RETURNING id`;
  const [deptB] = await sql<{ id: string }[]>`
    INSERT INTO departemen (kode, nama, warna)
    VALUES (${TANDA + '-B'}, ${TANDA + ' Kominfo'}, '#A3E635') RETURNING id`;
  // `app_user.id` sengaja tanpa DEFAULT: nilainya mencerminkan id di
  // `auth.users` milik Supabase. Skrip ini tidak membuat akun auth, jadi
  // id-nya dibangkitkan di sini.
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO app_user (id, nama_lengkap, nim, email)
    VALUES (uuid_generate_v4(), ${TANDA + ' Ketua'},
            ${'3337' + Date.now().toString().slice(-6)}, ${TANDA + '-ketua@example.test'})
    RETURNING id`;

  return { periode: periode!.id, deptA: deptA!.id, deptB: deptB!.id, user: user!.id };
}

/** Menyisipkan satu proker TERJADWAL berstatus MENUNGGU_APPROVAL. */
async function buatProker(
  sql: Sql,
  d: Dasar,
  nama: string,
  dept: string,
  persiapan: string,
  hMulai: string,
  hSelesai: string,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status,
                        tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
                        dibuat_oleh)
    VALUES (${d.periode}::uuid, ${dept}::uuid, ${TANDA + ' ' + nama}, 'TERJADWAL', 'MENUNGGU_APPROVAL',
            ${persiapan}::date, ${hMulai}::date, ${hSelesai}::date, ${d.user}::uuid)
    RETURNING id`;
  return row!.id;
}

interface HasilSetujui {
  ok: boolean;
  locked?: boolean;
  reason?: string;
  konflik?: { proker: string; departemen: string; mulai: string; selesai: string }[];
  /** Terisi bila panggilannya MELEMPAR, bukan mengembalikan penolakan yang rapi. */
  errcode?: string;
}

/**
 * Satu pesaing: koneksi sendiri, transaksi sendiri, menunggu barrier, lalu
 * memanggil `setujui_proker` dan commit.
 *
 * COMMIT wajib, bukan opsional. Nilai kembalian fungsi hanya menjadi kenyataan
 * setelah transaksinya commit — dan pesaing yang tertahan pada EXCLUDE
 * constraint baru memperoleh jawabannya justru pada saat itu.
 */
async function pesaing(
  conn: string,
  prokerId: string,
  approver: string,
  gerbang: { tunggu(): Promise<void> },
): Promise<HasilSetujui> {
  const sql = buatKoneksi(conn);
  try {
    await sql`BEGIN`;
    // Satu perintah ringan supaya transaksinya benar-benar terbuka di server
    // sebelum barrier dilepas; tanpa ini "bersamaan" hanya berlaku di sisi Node.
    await sql`SELECT 1`;
    await gerbang.tunggu();

    const [row] = await sql<{ setujui_proker: HasilSetujui }[]>`
      SELECT setujui_proker(${prokerId}::uuid, ${approver}::uuid)`;
    await sql`COMMIT`;
    return row!.setujui_proker;
  } catch (e) {
    // Melempar, bukan mengembalikan `ok:false`, adalah KEGAGALAN dan bukan
    // hasil yang sah — approver menerima 500 alih-alih panel konflik. Kodenya
    // dikembalikan supaya laporan menyebut penyebabnya (mis. 40P01 deadlock)
    // alih-alih menghentikan seluruh jalan pada pesaing pertama yang jatuh.
    await sql`ROLLBACK`.catch(() => {});
    return { ok: false, reason: 'ERROR', errcode: (e as { code?: string }).code ?? 'TIDAK_DIKETAHUI' };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Skenario
// ---------------------------------------------------------------------------

/** 1 & 2 — dua pesaing, satu menang, yang kalah melapor lengkap. */
async function skenarioDua(sql: Sql, conn: string, d: Dasar): Promise<void> {
  console.log('\n  1. Dua approval bersamaan atas rentang beririsan\n');

  // Persiapan 1 Nov, hari-H 6-7 Des. Rentang terkunci 1 Nov - 7 Des.
  const a = await buatProker(sql, d, 'SYNCHRONIZE', d.deptA, '2029-11-01', '2029-12-06', '2029-12-07');
  // Beririsan di tengah rentang A.
  const b = await buatProker(sql, d, 'IT Festival', d.deptB, '2029-11-05', '2029-11-20', '2029-11-21');

  const gerbang = barrier(2);
  const [hA, hB] = await Promise.all([
    pesaing(conn, a, d.user, gerbang),
    pesaing(conn, b, d.user, gerbang),
  ]);

  const menang = [hA, hB].filter((h) => h.ok);
  const kalah = [hA, hB].filter((h) => !h.ok);

  periksa(menang.length === 1, `tepat satu approval berhasil (berhasil: ${menang.length})`);
  periksa(menang[0]?.locked === true, 'yang berhasil mengunci kalender (locked:true)');
  periksa(kalah[0]?.reason === 'KONFLIK', `yang gagal beralasan KONFLIK (reason: ${kalah[0]?.reason})`);

  // Daftar konflik harus terisi. Penolakan tanpa detail memaksa approver
  // menebak tanggal mana yang bebas, satu per satu.
  const konflik = kalah[0]?.konflik ?? [];
  periksa(konflik.length >= 1, `daftar konflik terisi (${konflik.length} entri)`);
  periksa(
    Boolean(konflik[0]?.proker) && Boolean(konflik[0]?.departemen),
    `konflik menyebut proker & departemen (${konflik[0]?.proker} / ${konflik[0]?.departemen})`,
  );

  const idKalah = hA.ok ? b : a;
  const [statusKalah] = await sql<{ status: string }[]>`
    SELECT status FROM proker WHERE id = ${idKalah}::uuid`;
  periksa(
    statusKalah!.status === 'PERLU_REVISI',
    `yang kalah berstatus PERLU_REVISI (status: ${statusKalah!.status})`,
  );

  const [jumlahLock] = await sql<{ n: bigint }[]>`
    SELECT count(*) AS n FROM proker_lock WHERE proker_id IN (${a}::uuid, ${b}::uuid)`;
  periksa(Number(jumlahLock!.n) === 1, `tepat satu baris proker_lock terbentuk (${jumlahLock!.n})`);
}

/** 3 — sepuluh pesaing atas rentang yang sama. */
async function skenarioSepuluh(sql: Sql, conn: string, d: Dasar): Promise<void> {
  console.log('\n  3. Sepuluh approval bersamaan atas rentang yang sama\n');

  const ids: string[] = [];
  for (let n = 0; n < 10; n++) {
    ids.push(
      await buatProker(
        sql,
        d,
        `Serentak ${n}`,
        n % 2 === 0 ? d.deptA : d.deptB,
        '2030-01-05',
        '2030-01-25',
        '2030-01-26',
      ),
    );
  }

  const gerbang = barrier(10);
  const hasil = await Promise.all(ids.map((id) => pesaing(conn, id, d.user, gerbang)));

  const berhasil = hasil.filter((h) => h.ok).length;
  periksa(berhasil === 1, `tepat satu dari sepuluh berhasil (berhasil: ${berhasil})`);
  periksa(
    hasil.filter((h) => !h.ok).every((h) => h.reason === 'KONFLIK'),
    'sembilan sisanya beralasan KONFLIK, bukan error lain',
  );

  const [n] = await sql<{ n: bigint }[]>`
    SELECT count(*) AS n FROM proker_lock WHERE proker_id = ANY(${ids}::uuid[])`;
  periksa(Number(n!.n) === 1, `tepat satu baris proker_lock dari sepuluh proker (${n!.n})`);

  const [revisi] = await sql<{ n: bigint }[]>`
    SELECT count(*) AS n FROM proker
    WHERE id = ANY(${ids}::uuid[]) AND status = 'PERLU_REVISI'`;
  periksa(Number(revisi!.n) === 9, `sembilan berstatus PERLU_REVISI (${revisi!.n})`);
}

/** 4 — batas: mulai persis di hari terakhir proker sebelumnya (INV-11). */
async function skenarioBatas(sql: Sql, conn: string, d: Dasar): Promise<void> {
  console.log('\n  4. Batas rentang — hari terakhir ikut terkunci (INV-11)\n');

  // A terkunci 17 Mar - 17 Apr 2030 (hari-H 16-17 Apr, persiapan 30 hari).
  const a = await buatProker(sql, d, 'Batas A', d.deptA, '2030-03-17', '2030-04-16', '2030-04-17');
  const gerbangA = barrier(1);
  const hA = await pesaing(conn, a, d.user, gerbangA);
  periksa(hA.ok === true, 'proker A terkunci lebih dulu');

  // B mulai persiapan PERSIS di hari terakhir A. Bila rentang disimpan
  // eksklusif di ujung atas tanpa +1, irisan satu hari ini tidak terdeteksi
  // dan dua acara berjalan pada hari yang sama.
  const b = await buatProker(sql, d, 'Batas B', d.deptB, '2030-04-17', '2030-05-05', '2030-05-06');
  const hB = await pesaing(conn, b, d.user, barrier(1));
  periksa(hB.ok === false, 'proker B yang mulai di hari terakhir A DITOLAK');
  periksa(hB.reason === 'KONFLIK', `alasan penolakan KONFLIK (${hB.reason})`);

  // Sehari sesudahnya harus lolos — batas atas tidak boleh terlalu longgar.
  const c = await buatProker(sql, d, 'Batas C', d.deptB, '2030-04-18', '2030-05-06', '2030-05-07');
  const hC = await pesaing(conn, c, d.user, barrier(1));
  periksa(hC.ok === true, 'proker C yang mulai sehari setelah A DITERIMA');
}

/** 5 — revisi: kunci lama lepas dan kunci baru terpasang dalam satu transaksi. */
async function skenarioRevisi(sql: Sql, conn: string, d: Dasar): Promise<void> {
  console.log('\n  5. Revisi tanggal — kunci berpindah dalam satu transaksi (INV-13)\n');

  const p = await buatProker(sql, d, 'Revisi', d.deptA, '2030-07-01', '2030-07-20', '2030-07-21');
  const awal = await pesaing(conn, p, d.user, barrier(1));
  periksa(awal.ok === true, 'proker terkunci pada rentang awal');

  const [lockLama] = await sql<{ rentang: string }[]>`
    SELECT rentang::text AS rentang FROM proker_lock WHERE proker_id = ${p}::uuid`;
  periksa(
    lockLama!.rentang === '[2030-07-01,2030-07-22)',
    `rentang awal inklusif di kedua ujung (${lockLama!.rentang})`,
  );

  await sql`
    UPDATE proker SET
      tanggal_mulai_persiapan = '2030-09-01',
      tanggal_hari_h_mulai    = '2030-09-20',
      tanggal_hari_h_selesai  = '2030-09-21',
      status                  = 'MENUNGGU_APPROVAL_REVISI'
    WHERE id = ${p}::uuid`;

  const revisi = await pesaing(conn, p, d.user, barrier(1));
  periksa(revisi.ok === true, 'revisi disetujui');

  const lock = await sql<{ rentang: string }[]>`
    SELECT rentang::text AS rentang FROM proker_lock WHERE proker_id = ${p}::uuid`;
  periksa(lock.length === 1, `tepat satu kunci tersisa, bukan dua (${lock.length})`);
  periksa(
    lock[0]?.rentang === '[2030-09-01,2030-09-22)',
    `kunci memakai rentang baru (${lock[0]?.rentang})`,
  );

  // Rentang lama harus benar-benar bebas: kalau kunci lama tertinggal, tanggal
  // yang sudah ditinggalkan tetap memblokir departemen lain selamanya.
  const [bebas] = await sql<{ n: bigint }[]>`
    SELECT count(*) AS n FROM cek_konflik_proker(${d.periode}::uuid, '2030-07-01', '2030-07-21')`;
  periksa(Number(bebas!.n) === 0, `rentang lama kembali bebas (${bebas!.n} konflik tersisa)`);
}

/** Pemeriksaan penutup: tidak boleh ada dua lock beririsan di seluruh tabel. */
async function tidakAdaIrisan(sql: Sql): Promise<void> {
  console.log('\n  Penutup\n');
  const irisan = await sql<{ a: string; b: string }[]>`
    SELECT l1.proker_id AS a, l2.proker_id AS b
    FROM proker_lock l1
    JOIN proker_lock l2
      ON l1.periode_id = l2.periode_id
     AND l1.id < l2.id
     AND l1.rentang && l2.rentang`;
  periksa(
    irisan.length === 0,
    `tidak ada dua kunci beririsan di seluruh tabel (${irisan.length} pasangan)`,
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const env = bacaEnv();
  const conn = env.DIRECT_URL || env.DATABASE_URL;
  if (!conn) {
    console.error('\n  DIRECT_URL/DATABASE_URL belum diisi. Jalankan: npm run check:env\n');
    process.exit(1);
  }

  console.log('\n  stress-anti-bentrok — koneksi paralel sungguhan\n');

  const sql = buatKoneksi(conn);
  try {
    // Sisa dari jalan sebelumnya yang gagal di tengah dibersihkan lebih dulu,
    // supaya kegagalan sekali tidak membuat seluruh jalan berikutnya gagal
    // karena kunci yang tertinggal.
    await bersihkan(sql);
    const d = await siapkan(sql);

    await skenarioDua(sql, conn, d);
    await skenarioSepuluh(sql, conn, d);
    await skenarioBatas(sql, conn, d);
    await skenarioRevisi(sql, conn, d);
    await tidakAdaIrisan(sql);
  } finally {
    await bersihkan(sql).catch((e) => {
      console.error('\n  PERINGATAN: pembersihan gagal, data uji T066 mungkin tertinggal.');
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
