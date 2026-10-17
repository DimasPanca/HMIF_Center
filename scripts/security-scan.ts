/**
 * security-scan — uji penetrasi internal T-113 terhadap server yang berjalan.
 *
 *   npx tsx scripts/security-scan.ts [baseUrl]     (bawaan NEXT_PUBLIC_APP_URL / http://localhost:3000)
 *
 * Setiap jalur diuji di DUA lapis: aplikasi (HTTP sungguhan dengan sesi akun
 * uji e2e) dan RLS (SQL sebagai role `authenticated` ber-JWT akun yang sama,
 * di dalam transaksi yang di-rollback):
 *
 *   H  header keamanan §18.2 + CSP, verifikasi Origin (CSRF)
 *   D  lintas DEPARTEMEN — Kadept membuat proker di departemen lain
 *   V  lintas DIVISI — koordinator Konsumsi mengubah item RAB divisi PDD
 *   U  upload berbahaya — PDF menyamar JPG, 100 MB, nama path traversal, SVG ber-script
 *   S  berkas privat — preview/thumb/master nota tidak terbuka lewat URL publik;
 *      signed URL berumur 5 menit
 *
 * Data uji (proker, acara, divisi, gambar) dibuat dan dihapus oleh skrip ini.
 * Keluar dengan kode 1 bila satu pun pemeriksaan gagal.
 */

import fs from 'node:fs';
import path from 'node:path';

import postgres from 'postgres';
import sharp from 'sharp';

import { AKUN, PASSWORD_UJI, type AkunUji } from '../e2e/fixtures/akun';

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

const gagal: string[] = [];
function cek(ok: boolean, label: string): void {
  console.log(`  [${ok ? ' OK ' : 'GAGAL'}] ${label}`);
  if (!ok) gagal.push(label);
}

/** Sesi HTTP sederhana: menyimpan cookie dari Set-Cookie. */
class Sesi {
  private jar = new Map<string, string>();
  constructor(private dasar: string) {}
  async minta(jalur: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set('cookie', [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const r = await fetch(this.dasar + jalur, { ...init, headers, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv!.indexOf('=');
      this.jar.set(kv!.slice(0, i), kv!.slice(i + 1));
    }
    return r;
  }
  async masuk(akun: AkunUji): Promise<boolean> {
    const r = await this.minta('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: akun.email, password: PASSWORD_UJI }),
    });
    return r.ok;
  }
}

async function main(): Promise<number> {
  muatEnv();
  const dasar = (
    process.argv[2] ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, {
    ssl: 'require',
    max: 2,
    onnotice: () => {},
  });
  console.log(`  security-scan → ${dasar}`);

  const probe = await fetch(`${dasar}/login`).catch(() => null);
  if (!probe) {
    console.error(`  Server ${dasar} tidak terjangkau — jalankan dulu (npm run dev / next start).`);
    await sql.end();
    return 1;
  }

  // ---------------------------------------------------------------- H
  console.log('\n  H · header & CSRF');
  const h = probe.headers;
  cek(h.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY');
  cek(h.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
  cek(
    h.get('referrer-policy') === 'strict-origin-when-cross-origin',
    'Referrer-Policy: strict-origin-when-cross-origin',
  );
  cek(
    h.get('permissions-policy') === 'camera=(self), microphone=(), geolocation=()',
    'Permissions-Policy: camera=(self), microphone=(), geolocation=()',
  );
  cek(
    (h.get('strict-transport-security') ?? '').startsWith('max-age=63072000; includeSubDomains'),
    'Strict-Transport-Security max-age 2 tahun',
  );
  const csp = h.get('content-security-policy') ?? '';
  cek(
    csp.includes("frame-ancestors 'none'") &&
      csp.includes("object-src 'none'") &&
      csp.includes("base-uri 'self'"),
    `Content-Security-Policy (${csp || 'tidak ada'})`,
  );
  const lintas = await fetch(`${dasar}/api/proker`, {
    method: 'POST',
    headers: { Origin: 'https://penyerang.test', 'Content-Type': 'application/json' },
    body: '{}',
  });
  cek(
    lintas.status === 403 && (await lintas.json()).error?.code === 'ORIGIN_DITOLAK',
    `POST lintas situs ditolak (${lintas.status})`,
  );

  // ---------------------------------------------------------------- seed
  const idAkun = async (a: AkunUji) =>
    (await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email = ${a.email}`)[0]!.id;
  const [periode] = await sql<
    { id: string }[]
  >`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  const kadept = await idAkun(AKUN.kadept);
  const anggota = await idAkun(AKUN.anggota);
  const ketuplak = await idAkun(AKUN.sekum);
  const [deptSendiri] = await sql<{ id: string }[]>`
    SELECT departemen_id::text AS id FROM user_role WHERE user_id = ${kadept}::uuid AND periode_id = ${periode!.id}::uuid AND departemen_id IS NOT NULL LIMIT 1`;
  const [deptLain] = await sql<
    { id: string }[]
  >`SELECT id::text FROM departemen WHERE id <> ${deptSendiri!.id}::uuid ORDER BY kode LIMIT 1`;
  const tag = `SEC${Date.now().toString().slice(-7)}`;
  const [pr] = await sql<{ id: string }[]>`
    INSERT INTO proker (periode_id, departemen_id, nama, kategori, status, sumber_dana,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai, dibuat_oleh)
    VALUES (${periode!.id}::uuid, ${deptSendiri!.id}::uuid, ${`${tag} Uji Keamanan`}, 'TERJADWAL', 'BERJALAN', '{}'::text[],
      '2029-11-01', '2029-12-06', '2029-12-07', ${kadept}::uuid) RETURNING id::text`;
  const [kp] = await sql<{ id: string }[]>`
    INSERT INTO kepanitiaan (proker_id, nama_acara, kode_kegiatan, ketua_pelaksana)
    VALUES (${pr!.id}::uuid, ${`${tag} Uji Keamanan`}, ${tag}, ${ketuplak}::uuid) RETURNING id::text`;
  await sql`INSERT INTO rab_meta (kepanitiaan_id) VALUES (${kp!.id}::uuid)`;
  const [dk] = await sql<
    { id: string }[]
  >`INSERT INTO divisi (kepanitiaan_id, nama, koordinator_id, urutan) VALUES (${kp!.id}::uuid, 'Konsumsi', ${anggota}::uuid, 1) RETURNING id::text`;
  const [dp] = await sql<
    { id: string }[]
  >`INSERT INTO divisi (kepanitiaan_id, nama, urutan) VALUES (${kp!.id}::uuid, 'PDD', 2) RETURNING id::text`;
  await sql`INSERT INTO divisi_member (divisi_id, user_id, peran) VALUES (${dk!.id}::uuid, ${anggota}::uuid, 'KOORDINATOR')`;
  const [sk] = await sql<
    { id: string }[]
  >`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${dk!.id}::uuid, 'MAKAN', 1) RETURNING id::text`;
  const [sp] = await sql<
    { id: string }[]
  >`INSERT INTO rab_section (divisi_id, nama, urutan) VALUES (${dp!.id}::uuid, 'DOKUMENTASI', 1) RETURNING id::text`;
  const [ik] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${sk!.id}::uuid, 1, 'Snack', '10', 10, 10000, 100000, false) RETURNING id::text`;
  const [ip] = await sql<{ id: string }[]>`
    INSERT INTO rab_item (section_id, no_urut, jenis_barang, jumlah_teks, jumlah_numerik, harga_satuan, total, total_manual)
    VALUES (${sp!.id}::uuid, 1, 'Sewa kamera', '2', 2, 200000, 400000, false) RETURNING id::text`;
  const prokerBaru: string[] = [];
  const gambarBaru: string[] = [];

  /** SQL sebagai pengguna `userId` lewat role authenticated (RLS aktif), selalu di-rollback. */
  async function sebagai<T>(
    userId: string,
    fn: (tx: postgres.TransactionSql) => Promise<T>,
  ): Promise<T | Error> {
    let hasil: T | Error = new Error('tidak dijalankan');
    await sql
      .begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: userId, role: 'authenticated' }),
        ]);
        await tx.unsafe('SET LOCAL ROLE authenticated');
        try {
          hasil = await fn(tx);
        } catch (e) {
          hasil = e as Error;
        }
        throw new Error('__rollback__');
      })
      .catch(() => undefined);
    return hasil;
  }

  try {
    const sKadept = new Sesi(dasar);
    const sAnggota = new Sesi(dasar);
    cek(await sKadept.masuk(AKUN.kadept), 'login akun uji Kadept');
    cek(await sAnggota.masuk(AKUN.anggota), 'login akun uji Anggota (koordinator Konsumsi)');

    // -------------------------------------------------------------- D
    console.log('\n  D · lintas departemen');
    const badan = (dept: string) =>
      JSON.stringify({
        kategori: 'BERKALA',
        departemen_id: dept,
        nama: `${tag} Rutin`,
        pola_ulang: {
          frekuensi: 'MINGGUAN',
          hari: ['SABTU'],
          mulai: '2029-11-03',
          selesai: '2029-12-01',
        },
      });
    const jsonPost = { method: 'POST', headers: { 'Content-Type': 'application/json' } } as const;
    const lain = await sKadept.minta('/api/proker', { ...jsonPost, body: badan(deptLain!.id) });
    const nLain = (
      await sql<
        { n: number }[]
      >`SELECT count(*)::int n FROM proker WHERE nama = ${`${tag} Rutin`} AND departemen_id = ${deptLain!.id}::uuid`
    )[0]!.n;
    cek(
      lain.status === 403 && nLain === 0,
      `APP: Kadept membuat proker di departemen lain ditolak (${lain.status}, ${nLain} baris)`,
    );
    const sendiri = await sKadept.minta('/api/proker', {
      ...jsonPost,
      body: badan(deptSendiri!.id),
    });
    if (sendiri.ok) prokerBaru.push(((await sendiri.json()) as { data: { id: string } }).data.id);
    cek(
      sendiri.status === 201,
      `APP kontrol: proker yang sama di departemennya sendiri diterima (${sendiri.status})`,
    );
    const rlsD = await sebagai(
      kadept,
      (tx) =>
        tx`INSERT INTO proker (periode_id, departemen_id, nama, kategori, dibuat_oleh)
         VALUES (${periode!.id}::uuid, ${deptLain!.id}::uuid, ${`${tag} RLS`}, 'BERKALA', ${kadept}::uuid) RETURNING id`,
    );
    cek(
      rlsD instanceof Error && /row-level security|permission/i.test(rlsD.message),
      `RLS: INSERT proker departemen lain ditolak (${rlsD instanceof Error ? rlsD.message.slice(0, 60) : 'DITERIMA'})`,
    );

    // -------------------------------------------------------------- V
    console.log('\n  V · lintas divisi');
    const ubah = (harga: number) => ({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jenis_barang: 'Diubah penyerang',
        jumlah_teks: '2',
        jumlah_numerik: null,
        harga_satuan: harga,
        total_manual: false,
      }),
    });
    const vLain = await sAnggota.minta(`/api/rab/item/${ip!.id}`, ubah(1));
    const [itemPdd] = await sql<
      { jenis: string }[]
    >`SELECT jenis_barang AS jenis FROM rab_item WHERE id = ${ip!.id}::uuid`;
    cek(
      [403, 404].includes(vLain.status) && itemPdd!.jenis === 'Sewa kamera',
      `APP: koordinator Konsumsi mengubah item RAB divisi PDD ditolak (${vLain.status})`,
    );
    const vSendiri = await sAnggota.minta(`/api/rab/item/${ik!.id}`, ubah(12000));
    cek(vSendiri.ok, `APP kontrol: item RAB divisinya sendiri dapat diubah (${vSendiri.status})`);
    const rlsV = await sebagai(
      anggota,
      (tx) => tx`UPDATE rab_item SET harga_satuan = 1 WHERE id = ${ip!.id}::uuid RETURNING id`,
    );
    cek(
      Array.isArray(rlsV) && rlsV.length === 0,
      `RLS: UPDATE item RAB divisi lain mengenai ${Array.isArray(rlsV) ? rlsV.length : 'galat'} baris`,
    );
    const rlsVk = await sebagai(
      anggota,
      (tx) => tx`UPDATE rab_item SET harga_satuan = 11000 WHERE id = ${ik!.id}::uuid RETURNING id`,
    );
    cek(
      Array.isArray(rlsVk) && rlsVk.length === 1,
      'RLS kontrol: item RAB divisinya sendiri dapat diubah',
    );

    // -------------------------------------------------------------- U
    console.log('\n  U · upload berbahaya');
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 200, b: 190 } },
    })
      .jpeg()
      .toBuffer();
    const thumb = await sharp(jpeg).resize(400).jpeg().toBuffer();
    const unggah = (master: Blob, nama: string, extra: Record<string, string> = {}) => {
      const f = new FormData();
      f.set('master', master, nama);
      f.set('preview', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'preview.jpg');
      f.set('thumb', new Blob([new Uint8Array(thumb)], { type: 'image/jpeg' }), 'thumb.jpg');
      f.set('original_width', '800');
      f.set('original_height', '600');
      f.set('original_mime_type', 'image/jpeg');
      f.set('original_filename', nama);
      for (const [k, v] of Object.entries(extra)) f.set(k, v);
      return sAnggota.minta('/api/images/upload', { method: 'POST', body: f });
    };
    const pdf = Buffer.from(
      '%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
    );
    const rPdf = await unggah(new Blob([new Uint8Array(pdf)], { type: 'image/jpeg' }), 'struk.jpg');
    cek(
      rPdf.status === 422,
      `PDF menyamar sebagai JPG ditolak (${rPdf.status} ${(await rPdf.json().catch(() => ({}))).error?.code ?? ''})`,
    );
    const besar = new Blob([new Uint8Array(100 * 1024 * 1024)], { type: 'image/jpeg' });
    const rBesar = await unggah(besar, 'besar.jpg');
    cek(rBesar.status === 413, `berkas 100 MB ditolak sebelum dibaca (${rBesar.status})`);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>',
    );
    const rSvg = await unggah(
      new Blob([new Uint8Array(svg)], { type: 'image/svg+xml' }),
      'logo.svg',
    );
    cek(rSvg.status === 422, `SVG berisi script ditolak (${rSvg.status})`);
    const rSvgJpg = await unggah(
      new Blob([new Uint8Array(svg)], { type: 'image/jpeg' }),
      'logo.jpg',
    );
    cek(rSvgJpg.status === 422, `SVG menyamar sebagai JPG ditolak (${rSvgJpg.status})`);
    const rJalur = await unggah(
      new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }),
      '../../../etc/passwd.jpg',
    );
    const dJalur = (await rJalur.json().catch(() => ({}))) as { data?: { id: string } };
    if (dJalur.data?.id) gambarBaru.push(dJalur.data.id);
    const [img] = dJalur.data?.id
      ? await sql<
          { master_path: string; original_filename: string }[]
        >`SELECT master_path, original_filename FROM image WHERE id = ${dJalur.data.id}::uuid`
      : [];
    cek(
      rJalur.status === 201 &&
        !!img &&
        /^nota\/master\/[0-9a-f-]{36}\.jpg$/.test(img.master_path) &&
        !img.original_filename.includes('/') &&
        !img.original_filename.includes('..'),
      `nama berkas path traversal dinetralkan (key ${img?.master_path ?? '-'}, nama "${img?.original_filename ?? '-'}")`,
    );
    const rlsU = await sebagai(
      anggota,
      (tx) =>
        tx`INSERT INTO image (uploader_id, master_path, preview_path, thumbnail_path, original_filename, master_mime_type, original_width, original_height) VALUES (${kadept}::uuid, 'x', 'x', 'x', 'x', 'image/jpeg', 1, 1) RETURNING id`,
    );
    cek(
      rlsU instanceof Error,
      `RLS: menyisipkan gambar atas nama pengguna lain ditolak (${rlsU instanceof Error ? rlsU.message.slice(0, 50) : 'DITERIMA'})`,
    );

    // -------------------------------------------------------------- S
    console.log('\n  S · berkas privat');
    const supa = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, '');
    const pub = process.env.STORAGE_BUCKET_PUBLIC ?? 'public';
    const priv = process.env.STORAGE_BUCKET_PRIVATE ?? 'private';
    const [contoh] = await sql<
      { master_path: string; preview_path: string; thumbnail_path: string }[]
    >`
      SELECT master_path, preview_path, thumbnail_path FROM image ORDER BY created_at DESC LIMIT 1`;
    for (const [jenis, key] of Object.entries(contoh ?? {})) {
      const rPub = await fetch(`${supa}/storage/v1/object/public/${pub}/${key}`);
      const rPriv = await fetch(`${supa}/storage/v1/object/public/${priv}/${key}`);
      cek(
        !rPub.ok && !rPriv.ok,
        `${jenis} tidak terbuka lewat URL publik (bucket publik ${rPub.status}, privat ${rPriv.status})`,
      );
    }
    const { storage, DETIK_SIGNED_URL } = await import('@/lib/storage');
    if (contoh) {
      const url = await storage.getSignedUrl(contoh.thumbnail_path, DETIK_SIGNED_URL);
      const token = new URL(url).searchParams.get('token') ?? '';
      const klaim = JSON.parse(
        Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8') || '{}',
      ) as { exp?: number; iat?: number };
      const r = await fetch(url);
      cek(
        r.ok && klaim.exp! - klaim.iat! === 300,
        `signed URL thumbnail terbuka dan berumur ${klaim.exp! - klaim.iat!} detik`,
      );
    }
    const tanpaSesi = await fetch(
      `${dasar}/api/images/${gambarBaru[0] ?? '00000000-0000-4000-8000-000000000000'}/download`,
      { redirect: 'manual' },
    );
    cek(
      [401, 403, 307].includes(tanpaSesi.status),
      `unduh master tanpa sesi ditolak (${tanpaSesi.status})`,
    );
  } finally {
    for (const id of prokerBaru)
      await sql`DELETE FROM proker WHERE id = ${id}::uuid`.catch(() => undefined);
    await sql`DELETE FROM proker WHERE id = ${pr!.id}::uuid`.catch(() => undefined);
    if (gambarBaru.length) {
      const { storage } = await import('@/lib/storage');
      const baris = await sql<
        { id: string; master_path: string; preview_path: string; thumbnail_path: string }[]
      >`
        SELECT id::text, master_path, preview_path, thumbnail_path FROM image WHERE id IN ${sql(gambarBaru)}`;
      for (const b of baris) {
        for (const k of [b.master_path, b.preview_path, b.thumbnail_path])
          await storage.delete(k).catch(() => undefined);
      }
      await sql`DELETE FROM image WHERE id IN ${sql(gambarBaru)}`.catch(() => undefined);
    }
    await sql.end();
  }

  console.log(
    gagal.length
      ? `\n  ${gagal.length} pemeriksaan GAGAL.`
      : '\n  Seluruh pemeriksaan keamanan lulus.',
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
