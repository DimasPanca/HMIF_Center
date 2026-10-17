/**
 * pindah-turunan-nota — memindahkan preview/thumbnail nota dari bucket PUBLIK
 * ke bucket PRIVAT (ADR-011, temuan SECURITY_AUDIT S-01, T-113).
 *
 *   npx tsx scripts/pindah-turunan-nota.ts --kering   daftar saja
 *   npx tsx scripts/pindah-turunan-nota.ts            salin → verifikasi → hapus publik
 *
 * Sejak T-113 `keys.ts` menurunkan bucket privat untuk `nota/preview/` dan
 * `nota/thumb/`, sehingga berkas lama di bucket publik tidak terjangkau
 * aplikasi lagi — dan, lebih penting, masih terbuka bagi siapa pun yang
 * memegang URL-nya. Setiap berkas disalin ke privat, isinya dicocokkan
 * SHA-256, baru kemudian salinan publik dihapus. Aman diulang.
 *
 * Skrip administratif: memakai klien Supabase langsung karena adapter
 * sengaja tidak bisa menyentuh bucket yang "salah" untuk sebuah key.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERING = process.argv.includes('--kering');
const PREFIX = ['nota/preview', 'nota/thumb'];

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

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function main(): Promise<number> {
  muatEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rahasia = process.env.SUPABASE_SECRET_KEY;
  if (!url || !rahasia) {
    console.error('  NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi.');
    return 1;
  }
  const publik = process.env.STORAGE_BUCKET_PUBLIC ?? 'public';
  const privat = process.env.STORAGE_BUCKET_PRIVATE ?? 'private';
  const s = createClient(url, rahasia, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;

  const daftar: { key: string; mime: string | null }[] = [];
  for (const p of PREFIX) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await s.from(publik).list(p, { limit: 1000, offset });
      if (error) throw new Error(`list ${p}: ${error.message}`);
      for (const o of data ?? [])
        if (o.id)
          daftar.push({
            key: `${p}/${o.name}`,
            mime: (o.metadata as { mimetype?: string } | null)?.mimetype ?? null,
          });
      if (!data || data.length < 1000) break;
    }
  }
  console.log(`  ${daftar.length} turunan nota di bucket publik "${publik}"`);
  if (KERING || !daftar.length) return 0;

  let pindah = 0;
  const gagal: string[] = [];
  for (const o of daftar) {
    try {
      // Unduhan SDK dari bucket publik gagal "Bucket not found" (HANDOFF T-044);
      // adapter pun membacanya lewat URL publik — justru celah yang ditutup di sini.
      const r = await fetch(
        `${url.replace(/\/+$/, '')}/storage/v1/object/public/${publik}/${o.key}`,
        { cache: 'no-store' },
      );
      if (!r.ok) throw new Error(`unduh publik HTTP ${r.status}`);
      const isi = Buffer.from(await r.arrayBuffer());
      const naik = await s
        .from(privat)
        .upload(o.key, isi, { contentType: o.mime ?? 'image/webp', upsert: true });
      if (naik.error) throw new Error(naik.error.message);
      const cek = await s.from(privat).download(o.key);
      if (cek.error || !cek.data || sha(Buffer.from(await cek.data.arrayBuffer())) !== sha(isi))
        throw new Error('salinan privat tidak cocok');
      const hapus = await s.from(publik).remove([o.key]);
      if (hapus.error) throw new Error(`hapus publik: ${hapus.error.message}`);
      pindah++;
    } catch (e) {
      gagal.push(`${o.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`  ${pindah} dipindah ke "${privat}", ${gagal.length} gagal`);
  for (const g of gagal) console.log(`  [GAGAL] ${g}`);
  return gagal.length ? 1 : 0;
}

main().then(
  (k) => process.exit(k),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
