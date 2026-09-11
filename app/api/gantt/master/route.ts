import { requirePermission } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { sukses } from '@/lib/http/respond';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

interface BarisMaster {
  departemen_id: string | null;
  departemen_nama: string | null;
  departemen_warna: string | null;
  departemen_urutan: number | null;
  proker_id: string | null;
  proker_nama: string | null;
  kategori: string | null;
  status: string | null;
  tanggal_mulai_persiapan: string | null;
  tanggal_hari_h_mulai: string | null;
  tanggal_hari_h_selesai: string | null;
  pj_nama: string | null;
  progres: number | null;
}

export async function GET() {
  const guard = await requirePermission('master_gantt.read');
  if (!guard.ok) {
    guard.nilai.headers.set('Cache-Control', 'no-store');
    return guard.nilai;
  }

  const baris = await db.$queryRaw<BarisMaster[]>`
    SELECT
      departemen_id,
      departemen_nama,
      departemen_warna,
      departemen_urutan,
      proker_id,
      proker_nama,
      kategori::text,
      status::text,
      to_char(tanggal_mulai_persiapan, 'YYYY-MM-DD') AS tanggal_mulai_persiapan,
      to_char(tanggal_hari_h_mulai, 'YYYY-MM-DD') AS tanggal_hari_h_mulai,
      to_char(tanggal_hari_h_selesai, 'YYYY-MM-DD') AS tanggal_hari_h_selesai,
      pj_nama,
      progres::float8
    FROM v_master_gantt
    ORDER BY departemen_urutan, tanggal_mulai_persiapan, proker_nama
  `;

  return sukses(baris, { headers: TANPA_CACHE });
}
