/**
 * Test integrasi konteks audit.
 *
 * Berbeda dari test lain di direktori ini, berkas ini menyentuh database
 * sungguhan — konteks audit tidak dapat diuji tanpa itu, karena yang diuji
 * justru apakah `set_config` sampai ke koneksi yang menjalankan mutasi.
 *
 * Test ini meninggalkan beberapa baris di `audit_log`. Itu tidak dapat
 * dihindari dan memang benar: tabel itu append-only seumur hidup sistem
 * (INV-06). `npm run db:reset` membersihkannya.
 *
 * SELEBIHNYA WAJIB DIBERESKAN SENDIRI, karena berkas ini menyentuh database
 * yang sama dengan `npm run db:test`. Sempat terjadi: test ini membuat periode
 * berstatus AKTIF dan membiarkannya, lalu 17 berkas test SQL gagal karena
 * index `periode_hanya_satu_aktif` menolak periode aktif kedua. Gejalanya
 * muncul di suite yang sama sekali tidak bersalah.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-043 · SYSTEM_DESIGN §14.2 · INV-07
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// .env.local dimuat manual: vitest tidak membacanya, dan lib/db/client.ts
// menuntut DATABASE_URL sudah ada saat modulnya dievaluasi.
const AKAR = path.resolve(import.meta.dirname, '..', '..', '..');
const berkasEnv = path.join(AKAR, '.env.local');
if (fs.existsSync(berkasEnv)) {
  for (const baris of fs.readFileSync(berkasEnv, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const nama = t.slice(0, i).trim();
    if (!process.env[nama]) process.env[nama] = t.slice(i + 1).trim();
  }
}

// Tanpa kredensial database, seluruh berkas ini dilewati alih-alih gagal.
// `npm run verify` harus tetap dapat dijalankan di mesin yang belum di-setup
// dan di CI yang tidak memegang rahasia.
const adaDb = Boolean(process.env.DATABASE_URL);

const { db } = adaDb
  ? await import('../client')
  : ({ db: null } as unknown as typeof import('../client'));
const { withAuditContext, withServiceContext } = adaDb
  ? await import('../with-audit-context')
  : ({} as unknown as typeof import('../with-audit-context'));

const PENANDA = 'Uji Konteks Audit';
const IP = '182.253.44.7';
const UA = 'Mozilla/5.0 (Android 14; Mobile) HMIFCenter/1.0';

function permintaan(headers: Record<string, string>): Request {
  return new Request('https://hmif.test/api/proker', { method: 'POST', headers });
}

interface BarisAudit {
  ip_address: string | null;
  user_agent: string | null;
  periode_id: string | null;
  aksi: string;
}

async function auditTerakhir(entitasId: string): Promise<BarisAudit | undefined> {
  const baris = await db.$queryRaw<BarisAudit[]>`
    SELECT host(ip_address) AS ip_address, user_agent, periode_id::text AS periode_id, aksi
    FROM audit_log
    WHERE entitas = 'proker' AND entitas_id = ${entitasId}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
  return baris[0];
}

let periodeId: string;
let departemenId: string;
let penggunaId: string;
/** true bila periode aktif dibuat oleh test ini, bukan sudah ada sebelumnya. */
let periodeMilikTest = false;

beforeAll(async () => {
  if (!adaDb) return;
  const periode = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1
  `;
  if (periode[0]) {
    periodeId = periode[0].id;
  } else {
    const baru = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO periode (nama, tanggal_mulai, tanggal_selesai, status)
      VALUES (${PENANDA}, '2026-09-01', '2027-08-31', 'AKTIF')
      RETURNING id
    `;
    periodeId = baru[0]!.id;
    periodeMilikTest = true;
  }

  const dept = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM departemen ORDER BY urutan LIMIT 1
  `;
  departemenId = dept[0]!.id;

  const pengguna = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO app_user (id, nama_lengkap, nim, email)
    VALUES (gen_random_uuid(), ${PENANDA}, '9999999999', 'audit-context@uji.test')
    ON CONFLICT (email) DO UPDATE SET nama_lengkap = EXCLUDED.nama_lengkap
    RETURNING id
  `;
  penggunaId = pengguna[0]!.id;
});

afterAll(async () => {
  if (!adaDb) return;
  // Proker uji dibersihkan; baris audit-nya sengaja dibiarkan (INV-06).
  await db.$executeRaw`DELETE FROM proker WHERE nama LIKE ${PENANDA + '%'}`;

  // Periode yang dibuat test ini DIARSIPKAN, bukan dihapus: baris audit yang
  // dihasilkannya menunjuk ke sana lewat foreign key, dan audit tidak boleh
  // ikut hilang. Mengarsipkannya sudah cukup — index periode_hanya_satu_aktif
  // kembali bebas untuk suite lain.
  if (periodeMilikTest) {
    await db.$executeRaw`UPDATE periode SET status = 'ARSIP' WHERE id = ${periodeId}::uuid`;
  }

  await db.$disconnect();
});

async function buatProker(tx: { $queryRaw: typeof db.$queryRaw }, nama: string): Promise<string> {
  const baris = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
    VALUES (${periodeId}::uuid, ${departemenId}::uuid, ${nama}, 'BERKALA', ${penggunaId}::uuid)
    RETURNING id
  `;
  return baris[0]!.id;
}

describe.skipIf(!adaDb)('withAuditContext', () => {
  it('mencatat IP dan user agent nyata dari request ke audit_log', async () => {
    const id = await withAuditContext(
      permintaan({ 'x-forwarded-for': IP, 'user-agent': UA }),
      (tx) => buatProker(tx, `${PENANDA} A`),
    );

    const audit = await auditTerakhir(id);
    expect(audit).toBeDefined();
    expect(audit!.aksi).toBe('CREATE');
    expect(audit!.ip_address).toBe(IP);
    expect(audit!.user_agent).toBe(UA);
    expect(audit!.periode_id).toBe(periodeId);
  });

  it('mengambil IP pertama dari rantai x-forwarded-for', async () => {
    // Header ini dapat berisi "klien, proxy1, proxy2"; yang pertama adalah
    // klien aslinya. Mengambil yang terakhir berarti mencatat alamat proxy.
    const id = await withAuditContext(
      permintaan({ 'x-forwarded-for': `${IP}, 10.0.0.1, 10.0.0.2`, 'user-agent': UA }),
      (tx) => buatProker(tx, `${PENANDA} B`),
    );

    expect((await auditTerakhir(id))!.ip_address).toBe(IP);
  });

  it('menyimpan NULL, bukan alamat palsu, saat IP tidak diketahui', async () => {
    // '0.0.0.0' akan menyamarkan "tidak tahu" menjadi "berasal dari sana",
    // dan itu menyesatkan justru saat jejak audit paling dibutuhkan.
    const id = await withAuditContext(
      permintaan({ 'user-agent': UA }),
      (tx) => buatProker(tx, `${PENANDA} C`),
    );

    const audit = await auditTerakhir(id);
    expect(audit!.ip_address).toBeNull();
    expect(audit!.user_agent).toBe(UA);
  });

  it('mengembalikan nilai dari fn apa adanya', async () => {
    const hasil = await withAuditContext(
      permintaan({ 'user-agent': UA }),
      async () => ({ angka: 42, teks: 'halo' }),
    );
    expect(hasil).toEqual({ angka: 42, teks: 'halo' });
  });

  it('membatalkan seluruh mutasi bila fn melempar', async () => {
    const nama = `${PENANDA} D`;
    await expect(
      withAuditContext(permintaan({ 'user-agent': UA }), async (tx) => {
        await buatProker(tx, nama);
        throw new Error('sengaja gagal');
      }),
    ).rejects.toThrow('sengaja gagal');

    const sisa = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM proker WHERE nama = ${nama}
    `;
    expect(Number(sisa[0]!.n)).toBe(0);
  });

  it('KOREKSI SYSTEM_DESIGN 14.2: memakai klien global di dalam fn kehilangan konteks', async () => {
    // Contoh di dokumen memanggil `fn()` tanpa meneruskan `tx`, sehingga
    // kuerinya berjalan di koneksi LAIN dari pool. set_config bersifat
    // transaction-local dan tidak pernah sampai ke sana.
    //
    // Test ini menirukan bentuk itu dengan sengaja, untuk mengunci alasan
    // kenapa tanda tangan fungsinya mewajibkan `tx`. Bila suatu saat seseorang
    // "menyederhanakannya" kembali, kegagalannya tidak akan terlihat di
    // produksi — hanya jejak audit yang diam-diam kehilangan isinya.
    const id = await withAuditContext(
      permintaan({ 'x-forwarded-for': IP, 'user-agent': UA }),
      async () => buatProker(db, `${PENANDA} E`),   // sengaja `db`, bukan `tx`
    );

    const audit = await auditTerakhir(id);
    expect(audit!.ip_address).toBeNull();
    expect(audit!.user_agent).toBeNull();
  });
});

describe.skipIf(!adaDb)('withServiceContext', () => {
  it("menandai mutasi cron dengan user agent 'sistem'", async () => {
    const id = await withServiceContext((tx) => buatProker(tx, `${PENANDA} F`));

    const audit = await auditTerakhir(id);
    expect(audit!.user_agent).toBe('sistem');
    expect(audit!.ip_address).toBeNull();
    expect(audit!.periode_id).toBe(periodeId);
  });
});
