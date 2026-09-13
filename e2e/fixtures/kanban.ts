/** Fixture per-test: ID acak, hanya seed/inspeksi/cleanup memakai koneksi owner. */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import { test as base, expect, type Page } from '@playwright/test';
import postgres from 'postgres';

import { AKUN, PASSWORD_UJI, type AkunUji } from './akun';

export type KartuKanban = {
  id: string;
  judul: string;
  kolom: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
};

type DataKanban = {
  sql: ReturnType<typeof postgres>;
  departemen: { id: string; kode: string };
  departemenLain: { id: string; kode: string };
  anggotaId: string;
  prokerId: string;
  prokerNama: string;
  deadline: string;
  kartu: { gerak: KartuKanban; selesai: KartuKanban; filter: KartuKanban; asing: KartuKanban };
};

function koneksi(): string {
  const env: Record<string, string> = {};
  if (fs.existsSync('.env.local')) {
    for (const baris of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      if (!baris.trim() || baris.trim().startsWith('#')) continue;
      const i = baris.indexOf('=');
      if (i > 0)
        env[baris.slice(0, i).trim()] = baris
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
    }
  }
  const url =
    process.env.DIRECT_URL || env.DIRECT_URL || process.env.DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error('Gate Kanban aktif membutuhkan DIRECT_URL/DATABASE_URL untuk fixture.');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Fixture Kanban dilarang di produksi.');
  return url;
}

export async function masukKanban(page: Page, akun: AkunUji = AKUN.anggota): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(akun.email);
  await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
  await page.getByRole('button', { name: /masuk|login/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

export const test = base.extend<{ kanban: DataKanban }>({
  kanban: async ({ baseURL }, jalankan) => {
    if (!baseURL) throw new Error('Gate Kanban membutuhkan baseURL aplikasi uji.');
    const sql = postgres(koneksi(), { ssl: 'require', max: 1, onnotice: () => {} });
    const prokerIds = [randomUUID(), randomUUID(), randomUUID()];
    const kartuIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const awalan = `E2E80-${randomUUID()}`;
    try {
      const [periode] = await sql<{ id: string }[]>`SELECT id FROM periode WHERE status = 'AKTIF'`;
      if (!periode) throw new Error('Periode aktif belum tersedia; jalankan seed:e2e-auth.');
      const [anggota] = await sql<{ id: string; departemen_id: string }[]>`
        SELECT u.id, ur.departemen_id FROM app_user u
        JOIN user_role ur ON ur.user_id = u.id AND ur.periode_id = ${periode.id}::uuid
        WHERE u.email = ${AKUN.anggota.email} AND ur.role = 'ANGGOTA' ORDER BY ur.id LIMIT 1`;
      const [admin] = await sql<
        { id: string }[]
      >`SELECT id FROM app_user WHERE email = ${AKUN.admin.email}`;
      if (!anggota || !admin)
        throw new Error('Akun Kanban belum tersedia; jalankan seed:e2e-auth.');
      const [departemen] = await sql<{ id: string; kode: string }[]>`
        SELECT id, kode FROM departemen WHERE id = ${anggota.departemen_id}::uuid`;
      const [departemenLain] = await sql<{ id: string; kode: string }[]>`
        SELECT id, kode FROM departemen WHERE id <> ${anggota.departemen_id}::uuid AND is_active
        ORDER BY urutan LIMIT 1`;
      if (!departemen || !departemenLain)
        throw new Error('Gate Kanban membutuhkan dua departemen.');

      // Tanggal relatif berasal dari DB. BERKALA tidak mengambil kunci kalender.
      const [tanggal] = await sql<{ deadline: string }[]>`
        SELECT (CURRENT_DATE + 3)::text AS deadline`;
      const deadline = tanggal!.deadline;
      await sql.begin(async (tx) => {
        for (let i = 0; i < prokerIds.length; i++) {
          await tx`
            INSERT INTO proker (id, periode_id, departemen_id, nama, kategori, status,
              tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
              dibuat_oleh, penanggung_jawab)
            VALUES (${prokerIds[i]!}::uuid, ${periode.id}::uuid,
              ${i === 2 ? departemenLain.id : departemen.id}::uuid, ${`${awalan} proker ${i}`},
              'BERKALA', 'DISETUJUI', CURRENT_DATE, CURRENT_DATE + 20, CURRENT_DATE + 22,
              ${admin.id}::uuid, ${anggota.id}::uuid)`;
        }
        const daftar = [
          { proker: 0, kolom: 'TODO', prioritas: 'TINGGI', assignee: anggota.id, hari: 3 },
          { proker: 0, kolom: 'DONE', prioritas: 'RENDAH', assignee: admin.id, hari: 20 },
          { proker: 1, kolom: 'REVIEW', prioritas: 'SEDANG', assignee: admin.id, hari: 20 },
          { proker: 2, kolom: 'TODO', prioritas: 'TINGGI', assignee: anggota.id, hari: 3 },
        ];
        for (const [i, kartu] of daftar.entries()) {
          await tx`
            INSERT INTO kanban_card (id, departemen_id, proker_id, judul, kolom, prioritas,
              assignee_id, deadline, urutan, created_by)
            VALUES (${kartuIds[i]!}::uuid, ${kartu.proker === 2 ? departemenLain.id : departemen.id}::uuid,
              ${prokerIds[kartu.proker]!}::uuid, ${`${awalan} kartu ${i}`}, ${kartu.kolom}::kanban_kolom,
              ${kartu.prioritas}::prioritas, ${kartu.assignee}::uuid, CURRENT_DATE + ${kartu.hari}::int,
              0, ${admin.id}::uuid)`;
        }
      });
      const kartu = (i: number, kolom: KartuKanban['kolom']): KartuKanban => ({
        id: kartuIds[i]!,
        judul: `${awalan} kartu ${i}`,
        kolom,
      });
      await jalankan({
        sql,
        departemen,
        departemenLain,
        anggotaId: anggota.id,
        prokerId: prokerIds[0]!,
        prokerNama: `${awalan} proker 0`,
        deadline,
        kartu: {
          gerak: kartu(0, 'TODO'),
          selesai: kartu(1, 'DONE'),
          filter: kartu(2, 'REVIEW'),
          asing: kartu(3, 'TODO'),
        },
      });
    } finally {
      // Tepat ID yang dibuat test ini; tak menghapus fixture gate lain.
      try {
        await sql`DELETE FROM kanban_card WHERE id = ANY(${kartuIds}::uuid[])`;
        await sql`DELETE FROM proker WHERE id = ANY(${prokerIds}::uuid[])`;
      } finally {
        await sql.end();
      }
    }
  },
});

export { expect };
