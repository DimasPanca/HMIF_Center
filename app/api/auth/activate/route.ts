import { aktivasi, STATUS_GAGAL } from '@/lib/auth/invitation';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { gagal, sukses } from '@/lib/http/respond';

// Publik (RUTE_PUBLIK di middleware): penerima undangan belum punya sesi.
// Yang menjaga adalah tokennya — acak 32 byte, sekali pakai, disimpan sebagai hash.
const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const badan: unknown = await request.json().catch(() => null);
  const hasil = await withAuditContext(request, (tx) => aktivasi(tx, badan));
  return hasil.ok
    ? sukses({ email: hasil.nilai.email }, { headers: TANPA_CACHE })
    : gagal(hasil.kode, hasil.pesan, {
        status: STATUS_GAGAL[hasil.kode],
        details: hasil.isu,
        headers: TANPA_CACHE,
      });
}
