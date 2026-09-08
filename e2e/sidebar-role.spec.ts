/**
 * Gate E2E T-051 — sidebar dinamis per role.
 *
 * ===========================================================================
 * DITULIS SEBELUM T-051 DIMULAI
 * ===========================================================================
 * `e2e/**` milik lane data, sedangkan T-051 seluruhnya lane ui. Dua kali
 * sebelumnya urutan sebaliknya menghentikan pekerjaan di tengah — T-074 dan
 * T-078 sama-sama selesai lalu ketahuan tidak dapat dibuktikan karena gate-nya
 * belum ada. Berkas ini ditulis lebih dulu dan melewati dirinya sampai
 * halamannya datang (RENCANA-GELOMBANG-3 §8.1).
 *
 * ===========================================================================
 * DELAPAN ROLE TANPA DELAPAN KALI LOGIN
 * ===========================================================================
 * "Selesai bila" T-051 menuntut delapan role menghasilkan delapan susunan menu
 * berbeda, **diuji otomatis**. Cara langsungnya — membuat delapan akun lalu
 * login sebagai masing-masing — tidak dapat dipakai:
 *
 *   - Delapan sign-in dikali dua proyek Playwright menjadi enam belas tiap
 *     jalan, di atas puluhan milik gate login. Pembatas Supabase akan menolak
 *     login BERPASSWORD BENAR, dengan gejala yang menuduh halaman login.
 *   - Delapan akun uji berperan penuh harus hidup selamanya di proyek
 *     pengembangan, termasuk satu ber-role ADMIN yang boleh mengundang siapa
 *     pun.
 *
 * Yang diuji sebenarnya bukan login melainkan PENURUNAN MENU DARI ROLE. Karena
 * itu berkas ini memakai harness, pola yang sudah terbukti pada `/qa/gantt`
 * (T-073, T-074): halaman nonproduksi, tanpa sesi, dengan parameter query.
 *
 * Satu test tetap memakai sesi sungguhan. Tanpa itu, harness yang menerima
 * role dari query bisa saja lulus sempurna sementara sidebar sungguhan
 * mempercayai nilai dari klien — celah yang tidak akan terlihat dari mana pun.
 *
 * ===========================================================================
 * KONTRAK UNTUK LANE UI
 * ===========================================================================
 *   /qa/sidebar?role=<ROLE[,ROLE...]>
 *
 * Merender `Sidebar` untuk gabungan role yang diminta, tanpa sesi. Role memakai
 * kode dari `lib/auth/permissions.ts`: ADMIN, KETUA, WAKIL, SEKUM, BENDUM,
 * KADEPT, ANGGOTA, BPH.
 *
 * `data-testid` yang dipakai berkas ini:
 *
 *   sidebar-root                 pembungkus sidebar
 *   sidebar-menu-<slug>          satu per menu tingkat atas yang DIRENDER
 *   sidebar-sub-<slug>           submenu yang disebut tabel USER_FLOW §1.2
 *
 * Slug menu tingkat atas, mengikuti USER_FLOW §1.1:
 *
 *   beranda · proker · acara · surat · keuangan · sekretariat · departemen · admin
 *
 * Submenu yang wajib bertanda sendiri karena tabel §1.2 memberinya baris
 * terpisah:
 *
 *   proker-approval · surat-approval
 *
 * Atribut pada tiap `sidebar-menu-*` dan `sidebar-sub-*`:
 *
 *   data-mode="penuh" | "baca"   ✅ atau 👁️ pada tabel §1.2
 *
 * Menu yang **tersembunyi** (—) tidak boleh dirender sama sekali. Kontrak 2
 * T-051 dan INV-30 menyebutnya eksplisit, dan alasannya bukan kerapian: menu
 * yang muncul disabled memberi tahu penggunanya bahwa fitur itu ADA dan ia
 * tidak berhak — informasi yang tidak perlu ia miliki, dan yang membuat orang
 * meminta akses yang memang bukan haknya.
 *
 * Nama-nama di atas USULAN. Bila ada yang lebih cocok, angkat di sync point dan
 * berkas ini yang menyesuaikan.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-051 · USER_FLOW §1.1, §1.2 ·
 *         DESIGN_SYSTEM §4.2, §9.1 · ADR-017 · INV-30
 */

import { expect, test, type Page } from '@playwright/test';

import { AKUN, PASSWORD_UJI } from './fixtures/akun';

const HARNESS = '/qa/sidebar';

type Mode = 'penuh' | 'baca' | null;

/** Slug menu tingkat atas, urut seperti USER_FLOW §1.1. */
const MENU = [
  'beranda',
  'proker',
  'acara',
  'surat',
  'keuangan',
  'sekretariat',
  'departemen',
  'admin',
] as const;

const SUBMENU = ['proker-approval', 'surat-approval'] as const;

/**
 * Tabel visibilitas USER_FLOW §1.2, disalin sel per sel.
 *
 * `null` berarti menu TIDAK DIRENDER (— pada tabel). Ditulis sebagai tabel utuh
 * dan bukan sebagai aturan supaya dapat ditaruh berdampingan dengan dokumennya
 * dan dibandingkan baris demi baris — pola yang sama dipakai `MATRIKS` di
 * lib/auth/permissions.ts, dengan alasan yang sama.
 */
const VISIBILITAS: Record<string, Record<string, Mode>> = {
  //                  beranda  proker   acara    surat    keuangan sekretariat departemen admin
  ADMIN:   { beranda:'penuh', proker:'penuh', acara:'penuh', surat:'penuh', keuangan:'penuh', sekretariat:'penuh', departemen:'penuh', admin:'penuh' },
  KETUA:   { beranda:'penuh', proker:'penuh', acara:'penuh', surat:'penuh', keuangan:'baca',  sekretariat:'baca',  departemen:'baca',  admin:'baca'  },
  WAKIL:   { beranda:'penuh', proker:'penuh', acara:'penuh', surat:'penuh', keuangan:'baca',  sekretariat:'baca',  departemen:'baca',  admin:null    },
  SEKUM:   { beranda:'penuh', proker:'penuh', acara:'penuh', surat:'penuh', keuangan:'baca',  sekretariat:'penuh', departemen:'baca',  admin:null    },
  BENDUM:  { beranda:'penuh', proker:'penuh', acara:'penuh', surat:'penuh', keuangan:'penuh', sekretariat:'baca',  departemen:'baca',  admin:null    },
  KADEPT:  { beranda:'penuh', proker:'penuh', acara:'penuh', surat:'penuh', keuangan:'baca',  sekretariat:'baca',  departemen:'penuh', admin:null    },
  ANGGOTA: { beranda:'penuh', proker:'penuh', acara:'penuh', surat:null,    keuangan:'penuh', sekretariat:'baca',  departemen:'penuh', admin:null    },
  BPH:     { beranda:'penuh', proker:'baca',  acara:'baca',  surat:'baca',  keuangan:'baca',  sekretariat:'baca',  departemen:'baca',  admin:'baca'  },
};

/** Baris ↳ pada tabel §1.2 — hanya Ketua dan Wakil melihat antrian proker. */
const VISIBILITAS_SUB: Record<string, Record<string, Mode>> = {
  ADMIN:   { 'proker-approval': null,    'surat-approval': null },
  KETUA:   { 'proker-approval': 'penuh', 'surat-approval': 'penuh' },
  WAKIL:   { 'proker-approval': 'penuh', 'surat-approval': 'penuh' },
  SEKUM:   { 'proker-approval': null,    'surat-approval': 'penuh' },
  BENDUM:  { 'proker-approval': null,    'surat-approval': null },
  KADEPT:  { 'proker-approval': null,    'surat-approval': null },
  ANGGOTA: { 'proker-approval': null,    'surat-approval': null },
  BPH:     { 'proker-approval': null,    'surat-approval': null },
};

const ROLE = Object.keys(VISIBILITAS);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

async function buka(page: Page, role: string): Promise<void> {
  const alamat = `${HARNESS}?role=${role}`;
  const r = await page.goto(alamat, { waitUntil: 'load' });

  if (!r || r.status() === 404) {
    test.skip(
      true,
      `Halaman harness ${HARNESS} belum ada. Ia milik lane ui (T-051); ` +
        'lihat KONTRAK di kepala e2e/sidebar-role.spec.ts.',
    );
  }

  // Bila /qa/ belum dikecualikan middleware, status akhirnya 200 pada halaman
  // LOGIN dan waitForSelector di bawah menunggu 30 detik dengan pesan yang
  // tidak menyebut sebabnya sama sekali.
  const tujuan = new URL(page.url()).pathname;
  if (tujuan !== HARNESS) {
    throw new Error(
      `${alamat} dialihkan ke ${tujuan}. Harness E2E harus dapat dibuka tanpa sesi; ` +
        'periksa PREFIX_HARNESS di middleware.ts (lane data).',
    );
  }

  const ada = await page
    .waitForSelector('[data-testid="sidebar-root"]', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  test.skip(
    !ada,
    `${alamat} terbuka tetapi tidak memuat [data-testid="sidebar-root"]. ` +
      'Komponen Sidebar T-051 belum terpasang di harness.',
  );
}

/** Susunan menu yang benar-benar dirender, sebagai peta slug → mode. */
async function bacaMenu(page: Page, daftar: readonly string[], awalan: string): Promise<Record<string, Mode>> {
  const hasil: Record<string, Mode> = {};

  for (const slug of daftar) {
    const el = page.getByTestId(`${awalan}-${slug}`);
    hasil[slug] = (await el.count()) === 0 ? null : ((await el.getAttribute('data-mode')) as Mode);
  }

  return hasil;
}

// ---------------------------------------------------------------------------
// Selesai bila 1 — delapan role, delapan susunan berbeda
// ---------------------------------------------------------------------------

test.describe('Selesai bila 1 — delapan susunan menu berbeda', () => {
  for (const role of ROLE) {
    test(`${role} melihat menu sesuai tabel USER_FLOW 1.2`, async ({ page }) => {
      await buka(page, role);

      expect(await bacaMenu(page, MENU, 'sidebar-menu')).toEqual(VISIBILITAS[role]);
      expect(await bacaMenu(page, SUBMENU, 'sidebar-sub')).toEqual(VISIBILITAS_SUB[role]);
    });
  }

  test('kedelapan susunan benar-benar berbeda satu sama lain', async ({ page }) => {
    const tanda = new Map<string, string[]>();

    for (const role of ROLE) {
      await buka(page, role);
      const menu = await bacaMenu(page, MENU, 'sidebar-menu');
      const sub = await bacaMenu(page, SUBMENU, 'sidebar-sub');
      const kunci = JSON.stringify({ menu, sub });
      tanda.set(kunci, [...(tanda.get(kunci) ?? []), role]);
    }

    // Bila dua role menghasilkan susunan identik, salah satu tabel di atas
    // salah disalin ATAU sidebar mengabaikan sebagian role. Keduanya membuat
    // seseorang melihat menu yang bukan haknya, dan tidak ada assertion lain
    // di berkas ini yang akan menangkapnya.
    const kembar = [...tanda.values()].filter((r) => r.length > 1);
    expect(kembar, `role dengan susunan menu identik: ${JSON.stringify(kembar)}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 2 — tidak ada menu yang muncul disabled
// ---------------------------------------------------------------------------

test.describe('Selesai bila 2 — menu tanpa hak tidak dirender', () => {
  test('ANGGOTA tidak melihat Persuratan sama sekali', async ({ page }) => {
    await buka(page, 'ANGGOTA');

    // Bukan disabled, bukan disembunyikan lewat CSS: tidak ada di DOM.
    // Menu disabled memberi tahu penggunanya bahwa fitur itu ADA dan ia tidak
    // berhak — informasi yang tidak perlu ia miliki (INV-30).
    await expect(page.getByTestId('sidebar-menu-surat')).toHaveCount(0);
  });

  test('lima role tidak melihat Administrasi sama sekali', async ({ page }) => {
    for (const role of ['WAKIL', 'SEKUM', 'BENDUM', 'KADEPT', 'ANGGOTA']) {
      await buka(page, role);
      await expect(page.getByTestId('sidebar-menu-admin'), `${role} melihat Administrasi`).toHaveCount(0);
    }
  });

  test('tidak ada elemen menu ber-atribut disabled', async ({ page }) => {
    for (const role of ROLE) {
      await buka(page, role);
      const mati = page.locator('[data-testid^="sidebar-menu-"][disabled], [data-testid^="sidebar-menu-"][aria-disabled="true"]');
      await expect(mati, `${role} punya menu disabled`).toHaveCount(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Selesai bila 3 — Haluan Kerja dihapus (ADR-017)
// ---------------------------------------------------------------------------

test.describe('Selesai bila 3 — Haluan Kerja tidak ada', () => {
  test('tidak muncul untuk satu role pun', async ({ page }) => {
    for (const role of ROLE) {
      await buka(page, role);
      await expect(
        page.getByTestId('sidebar-root').getByText(/haluan\s*kerja/i),
        `Haluan Kerja masih muncul untuk ${role}`,
      ).toHaveCount(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Sidebar sungguhan memakai role dari SERVER
// ---------------------------------------------------------------------------

test.describe('Sidebar sungguhan', () => {
  /*
   * Dua test bersesi, dan keduanya menutup celah yang tidak dapat ditutup
   * harness: harness menerima role dari query, jadi ia akan lulus sempurna walau
   * sidebar sungguhan mempercayai nilai yang dikirim klien. Yang benar, role
   * dibaca dari `user_role` di server (INV-02).
   *
   * Yang pertama login ADMIN — susunan menunya paling khas (delapan menu penuh,
   * termasuk Administrasi yang tersembunyi bagi lima role lain) — dan memastikan
   * server menurunkan susunan itu benar. Yang kedua login sebagai non-ADMIN lalu
   * menyuntik ?role=ADMIN, memastikan query TIDAK menaikkan susunannya.
   */
  test('menampilkan susunan ADMIN setelah login sebagai ADMIN', async ({ page }) => {
    const r = await page.goto('/login', { waitUntil: 'load' });
    test.skip(!r || r.status() === 404, 'Halaman /login belum ada.');

    await page.getByLabel(/email/i).fill(AKUN.admin.email);
    await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
    await page.getByRole('button', { name: /masuk|login/i }).click();

    const muncul = await page
      .waitForSelector('[data-testid="sidebar-root"]', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    test.skip(
      !muncul,
      'Sidebar tidak muncul setelah login. Layout dashboard T-051 belum ada, ' +
        'atau login belum mengalihkan ke beranda.',
    );

    expect(await bacaMenu(page, MENU, 'sidebar-menu')).toEqual(VISIBILITAS.ADMIN);
  });

  test('role dari query TIDAK mengubah sidebar sungguhan', async ({ page }) => {
    // Bila ini merah, siapa pun dapat menaikkan susunan menunya ke ADMIN dengan
    // menambahkan ?role=ADMIN pada URL beranda. Menunya sendiri tidak memberi
    // hak apa pun — RLS dan guard tetap menolak — tetapi ia membocorkan
    // struktur sistem kepada orang yang tidak berhak melihatnya (INV-02).
    //
    // WAJIB login lebih dahulu. Tanpa sesi, `/` mengalihkan ke `/login` dan test
    // hanya akan SKIP — celah yang selama ini menutupi bug ini: harness bisa
    // lulus sempurna sementara beranda sungguhan tak pernah teruji terhadap
    // spoof. Dipakai akun non-ADMIN e2e-aktif (KETUA), yang susunannya berbeda
    // dari ADMIN tepat pada Administrasi — 'baca' bagi KETUA, 'penuh' bagi ADMIN.
    // Bila query dihormati, mode itu akan naik ke 'penuh'; harusnya tetap 'baca'.
    const r = await page.goto('/login', { waitUntil: 'load' });
    test.skip(!r || r.status() === 404, 'Halaman /login belum ada.');

    await page.getByLabel(/email/i).fill(AKUN.aktif.email);
    await page.getByLabel(/password|kata sandi/i).fill(PASSWORD_UJI);
    await page.getByRole('button', { name: /masuk|login/i }).click();

    const masuk = await page
      .waitForSelector('[data-testid="sidebar-root"]', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !masuk,
      'Sidebar tidak muncul setelah login KETUA. Layout dashboard T-051 belum ada, ' +
        'atau login belum mengalihkan ke beranda.',
    );

    // Kini bersesi sebagai KETUA. Buka beranda dengan query jahat.
    await page.goto('/?role=ADMIN', { waitUntil: 'load' });

    const tujuan = new URL(page.url()).pathname;
    expect(tujuan, 'sesi KETUA seharusnya tetap di beranda, bukan dialihkan').toBe('/');

    await page.waitForSelector('[data-testid="sidebar-root"]', { timeout: 5000 });

    // Susunan HARUS tetap milik KETUA (peran dari server), sama sekali tak
    // terpengaruh ?role=ADMIN.
    const peran = AKUN.aktif.role!;
    const susunan = await bacaMenu(page, MENU, 'sidebar-menu');
    expect(susunan).toEqual(VISIBILITAS[peran]);
    // Bukti paling tajam terhadap spoof: Administrasi tetap 'baca' (hak KETUA),
    // tidak naik ke 'penuh' (hak ADMIN yang diminta lewat query).
    expect(susunan.admin).toBe('baca');
  });
});
