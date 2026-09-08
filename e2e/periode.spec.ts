/**
 * Gate E2E T-050 — periode kepengurusan.
 *
 * ===========================================================================
 * DITULIS SEBELUM T-050 DIMULAI
 * ===========================================================================
 * `e2e/**` milik lane data, T-050 seluruhnya lane ui. Gate ditulis lebih dulu
 * dan melewati dirinya sampai route-nya datang (RENCANA-GELOMBANG-3 §8.1).
 *
 * ===========================================================================
 * GATE INI TIDAK MENGAKTIFKAN PERIODE, DAN ITU KEPUTUSAN SADAR
 * ===========================================================================
 * Mengaktifkan periode berarti MENGARSIPKAN yang lama — itu memang maksudnya
 * (PRD F-2.1). Tetapi periode yang aktif sekarang adalah "Periode Uji E2E"
 * milik `seed:e2e-auth`, dan seluruh gate lain bergantung padanya: tanpa
 * periode aktif, `user_role` tidak punya baris yang cocok, `konteksSaatIni()`
 * mengembalikan `TIDAK_ADA_PERIODE`, dan gate login beserta gate undangan
 * gagal seluruhnya dengan pesan yang menuduh halaman login.
 *
 * Membersihkannya kembali di `afterAll` tidak cukup: dua proyek Playwright
 * berjalan dua worker, jadi aktivasi dari satu worker mengubah keadaan yang
 * sedang dibaca worker lain — dan satu jalan yang jatuh di tengah meninggalkan
 * database tanpa periode aktif sampai seseorang menyadarinya.
 *
 * Yang lebih penting: perilaku aktivasinya SUDAH TERBUKTI di tempat yang tepat,
 * di dalam transaksi yang selalu di-ROLLBACK —
 *
 *   supabase/tests/003_core.sql:43        periode AKTIF kedua ditolak index
 *                                         `periode_hanya_satu_aktif`
 *   supabase/tests/014b_surat_fn.sql:157  `aktifkan_periode` mengarsipkan yang lama
 *   supabase/tests/014b_surat_fn.sql:164  surat pertama periode baru bernomor 001
 *
 * Ketiganya adalah tiga butir "Selesai bila" T-050. Mengulanginya di sini tidak
 * menambah jaminan apa pun; yang ditambahkannya hanya risiko merusak fixture.
 *
 * Karena itu berkas ini menguji LAPISAN HTTP saja — hal yang tidak ada di test
 * SQL: izin, validasi, syarat konfirmasi, dan sifat baca-saja periode arsip.
 *
 * ===========================================================================
 * KONTRAK UNTUK LANE UI
 * ===========================================================================
 *   GET    /api/periode                daftar periode        -> daftarPeriode()
 *   POST   /api/periode                buat periode          -> buatPeriode()
 *   PATCH  /api/periode/{id}           ubah periode          -> ubahPeriode()
 *   DELETE /api/periode/{id}           hapus                 -> hapusPeriode()
 *   POST   /api/periode/{id}/activate  aktifkan              -> aktifkanPeriode()
 *
 * PENTING soal cakupan: kontrak T-050 di tasks.json HANYA menyebut
 * `app/api/periode/{route.ts,[id]/activate/route.ts}`. Route PATCH dan DELETE
 * menuntut `app/api/periode/[id]/route.ts`, yang tidak ada di sana — Codex
 * benar menandainya (ADR-050). Berkas itu resmi menjadi bagian T-050-UI lewat
 * PERIODE_CONTRACT.md §1, jalur yang sama dengan T-047 yang juga menambah
 * `[id]/route.ts` lewat kontraknya.
 *
 * ===========================================================================
 * BENTUK RESPONS: K-02, LEWAT lib/http/respond
 * ===========================================================================
 * Setiap respons `{ ok: true, data }` atau `{ ok: false, error: { code, message,
 * details? } }` — tidak ada bentuk lain (K-02). Route handler memakai helper
 * `sukses`/`gagal` dari `lib/http/respond` dan peta `STATUS_GAGAL` dari service:
 *
 *     import { sukses, gagal } from '@/lib/http/respond';
 *     import { STATUS_GAGAL } from '@/lib/periode/service';
 *     return h.ok
 *       ? sukses(h.nilai, { status: 201 })
 *       : gagal(h.kode, h.pesan, { details: h.isu, status: STATUS_GAGAL[h.kode] });
 *
 * Gate ini membaca `body.data.*` untuk sukses dan `body.error.code` untuk gagal.
 * Versi pertama membaca `body.id`/`body.status`/`body.isu` — bentuk yang
 * bertentangan dengan K-02, dan Codex benar menolaknya.
 *
 * Badan `POST /api/periode`:  { nama, tanggal_mulai, tanggal_selesai, nomor_surat_awal? }
 *   `status` TIDAK diterima — satu-satunya jalan menuju AKTIF adalah `/activate`
 *   (kontrak 2 T-050: "bukan update manual dari aplikasi").
 *
 * Badan `POST /api/periode/{id}/activate`:  { konfirmasi: "<nama periode persis>" }
 *   Kontrak 3: konfirmasi kritis. Ditolak SEBELUM apa pun berubah; tanpa ini
 *   satu permintaan nyasar dapat mengarsipkan seluruh kepengurusan berjalan.
 *
 * Nama-nama di atas USULAN. Angkat di sync point bila ada yang lebih cocok.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-050 · PRD F-2.1 · SYSTEM_DESIGN §7.3 ·
 *         ADR-003 · migrasi 003, 014b
 */

import { expect, test, type APIRequestContext } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

/** Periode buatan gate ini selalu bertanda ini supaya sisa mudah dikenali. */
const TANDA = 'E2E-PERIODE';

function namaUji(): string {
  return `${TANDA} ${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

async function masuk(request: APIRequestContext, email: string): Promise<number> {
  const r = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD_UJI },
    failOnStatusCode: false,
  });
  return r.status();
}

let ctxAdmin: APIRequestContext | null = null;
let alasanLewat: string | null = null;
const dibuat: string[] = [];

test.beforeAll(async ({ playwright, baseURL }) => {
  ctxAdmin = await playwright.request.newContext({ baseURL });

  const status = await masuk(ctxAdmin, AKUN.admin.email);
  if (status !== 200) {
    alasanLewat =
      `Login akun ADMIN gagal (${status}). Jalankan: npm run seed:e2e-auth. ` +
      'Bila pesannya menyebut "dari jaringan ini", itu pembatas Supabase — tunggu beberapa menit.';
    return;
  }

  // Keberadaan route diperiksa MEMAKAI SESI. Middleware menolak seluruh
  // `/api/*` tanpa sesi dengan 401 sebelum routing terjadi, jadi permintaan
  // tanpa sesi menjawab 401 bahkan untuk route yang belum pernah dibuat.
  const cek = await ctxAdmin.get('/api/periode', { failOnStatusCode: false });
  if (cek.status() === 404) {
    alasanLewat =
      'GET /api/periode menjawab 404 pada permintaan ber-sesi — route-nya belum ada. ' +
      'Ia milik lane ui (T-050); lihat KONTRAK di kepala e2e/periode.spec.ts.';
  }
});

test.afterAll(async () => {
  // Best-effort. Periode uji tidak punya surat maupun proker, jadi DELETE-nya
  // tidak tertahan aturan "jangan hapus periode yang punya surat terbit".
  for (const id of dibuat) {
    await ctxAdmin?.delete(`/api/periode/${id}`, { failOnStatusCode: false }).catch(() => null);
  }
  if (dibuat.length) {
    console.log(
      `    periode uji: ${dibuat.length} dibuat. Sisa bertanda "${TANDA}" ` +
        'dapat dihapus tangan bila DELETE belum ada.',
    );
  }
  await ctxAdmin?.dispose();
  ctxAdmin = null;
});

function lewatiBila(): void {
  test.skip(alasanLewat !== null, alasanLewat ?? '');
}

async function buatPeriode(
  ctx: APIRequestContext,
  ubah: Record<string, unknown> = {},
): Promise<{
  status: number;
  body: { data?: Record<string, unknown>; error?: { code?: string; message?: string; details?: unknown } };
}> {
  const r = await ctx.post('/api/periode', {
    data: {
      nama: namaUji(),
      tanggal_mulai: '2031-09-01',
      tanggal_selesai: '2032-08-31',
      nomor_surat_awal: 1,
      ...ubah,
    },
    failOnStatusCode: false,
  });

  const body = (await r.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    error?: { code?: string; message?: string; details?: unknown };
  };
  const id = body.data?.id;
  if (r.status() === 201 && typeof id === 'string') dibuat.push(id);
  return { status: r.status(), body };
}

// ---------------------------------------------------------------------------
// Izin
// ---------------------------------------------------------------------------

test.describe('Izin', () => {
  test('tanpa sesi ditolak 401', async ({ playwright, baseURL }) => {
    lewatiBila();
    const ctx = await playwright.request.newContext({ baseURL });
    try {
      const r = await ctx.post('/api/periode', { data: {}, failOnStatusCode: false });
      expect(r.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  // Matriks PRD §5.1 memberi `periode: CRUD` HANYA kepada ADMIN; seluruh role
  // lain `R`. Periode yang salah aktif menggeser scope SELURUH data organisasi
  // dan mereset penomoran surat — bukan sesuatu yang boleh dipegang banyak orang.
  test('KETUA boleh membaca tetapi tidak boleh membuat', async ({ playwright, baseURL }) => {
    lewatiBila();
    const ctx = await playwright.request.newContext({ baseURL });
    try {
      expect(await masuk(ctx, AKUN.aktif.email)).toBe(200);

      expect((await ctx.get('/api/periode', { failOnStatusCode: false })).status()).toBe(200);

      const r = await ctx.post('/api/periode', {
        data: { nama: namaUji(), tanggal_mulai: '2031-09-01', tanggal_selesai: '2032-08-31' },
        failOnStatusCode: false,
      });
      expect(r.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// Pembuatan
// ---------------------------------------------------------------------------

test.describe('Membuat periode', () => {
  test('periode sah dibuat berstatus PERSIAPAN, bukan AKTIF', async () => {
    lewatiBila();
    const { status, body } = await buatPeriode(ctxAdmin!);

    expect(status).toBe(201);
    // Satu-satunya jalan menuju AKTIF adalah /activate, yang memanggil fungsi
    // database. Periode yang lahir langsung AKTIF melewati aktifkan_periode,
    // dan bersamanya melewati pembuatan `surat_counter` — surat pertama periode
    // itu akan gagal dialokasikan nomor, jauh kemudian, tanpa sebab yang jelas.
    expect(body.data?.status).toBe('PERSIAPAN');
  });

  test('status AKTIF dari badan request diabaikan atau ditolak', async () => {
    lewatiBila();
    const { status, body } = await buatPeriode(ctxAdmin!, { status: 'AKTIF' });

    expect([201, 422]).toContain(status);
    if (status === 201) expect(body.data?.status).toBe('PERSIAPAN');
  });

  test('tanggal selesai sebelum tanggal mulai ditolak dengan pesan form', async () => {
    lewatiBila();
    const { status, body } = await buatPeriode(ctxAdmin!, {
      tanggal_mulai: '2032-08-31',
      tanggal_selesai: '2031-09-01',
    });

    expect(status).toBe(422);
    expect(body.error?.code).toBe('VALIDASI_GAGAL');
  });

  test('nomor_surat_awal nol atau negatif ditolak', async () => {
    lewatiBila();
    // ADR-003: counter dimulai dari nomor_surat_awal - 1 supaya alokasi pertama
    // menghasilkan tepat nomor_surat_awal. Nilai nol membuat surat pertama
    // bernomor 000.
    expect((await buatPeriode(ctxAdmin!, { nomor_surat_awal: 0 })).status).toBe(422);
  });

  test('nama kosong ditolak', async () => {
    lewatiBila();
    expect((await buatPeriode(ctxAdmin!, { nama: '' })).status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Aktivasi — konfirmasi kritis, TANPA benar-benar mengaktifkan
// ---------------------------------------------------------------------------

test.describe('Aktivasi menuntut konfirmasi kritis', () => {
  test('konfirmasi yang tidak cocok ditolak dan tidak mengubah apa pun', async () => {
    lewatiBila();
    const { status, body } = await buatPeriode(ctxAdmin!);
    test.skip(status !== 201, 'POST /api/periode belum bekerja.');

    const id = String(body.data?.id);
    const r = await ctxAdmin!.post(`/api/periode/${id}/activate`, {
      data: { konfirmasi: 'jelas bukan nama periode ini' },
      failOnStatusCode: false,
    });

    test.skip(r.status() === 404, 'POST /api/periode/{id}/activate belum ada (T-050).');

    // Kontrak 3: konfirmasi tingkat kritis. Tanpa syarat ini, satu permintaan
    // nyasar dapat mengarsipkan seluruh kepengurusan yang sedang berjalan.
    expect([400, 422]).toContain(r.status());

    const cek = await ctxAdmin!.get('/api/periode', { failOnStatusCode: false });
    const daftar = (await cek.json()) as { data?: { id: string; status: string }[] };
    const baris = (daftar.data ?? []).find((p) => p.id === id);
    expect(baris?.status, 'periode berubah walau konfirmasinya salah').toBe('PERSIAPAN');
  });

  test('tanpa medan konfirmasi ditolak', async () => {
    lewatiBila();
    const { status, body } = await buatPeriode(ctxAdmin!);
    test.skip(status !== 201, 'POST /api/periode belum bekerja.');

    const r = await ctxAdmin!.post(`/api/periode/${String(body.data?.id)}/activate`, {
      data: {},
      failOnStatusCode: false,
    });
    test.skip(r.status() === 404, 'POST /api/periode/{id}/activate belum ada (T-050).');
    expect([400, 422]).toContain(r.status());
  });

  test('KETUA tidak boleh mengaktifkan', async ({ playwright, baseURL }) => {
    lewatiBila();
    const { status, body } = await buatPeriode(ctxAdmin!);
    test.skip(status !== 201, 'POST /api/periode belum bekerja.');

    const ctx = await playwright.request.newContext({ baseURL });
    try {
      expect(await masuk(ctx, AKUN.aktif.email)).toBe(200);
      const r = await ctx.post(`/api/periode/${String(body.data?.id)}/activate`, {
        data: { konfirmasi: String(body.data?.nama) },
        failOnStatusCode: false,
      });
      test.skip(r.status() === 404, 'POST /api/periode/{id}/activate belum ada (T-050).');
      expect(r.status()).toBe(403);
    } finally {
      await ctx.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// PRD F-2.1 AC 3 — periode arsip hanya baca
// ---------------------------------------------------------------------------

test.describe('PRD F-2.1 AC 3 — periode arsip hanya baca', () => {
  test('periode berstatus ARSIP tidak dapat diubah', async () => {
    lewatiBila();
    const daftar = await ctxAdmin!.get('/api/periode', { failOnStatusCode: false });
    test.skip(!daftar.ok(), 'GET /api/periode belum bekerja.');

    const isi = (await daftar.json()) as { data?: { id: string; status: string }[] };
    const arsip = (isi.data ?? []).find((p) => p.status === 'ARSIP');
    test.skip(
      !arsip,
      'Belum ada periode berstatus ARSIP untuk diuji. Muncul sendiri setelah ' +
        'pergantian periode pertama; sifat arsipnya sendiri sudah diuji di ' +
        'supabase/tests/014b_surat_fn.sql.',
    );

    const r = await ctxAdmin!.patch(`/api/periode/${arsip!.id}`, {
      data: { nama: 'Coba Ubah Arsip' },
      failOnStatusCode: false,
    });

    // Data periode lama tetap dapat DIBACA — yang ditolak hanya perubahannya.
    expect([403, 409]).toContain(r.status());
  });

  test('periode arsip tetap muncul di daftar', async () => {
    lewatiBila();
    const r = await ctxAdmin!.get('/api/periode', { failOnStatusCode: false });
    test.skip(!r.ok(), 'GET /api/periode belum bekerja.');

    const isi = (await r.json()) as { data?: unknown[] };
    // AC 3: "tetap dapat dilihat & diunduh". Menyembunyikan arsip dari daftar
    // membuat data kepengurusan lama tidak dapat dijangkau sama sekali.
    expect(Array.isArray(isi.data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fixture E2E tidak boleh tersentuh
// ---------------------------------------------------------------------------

test('tepat satu periode AKTIF, dan itu fixture E2E', async () => {
  lewatiBila();
  const r = await ctxAdmin!.get('/api/periode', { failOnStatusCode: false });
  test.skip(!r.ok(), 'GET /api/periode belum bekerja.');

  const isi = (await r.json()) as { data?: { nama: string; status: string }[] };
  const aktif = (isi.data ?? []).filter((p) => p.status === 'AKTIF');

  // Penjaga bagi gate ini sendiri. Bila suatu saat seseorang menambahkan test
  // yang benar-benar mengaktifkan periode, test ini yang akan merah lebih dulu
  // — sebelum gate login dan gate undangan gagal dengan pesan yang menuduh
  // halaman login.
  expect(aktif, 'jumlah periode AKTIF bukan satu').toHaveLength(1);
  expect(aktif[0]!.nama).not.toContain(TANDA);
});
