/**
 * respond — satu-satunya tempat bentuk respons API dirakit.
 *
 * ===========================================================================
 * K-02 PUNYA SATU IMPLEMENTASI, BUKAN DUA PULUH
 * ===========================================================================
 * K-02 mewajibkan setiap respons berbentuk `{ ok: true, data }` atau
 * `{ ok: false, error: { code, message, details? } }`. Tidak ada bentuk lain.
 *
 * Sebelum berkas ini ada, setiap route handler merakit bentuk itu sendiri, dan
 * mereka mulai menyimpang: route login menulis `error.message` dengan benar,
 * sementara `guard.ts` menulis `error.pesan`, dan kontrak lama menyuruh route
 * menyebar `data` ke tingkat atas. Tiga bentuk untuk satu invariant, dan tidak
 * ada satu pun yang salah secara mencolok — sampai antarmuka membaca `data.x`
 * pada respons yang ternyata menaruh `x` di tingkat atas.
 *
 * Karena itu route handler TIDAK LAGI merakit sendiri. Ia memanggil `sukses`
 * atau `gagal`, dan bentuknya dijamin sama di seluruh aplikasi. Service milik
 * lane data mengekspor peta `kode → status HTTP`-nya masing-masing, sehingga
 * satu-satunya tugas route adalah menerjemahkan `Hasil` menjadi respons:
 *
 *     return h.ok
 *       ? sukses(h.nilai, { status: 201 })
 *       : gagal(h.kode, h.pesan, { details: h.isu, status: STATUS_GAGAL[h.kode] });
 *
 * Berkas ini milik lane data supaya bentuk K-02 punya satu pemilik. Ia tidak
 * membaca environment dan tidak menyentuh database, jadi aman diimpor route
 * handler mana pun.
 *
 * Sumber: docs/ai/AGENT_RULES.md K-02, K-03
 */

import { NextResponse } from 'next/server';

interface OpsiSukses {
  status?: number;
  headers?: Record<string, string>;
}

interface OpsiGagal {
  /** Detail per-field untuk kegagalan validasi (K-02 `error.details`). */
  details?: unknown;
  status?: number;
  headers?: Record<string, string>;
}

function pasangHeader(res: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

/** `{ ok: true, data }`. Status bawaan 200. */
export function sukses<T>(data: T, opsi: OpsiSukses = {}): NextResponse {
  return pasangHeader(
    NextResponse.json({ ok: true, data }, { status: opsi.status ?? 200 }),
    opsi.headers,
  );
}

/**
 * `{ ok: false, error: { code, message, details? } }`. Status bawaan 400.
 *
 * `code` wajib SCREAMING_SNAKE (K-03). Tidak ditegakkan di sini karena TypeScript
 * tidak dapat memeriksa isi string, tetapi setiap `KodeGagal*` di service memang
 * sudah berbentuk itu.
 *
 * `details` dihilangkan dari badan bila `undefined`, supaya respons sukses-tanpa-
 * detail tidak membawa `"details": null` yang membingungkan pembaca.
 */
export function gagal(code: string, message: string, opsi: OpsiGagal = {}): NextResponse {
  const error: { code: string; message: string; details?: unknown } = { code, message };
  if (opsi.details !== undefined) error.details = opsi.details;

  return pasangHeader(
    NextResponse.json({ ok: false, error }, { status: opsi.status ?? 400 }),
    opsi.headers,
  );
}
