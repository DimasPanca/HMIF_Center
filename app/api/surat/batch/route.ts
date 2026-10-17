import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guard';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal } from '@/lib/http/respond';
import {
  BATAS_TRANSAKSI_BATCH_MS,
  belumTerbit,
  buatBatch,
  penerbitSungguhan,
  setujuiBatch,
  terbitkanBatch,
  tolakBatch,
  zipBatch,
  type ItemBatch,
  type ProgresBatch,
} from '@/lib/surat/batch';
import { BATAS, cekBatas, respons429 } from '@/lib/security/rate-limit';
import { STATUS_GAGAL_SURAT } from '@/lib/surat/draft';

import { TANPA_CACHE, bacaBody, responsGuard, responsSurat } from '@/app/api/surat/_respons';

/** 50 dokumen × ±0,3 dtk generate + unggah, dengan ruang. */
export const maxDuration = 60;

const SkemaAksi = z.object({
  aksi: z.enum(['buat', 'setujui', 'terbitkan', 'tolak']),
  batch: z.uuid().optional(),
});

/**
 * Progres generate dikirim sebagai NDJSON — satu baris per dokumen, lalu
 * ringkasan — dalam SATU request (kontrak T-064: bukan 30 request approval
 * terpisah dari klien). Nomor sudah di-commit sebelum streaming dimulai, jadi
 * koneksi yang putus di tengah tidak melepas nomor; sisa dokumen dapat
 * diterbitkan ulang lewat `aksi: 'terbitkan'`.
 */
function streamProgres(items: ItemBatch[], terbit: (id: string) => ReturnType<ReturnType<typeof penerbitSungguhan>>, awal: object) {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const kirim = (o: object) => c.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      kirim(awal);
      await terbitkanBatch(items, (p: ProgresBatch) => kirim(p), terbit);
      c.close();
    },
  });
  return new Response(stream, {
    headers: { ...TANPA_CACHE, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function POST(request: Request) {
  const body = (await bacaBody(request)) as Record<string, unknown> | null;
  const a = SkemaAksi.safeParse(body ?? {});
  if (!a.success) return gagal('VALIDASI_GAGAL', 'Aksi tidak valid.', { status: 422, headers: TANPA_CACHE });

  if (a.data.aksi === 'buat') {
    const guard = await requirePermission('surat.create');
    if (!guard.ok) return responsGuard(guard.nilai);
    const hasil = await withAuditContext(request, guard.konteks, (tx) => buatBatch(tx, guard.konteks, body), {
      timeout: BATAS_TRANSAKSI_BATCH_MS,
    });
    return responsSurat(hasil, 201);
  }

  const guard = await requirePermission('surat.approve');
  if (!guard.ok) return responsGuard(guard.nilai);
  if (!a.data.batch) return gagal('VALIDASI_GAGAL', 'Batch wajib dipilih.', { status: 422, headers: TANPA_CACHE });
  const batch = a.data.batch;

  if (a.data.aksi === 'tolak') {
    const hasil = await withAuditContext(request, guard.konteks, (tx) => tolakBatch(tx, guard.konteks, batch, body), {
      timeout: BATAS_TRANSAKSI_BATCH_MS,
    });
    return responsSurat(hasil);
  }

  if (a.data.aksi === 'terbitkan') {
    const items = await belumTerbit(guard.konteks, batch);
    if (items.length === 0) return gagal('STATUS_TIDAK_SESUAI', 'Tidak ada surat batch ini yang menunggu terbit.', { status: 409, headers: TANPA_CACHE });
    return streamProgres(items, penerbitSungguhan(request, guard.konteks), { tipe: 'mulai', total: items.length });
  }

  // T-113 / SYSTEM_DESIGN §18.3: 100 persetujuan surat per jam per user.
  const batas = await cekBatas(`approve-surat:${guard.konteks.sesi.userId}`, BATAS.approveSurat.batas, BATAS.approveSurat.jendelaDetik);
  if (!batas.ok) return respons429(batas, `Batas ${BATAS.approveSurat.batas} persetujuan surat per jam tercapai.`);
  const disetujui = await withAuditContext(request, guard.konteks, (tx) => setujuiBatch(tx, guard.konteks, batch), {
    timeout: BATAS_TRANSAKSI_BATCH_MS,
  });
  if (!disetujui.ok) {
    return gagal(disetujui.kode, disetujui.pesan, { status: STATUS_GAGAL_SURAT[disetujui.kode], headers: TANPA_CACHE });
  }
  const items = disetujui.nilai;
  return streamProgres(items, penerbitSungguhan(request, guard.konteks), {
    tipe: 'mulai',
    total: items.length,
    nomor_awal: items[0]?.nomor ?? null,
    nomor_akhir: items.at(-1)?.nomor ?? null,
  });
}

/** `?batch=<id>` → ZIP seluruh DOCX batch yang sudah terbit, `{nomor}-{nama}.docx`. */
export async function GET(request: Request) {
  const guard = await requirePermission('surat.read');
  if (!guard.ok) return responsGuard(guard.nilai);
  const batch = z.uuid().safeParse(new URL(request.url).searchParams.get('batch'));
  if (!batch.success) return gagal('VALIDASI_GAGAL', 'Batch tidak valid.', { status: 422, headers: TANPA_CACHE });

  const zip = await zipBatch(guard.konteks, batch.data);
  if (!zip) return gagal('TIDAK_DITEMUKAN', 'Belum ada dokumen terbit di batch ini.', { status: 404, headers: TANPA_CACHE });
  return new Response(new Uint8Array(zip.isi), {
    headers: {
      ...TANPA_CACHE,
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="surat-aktif-organisasi.zip"',
      'X-Content-Type-Options': 'nosniff',
      'X-Jumlah-Dokumen': String(zip.jumlah),
    },
  });
}

