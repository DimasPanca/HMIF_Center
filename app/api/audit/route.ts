import { Prisma } from '@prisma/client';

import { lingkupKonteks, requirePermission, type Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { gagal, sukses } from '@/lib/http/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };
const BATAS_BAWAAN = 25;
const BATAS_MAKSIMAL = 100;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

type BarisAudit = {
  aksi: string;
  created_at: Date;
  email: string | null;
  entitas: string;
  entitas_id: string | null;
  id: bigint;
  ip_address: string | null;
  nama_lengkap: string | null;
  nilai_baru: Prisma.JsonValue | null;
  nilai_lama: Prisma.JsonValue | null;
  periode_id: string | null;
  user_agent: string | null;
  user_id: string | null;
};

type BarisPengguna = {
  email: string;
  id: string;
  nama_lengkap: string;
};

type BarisPilihan = {
  aksi: string[];
  entitas: string[];
};

type CursorAudit = {
  createdAt: string;
  id: string;
};

type FilterAudit = {
  aksi: string | null;
  cursor: CursorAudit | null;
  dari: string | null;
  entitas: string | null;
  limit: number;
  sampai: string | null;
  user: string | null;
};

function tanggalValid(nilai: string): boolean {
  if (!POLA_TANGGAL.test(nilai)) return false;
  const [tahun, bulan, hari] = nilai.split('-').map(Number);
  const tanggal = new Date(Date.UTC(tahun!, bulan! - 1, hari));
  return (
    tanggal.getUTCFullYear() === tahun &&
    tanggal.getUTCMonth() === bulan! - 1 &&
    tanggal.getUTCDate() === hari
  );
}

function bacaCursor(nilai: string | null): CursorAudit | null | false {
  if (!nilai) return null;

  try {
    const hasil = JSON.parse(
      Buffer.from(nilai, 'base64url').toString('utf8'),
    ) as Partial<CursorAudit>;
    if (
      typeof hasil.createdAt !== 'string' ||
      Number.isNaN(Date.parse(hasil.createdAt)) ||
      typeof hasil.id !== 'string' ||
      !/^\d+$/.test(hasil.id)
    ) {
      return false;
    }
    return { createdAt: hasil.createdAt, id: hasil.id };
  } catch {
    return false;
  }
}

function buatCursor(baris: BarisAudit): string {
  return Buffer.from(
    JSON.stringify({ createdAt: baris.created_at.toISOString(), id: baris.id.toString() }),
  ).toString('base64url');
}

function bacaFilter(url: URL): FilterAudit | { error: string } {
  const user = url.searchParams.get('user') ?? url.searchParams.get('user_id');
  const dari = url.searchParams.get('dari') ?? url.searchParams.get('tanggal_mulai');
  const sampai = url.searchParams.get('sampai') ?? url.searchParams.get('tanggal_selesai');
  const entitas = url.searchParams.get('entitas');
  const aksi = url.searchParams.get('aksi');
  const cursor = bacaCursor(url.searchParams.get('cursor'));
  const limitMentah = url.searchParams.get('limit');
  const limit = limitMentah ? Number(limitMentah) : BATAS_BAWAAN;

  if (user && user !== 'sistem' && !POLA_UUID.test(user)) {
    return { error: 'Filter pengguna tidak valid.' };
  }
  if (dari && !tanggalValid(dari)) return { error: 'Tanggal awal tidak valid.' };
  if (sampai && !tanggalValid(sampai)) return { error: 'Tanggal akhir tidak valid.' };
  if (dari && sampai && dari > sampai) {
    return { error: 'Tanggal awal tidak boleh setelah tanggal akhir.' };
  }
  if (cursor === false) return { error: 'Cursor tidak valid.' };
  if (!Number.isInteger(limit) || limit < 1 || limit > BATAS_MAKSIMAL) {
    return { error: `Jumlah baris harus antara 1 dan ${BATAS_MAKSIMAL}.` };
  }
  if (entitas && entitas.length > 80) return { error: 'Filter entitas terlalu panjang.' };
  if (aksi && aksi.length > 80) return { error: 'Filter aksi terlalu panjang.' };

  return {
    aksi: aksi || null,
    cursor,
    dari,
    entitas: entitas || null,
    limit,
    sampai,
    user: user || null,
  };
}

/**
 * Audit Kadept hanya boleh menampilkan entitas yang dapat dibuktikan berada di
 * departemennya. Snapshot JSON dipakai lebih dulu agar jejak entitas yang
 * sudah dihapus tetap dapat dicocokkan; relasi aktif menjadi jalur cadangan.
 * Baris global yang tidak dapat diatribusikan ke departemen sengaja ditutup.
 */
function kondisiLingkup(konteks: Konteks): Prisma.Sql {
  if (lingkupKonteks(konteks, 'audit.read') !== 'DEPARTEMEN') return Prisma.sql`TRUE`;
  if (konteks.departemenIds.length === 0) return Prisma.sql`FALSE`;

  const departemenTeks = Prisma.join(konteks.departemenIds);
  const departemenUuid = Prisma.join(konteks.departemenIds.map((id) => Prisma.sql`${id}::uuid`));

  return Prisma.sql`(
    COALESCE(a.nilai_baru->>'departemen_id', a.nilai_lama->>'departemen_id')
      IN (${departemenTeks})
    OR EXISTS (
      SELECT 1 FROM proker p
      WHERE p.departemen_id IN (${departemenUuid})
        AND p.id::text = COALESCE(
          a.nilai_baru->>'proker_id', a.nilai_lama->>'proker_id',
          CASE WHEN a.entitas IN ('proker', 'proker_lock') THEN a.entitas_id END
        )
    )
    OR EXISTS (
      SELECT 1 FROM kepanitiaan k
      JOIN proker p ON p.id = k.proker_id
      WHERE p.departemen_id IN (${departemenUuid})
        AND k.id::text = COALESCE(
          a.nilai_baru->>'kepanitiaan_id', a.nilai_lama->>'kepanitiaan_id',
          CASE WHEN a.entitas IN ('kepanitiaan', 'rab_meta', 'lpj') THEN a.entitas_id END
        )
    )
    OR EXISTS (
      SELECT 1 FROM divisi d
      JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
      JOIN proker p ON p.id = k.proker_id
      WHERE p.departemen_id IN (${departemenUuid})
        AND d.id::text = COALESCE(
          a.nilai_baru->>'divisi_id', a.nilai_lama->>'divisi_id',
          CASE WHEN a.entitas IN ('divisi', 'nota') THEN a.entitas_id END
        )
    )
    OR EXISTS (
      SELECT 1 FROM rab_section rs
      JOIN divisi d ON d.id = rs.divisi_id
      JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
      JOIN proker p ON p.id = k.proker_id
      WHERE p.departemen_id IN (${departemenUuid})
        AND rs.id::text = COALESCE(
          a.nilai_baru->>'section_id', a.nilai_lama->>'section_id',
          CASE WHEN a.entitas = 'rab_item' THEN a.entitas_id END
        )
    )
    OR (
      a.entitas = 'app_user'
      AND EXISTS (
        SELECT 1 FROM user_role ur
        WHERE ur.user_id::text = a.entitas_id
          AND ur.departemen_id IN (${departemenUuid})
      )
    )
  )`;
}

function kondisiFilter(filter: FilterAudit, lingkup: Prisma.Sql): Prisma.Sql[] {
  const kondisi = [lingkup];
  if (filter.user === 'sistem') kondisi.push(Prisma.sql`a.user_id IS NULL`);
  else if (filter.user) kondisi.push(Prisma.sql`a.user_id = ${filter.user}::uuid`);
  if (filter.entitas) kondisi.push(Prisma.sql`a.entitas = ${filter.entitas}`);
  if (filter.aksi) kondisi.push(Prisma.sql`a.aksi = ${filter.aksi}`);
  if (filter.dari) {
    kondisi.push(
      Prisma.sql`a.created_at >= (${filter.dari}::date::timestamp AT TIME ZONE 'Asia/Jakarta')`,
    );
  }
  if (filter.sampai) {
    kondisi.push(
      Prisma.sql`a.created_at < ((${filter.sampai}::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')`,
    );
  }
  if (filter.cursor) {
    kondisi.push(
      Prisma.sql`(a.created_at, a.id) < (${filter.cursor.createdAt}::timestamptz, ${BigInt(filter.cursor.id)})`,
    );
  }
  return kondisi;
}

function petakanBaris(baris: BarisAudit) {
  return {
    id: baris.id.toString(),
    user_id: baris.user_id,
    pengguna: baris.user_id
      ? {
          id: baris.user_id,
          nama: baris.nama_lengkap ?? 'Pengguna tidak tersedia',
          email: baris.email,
        }
      : null,
    periode_id: baris.periode_id,
    aksi: baris.aksi,
    entitas: baris.entitas,
    entitas_id: baris.entitas_id,
    nilai_lama: baris.nilai_lama,
    nilai_baru: baris.nilai_baru,
    ip_address: baris.ip_address,
    user_agent: baris.user_agent,
    created_at: baris.created_at.toISOString(),
  };
}

function amanSpreadsheet(nilai: string): string {
  return /^[=+\-@]/.test(nilai) ? `'${nilai}` : nilai;
}

function selCsv(nilai: unknown): string {
  const teks = amanSpreadsheet(
    nilai === null || nilai === undefined
      ? ''
      : typeof nilai === 'string'
        ? nilai
        : JSON.stringify(nilai),
  );
  return `"${teks.replace(/"/g, '""')}"`;
}

function buatCsv(baris: BarisAudit[]): string {
  const kepala = [
    'Waktu',
    'Pengguna',
    'Email',
    'Aksi',
    'Entitas',
    'ID Entitas',
    'Nilai Lama',
    'Nilai Baru',
    'Alamat IP',
    'User Agent',
  ];
  const isi = baris.map((item) =>
    [
      item.created_at.toISOString(),
      item.nama_lengkap ?? 'Sistem',
      item.email,
      item.aksi,
      item.entitas,
      item.entitas_id,
      item.nilai_lama,
      item.nilai_baru,
      item.ip_address,
      item.user_agent,
    ]
      .map(selCsv)
      .join(','),
  );
  return `\uFEFF${[kepala.map(selCsv).join(','), ...isi].join('\r\n')}`;
}

async function ambilBaris(kondisi: Prisma.Sql[], limit: number | null): Promise<BarisAudit[]> {
  const batas = limit === null ? Prisma.empty : Prisma.sql`LIMIT ${limit}`;
  return db.$queryRaw<BarisAudit[]>`
    SELECT
      a.id, a.user_id, a.periode_id, a.aksi, a.entitas, a.entitas_id,
      a.nilai_lama, a.nilai_baru, a.ip_address::text AS ip_address,
      a.user_agent, a.created_at, u.nama_lengkap, u.email
    FROM audit_log a
    LEFT JOIN app_user u ON u.id = a.user_id
    WHERE ${Prisma.join(kondisi, ' AND ')}
    ORDER BY a.created_at DESC, a.id DESC
    ${batas}
  `;
}

async function ambilPilihan(lingkup: Prisma.Sql) {
  const [pilihan] = await db.$queryRaw<BarisPilihan[]>`
    SELECT
      COALESCE(array_agg(DISTINCT a.aksi ORDER BY a.aksi), ARRAY[]::text[]) AS aksi,
      COALESCE(array_agg(DISTINCT a.entitas ORDER BY a.entitas), ARRAY[]::text[]) AS entitas
    FROM audit_log a
    WHERE ${lingkup}
  `;
  const pengguna = await db.$queryRaw<BarisPengguna[]>`
    SELECT DISTINCT u.id, u.nama_lengkap, u.email
    FROM audit_log a
    JOIN app_user u ON u.id = a.user_id
    WHERE ${lingkup}
    ORDER BY u.nama_lengkap, u.email
  `;

  return {
    aksi: pilihan?.aksi ?? [],
    entitas: pilihan?.entitas ?? [],
    pengguna,
  };
}

export async function GET(request: Request) {
  const guard = await requirePermission('audit.read');
  if (!guard.ok) {
    guard.nilai.headers.set('Cache-Control', 'no-store');
    return guard.nilai;
  }

  const url = new URL(request.url);
  const filter = bacaFilter(url);
  if ('error' in filter) {
    return gagal('TIDAK_VALID', filter.error, { status: 422, headers: TANPA_CACHE });
  }

  try {
    const lingkup = kondisiLingkup(guard.konteks);
    const kondisi = kondisiFilter(filter, lingkup);

    if (url.searchParams.get('format') === 'csv') {
      const baris = await ambilBaris(kondisi, null);
      return new Response(buatCsv(baris), {
        status: 200,
        headers: {
          ...TANPA_CACHE,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const [baris, pilihan] = await Promise.all([
      ambilBaris(kondisi, filter.limit + 1),
      ambilPilihan(lingkup),
    ]);
    const adaBerikutnya = baris.length > filter.limit;
    const item = baris.slice(0, filter.limit);

    return sukses(
      {
        items: item.map(petakanBaris),
        next_cursor: adaBerikutnya && item.length > 0 ? buatCursor(item[item.length - 1]!) : null,
        pilihan,
      },
      { headers: TANPA_CACHE },
    );
  } catch (error) {
    console.error('Audit log belum dapat dibaca.', error);
    return gagal('GAGAL_MEMBACA_AUDIT', 'Audit log belum dapat dimuat.', {
      status: 500,
      headers: TANPA_CACHE,
    });
  }
}
