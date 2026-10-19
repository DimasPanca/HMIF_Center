/**
 * Akun & data pengurus demo.
 *
 * Membuat 30 akun Supabase Auth berkata sandi PASSWORD_DEMO, baris `app_user`,
 * `user_role` pada periode aktif, dan `pengurus` (Data Pengurus) untuk mereka
 * plus pengurus tanpa akun. Idempoten: akun yang sudah ada disetel ulang
 * passwordnya dan dipakai apa adanya.
 */

import { DOMAIN_DEMO, PASSWORD_DEMO, ok, type Sql } from './konfig';
import { NAMA_DEPARTEMEN, PENGURUS_TANPA_AKUN, ROSTER, emailDemo, type OrangDemo } from './roster';

export interface InfoAkun {
  id: string;
  email: string;
  orang: OrangDemo;
}

export interface Latar {
  periodeId: string;
  /** kode departemen → id */
  dept: Map<string, string>;
}

export async function bacaLatar(sql: Sql): Promise<Latar> {
  const [p] = await sql<{ id: string }[]>`SELECT id::text FROM periode WHERE status = 'AKTIF' LIMIT 1`;
  if (!p) throw new Error('Tidak ada periode AKTIF. Jalankan `npm run seed:e2e-auth` (atau aktifkan periode di menu Administrasi) lebih dulu.');
  const dept = await sql<{ id: string; kode: string }[]>`SELECT id::text, kode FROM departemen WHERE is_active`;
  return { periodeId: p.id, dept: new Map(dept.map((d) => [d.kode, d.id])) };
}

export async function buatAkun(sql: Sql, env: Record<string, string>, latar: Latar): Promise<Map<string, InfoAkun>> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error('Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY di .env.local.');
  const kepala = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };

  const sudah = new Map<string, string>();
  for (let halaman = 1; halaman < 20; halaman++) {
    const r = await fetch(`${url}/auth/v1/admin/users?per_page=200&page=${halaman}`, { headers: kepala });
    if (!r.ok) throw new Error(`Gagal membaca daftar pengguna Auth: ${r.status} ${await r.text()}`);
    const j = (await r.json()) as { users?: Array<{ id: string; email: string }> };
    for (const u of j.users ?? []) sudah.set(u.email.toLowerCase(), u.id);
    if ((j.users ?? []).length < 200) break;
  }

  const hasil = new Map<string, InfoAkun>();
  for (const o of ROSTER) {
    const email = emailDemo(o.kunci, DOMAIN_DEMO);
    let id = sudah.get(email.toLowerCase());
    if (id) {
      const r = await fetch(`${url}/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        headers: kepala,
        body: JSON.stringify({ password: PASSWORD_DEMO, email_confirm: true }),
      });
      if (!r.ok) throw new Error(`Gagal memperbarui ${email}: ${r.status} ${await r.text()}`);
    } else {
      const r = await fetch(`${url}/auth/v1/admin/users`, {
        method: 'POST',
        headers: kepala,
        body: JSON.stringify({ email, password: PASSWORD_DEMO, email_confirm: true }),
      });
      if (!r.ok) throw new Error(`Gagal membuat ${email}: ${r.status} ${await r.text()}`);
      id = ((await r.json()) as { id: string }).id;
    }

    await sql`
      INSERT INTO app_user (id, nama_lengkap, nim, email, angkatan, is_active)
      VALUES (${id}::uuid, ${o.nama}, ${o.nim}, ${email}, ${o.angkatan}, true)
      ON CONFLICT (id) DO UPDATE SET nama_lengkap = EXCLUDED.nama_lengkap, nim = EXCLUDED.nim, angkatan = EXCLUDED.angkatan, is_active = true`;

    const deptId = o.dept ? latar.dept.get(o.dept)! : null;
    // `created_at` Ketua demo dibuat lebih tua daripada baris KETUA mana pun
    // (mis. akun uji e2e): "Ketua Himpunan" pada kop surat/TOR/proposal dipilih
    // dari baris KETUA tertua periode aktif (lib/surat/konfig.ts).
    await sql`
      INSERT INTO user_role (user_id, periode_id, role, departemen_id, jabatan_teks, created_at)
      VALUES (${id}::uuid, ${latar.periodeId}::uuid, ${o.role}::role_code, ${deptId}::uuid, ${o.jabatan},
              ${o.role === 'KETUA' ? '2000-01-01T00:00:00Z' : new Date().toISOString()}::timestamptz)
      ON CONFLICT DO NOTHING`;

    hasil.set(o.kunci, { id, email, orang: o });
  }
  ok(`${hasil.size} akun demo siap (kata sandi ${PASSWORD_DEMO})`);
  return hasil;
}

export async function isiDataPengurus(sql: Sql, latar: Latar, akun: Map<string, InfoAkun>): Promise<void> {
  for (const a of akun.values()) {
    const o = a.orang;
    if (o.role === 'ADMIN') continue; // admin sistem bukan pengurus himpunan
    await sql`
      INSERT INTO pengurus (periode_id, user_id, nama_lengkap, nim, jabatan, departemen_id, angkatan, is_aktif)
      VALUES (${latar.periodeId}::uuid, ${a.id}::uuid, ${o.nama}, ${o.nim}, ${o.jabatan},
              ${o.dept ? latar.dept.get(o.dept)! : null}::uuid, ${o.angkatan}, true)
      ON CONFLICT (periode_id, nim) DO UPDATE SET user_id = EXCLUDED.user_id, nama_lengkap = EXCLUDED.nama_lengkap, jabatan = EXCLUDED.jabatan`;
  }
  let nim = 7737230100;
  for (const p of PENGURUS_TANPA_AKUN) {
    await sql`
      INSERT INTO pengurus (periode_id, nama_lengkap, nim, jabatan, departemen_id, angkatan, is_aktif)
      VALUES (${latar.periodeId}::uuid, ${p.nama}, ${String(nim++)}, ${`Staff Departemen ${NAMA_DEPARTEMEN[p.dept as keyof typeof NAMA_DEPARTEMEN]}`},
              ${latar.dept.get(p.dept)!}::uuid, ${p.angkatan}, true)
      ON CONFLICT (periode_id, nim) DO NOTHING`;
  }
  ok(`Data Pengurus: ${akun.size - 1 + PENGURUS_TANPA_AKUN.length} pengurus (${PENGURUS_TANPA_AKUN.length} tanpa akun)`);
}
