/**
 * Lapisan permission aplikasi.
 *
 * ===========================================================================
 * SATU SUMBER KEBENARAN: TABEL PRD §5.1, DISALIN SEL PER SEL
 * ===========================================================================
 * SYSTEM_DESIGN §5.4 memberi contoh berisi 11 permission. Contoh itu memang
 * ditulis sebagai contoh — memakainya apa adanya akan meninggalkan 15 dari 26
 * baris matriks PRD tanpa penjagaan sama sekali, termasuk Kanban, Kendala,
 * Notulensi, Data Pengurus, Peminjaman Ruangan, dan Audit Log.
 *
 * Karena itu `MATRIKS` di bawah menyalin tabel PRD §5.1 apa adanya: satu kunci
 * per baris tabel, satu untai per sel, memakai huruf yang sama (`C`, `R`, `U`,
 * `D`, `A`) dan penanda lingkup yang sama (`*`, `**`). Bentuk itu dipilih supaya
 * siapa pun dapat menaruh berkas ini di sebelah PRD dan membandingkannya baris
 * demi baris tanpa menerjemahkan apa pun.
 *
 * `PERMISSIONS` — bentuk yang dipakai kode — TIDAK ditulis tangan, melainkan
 * diturunkan dari `MATRIKS`. Dua daftar yang ditulis terpisah pasti akan
 * berbeda suatu hari, dan perbedaannya tidak akan terlihat sampai ada orang
 * memperoleh hak yang bukan miliknya.
 *
 * ===========================================================================
 * `can()` SAJA TIDAK PERNAH CUKUP UNTUK ROLE BERLINGKUP
 * ===========================================================================
 * Tanda `*` dan `**` di PRD bukan hak yang lebih kecil — keduanya hak yang
 * sama dengan BATAS BARIS. Kadept boleh mengubah proker, tetapi hanya proker
 * departemennya; Anggota boleh mengunggah nota, tetapi hanya untuk divisi
 * tempat ia ditugaskan.
 *
 * `can()` tidak mengetahui baris mana yang sedang disentuh, jadi ia tidak dapat
 * menegakkan batas itu. Yang menegakkannya ada dua lapis di belakang: RLS di
 * database (migrasi 015b) dan pemeriksaan lingkup di service. `lingkupUntuk()`
 * ada supaya pemanggil tahu kapan lapisan itu wajib dipakai — dan supaya
 * kelalaian memakainya menjadi sesuatu yang bisa ditanyakan, bukan diam.
 *
 * Sumber: PRD §5.1, §5.2 · SYSTEM_DESIGN §5.4 · INV-02, INV-03
 */

/** Delapan role, sama persis dengan enum `role_code` di migrasi 002. */
export const ROLES = [
  'ADMIN',
  'KETUA',
  'WAKIL',
  'SEKUM',
  'BENDUM',
  'KADEPT',
  'ANGGOTA',
  'BPH',
] as const;

export type RoleCode = (typeof ROLES)[number];

/** Huruf hak pada tabel PRD: Create, Read, Update, Delete, Approve. */
export type Hak = 'C' | 'R' | 'U' | 'D' | 'A';

/**
 * Batas baris yang menyertai sebuah hak.
 *
 * `DEPARTEMEN` = tanda `*` pada PRD — terbatas pada departemen sendiri.
 * `DIVISI`     = tanda `**` — terbatas pada divisi kepanitiaan tempat ia
 *                ditugaskan.
 */
export type Lingkup = 'DEPARTEMEN' | 'DIVISI';

type Sel = string;
type Baris = Record<RoleCode, Sel>;

/**
 * Tabel PRD §5.1, disalin apa adanya.
 *
 * Empat baris "Proker" dan dua baris "Surat", "RAB", "Nota" pada PRD memang
 * terpisah karena haknya berbeda — misalnya Kadept boleh MEMBUAT proker tetapi
 * tidak boleh MENYETUJUINYA. Pemisahan itu dipertahankan di sini; menyatukannya
 * akan menghapus perbedaan yang justru menjadi maksud tabelnya.
 */
const MATRIKS: Record<string, Baris> = {
  //                     ADMIN   KETUA   WAKIL   SEKUM   BENDUM  KADEPT   ANGGOTA  BPH
  user:                { ADMIN:'CRUD', KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'R',   KADEPT:'R*',   ANGGOTA:'R*',  BPH:'R' },
  periode:             { ADMIN:'CRUD', KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'R',   KADEPT:'R',    ANGGOTA:'R',   BPH:'R' },
  departemen:          { ADMIN:'CRUD', KETUA:'CRUD', WAKIL:'CRUD', SEKUM:'R',    BENDUM:'R',   KADEPT:'RU*',  ANGGOTA:'R*',  BPH:'R' },

  proker:              { ADMIN:'CRU',  KETUA:'CRU',  WAKIL:'CRU',  SEKUM:'R',    BENDUM:'R',   KADEPT:'CRU*', ANGGOTA:'R*',  BPH:'R' },
  proker_approve:      { ADMIN:'',     KETUA:'A',    WAKIL:'A',    SEKUM:'',     BENDUM:'',    KADEPT:'',     ANGGOTA:'',    BPH:'' },
  proker_edit_terkunci:{ ADMIN:'U',    KETUA:'U',    WAKIL:'U',    SEKUM:'',     BENDUM:'',    KADEPT:'U*',   ANGGOTA:'',    BPH:'R' },
  proker_hapus:        { ADMIN:'D',    KETUA:'D',    WAKIL:'D',    SEKUM:'',     BENDUM:'',    KADEPT:'',     ANGGOTA:'',    BPH:'' },

  gantt:               { ADMIN:'CRUD', KETUA:'CRUD', WAKIL:'CRUD', SEKUM:'R',    BENDUM:'R',   KADEPT:'CRU*', ANGGOTA:'RU*', BPH:'R' },
  master_gantt:        { ADMIN:'R',    KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'R',   KADEPT:'R',    ANGGOTA:'R',   BPH:'R' },

  kanban:              { ADMIN:'CRUD', KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'R',   KADEPT:'CRUD*',ANGGOTA:'CRU*',BPH:'R' },
  kendala:             { ADMIN:'CRUD', KETUA:'CRU',  WAKIL:'CRU',  SEKUM:'R',    BENDUM:'R',   KADEPT:'CRUD*',ANGGOTA:'CRU*',BPH:'R' },

  // ADR-036: hanya Sekum (dan Admin) menyusun surat; pengurus lain mengajukan SK Aktif dirinya.
  surat:               { ADMIN:'C',    KETUA:'',     WAKIL:'',     SEKUM:'C',    BENDUM:'',    KADEPT:'',     ANGGOTA:'',    BPH:'' },
  surat_aktif:         { ADMIN:'',     KETUA:'C',    WAKIL:'C',    SEKUM:'C',    BENDUM:'C',   KADEPT:'C',    ANGGOTA:'C',   BPH:'' },
  surat_approve:       { ADMIN:'',     KETUA:'A',    WAKIL:'A',    SEKUM:'A',    BENDUM:'',    KADEPT:'',     ANGGOTA:'',    BPH:'' },
  surat_arsip:         { ADMIN:'RUD',  KETUA:'R',    WAKIL:'R',    SEKUM:'RUD',  BENDUM:'R',   KADEPT:'R*',   ANGGOTA:'',    BPH:'R' },

  kepanitiaan_bentuk:  { ADMIN:'C',    KETUA:'C',    WAKIL:'C',    SEKUM:'',     BENDUM:'',    KADEPT:'C*',   ANGGOTA:'',    BPH:'R' },
  kepanitiaan:         { ADMIN:'CRUD', KETUA:'RU',   WAKIL:'RU',   SEKUM:'R',    BENDUM:'R',   KADEPT:'RU*',  ANGGOTA:'R*',  BPH:'R' },

  rab:                 { ADMIN:'CRUD', KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'RU',  KADEPT:'R*',   ANGGOTA:'C**', BPH:'R' },
  rab_kunci:           { ADMIN:'U',    KETUA:'U',    WAKIL:'U',    SEKUM:'',     BENDUM:'U',   KADEPT:'',     ANGGOTA:'',    BPH:'R' },

  nota:                { ADMIN:'C',    KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'R',   KADEPT:'C*',   ANGGOTA:'C**', BPH:'R' },
  nota_verifikasi:     { ADMIN:'U',    KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'U',   KADEPT:'',     ANGGOTA:'',    BPH:'R' },

  lpj:                 { ADMIN:'C',    KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'C',   KADEPT:'R*',   ANGGOTA:'',    BPH:'R' },

  notulensi:           { ADMIN:'CRUD', KETUA:'CRU',  WAKIL:'CRU',  SEKUM:'CRUD', BENDUM:'R',   KADEPT:'CRU*', ANGGOTA:'R*',  BPH:'R' },
  pengurus:            { ADMIN:'CRUD', KETUA:'R',    WAKIL:'R',    SEKUM:'CRUD', BENDUM:'R',   KADEPT:'R*',   ANGGOTA:'R*',  BPH:'R' },
  ruangan:             { ADMIN:'CRUD', KETUA:'R',    WAKIL:'R',    SEKUM:'CRUD', BENDUM:'R',   KADEPT:'C*',   ANGGOTA:'',    BPH:'R' },

  backup:              { ADMIN:'CRUD', KETUA:'R',    WAKIL:'',     SEKUM:'',     BENDUM:'',    KADEPT:'',     ANGGOTA:'',    BPH:'R' },
  audit:               { ADMIN:'R',    KETUA:'R',    WAKIL:'R',    SEKUM:'R',    BENDUM:'R',   KADEPT:'R*',   ANGGOTA:'',    BPH:'R' },
};

/**
 * Nama permission yang dipakai kode, dipetakan ke baris dan huruf hak.
 *
 * Nama di sisi kiri sengaja dibaca seperti kalimat — `proker.approve`, bukan
 * `proker_approve.A` — sementara sisi kanan tetap menunjuk ke sel tabel PRD.
 * Dengan begitu kode pemanggil tidak perlu tahu bentuk tabelnya, dan tabelnya
 * tidak perlu berkompromi demi kenyamanan penamaan.
 */
const AKSI = {
  'user.read':                ['user', 'R'],
  'user.create':              ['user', 'C'],
  'user.update':              ['user', 'U'],
  'user.delete':              ['user', 'D'],

  'periode.read':             ['periode', 'R'],
  'periode.create':           ['periode', 'C'],
  'periode.update':           ['periode', 'U'],
  'periode.delete':           ['periode', 'D'],

  'departemen.read':          ['departemen', 'R'],
  'departemen.create':        ['departemen', 'C'],
  'departemen.update':        ['departemen', 'U'],
  'departemen.delete':        ['departemen', 'D'],

  'proker.read':              ['proker', 'R'],
  'proker.create':            ['proker', 'C'],
  'proker.update':            ['proker', 'U'],
  'proker.approve':           ['proker_approve', 'A'],
  'proker.edit_terkunci':     ['proker_edit_terkunci', 'U'],
  'proker.delete':            ['proker_hapus', 'D'],

  'gantt.read':               ['gantt', 'R'],
  'gantt.create':             ['gantt', 'C'],
  'gantt.update':             ['gantt', 'U'],
  'gantt.delete':             ['gantt', 'D'],
  'master_gantt.read':        ['master_gantt', 'R'],

  'kanban.read':              ['kanban', 'R'],
  'kanban.create':            ['kanban', 'C'],
  'kanban.update':            ['kanban', 'U'],
  'kanban.delete':            ['kanban', 'D'],

  'kendala.read':             ['kendala', 'R'],
  'kendala.create':           ['kendala', 'C'],
  'kendala.update':           ['kendala', 'U'],
  'kendala.delete':           ['kendala', 'D'],

  'surat.create':             ['surat', 'C'],
  'surat.ajukan_aktif':       ['surat_aktif', 'C'],
  'surat.approve':            ['surat_approve', 'A'],
  'surat.read':               ['surat_arsip', 'R'],
  'surat.update':             ['surat_arsip', 'U'],
  'surat.delete':             ['surat_arsip', 'D'],

  'kepanitiaan.bentuk':       ['kepanitiaan_bentuk', 'C'],
  'kepanitiaan.read':         ['kepanitiaan', 'R'],
  'kepanitiaan.update':       ['kepanitiaan', 'U'],
  'kepanitiaan.delete':       ['kepanitiaan', 'D'],

  'rab.read':                 ['rab', 'R'],
  'rab.create':               ['rab', 'C'],
  'rab.update':               ['rab', 'U'],
  'rab.delete':               ['rab', 'D'],
  'rab.lock':                 ['rab_kunci', 'U'],

  'nota.read':                ['nota', 'R'],
  'nota.create':              ['nota', 'C'],
  'nota.verify':              ['nota_verifikasi', 'U'],

  'lpj.read':                 ['lpj', 'R'],
  'lpj.generate':             ['lpj', 'C'],

  'notulensi.read':           ['notulensi', 'R'],
  'notulensi.create':         ['notulensi', 'C'],
  'notulensi.update':         ['notulensi', 'U'],
  'notulensi.delete':         ['notulensi', 'D'],

  'pengurus.read':            ['pengurus', 'R'],
  'pengurus.create':          ['pengurus', 'C'],
  'pengurus.update':          ['pengurus', 'U'],
  'pengurus.delete':          ['pengurus', 'D'],

  'ruangan.read':             ['ruangan', 'R'],
  'ruangan.create':           ['ruangan', 'C'],
  'ruangan.update':           ['ruangan', 'U'],
  'ruangan.delete':           ['ruangan', 'D'],

  'backup.read':              ['backup', 'R'],
  'backup.manage':            ['backup', 'U'],

  'audit.read':               ['audit', 'R'],
} as const satisfies Record<string, readonly [string, Hak]>;

export type Permission = keyof typeof AKSI;

/** Semua nama permission, untuk iterasi dan pengujian. */
export const SEMUA_PERMISSION = Object.keys(AKSI) as Permission[];

/** Membaca satu sel: huruf hak yang diberikan, dan lingkupnya bila ada. */
function bacaSel(sel: Sel): { hak: Hak[]; lingkup: Lingkup | null } {
  // `**` diperiksa lebih dulu; `*` adalah awalannya dan akan cocok lebih dulu
  // bila urutannya dibalik, sehingga lingkup DIVISI diam-diam menjadi
  // DEPARTEMEN — hak Anggota atas nota melebar dari satu divisi ke seluruh
  // departemen tanpa satu pun tanda.
  const lingkup: Lingkup | null = sel.includes('**')
    ? 'DIVISI'
    : sel.includes('*')
      ? 'DEPARTEMEN'
      : null;

  const hak = sel.replace(/\*/g, '').split('') as Hak[];
  return { hak, lingkup };
}

/**
 * Peta permission → role yang memilikinya, diturunkan dari `MATRIKS`.
 * Inilah bentuk yang disebut SYSTEM_DESIGN §5.4 sebagai `PERMISSIONS`.
 */
export const PERMISSIONS: Record<Permission, RoleCode[]> = Object.fromEntries(
  SEMUA_PERMISSION.map((p) => {
    const [baris, hak] = AKSI[p];
    const row = MATRIKS[baris];
    if (!row) throw new Error(`Baris matriks "${baris}" tidak ada (permission ${p}).`);
    return [p, ROLES.filter((r) => bacaSel(row[r]).hak.includes(hak))];
  }),
) as Record<Permission, RoleCode[]>;

/**
 * Apakah salah satu role pengguna memberi permission ini.
 *
 * Gabungan hak (*union of permissions*): pengguna ber-role ganda memperoleh
 * gabungan hak seluruh role-nya. Yang TIDAK terjadi adalah sebaliknya — role
 * tambahan tidak pernah mengurangi hak, dan tidak pernah menambah hak yang
 * tidak dimiliki satu pun role-nya (INV-03).
 */
export function can(roles: readonly RoleCode[], permission: Permission): boolean {
  return PERMISSIONS[permission].some((r) => roles.includes(r));
}

/**
 * Batas baris yang berlaku bila permission ini dipakai oleh role-role tersebut.
 *
 * Mengembalikan lingkup TERLONGGAR di antara role yang memberi hak: pengguna
 * yang sekaligus Kadept (berlingkup) dan Ketua (tidak berlingkup) menjalankan
 * aksinya sebagai Ketua, tanpa batas. Mengembalikan lingkup tersempit justru
 * akan mempersempit hak Ketua hanya karena ia kebetulan juga Kadept.
 *
 * `null` berarti tidak ada batas — atau permission-nya memang tidak dimiliki;
 * pemanggil wajib memanggil `can()` lebih dulu.
 */
export function lingkupUntuk(
  roles: readonly RoleCode[],
  permission: Permission,
): Lingkup | null {
  const [baris, hak] = AKSI[permission];
  const row = MATRIKS[baris];
  if (!row) return null;

  let paling: Lingkup | null = null;
  let adaYangMemberi = false;

  for (const r of roles) {
    const { hak: daftar, lingkup } = bacaSel(row[r]);
    if (!daftar.includes(hak)) continue;
    adaYangMemberi = true;
    if (lingkup === null) return null;
    if (lingkup === 'DEPARTEMEN') paling = 'DEPARTEMEN';
    else if (paling === null) paling = 'DIVISI';
  }

  return adaYangMemberi ? paling : null;
}

/**
 * Baris matriks yang tidak ditunjuk satu pun permission.
 *
 * Menyalin tabel PRD tidak ada gunanya bila sebagian barisnya tidak pernah
 * dipakai kode: barisnya ada, tetapi tidak ada yang menjaganya. Persis itulah
 * yang terjadi bila contoh 11 permission SYSTEM_DESIGN §5.4 dipakai apa adanya
 * — lima belas baris tanpa penjaga, dan tidak ada yang memberi tahu.
 */
export function barisTanpaAksi(): string[] {
  const dipakai = new Set<string>(SEMUA_PERMISSION.map((p) => AKSI[p][0]));
  return Object.keys(MATRIKS).filter((b) => !dipakai.has(b));
}

/**
 * Daftar pelanggaran INV-03: BPH memperoleh hak selain baca.
 *
 * PRD §5.2 butir 3 menyebutnya sebagai "BPH tidak pernah muncul sebagai
 * approver". Yang sebenarnya berlaku lebih luas: pada seluruh 26 baris matriks,
 * BPH hanya pernah memegang `R`. Fungsi ini memeriksa hal itu terhadap
 * `MATRIKS`, bukan terhadap ingatan — sehingga sel BPH yang kelak berubah
 * menjadi `RU` akan menggagalkan test, bukan diam-diam memberi hak tulis
 * kepada role yang seharusnya hanya mengawasi.
 */
export function pelanggaranBph(): string[] {
  const buruk: string[] = [];
  for (const [nama, baris] of Object.entries(MATRIKS)) {
    const { hak } = bacaSel(baris.BPH);
    const menulis = hak.filter((h) => h !== 'R');
    if (menulis.length > 0) buruk.push(`${nama}: BPH memegang ${menulis.join('')}`);
  }
  return buruk;
}
