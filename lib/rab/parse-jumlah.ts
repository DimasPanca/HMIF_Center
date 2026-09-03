/**
 * Parser kolom `jumlah` pada RAB.
 *
 * Kolom ini di template asli berisi teks bebas: "10", "16 Unit",
 * "2 pack (12 pcs/pack)", "2 Hari 1 Malam". Sistem menyimpannya DUA KALI —
 * `jumlah_teks` apa adanya untuk tampilan dan ekspor, `jumlah_numerik` untuk
 * berhitung (INV-26).
 *
 * `teks` tidak pernah diubah isinya, hanya dipangkas spasi tepi. Ekspor Excel
 * wajib menghasilkan sel yang identik dengan arsip; "16 Unit" yang berubah
 * menjadi "16" sudah cukup untuk membuat gerbang G4 gagal.
 *
 * ===========================================================================
 * DUA KOREKSI TERHADAP SYSTEM_DESIGN §11.1
 * ===========================================================================
 *
 * 1. KODE CONTOHNYA BERTENTANGAN DENGAN TABELNYA SENDIRI.
 *
 *    Regex kasus 2 di dokumen berbunyi /^(\d+([.,]\d+)?)\s*[A-Za-z]/ —
 *    "angka, lalu ada huruf". Pola itu COCOK dengan ketiga baris yang oleh
 *    tabel di bawahnya justru ditandai butuh konfirmasi:
 *
 *      "2 pack (12 pcs/pack)"  -> "2" lalu "p"  -> cocok
 *      "2 Hari 1 Malam"        -> "2" lalu "H"  -> cocok
 *      "1 pack (isi 100)"      -> "1" lalu "p"  -> cocok
 *
 *    Dengan kode itu, KETIGANYA lolos sebagai kasus sederhana dan tidak
 *    pernah meminta konfirmasi. "2 Hari 1 Malam" akan tersimpan sebagai
 *    jumlah 2 tanpa ada yang menyadari bahwa satuannya bukan "2 sesuatu".
 *
 *    Yang dimaksud tabel jelas: satuan harus MENGHABISKAN sisa teks. Karena
 *    itu polanya diakhiri `$` dan satuannya satu kata alfabet.
 *
 * 2. TITIK SEBAGAI PEMISAH RIBUAN TIDAK DITANGANI.
 *
 *    `parseFloat('1.000')` menghasilkan 1. Dalam penulisan Indonesia —
 *    dan itulah yang dipakai di berkas RAB — "1.000" berarti seribu.
 *    Kesalahan ini tidak berteriak: RAB dengan 1.000 lembar stiker akan
 *    dihitung sebagai 1 lembar, dan selisihnya baru ketahuan saat LPJ.
 *
 * Sumber: SYSTEM_DESIGN §11.1 · PRD F-9.1 · INV-26 · docs/ai/tasks/P5-kepanitiaan-rab.md T-086
 */

export interface ParsedJumlah {
  /** Teks asli, hanya dipangkas spasi tepi. Tidak pernah diubah isinya. */
  teks: string;
  /** Nilai untuk berhitung. `null` bila tidak ada angka yang bisa dipercaya. */
  numerik: number | null;
  /** true bila UI harus meminta pengguna memastikan angkanya. */
  butuhInputManual: boolean;
}

/** Angka murni: "10", "156", "2,5", "1.000". */
const MURNI = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$|^\d+(?:[.,]\d+)?$/;

/**
 * Angka diikuti SATU kata satuan, dan tidak ada apa pun setelahnya.
 *
 * `$` di ujung itu inti koreksinya. Tanpanya, "2 Hari 1 Malam" ikut tertangkap
 * di sini dan tidak pernah meminta konfirmasi.
 */
const ANGKA_SATUAN = /^(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*([A-Za-z]+)$/;

/** Angka pertama di mana pun, untuk perkiraan pada kasus kompleks. */
const ANGKA_PERTAMA = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/;

/**
 * Mengubah angka bergaya Indonesia menjadi number.
 *
 * Titik dengan TEPAT tiga digit di belakangnya diperlakukan sebagai pemisah
 * ribuan — "1.000" jadi 1000, "1.000.000" jadi 1000000. Selain itu titik
 * adalah desimal, sehingga "1.5" tetap 1,5. Koma selalu desimal.
 *
 * Aturan tiga digit ini bukan tebakan: itulah yang membedakan "1.000" dari
 * "1.5" dalam penulisan Indonesia, dan berkas RAB memang ditulis begitu.
 */
function keAngka(mentah: string): number | null {
  const ribuan = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/;

  const bersih = ribuan.test(mentah)
    ? mentah.replace(/\./g, '').replace(',', '.')
    : mentah.replace(',', '.');

  const n = Number.parseFloat(bersih);
  return Number.isFinite(n) ? n : null;
}

export function parseJumlah(input: string): ParsedJumlah {
  const teks = (input ?? '').trim();

  // Kosong: tidak ada yang bisa disimpulkan, dan menebak 0 lebih buruk
  // daripada mengaku tidak tahu — 0 akan lolos ke kalkulasi sebagai angka sah.
  if (teks === '') {
    return { teks, numerik: null, butuhInputManual: true };
  }

  // Angka negatif DITOLAK, bukan diperbaiki diam-diam.
  //
  // Tanpa pemeriksaan ini, "-5" jatuh ke kasus kompleks dan ANGKA_PERTAMA
  // menemukan "5" — tandanya hilang dan jumlahnya berubah menjadi positif.
  // CHECK rab_item_jumlah_positif di migrasi 007 memang akan menolaknya
  // kelak, tetapi dengan pesan yang tidak menyebut sebabnya.
  if (/-\s*\d/.test(teks)) {
    return { teks, numerik: null, butuhInputManual: true };
  }

  // Kasus 1 — angka murni: "10", "156", "2,5", "1.000"
  if (MURNI.test(teks)) {
    return { teks, numerik: keAngka(teks), butuhInputManual: false };
  }

  // Kasus 2 — angka + satu kata satuan, habis: "16 Unit", "10 lembar"
  const m = ANGKA_SATUAN.exec(teks);
  if (m) {
    return { teks, numerik: keAngka(m[1]!), butuhInputManual: false };
  }

  // Kasus 3 — kompleks. Angka pertama dipakai sebagai perkiraan, tetapi
  // pengguna WAJIB memastikannya: "2 pack (12 pcs/pack)" bisa berarti 2 pack
  // atau 24 pcs, dan hanya orang yang membelinya yang tahu.
  const pertama = ANGKA_PERTAMA.exec(teks);
  return {
    teks,
    numerik: pertama ? keAngka(pertama[1]!) : null,
    butuhInputManual: true,
  };
}
