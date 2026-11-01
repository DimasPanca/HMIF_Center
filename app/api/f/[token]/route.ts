/**
 * Pengisian form publik (ADR-038 #9). Rute ini dikecualikan dari sesi di
 * middleware; sesi tetap dibaca bila ada (form INTERNAL wajib login).
 *
 * POST multipart: `jawaban` (JSON {pertanyaanId: nilai}), berkas
 * `berkas_<pertanyaanId>`, dan honeypot `situs_web` yang harus kosong —
 * bot yang mengisinya menerima "sukses" palsu tanpa apa pun disimpan.
 */

import { konteksSaatIni } from '@/lib/auth/guard';
import type { MasukanJawaban } from '@/lib/form/jawaban';
import { formUntukIsi, kirimRespons, type BerkasMasuk } from '@/lib/form/respons';
import { STATUS_HTTP_FORM } from '@/lib/form/service';
import { gagal, sukses } from '@/lib/http/respond';
import { cekBatas, ipDari, respons429 } from '@/lib/security/rate-limit';

interface RouteContext {
  params: Promise<{ token: string }>;
}

const TANPA_CACHE = { 'Cache-Control': 'no-store' };
/** Vercel menolak badan > 4,5 MB; sisakan ruang untuk pembungkus multipart. */
const MAKS_BADAN = 4.4 * 1024 * 1024;
const BATAS_KIRIM = { batas: 20, jendelaDetik: 60 * 60 };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const f = await formUntukIsi(token, await konteksSaatIni());
  return f ? sukses(f, { headers: TANPA_CACHE }) : gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.', { status: 404, headers: TANPA_CACHE });
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!/^[0-9a-f]{32}$/.test(token)) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.', { status: 404 });

  const panjang = Number(request.headers.get('content-length') ?? 0);
  if (panjang > MAKS_BADAN) return gagal('VALIDASI_GAGAL', 'Total berkas terlalu besar (maksimal 4 MB per kiriman).', { status: 413 });

  const batas = await cekBatas(`form:${token}:${ipDari(request.headers)}`, BATAS_KIRIM.batas, BATAS_KIRIM.jendelaDetik);
  if (!batas.ok) return respons429(batas, 'Terlalu banyak kiriman dari jaringan ini. Coba lagi nanti.');

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return gagal('VALIDASI_GAGAL', 'Kiriman tidak dapat dibaca.', { status: 422 });
  }

  const madu = data.get('situs_web');
  if (typeof madu === 'string' && madu.trim() !== '') return sukses({ pesan_selesai: 'Terima kasih, jawaban Anda sudah tercatat.' });

  let masukan: MasukanJawaban;
  try {
    const mentah = JSON.parse(String(data.get('jawaban') ?? '{}')) as unknown;
    if (!mentah || typeof mentah !== 'object' || Array.isArray(mentah)) throw new Error();
    masukan = mentah as MasukanJawaban;
  } catch {
    return gagal('VALIDASI_GAGAL', 'Format jawaban tidak valid.', { status: 422 });
  }

  const berkas: BerkasMasuk[] = [];
  for (const [kunci, nilai] of data.entries()) {
    if (!kunci.startsWith('berkas_') || typeof nilai === 'string') continue;
    berkas.push({ pertanyaanId: kunci.slice('berkas_'.length), nama: nilai.name, isi: Buffer.from(await nilai.arrayBuffer()) });
  }

  const h = await kirimRespons({ token, konteks: await konteksSaatIni(), masukan, berkas });
  return h.ok
    ? sukses(h.nilai, { status: 201, headers: TANPA_CACHE })
    : gagal(h.kode, h.pesan, { details: h.details, status: STATUS_HTTP_FORM[h.kode], headers: TANPA_CACHE });
}
