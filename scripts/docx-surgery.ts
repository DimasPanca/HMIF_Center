/**
 * Bedah DOCX tanpa membongkar strukturnya.
 *
 * ===========================================================================
 * KENAPA INI AMAN, PADAHAL "MENGEDIT DOCX LEWAT KODE" BIASANYA TIDAK
 * ===========================================================================
 * Yang membuat berkas Word rusak adalah menulis ulang tag STRUKTUR — `<w:pPr>`,
 * `<w:rPr>`, `<w:tblPr>`, relasi gambar. Modul ini tidak pernah menyentuh satu
 * pun di antaranya. Ia hanya mengubah isi `<w:t>`, yaitu teks yang terlihat,
 * dan menyalin `<w:p>` yang sudah ada bila perlu paragraf baru.
 *
 * Akibatnya kop surat, margin, font, penomoran, dan tabel tetap persis seperti
 * aslinya — bukan karena hati-hati, melainkan karena tidak pernah dibaca.
 *
 * ===========================================================================
 * MASALAH RUN YANG TERPECAH, DAN CARA MODUL INI MENANGANINYA
 * ===========================================================================
 * Word memecah satu kalimat menjadi beberapa `<w:t>` begitu formatnya berubah
 * di tengah. Berkas contoh HMIF menyimpan satu NIM sebagai tiga potongan:
 *
 *     "Muhammad Zidan Heiqmatyar" | "NIM. 33372300" | "84"
 *
 * Mencari "NIM. 3337230084" di dalam satu `<w:t>` karena itu tidak akan pernah
 * ketemu. Modul ini menggabungkan seluruh `<w:t>` satu paragraf menjadi satu
 * untai, mencari di sana, lalu MENGEMBALIKAN hasilnya ke potongan-potongan
 * semula: teks pengganti masuk ke potongan pertama yang tersentuh, dan potongan
 * lain hanya kehilangan bagian yang tergantikan.
 *
 * Cara itu penting justru untuk yang TIDAK diganti. Menulis seluruh paragraf ke
 * satu `<w:t>` akan meratakan formatnya — satu kata tebal di tengah kalimat
 * ikut hilang. Dengan mengembalikan per potongan, format bagian yang tidak
 * disentuh tetap utuh.
 *
 * Sumber: docs/ai/TEMPLATE_MAPPING.md · docs/ai/tasks/P0-prasyarat.md T-006
 */

import PizZip from 'pizzip';

/** Satu simpul `<w:t>` beserta letaknya di untai gabungan paragraf. */
interface Simpul {
  /** Indeks awal isi (setelah `<w:t ...>`) di dalam XML paragraf. */
  isiAwal: number;
  /** Indeks akhir isi (sebelum `</w:t>`). */
  isiAkhir: number;
  /** Teks sudah ter-decode, siap dicocokkan. */
  teks: string;
  /** Offset simpul ini di untai gabungan. */
  offset: number;
}

const POLA_T = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function encode(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function simpul(xmlParagraf: string): Simpul[] {
  const hasil: Simpul[] = [];
  let offset = 0;
  POLA_T.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = POLA_T.exec(xmlParagraf)) !== null) {
    const buka = m[1] ?? '';
    const isi = m[2] ?? '';
    const teks = decode(isi);
    hasil.push({
      isiAwal: m.index + buka.length,
      isiAkhir: m.index + buka.length + isi.length,
      teks,
      offset,
    });
    offset += teks.length;
  }
  return hasil;
}

/** Teks satu paragraf, hasil penggabungan seluruh `<w:t>`-nya. */
export function teksParagraf(xmlParagraf: string): string {
  return simpul(xmlParagraf)
    .map((s) => s.teks)
    .join('');
}

/**
 * Menulis ulang teks paragraf dari untai gabungan yang sudah diubah.
 *
 * `sunting` menerima untai gabungan dan mengembalikan daftar suntingan
 * `[awal, akhir, pengganti]` dalam koordinat untai itu. Suntingan diterapkan
 * dari belakang supaya indeks di depannya tetap sah.
 */
function terapkan(
  xmlParagraf: string,
  suntingan: [number, number, string][],
): string {
  if (suntingan.length === 0) return xmlParagraf;

  const simpulan = simpul(xmlParagraf);
  if (simpulan.length === 0) return xmlParagraf;

  const urut = [...suntingan].sort((a, b) => a[0] - b[0]);
  const panjang = simpulan.reduce((n, s) => n + s.teks.length, 0);

  const teksBaru = simpulan.map((s) => {
    const sAwal = s.offset;
    const sAkhir = s.offset + s.teks.length;
    const terakhir = s === simpulan[simpulan.length - 1];

    let keluar = '';
    let pos = sAwal;

    for (const [a, b, ganti] of urut) {
      if (a === b) {
        // Penyisipan murni: ditempelkan pada simpul yang memuat titiknya, dan
        // hanya pada satu simpul. Tanpa syarat `terakhir`, penyisipan tepat di
        // ujung paragraf tidak akan mendarat di mana pun.
        const milikSimpul = (sAwal <= a && a < sAkhir) || (terakhir && a === panjang);
        if (!milikSimpul) continue;
        keluar += s.teks.slice(pos - sAwal, a - sAwal) + ganti;
        pos = a;
        continue;
      }

      if (b <= sAwal || a >= sAkhir) continue;

      const mulai = Math.max(a, sAwal);
      const henti = Math.min(b, sAkhir);
      keluar += s.teks.slice(pos - sAwal, mulai - sAwal);

      // Teks pengganti hanya ditulis sekali, di simpul tempat suntingan
      // DIMULAI. Simpul berikutnya yang ikut tersentuh cuma kehilangan bagian
      // yang tergantikan — itulah yang membuat tag yang terpecah menyatu
      // kembali tanpa menduplikasi hasilnya.
      if (a >= sAwal) keluar += ganti;
      pos = henti;
    }

    return keluar + s.teks.slice(pos - sAwal);
  });

  // Ditulis balik dari belakang supaya indeks XML di depannya tetap sah.
  let keluar = xmlParagraf;
  for (let i = simpulan.length - 1; i >= 0; i--) {
    const s = simpulan[i]!;
    keluar = keluar.slice(0, s.isiAwal) + encode(teksBaru[i]!) + keluar.slice(s.isiAkhir);
  }
  return keluar;
}

/**
 * Mengganti setiap kemunculan `cari` di dalam satu paragraf.
 * Mengembalikan XML baru dan berapa kali penggantian terjadi.
 */
export function gantiDiParagraf(
  xmlParagraf: string,
  cari: string,
  jadi: string,
): { xml: string; jumlah: number } {
  const untai = teksParagraf(xmlParagraf);
  const suntingan: [number, number, string][] = [];

  let dari = 0;
  for (;;) {
    const i = untai.indexOf(cari, dari);
    if (i === -1) break;
    suntingan.push([i, i + cari.length, jadi]);
    dari = i + cari.length;
  }

  if (suntingan.length === 0) return { xml: xmlParagraf, jumlah: 0 };
  return { xml: terapkan(xmlParagraf, suntingan), jumlah: suntingan.length };
}

/**
 * Blok tingkat atas di dalam `<w:body>`: sebuah tabel utuh atau sebuah paragraf.
 *
 * Tabel diperlakukan sebagai satu blok — paragraf di dalam selnya tidak muncul
 * sebagai blok tersendiri, tetapi tetap dapat dijangkau operasi teks karena
 * pencarian dilakukan pada seluruh `<w:p>` di mana pun letaknya.
 */
const POLA_BLOK = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g;

export class Dokumen {
  private xml: string;
  private readonly zip: PizZip;

  constructor(isi: Buffer) {
    this.zip = new PizZip(isi);
    const doc = this.zip.file('word/document.xml');
    if (!doc) throw new Error('word/document.xml tidak ada — bukan .docx yang sah.');
    this.xml = doc.asText();
  }

  /** Seluruh `<w:p>` di dokumen, termasuk yang berada di dalam sel tabel. */
  private paragraf(): { awal: number; akhir: number; xml: string }[] {
    const hasil: { awal: number; akhir: number; xml: string }[] = [];
    const pola = /<w:p\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g;
    let m: RegExpExecArray | null;
    while ((m = pola.exec(this.xml)) !== null) {
      hasil.push({ awal: m.index, akhir: m.index + m[0].length, xml: m[0] });
    }
    return hasil;
  }

  private blok(): { awal: number; akhir: number; xml: string }[] {
    const badan = this.xml.indexOf('<w:body>');
    const hasil: { awal: number; akhir: number; xml: string }[] = [];
    POLA_BLOK.lastIndex = badan === -1 ? 0 : badan;
    let m: RegExpExecArray | null;
    while ((m = POLA_BLOK.exec(this.xml)) !== null) {
      hasil.push({ awal: m.index, akhir: m.index + m[0].length, xml: m[0] });
    }
    return hasil;
  }

  /** Teks tiap paragraf, untuk memeriksa hasil dan menyusun resep. */
  teks(): string[] {
    return this.paragraf()
      .map((p) => teksParagraf(p.xml).replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0);
  }

  /**
   * Mengganti `cari` menjadi `jadi` di seluruh dokumen.
   * Mengembalikan jumlah kemunculan yang tergantikan.
   */
  ganti(cari: string, jadi: string): number {
    let total = 0;
    const daftar = this.paragraf();
    // Dari belakang: mengganti paragraf terakhir lebih dulu menjaga indeks
    // paragraf-paragraf sebelumnya tetap sah.
    for (let i = daftar.length - 1; i >= 0; i--) {
      const p = daftar[i]!;
      const { xml, jumlah } = gantiDiParagraf(p.xml, cari, jadi);
      if (jumlah === 0) continue;
      this.xml = this.xml.slice(0, p.awal) + xml + this.xml.slice(p.akhir);
      total += jumlah;
    }
    return total;
  }

  /** Mengganti seluruh isi paragraf pertama yang teksnya diawali `awalan`. */
  gantiParagraf(awalan: string, jadi: string): boolean {
    for (const p of this.paragraf()) {
      const untai = teksParagraf(p.xml);
      if (!untai.trimStart().startsWith(awalan)) continue;
      const baru = terapkan(p.xml, [[0, untai.length, jadi]]);
      this.xml = this.xml.slice(0, p.awal) + baru + this.xml.slice(p.akhir);
      return true;
    }
    return false;
  }

  /**
   * Menyisipkan paragraf baru tepat sebelum paragraf yang diawali `awalan`.
   *
   * Paragraf baru adalah SALINAN paragraf acuan dengan teksnya diganti, bukan
   * `<w:p>` yang dirakit dari nol. Dengan begitu perataan, jarak baris, dan
   * format hurufnya otomatis sama — dan tidak ada tag struktur yang dikarang.
   */
  sisipSebelum(awalan: string, teks: string): boolean {
    for (const p of this.paragraf()) {
      if (!teksParagraf(p.xml).trimStart().startsWith(awalan)) continue;
      const untai = teksParagraf(p.xml);
      const salinan = terapkan(p.xml, [[0, untai.length, teks]]);
      this.xml = this.xml.slice(0, p.awal) + salinan + this.xml.slice(p.awal);
      return true;
    }
    return false;
  }

  /**
   * Seperti `sisipSebelum`, tetapi gaya paragraf disalin dari paragraf LAIN
   * (diawali `awalanSumber`). Dipakai saat sasaran sisip adalah judul: paragraf
   * isi yang disisipkan sebelum judul tidak boleh ikut bergaya judul (T-105).
   */
  sisipSalinSebelum(awalanSumber: string, awalanSebelum: string, teks: string): boolean {
    const semua = this.paragraf();
    const cocok = (awalan: string) => semua.find((p) => teksParagraf(p.xml).trimStart().startsWith(awalan));
    const sumber = cocok(awalanSumber);
    const sasaran = cocok(awalanSebelum);
    if (!sumber || !sasaran) return false;
    const salinan = terapkan(sumber.xml, [[0, teksParagraf(sumber.xml).length, teks]]);
    this.xml = this.xml.slice(0, sasaran.awal) + salinan + this.xml.slice(sasaran.awal);
    return true;
  }

  /**
   * Menghapus blok tingkat atas dari paragraf yang diawali `dari` sampai
   * paragraf yang diawali `sampai`, keduanya ikut terhapus. Bila `sampai`
   * kosong, penghapusan berlanjut sampai akhir badan dokumen.
   *
   * Bekerja pada blok tingkat atas, bukan paragraf, supaya tabel yang berada
   * di dalam rentang ikut terhapus utuh — bukan menyisakan `<w:tbl>` yang
   * kehilangan isinya dan membuat Word menolak berkas.
   */
  hapusBlok(dari: string, sampai?: string): number {
    const blok = this.blok();
    const cocok = (b: { xml: string }, awalan: string): boolean =>
      b.xml.startsWith('<w:p')
        ? teksParagraf(b.xml).trimStart().startsWith(awalan)
        : false;

    const i = blok.findIndex((b) => cocok(b, dari));
    if (i === -1) return 0;

    let j: number;
    if (sampai === undefined) {
      j = blok.length - 1;
    } else {
      j = blok.findIndex((b, k) => k >= i && cocok(b, sampai));
      if (j === -1) return 0;
    }

    const awal = blok[i]!.awal;
    const akhir = blok[j]!.akhir;
    this.xml = this.xml.slice(0, awal) + this.xml.slice(akhir);
    return j - i + 1;
  }

  /**
   * Menghapus blok dari paragraf yang diawali `dari` sampai TEPAT SEBELUM
   * paragraf yang diawali `sebelum`.
   *
   * Bentuk eksklusif ini yang dipakai untuk membuang isi contoh sebuah bagian:
   * penandanya adalah judul bagian BERIKUTNYA, yang selalu unik dan tidak ikut
   * terhapus. Bentuk inklusif `hapusBlok` menuntut penanda akhir yang tepat,
   * padahal kalimat terakhir sebuah bagian sering berulang di bagian lain —
   * "Tempat: Baduy Outbound" muncul dua kali di TOR, dan penghapusan berhenti
   * di kemunculan pertama tanpa memberi tanda.
   */
  hapusHingga(dari: string, sebelum: string): number {
    const blok = this.blok();
    const cocok = (b: { xml: string }, awalan: string): boolean =>
      b.xml.startsWith('<w:p') ? teksParagraf(b.xml).trimStart().startsWith(awalan) : false;

    const i = blok.findIndex((b) => cocok(b, dari));
    if (i === -1) return 0;
    const j = blok.findIndex((b, k) => k > i && cocok(b, sebelum));
    if (j === -1) return 0;

    this.xml = this.xml.slice(0, blok[i]!.awal) + this.xml.slice(blok[j]!.awal);
    return j - i;
  }

  /**
   * Mengisi sebuah bagian: paragraf berteks PERTAMA sesudah judul `judul`
   * diganti dengan `teks`, dan seluruh blok sisanya sampai `judulBerikut`
   * dibuang.
   *
   * Pola ini berulang di hampir setiap bagian TOR, Proposal, dan LPJ: sebuah
   * judul, lalu beberapa paragraf contoh yang seluruhnya harus menjadi satu
   * placeholder. Menuliskannya sebagai `paragraf` + `hapusHingga` menuntut
   * penulis resep mengetahui kalimat pertama DAN kalimat kedua tiap bagian —
   * dua puluh kalimat yang harus disalin persis dan tidak berguna bagi siapa
   * pun yang membacanya nanti. Di sini cukup nama kedua judulnya.
   */
  isiBagian(judul: string, judulBerikut: string, teks: string): boolean {
    const blok = this.blok();
    const paragrafBerteks = (b: { xml: string }): boolean =>
      b.xml.startsWith('<w:p') && /<w:t(?:\s[^>]*)?>/.test(b.xml);
    const cocok = (b: { xml: string }, awalan: string): boolean =>
      b.xml.startsWith('<w:p') ? teksParagraf(b.xml).trimStart().startsWith(awalan) : false;

    const i = blok.findIndex((b) => cocok(b, judul));
    if (i === -1) return false;
    const j = blok.findIndex((b, k) => k > i && cocok(b, judulBerikut));
    if (j === -1) return false;

    const isi = blok.findIndex((b, k) => k > i && k < j && paragrafBerteks(b));
    if (isi === -1) return false;

    // Dari belakang: penghapusan lebih dulu, penggantian sesudahnya, supaya
    // indeks XML paragraf isi tidak bergeser.
    if (j > isi + 1) {
      this.xml = this.xml.slice(0, blok[isi + 1]!.awal) + this.xml.slice(blok[j]!.awal);
    }
    const pr = blok[isi]!;
    const baru = terapkan(pr.xml, [[0, teksParagraf(pr.xml).length, teks]]);
    this.xml = this.xml.slice(0, pr.awal) + baru + this.xml.slice(pr.akhir);
    return true;
  }

  /**
   * Menghapus tabel-tabel utuh berdasarkan indeksnya (mulai 0).
   *
   * Sebagian tabel contoh tidak punya paragraf berteks di sekitarnya yang bisa
   * dijadikan penanda — di TOR, kelima tabel susunan acara hanya dipisahkan
   * paragraf kosong. Menghapusnya lewat koordinat adalah satu-satunya cara yang
   * tidak menebak.
   */
  hapusTabel(indeks: number[]): number {
    let terhapus = 0;
    // Dari belakang: indeks tabel di depannya tetap sah.
    for (const i of [...indeks].sort((a, b) => b - a)) {
      const t = [...this.xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)][i];
      if (!t) continue;
      this.xml = this.xml.slice(0, t.index) + this.xml.slice(t.index + t[0].length);
      terhapus++;
    }
    return terhapus;
  }

  /**
   * Menghapus baris ke-`indeks` (mulai 0) dari tabel ke-`tabel` (mulai 0).
   * Dipakai untuk menyisakan satu baris contoh sebagai badan loop.
   */
  hapusBarisTabel(tabel: number, indeks: number[]): number {
    const tabelan = [...this.xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];
    const t = tabelan[tabel];
    if (!t) return 0;

    const isi = t[0];
    const baris = [...isi.matchAll(/<w:tr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:tr>)/g)];
    let baruIsi = isi;
    let terhapus = 0;

    for (const i of [...indeks].sort((a, b) => b - a)) {
      const b = baris[i];
      if (!b) continue;
      baruIsi = baruIsi.slice(0, b.index) + baruIsi.slice(b.index + b[0].length);
      terhapus++;
    }

    this.xml = this.xml.slice(0, t.index) + baruIsi + this.xml.slice(t.index + isi.length);
    return terhapus;
  }

  /**
   * Menulis isi sebuah sel tabel, satu untai per paragraf.
   *
   * Dipakai untuk membungkus baris tabel menjadi loop dan untuk blok tanda
   * tangan. Menargetkan sel lewat koordinat, bukan lewat pencarian teks, karena
   * isi selnya sering berupa kata yang juga muncul di tempat lain — "Acara"
   * pada tabel rundown juga menjadi judul kolom dan bagian dari "Susunan Acara".
   * Pencarian teks di situ akan mengganti hal yang salah tanpa memberi tanda.
   *
   * Bila `isi` lebih pendek dari jumlah paragraf sel, sisanya dikosongkan.
   * Bila lebih panjang, paragraf terakhir DISALIN untuk menampung kelebihannya —
   * sehingga baris tambahan mewarisi perataan dan format yang sama.
   */
  setSel(tabel: number, baris: number, sel: number, isi: string[]): boolean {
    const tabelan = [...this.xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];
    const t = tabelan[tabel];
    if (!t) return false;

    const barisan = [...t[0].matchAll(/<w:tr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:tr>)/g)];
    const b = barisan[baris];
    if (!b) return false;

    const selan = [...b[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
    const c = selan[sel];
    if (!c) return false;

    // HANYA paragraf yang punya `<w:t>`.
    //
    // Sel tanda tangan berisi beberapa paragraf kosong di antara jabatan dan
    // nama — itulah ruang tempat tanda tangan fisik dibubuhkan. Paragraf
    // seperti itu tidak punya run sama sekali, sehingga tidak ada tempat
    // menaruh teks di dalamnya: menulis ke sana menguap tanpa jejak, dan untai
    // berikutnya bergeser ke paragraf yang salah. Pernah terjadi — `{label_atas}`
    // hilang dari lima surat sekaligus, dan teks aslinya ikut terhapus.
    //
    // Dengan menyaringnya di sini, paragraf kosong itu tetap utuh sebagai
    // ruang, dan untai hanya mendarat di paragraf yang memang bisa menampung.
    const paragrafan = [...c[0].matchAll(/<w:p\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g)].filter(
      (m) => /<w:t(?:\s[^>]*)?>/.test(m[0]),
    );
    if (paragrafan.length === 0) return false;

    let selBaru = c[0];

    // Kelebihan untai ditambahkan lebih dulu, dengan menyalin paragraf terakhir.
    const terakhir = paragrafan[paragrafan.length - 1]!;
    if (isi.length > paragrafan.length) {
      const tambahan = isi
        .slice(paragrafan.length)
        .map((teks) => terapkan(terakhir[0], [[0, teksParagraf(terakhir[0]).length, teks]]))
        .join('');
      const sisip = terakhir.index + terakhir[0].length;
      selBaru = selBaru.slice(0, sisip) + tambahan + selBaru.slice(sisip);
    }

    // Ditulis dari belakang supaya indeks paragraf di depannya tetap sah.
    //
    // Paragraf berlebih DIHAPUS, bukan dikosongkan. Mengosongkannya menyisakan
    // baris kosong tepat di tempat teks contoh tadi berada — pada sel anggota
    // panitia yang memuat tujuh nama, itu berarti enam baris kosong menganga di
    // setiap dokumen yang dihasilkan.
    for (let i = paragrafan.length - 1; i >= 0; i--) {
      const pr = paragrafan[i]!;
      if (i >= isi.length) {
        selBaru = selBaru.slice(0, pr.index) + selBaru.slice(pr.index + pr[0].length);
        continue;
      }
      const baru = terapkan(pr[0], [[0, teksParagraf(pr[0]).length, isi[i]!]]);
      selBaru = selBaru.slice(0, pr.index) + baru + selBaru.slice(pr.index + pr[0].length);
    }

    this.xml = this.xml.slice(0, t.index + b.index + c.index) + selBaru +
      this.xml.slice(t.index + b.index + c.index + c[0].length);
    return true;
  }

  /** Isi tiap paragraf sebuah sel — untuk menyusun dan memeriksa resep. */
  bacaSel(tabel: number, baris: number, sel: number): string[] | null {
    const t = [...this.xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)][tabel];
    if (!t) return null;
    const b = [...t[0].matchAll(/<w:tr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:tr>)/g)][baris];
    if (!b) return null;
    const c = [...b[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)][sel];
    if (!c) return null;
    return [...c[0].matchAll(/<w:p\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g)].map((m) =>
      teksParagraf(m[0]),
    );
  }

  /**
   * Menghapus SETIAP gambar di badan dokumen beserta berkas medianya.
   *
   * Berkas contoh HMIF menyimpan tanda tangan basah orang sungguhan dan cap
   * stempel sebagai gambar melayang di blok tanda tangan (ditemukan T-061).
   * Dibiarkan, setiap surat yang dihasilkan ikut memuat tanda tangan pejabat
   * lama — di atas nama penandatangan yang sama sekali lain. Tanda tangan dan
   * stempel sah disisipkan saat generate lewat `{%ttd}`, bukan diwarisi contoh.
   *
   * Kop surat ada di `header*.xml` dan tidak tersentuh. Relasi dan berkas
   * `word/media/*` yang tidak lagi dirujuk bagian mana pun ikut dibuang — kalau
   * tidak, tanda tangan lama tetap dapat diekstrak dari zip walau tak tampil.
   */
  hapusGambar(): number {
    let n = 0;
    this.xml = this.xml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:(?:drawing|pict)\b[\s\S]*?<\/w:r>/g, () => {
      n++;
      return '';
    });

    const relsDoc = 'word/_rels/document.xml.rels';
    const rels = this.zip.file(relsDoc)?.asText() ?? '';
    const sisa = rels.replace(/<Relationship\b[^>]*\/>/g, (rel) => {
      const id = /\bId="([^"]+)"/.exec(rel)?.[1];
      const gambar = /\/relationships\/image"/.test(rel);
      return gambar && id && !this.xml.includes(`"${id}"`) ? '' : rel;
    });
    this.zip.file(relsDoc, sisa);

    // Media yang tidak dirujuk berkas relasi mana pun (header tetap merujuk logonya).
    const semuaRels = this.zip
      .file(/\.rels$/)
      .map((f) => f.asText())
      .join('\n');
    for (const f of this.zip.file(/^word\/media\//)) {
      const nama = f.name.slice('word/'.length);
      if (!semuaRels.includes(`Target="${nama}"`) && !semuaRels.includes(`Target="/word/${nama}"`)) {
        this.zip.remove(f.name);
      }
    }
    return n;
  }

  /**
   * Membuang paragraf kosong berisi pindah halaman di AKHIR badan dokumen.
   *
   * Sisa pembedahan: Undangan Pemateri dulu menyambung ke TOR lewat satu
   * paragraf pindah halaman. TOR-nya dibuang, paragraf itu tertinggal, dan
   * setiap undangan tercetak dengan halaman kedua kosong (ditemukan T-061).
   * Hanya paragraf tanpa teks yang memuat `<w:br w:type="page"/>` yang dibuang;
   * paragraf kosong biasa dan `sectPr` tidak disentuh.
   */
  hapusPindahHalamanAkhir(): number {
    let n = 0;
    for (;;) {
      const blok = this.blok().filter((b) => !b.xml.startsWith('<w:sectPr'));
      const akhir = blok.at(-1);
      if (!akhir || !akhir.xml.startsWith('<w:p')) break;
      if (teksParagraf(akhir.xml).trim() !== '') break;
      if (!/<w:br\b[^>]*w:type="page"/.test(akhir.xml)) {
        // Paragraf kosong biasa di antaranya boleh dilewati — cari ke belakang.
        const sebelum = blok.at(-2);
        if (sebelum && sebelum.xml.startsWith('<w:p') && teksParagraf(sebelum.xml).trim() === '' && /<w:br\b[^>]*w:type="page"/.test(sebelum.xml)) {
          this.xml = this.xml.slice(0, sebelum.awal) + this.xml.slice(sebelum.akhir);
          n++;
          continue;
        }
        break;
      }
      this.xml = this.xml.slice(0, akhir.awal) + this.xml.slice(akhir.akhir);
      n++;
    }
    return n;
  }

  simpan(): Buffer {
    this.zip.file('word/document.xml', this.xml);
    return this.zip.generate({ type: 'nodebuffer' }) as Buffer;
  }
}
