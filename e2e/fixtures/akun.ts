/**
 * Akun uji untuk gate E2E login.
 *
 * Dipakai bersama oleh `scripts/seed-e2e-auth.ts` yang membuatnya dan
 * `e2e/login.spec.ts` yang memakainya. Satu berkas supaya keduanya tidak
 * pernah berbeda — email yang meleset satu huruf menghasilkan kegagalan
 * yang terbaca seperti bug autentikasi.
 *
 * ===========================================================================
 * KENAPA AKUNNYA DISIAPKAN TERPISAH, BUKAN DIBUAT OLEH TEST
 * ===========================================================================
 * Membuat akun Supabase Auth menuntut SUPABASE_SECRET_KEY, dan worktree lane
 * ui sengaja tidak memilikinya (hak minimum). Kalau test yang membuatnya,
 * gate ini hanya dapat dijalankan di mesin yang memegang kunci penuh — dan
 * lane yang justru menulis halaman loginnya tidak akan pernah bisa
 * menjalankannya.
 *
 * Karena itu akunnya disiapkan sekali lewat `npm run seed:e2e-auth` oleh
 * pemegang kunci, lalu menetap di proyek Supabase pengembangan. Test hanya
 * memakainya, dan cukup berbekal NEXT_PUBLIC_* untuk berjalan.
 *
 * Domain `.test` dipesan RFC 2606 untuk pengujian dan tidak pernah dapat
 * diresolusi ke internet — tidak ada risiko surat nyasar ke alamat orang.
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-045 · PRD F-1.1 · USER_FLOW §2.3
 */

/**
 * Password akun uji. Sengaja terlihat jelas sebagai kredensial uji.
 *
 * Memenuhi aturan PRD F-1.1 (minimal 8 karakter, mengandung huruf dan angka)
 * supaya yang diuji benar-benar alur loginnya, bukan penolakan format.
 */
export const PASSWORD_UJI = 'UjiE2E2026';

/** Password yang pasti salah, untuk skenario kegagalan. */
export const PASSWORD_SALAH = 'JelasSalah9999';

export interface AkunUji {
  email: string;
  namaLengkap: string;
  nim: string;
  /** false berarti `app_user.is_active = false`. */
  aktif: boolean;
  /** null berarti akun Supabase Auth dibuat TANPA baris `app_user`. */
  role: 'KETUA' | 'ANGGOTA' | 'BPH' | 'ADMIN' | null;
}

export const AKUN: Record<
  'aktif' | 'nonaktif' | 'tanpaProfil' | 'bacaSaja' | 'admin',
  AkunUji
> = {
  /** Jalur bahagia: masuk, punya peran, punya periode aktif. */
  aktif: {
    email: 'e2e-aktif@uji.test',
    namaLengkap: 'Uji E2E Aktif',
    nim: '3337229001',
    aktif: true,
    role: 'KETUA',
  },

  /** Password benar, tetapi `is_active = false` (PRD F-1.1 kriteria 4). */
  nonaktif: {
    email: 'e2e-nonaktif@uji.test',
    namaLengkap: 'Uji E2E Nonaktif',
    nim: '3337229002',
    aktif: false,
    role: 'ANGGOTA',
  },

  /**
   * Punya akun Supabase Auth tetapi tidak punya baris `app_user`.
   *
   * Keadaan nyata: undangan yang belum tuntas. Dari sisi pengguna harus tidak
   * dapat dibedakan dari kredensial salah — menyebutkannya membocorkan
   * keadaan internal sistem.
   */
  tanpaProfil: {
    email: 'e2e-tanpa-profil@uji.test',
    namaLengkap: 'Uji E2E Tanpa Profil',
    nim: '3337229003',
    aktif: true,
    role: null,
  },
  /**
   * Dapat masuk, tetapi TIDAK berhak menulis apa pun.
   *
   * Ditambahkan untuk T-078: kontraknya menuntut dibuktikan bahwa pengguna
   * tanpa izin tidak dapat menggeser bar Gantt — tombolnya mati DAN API-nya
   * menolak. Tanpa akun seperti ini, separuh kedua tuntutan itu tidak dapat
   * diuji siapa pun: ketiga akun di atas entah tidak dapat masuk sama sekali,
   * entah masuk sebagai KETUA yang justru berhak penuh atas Gantt.
   *
   * BPH dipilih karena sifatnya read-only mutlak dan itu INVARIANT, bukan
   * kebetulan konfigurasi (INV-03, PRD §5.1). Akun uji yang haknya kebetulan
   * kosong bisa berubah diam-diam saat matriks permission disunting; akun BPH
   * tidak, karena barisnya di PRD memang tidak pernah memuat C, U, atau D.
   *
   * Tidak berdepartemen: BPH mengawasi seluruh organisasi, bukan satu
   * departemen (seed mengisi `departemen_id` hanya untuk ANGGOTA).
   */
  bacaSaja: {
    email: 'e2e-bph@uji.test',
    namaLengkap: 'Uji E2E BPH',
    nim: '3337229004',
    aktif: true,
    role: 'BPH',
  },
  /**
   * Satu-satunya akun uji yang berhak mengundang pengurus.
   *
   * Ditambahkan untuk T-047. Matriks PRD §5.1 memberi `user: CRUD` HANYA kepada
   * ADMIN; KETUA, WAKIL, SEKUM, BENDUM, dan BPH seluruhnya `R`. Tanpa akun ini,
   * gate `undangan` tidak dapat menguji satu pun alur undangan — `e2e-aktif`
   * berperan KETUA dan hanya bisa membaca daftar pengguna.
   *
   * ADMIN bersifat teknis dan berada DI LUAR struktur organisasi (migrasi 002),
   * jadi ia tidak berdepartemen — seed mengisi `departemen_id` hanya untuk
   * ANGGOTA.
   */
  admin: {
    email: 'e2e-admin@uji.test',
    namaLengkap: 'Uji E2E Admin',
    nim: '3337229005',
    aktif: true,
    role: 'ADMIN',
  },
};

/** Email yang dijamin tidak pernah terdaftar. */
export const EMAIL_TIDAK_TERDAFTAR = 'e2e-tidak-ada@uji.test';

/** Nama periode yang disiapkan seed, supaya dapat dibersihkan kembali. */
export const NAMA_PERIODE_UJI = 'Periode Uji E2E';
