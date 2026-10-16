/**
 * Membuat divisi kepanitiaan LENGKAP dengan ruang kerjanya (T-093). Server-only.
 *
 * `bentuk_kepanitiaan()` (migrasi 022) membuat setiap divisi bersama satu
 * `job_desk` kosong dan satu `gantt_chart` scope DIVISI. Divisi yang ditambah
 * kemudian — lewat grid RAB (T-087) atau impor Excel (T-091) — harus sama
 * bentuknya, supaya ruang kerja divisinya tidak setengah jadi. Semua jalur
 * pembuatan divisi di aplikasi memakai fungsi ini.
 *
 * Sumber: docs/ai/tasks/P5-kepanitiaan-rab.md T-093 · migrasi 022 · PRD F-8.2
 */

import type { TxKlien } from '@/lib/db/with-audit-context';

if (typeof window !== 'undefined') {
  throw new Error('lib/kepanitiaan/divisi.ts adalah modul server-only.');
}

export async function buatDivisiLengkap(
  tx: TxKlien,
  p: { kepanitiaanId: string; nama: string; urutan: number; pembuatId: string },
): Promise<{ id: string }> {
  const kp = await tx.kepanitiaan.findUniqueOrThrow({ where: { id: p.kepanitiaanId }, select: { proker: { select: { periode_id: true } } } });
  const d = await tx.divisi.create({ data: { kepanitiaan_id: p.kepanitiaanId, nama: p.nama, urutan: p.urutan }, select: { id: true } });
  await tx.job_desk.create({ data: { divisi_id: d.id, konten: { type: 'doc', content: [{ type: 'paragraph' }] }, updated_by: p.pembuatId } });
  // Periode chart = periode proker acaranya (sama dengan fn_gantt_chart_periode, migrasi 037).
  await tx.gantt_chart.create({ data: { scope: 'DIVISI', divisi_id: d.id, periode_id: kp.proker.periode_id, judul: `Gantt Divisi ${p.nama}` } });
  return d;
}
