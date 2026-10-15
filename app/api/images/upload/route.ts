import { requirePermission } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';
import { FileTidakValidError, MAKS_BYTE } from '@/lib/images/server-validate';
import { SkemaMetaSumber, unggahGambar } from '@/lib/images/upload';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

const TANPA_CACHE = { 'Cache-Control': 'no-store' };

/** T-098 #8: 30 unggahan per jam per pengguna. */
const BATAS_PER_JAM = 30;

/** Tiga berkas + metadata form; sedikit kelonggaran di atas 15 MB master. */
const MAKS_BADAN = MAKS_BYTE + 6 * 1024 * 1024;

/**
 * Unggah gambar nota: `master`, `preview`, `thumb` (hasil pipeline klien
 * T-097) + metadata sumber. Seluruh jenis & keutuhan diperiksa ulang di
 * server — `Content-Type` dan nama berkas dari klien TIDAK dipercaya.
 *
 * Sumber: T-098 · SYSTEM_DESIGN §9.3 · INV-21, INV-23
 */
export async function POST(request: Request) {
  const guard = await requirePermission('nota.create');
  if (!guard.ok) return guard.nilai;
  const { konteks } = guard;

  const panjang = Number(request.headers.get('content-length') ?? '0');
  if (panjang > MAKS_BADAN) {
    return gagal('FILE_TIDAK_VALID', 'Ukuran unggahan melebihi batas 15 MB.', { status: 413, headers: TANPA_CACHE });
  }

  const [hitung] = await db.$queryRaw<{ n: number; sisa: number | null }[]>`
    SELECT count(*)::int AS n,
           CEIL(EXTRACT(EPOCH FROM (min(created_at) + interval '1 hour' - now())))::int AS sisa
    FROM image WHERE uploader_id = ${konteks.sesi.userId}::uuid AND created_at > now() - interval '1 hour'`;
  if ((hitung?.n ?? 0) >= BATAS_PER_JAM) {
    const menit = Math.max(1, Math.ceil((hitung?.sisa ?? 3600) / 60));
    return gagal('TERLALU_BANYAK_PERCOBAAN', `Batas ${BATAS_PER_JAM} unggahan per jam tercapai. Coba lagi dalam ${menit} menit.`, {
      status: 429,
      headers: { ...TANPA_CACHE, 'Retry-After': String(menit * 60) },
    });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return gagal('FILE_TIDAK_VALID', 'Unggahan tidak terbaca.', { status: 422, headers: TANPA_CACHE });
  const master = form.get('master');
  const preview = form.get('preview');
  const thumb = form.get('thumb');
  if (!(master instanceof File) || !(preview instanceof File) || !(thumb instanceof File)) {
    return gagal('FILE_TIDAK_VALID', 'Gambar utama, pratinjau, dan thumbnail wajib dikirim.', { status: 422, headers: TANPA_CACHE });
  }
  const meta = SkemaMetaSumber.safeParse(Object.fromEntries(['original_width', 'original_height', 'original_mime_type', 'kind', 'is_scanned'].map((k) => [k, form.get(k) ?? undefined])));
  if (!meta.success) {
    return gagal('FILE_TIDAK_VALID', meta.error.issues[0]?.message ?? 'Metadata gambar tidak valid.', { status: 422, headers: TANPA_CACHE });
  }
  const namaForm = form.get('original_filename');
  const namaAsli = typeof namaForm === 'string' && namaForm.trim() ? namaForm : master.name;

  try {
    const hasil = await unggahGambar(
      {
        storage,
        simpanRecord: (r) => withAuditContext(request, konteks, (tx) => tx.image.create({ data: r, select: { id: true } })),
      },
      {
        master: Buffer.from(await master.arrayBuffer()),
        preview: Buffer.from(await preview.arrayBuffer()),
        thumb: Buffer.from(await thumb.arrayBuffer()),
        namaAsli,
        meta: meta.data,
        uploaderId: konteks.sesi.userId,
      },
    );
    return sukses(hasil, { status: 201, headers: TANPA_CACHE });
  } catch (e) {
    if (e instanceof FileTidakValidError) return gagal('FILE_TIDAK_VALID', e.message, { status: 422, headers: TANPA_CACHE });
    console.error('[images] unggah gagal', e);
    return gagal('UNGGAH_GAGAL', 'Gambar gagal disimpan. Tidak ada yang tersimpan; coba lagi.', { status: 500, headers: TANPA_CACHE });
  }
}
