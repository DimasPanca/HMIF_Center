/**
 * Status proker: daftar nilainya, transisi yang sah, dan siapa yang mengunci
 * kalender.
 *
 * Berkas ini sengaja TIDAK menyentuh database. Ia menerjemahkan dua tabel yang
 * sudah ada di dokumen — diagram USER_FLOW §11.1 dan matriks SYSTEM_DESIGN §6.6
 * — menjadi data yang dapat diperiksa satu per satu oleh test. Aturannya hidup
 * di sini supaya service, wizard, dan halaman approval membaca daftar yang sama
 * alih-alih masing-masing menuliskan `if` sendiri.
 *
 * Yang TIDAK dijamin berkas ini: anti-bentrok. Itu milik EXCLUDE constraint di
 * `proker_lock` (INV-09), dan tidak ada satu pun fungsi di sini yang boleh
 * dianggap sebagai penggantinya.
 *
 * Sumber: USER_FLOW §11.1 · SYSTEM_DESIGN §6.6 · PRD F-5.1, F-5.2 · INV-09, INV-10, INV-13
 */

/** Tiga kategori, sama persis dengan enum `proker_kategori` di migrasi 002. */
export const KATEGORI = ['TERJADWAL', 'BERKALA', 'RESPONSIF'] as const;
export type ProkerKategori = (typeof KATEGORI)[number];

/** Sembilan status, sama persis dengan enum `proker_status` di migrasi 002. */
export const STATUS = [
  'DRAFT',
  'MENUNGGU_APPROVAL',
  'MENUNGGU_APPROVAL_REVISI',
  'DISETUJUI',
  'BERJALAN',
  'SELESAI',
  'DITOLAK',
  'PERLU_REVISI',
  'DIBATALKAN',
] as const;
export type ProkerStatus = (typeof STATUS)[number];

/**
 * Diagram USER_FLOW §11.1, disalin panah per panah.
 *
 * `DRAFT -> DRAFT` ikut dicatat karena diagramnya memuatnya: menyimpan progres
 * wizard adalah transisi yang sah, dan menghilangkannya membuat penyimpanan
 * langkah demi langkah tampak seperti pelanggaran.
 *
 * `MENUNGGU_APPROVAL_REVISI -> DISETUJUI` muncul sekali walau diagram
 * menggambarnya dua kali; keduanya berujung pada status yang sama, hanya
 * berbeda pada apa yang terjadi terhadap kunci — dan itu keputusan T-071,
 * bukan keputusan tabel ini.
 */
export const TRANSISI: Record<ProkerStatus, readonly ProkerStatus[]> = {
  DRAFT: ['DRAFT', 'MENUNGGU_APPROVAL'],
  MENUNGGU_APPROVAL: ['DISETUJUI', 'DITOLAK', 'PERLU_REVISI'],
  MENUNGGU_APPROVAL_REVISI: ['DISETUJUI'],
  DISETUJUI: ['BERJALAN', 'MENUNGGU_APPROVAL_REVISI', 'DIBATALKAN'],
  BERJALAN: ['SELESAI', 'DIBATALKAN'],
  SELESAI: [],
  DITOLAK: ['DRAFT'],
  PERLU_REVISI: ['MENUNGGU_APPROVAL'],
  DIBATALKAN: [],
};

export function bolehTransisi(dari: ProkerStatus, ke: ProkerStatus): boolean {
  return TRANSISI[dari].includes(ke);
}

/**
 * Status yang membuat proker TERJADWAL benar-benar mengunci kalender (INV-10).
 *
 * Hanya dua. Draft, ditolak, selesai, dan dibatalkan tidak mengunci apa pun —
 * itulah sebabnya `proker_lock` tabel terpisah dan bukan constraint di `proker`.
 *
 * Daftar ini dipakai untuk MEMBACA (kalender, badge, filter), tidak untuk
 * menulis: baris `proker_lock` hanya boleh muncul lewat `setujui_proker`.
 */
export const STATUS_MENGUNCI: readonly ProkerStatus[] = ['DISETUJUI', 'BERJALAN'];

/** Status yang menunggu keputusan Ketua/Wakil. */
export const STATUS_MENUNGGU: readonly ProkerStatus[] = [
  'MENUNGGU_APPROVAL',
  'MENUNGGU_APPROVAL_REVISI',
];

/**
 * Apakah kategori ini mengunci kalender bila disetujui (PRD F-5.1).
 *
 * Satu-satunya sel "Ditolak" pada matriks SYSTEM_DESIGN §6.6 adalah
 * TERJADWAL × TERJADWAL. Fungsi ini dan `konflikDitolak()` di bawah adalah dua
 * cara membaca fakta yang sama; keduanya ada supaya pemanggil tidak perlu
 * menyimpulkan sendiri.
 */
export function mengunciKalender(kategori: ProkerKategori): boolean {
  return kategori === 'TERJADWAL';
}

/**
 * Matriks konflik SYSTEM_DESIGN §6.6, diterjemahkan apa adanya.
 *
 * Sengaja ditulis sebagai perbandingan dua kategori, bukan sebagai
 * `baru === 'TERJADWAL'`, supaya bentuknya tetap terbaca sebagai matriks
 * seandainya kategori keempat ditambahkan suatu hari.
 */
export function konflikDitolak(baru: ProkerKategori, existing: ProkerKategori): boolean {
  return baru === 'TERJADWAL' && existing === 'TERJADWAL';
}

/**
 * Apakah kategori ini memerlukan approval Ketua/Wakil (PRD F-5.1).
 *
 * BERKALA tidak. Konsekuensinya nyata dan mudah terlewat: proker BERKALA
 * berpindah dari DRAFT langsung ke DISETUJUI tanpa pernah singgah di antrian
 * approval, sehingga antrian itu tidak boleh menampilkannya.
 */
export function butuhApproval(kategori: ProkerKategori): boolean {
  return kategori !== 'BERKALA';
}

/** Kepanitiaan dan Gantt wajib hanya untuk TERJADWAL (PRD F-5.3 langkah 4-5). */
export function wajibKepanitiaan(kategori: ProkerKategori): boolean {
  return kategori === 'TERJADWAL';
}
export const wajibGantt = wajibKepanitiaan;
