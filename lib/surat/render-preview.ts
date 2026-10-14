/**
 * render-preview — model pratinjau surat dari isian form (T-059). Modul murni.
 *
 * Pratinjau adalah REPLIKA HTML tata letak surat, bukan render DOCX: dihitung
 * di klien tiap kali isian berubah, tanpa satu pun panggilan server. Kalimat
 * baku tiap jenis disalin dari teks template (`templates/*.docx`), dan
 * `render-preview.test.ts` memeriksa bahwa setiap kalimat baku di sini memang
 * tertulis di template — kalau template diubah, pratinjau yang basi ketahuan.
 *
 * Bagian yang belum diisi tidak dikosongkan, melainkan menjadi segmen `kosong`
 * berlabel, supaya pengguna melihat di mana isiannya akan muncul.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-059 · TEMPLATE_MAPPING §5 · ADR-004, ADR-021
 */

import {
  ATURAN_PENANDATANGAN,
  infoJenis,
  type JenisSurat,
  type KonfigSurat,
} from '@/lib/surat/field-schemas';
import { sanitasiIsiHtml, teksDariIsiHtml } from '@/lib/surat/isi-html';
import { previewNomor } from '@/lib/surat/nomor';
import { formatTanggalSurat } from '@/lib/utils/format-tanggal';

// ---------------------------------------------------------------------------
// Bentuk model
// ---------------------------------------------------------------------------

export type Segmen = { t: 'teks'; v: string } | { t: 'kosong'; label: string };
export type Baris = Segmen[];

export type Blok =
  | { jenis: 'paragraf'; isi: Baris; rata?: 'tengah' | 'kanan'; tebal?: boolean }
  /** HTML isi surat yang SUDAH dibersihkan `sanitasiIsiHtml`. */
  | { jenis: 'html'; html: string; kosong?: string }
  /** Baris "Label : nilai" berlekuk, mis. Hari, tanggal / Waktu / Tempat. */
  | { jenis: 'rincian'; baris: { label: string; nilai: Baris }[] }
  | { jenis: 'tabel'; kepala: string[]; baris: Baris[][]; kosong: string }
  | { jenis: 'poin'; nomor: number; judul: Baris; paragraf: Baris[] };

export interface Penanda {
  /** Baris pembuka kolom, mis. "Mengetahui,". */
  label?: string;
  jabatan: Baris;
  nama: Baris;
  nim: Baris;
  /** Awalan NIM: Keterangan Aktif menulis "NIM" tanpa titik (TEMPLATE_MAPPING §5.1). */
  awalanNim: string;
  ttd: boolean;
  stempel: boolean;
}

export interface ModelPratinjau {
  jenis: JenisSurat;
  /** Judul di tengah, hanya surat keterangan. */
  judul?: string;
  nomor: string;
  /** "Cilegon, 02 Agustus 2025" — di kepala surat, atau di blok TTD (Keterangan Aktif). */
  kotaTanggal: Baris;
  lampiran?: Baris;
  perihal?: Baris;
  tujuan?: Baris[];
  salam?: string;
  isi: Blok[];
  ttd: { labelAtas?: Baris; kotaTanggalDiAtas: boolean; kiri?: Penanda; kanan: Penanda };
  lampiranHalaman?: { judul: string[]; isi: Blok[] };
}

export interface KetuaHimpunan {
  nama: string;
  nim: string;
}

// ---------------------------------------------------------------------------
// Pembangun
// ---------------------------------------------------------------------------

type Nilai = Record<string, unknown> & { jenis: JenisSurat; data_dinamis?: Record<string, unknown> };

const teks = (v: string): Segmen => ({ t: 'teks', v });

function ambil(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Nilai terisi → teks; kosong → penanda berlabel. */
function isi(v: unknown, label: string): Segmen {
  const s = ambil(v);
  return s ? teks(s) : { t: 'kosong', label };
}

/** Kalimat dari potongan teks baku dan segmen isian. */
function kalimat(...bagian: (string | Segmen)[]): Baris {
  return bagian.map((b) => (typeof b === 'string' ? teks(b) : b));
}

function tanggalSurat(v: unknown): Segmen {
  const s = ambil(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { t: 'kosong', label: 'Tanggal surat' };
  try {
    return teks(formatTanggalSurat(s));
  } catch {
    return { t: 'kosong', label: 'Tanggal surat' };
  }
}

function larik(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];
}

const KALIMAT_KEGIATAN = 'Sehubungan dengan akan diselenggarakannya kegiatan ';
const OLEH_HMIF = ' yang diselenggarakan oleh Himpunan Mahasiswa Informatika (HMIF) FT-UNTIRTA.  ';
const PENUTUP_KESEDIAAN = 'Demikian surat ini kami sampaikan. Atas perhatian dan kesediaannya kami ucapkan terima kasih.';

function kegiatan(d: Record<string, unknown>): Segmen[] {
  return [isi(d.nama_kegiatan, 'Nama kegiatan'), teks(' ('), isi(d.tema_kegiatan, 'Tema kegiatan'), teks(')')];
}

/** Paragraf pembuka + rincian + penutup untuk surat kepanitiaan (04, 05, 08). */
function badanKepanitiaan(n: Nilai, d: Record<string, unknown>): Blok[] {
  const tujuan = isi(n.tujuan_nama, 'Nama/jabatan tujuan');
  const hari = { label: 'Hari, tanggal', nilai: [isi(d.hari_tanggal, 'Hari, tanggal')] };
  const tempat = { label: 'Tempat', nilai: [isi(d.tempat, 'Tempat')] };

  switch (n.jenis) {
    case 'UNDANGAN_PEMATERI':
      return [
        {
          jenis: 'paragraf',
          isi: kalimat(
            KALIMAT_KEGIATAN, ...kegiatan(d), OLEH_HMIF,
            'Kami memohon perkenan Saudara ', tujuan,
            ' untuk dapat hadir sebagai Pembicara dengan topik ', isi(d.topik_materi, 'Topik materi'),
            ' dalam kegiatan yang akan dilaksanakan pada:',
          ),
        },
        { jenis: 'rincian', baris: [hari, { label: 'Waktu', nilai: [isi(d.waktu, 'Waktu')] }, tempat] },
        { jenis: 'paragraf', isi: kalimat('Demikian surat undangan ini kami sampaikan, atas perhatian dan bantuannya kami mengucapkan terima kasih.') },
      ];
    case 'UNDANGAN_SAMBUTAN':
      return [
        {
          jenis: 'paragraf',
          isi: kalimat(
            KALIMAT_KEGIATAN, ...kegiatan(d),
            ', kami selaku panitia pelaksana memohon perkenan kepada ', tujuan,
            ' untuk dapat menghadiri sekaligus memberikan sambutan pada kegiatan tersebut, yang akan dilaksanakan pada:',
          ),
        },
        { jenis: 'rincian', baris: [hari, { label: 'Waktu', nilai: [isi(d.waktu, 'Waktu')] }, tempat] },
        { jenis: 'paragraf', isi: kalimat('Demikian surat undangan ini kami sampaikan, atas perhatian dan kesediaannya kami ucapkan terima kasih.') },
      ];
    case 'PEMINJAMAN_BARANG':
      return [
        {
          jenis: 'paragraf',
          isi: kalimat(
            KALIMAT_KEGIATAN, ...kegiatan(d), OLEH_HMIF,
            'Kami selaku panitia bermaksud untuk meminjam ', isi(d.barang, 'Barang yang dipinjam'),
            ' guna menunjang kegiatan yang akan dilaksanakan pada:',
          ),
        },
        { jenis: 'rincian', baris: [hari, tempat] },
        { jenis: 'paragraf', isi: kalimat('Peralatan yang dibutuhkan') },
        {
          jenis: 'tabel',
          kepala: ['No.', 'Kebutuhan', 'Banyaknya'],
          baris: larik(d.items).map((b, i) => [
            [teks(`${i + 1}.`)],
            [isi(b.kebutuhan, 'Kebutuhan')],
            [isi(b.banyaknya, 'Banyaknya')],
          ]),
          kosong: 'Tabel kebutuhan',
        },
        { jenis: 'paragraf', isi: kalimat(PENUTUP_KESEDIAAN) },
      ];
    case 'PEMINJAMAN_RUANGAN':
      return [
        {
          jenis: 'paragraf',
          isi: kalimat(
            KALIMAT_KEGIATAN, ...kegiatan(d), OLEH_HMIF,
            'Kami selaku panitia bermaksud untuk meminjam ', isi(d.ruangan, 'Nama ruangan'),
            ' guna menunjang kegiatan yang akan dilaksanakan pada:',
          ),
        },
        { jenis: 'rincian', baris: [hari, { label: 'Pukul', nilai: [isi(d.waktu, 'Pukul')] }, tempat] },
        { jenis: 'paragraf', isi: kalimat(PENUTUP_KESEDIAAN) },
      ];
    case 'KERJA_SAMA':
      return [
        {
          jenis: 'paragraf',
          isi: kalimat(
            KALIMAT_KEGIATAN, ...kegiatan(d), OLEH_HMIF,
            'Kami selaku panitia ', isi(d.nama_kegiatan, 'Nama kegiatan'),
            ' bermaksud memohon kerjasama dengan ', isi(d.jenis_mitra, 'Jenis instansi mitra'),
            ' Bapak/Ibu/Saudara dalam kegiatan yang akan dilaksanakan pada:',
          ),
        },
        { jenis: 'rincian', baris: [hari, tempat] },
        { jenis: 'paragraf', isi: kalimat(PENUTUP_KESEDIAAN) },
      ];
    default:
      return [];
  }
}

function blokIsiSurat(n: Nilai): Blok {
  const html = sanitasiIsiHtml(n.isi_surat);
  return teksDariIsiHtml(html) ? { jenis: 'html', html } : { jenis: 'html', html: '', kosong: 'Isi surat' };
}

/**
 * Jabatan Ketua Himpunan di blok TTD — bunyinya mengikuti berkas contoh tiap
 * jenis. Dipakai pratinjau DAN generator DOCX (T-061) supaya keduanya tak
 * pernah berbeda.
 */
export function jabatanKetua(jenis: JenisSurat): string {
  return jenis === 'KETERANGAN_AKTIF' ? 'Ketua HMIF FT UNTIRTA' : 'Ketua HMIF';
}

/** Label kolom kanan: "Mengetahui," hanya bila ada penandatangan kolom kiri. */
export const LABEL_MENGETAHUI = 'Mengetahui,';

function penandaKetua(jenis: JenisSurat, ketua: KetuaHimpunan | null, label?: string): Penanda {
  return {
    label,
    jabatan: [teks(jabatanKetua(jenis))],
    nama: [ketua ? teks(ketua.nama) : { t: 'kosong', label: 'Ketua Himpunan belum terdaftar' }],
    nim: [ketua?.nim ? teks(ketua.nim) : { t: 'kosong', label: 'NIM Ketua' }],
    awalanNim: jenis === 'KETERANGAN_AKTIF' ? 'NIM ' : 'NIM. ',
    ttd: true,
    stempel: true,
  };
}

/**
 * Model pratinjau untuk satu isian. Tidak melempar untuk isian setengah jadi —
 * pratinjau harus selalu dapat digambar selagi orang mengetik.
 */
export function susunPratinjau(nilai: unknown, konfig: KonfigSurat, ketua: KetuaHimpunan | null): ModelPratinjau {
  const n = (nilai ?? {}) as Nilai;
  const jenis = n.jenis;
  const d = (n.data_dinamis ?? {}) as Record<string, unknown>;
  const info = infoJenis(jenis);
  const nomor = previewNomor({
    kodeSurat: info.kode,
    kodeKegiatan: ambil(n.kode_kegiatan),
    tanggalSurat: ambil(n.tanggal_surat),
    kodeAdministrasi: konfig.kodeAdministrasi,
  });
  const kotaTanggal = kalimat(isi(n.kota, 'Kota'), ', ', tanggalSurat(n.tanggal_surat));
  const adaKiri = ATURAN_PENANDATANGAN[jenis].some((a) => a.posisi === 'KIRI');
  const kiriIsian = Array.isArray(n.penandatangan_tambahan) ? (n.penandatangan_tambahan[0] as Record<string, unknown> | undefined) : undefined;
  const kiri: Penanda | undefined =
    adaKiri && (kiriIsian || ATURAN_PENANDATANGAN[jenis].some((a) => a.posisi === 'KIRI' && a.wajib))
      ? {
          jabatan: [isi(kiriIsian?.jabatan, 'Jabatan')],
          nama: [isi(kiriIsian?.nama, 'Nama')],
          nim: [isi(kiriIsian?.nim, 'NIM')],
          awalanNim: 'NIM. ',
          ttd: false,
          stempel: false,
        }
      : undefined;

  if (jenis === 'KETERANGAN_AKTIF') {
    return {
      jenis,
      judul: 'SURAT KETERANGAN AKTIF BERORGANISASI',
      nomor,
      kotaTanggal,
      isi: [
        {
          jenis: 'paragraf',
          isi: kalimat(
            'Yang bertanda tangan di bawah ini selaku Ketua Umum Himpunan Mahasiswa Informatika (HMIF) Fakultas Teknik Universitas Sultan Ageng Tirtayasa, dengan ini menerangkan bahwa:',
          ),
        },
        {
          jenis: 'rincian',
          baris: [
            { label: 'Nama', nilai: [isi(d.nama_pemohon, 'Nama mahasiswa')] },
            { label: 'NIM', nilai: [isi(d.nim_pemohon, 'NIM')] },
            { label: 'Jabatan', nilai: [isi(d.jabatan_pemohon, 'Jabatan')] },
          ],
        },
        {
          jenis: 'paragraf',
          isi: kalimat(
            'Adalah benar mahasiswa tersebut aktif dalam organisasi kemahasiswaan Himpunan Mahasiswa Informatika (HMIF) Fakultas Teknik Universitas Sultan Ageng Tirtayasa. Selama menjadi anggota, yang bersangkutan menunjukkan komitmen, tanggung jawab, serta kontribusi aktif terhadap kegiatan himpunan.',
          ),
        },
        { jenis: 'paragraf', isi: kalimat('Demikian surat keterangan ini dibuat dengan sebenar-benarnya dan dipergunakan sebagai') },
        { jenis: 'paragraf', isi: kalimat(isi(d.keperluan, 'Keperluan')), tebal: true },
      ],
      ttd: { kotaTanggalDiAtas: true, kanan: penandaKetua(jenis, ketua) },
    };
  }

  const kepala = {
    nomor,
    kotaTanggal,
    lampiran: [isi(n.lampiran, 'Lampiran')],
    perihal: [isi(n.perihal, 'Perihal')],
    tujuan: [
      [isi(n.tujuan_nama, 'Nama/jabatan tujuan')],
      ...(ambil(d.tujuan_jabatan) || jenis === 'PEMINJAMAN_RUANGAN' ? [[isi(d.tujuan_jabatan, 'Nama instansi tujuan')]] : []),
      [isi(n.tujuan_alamat, 'Alamat tujuan')],
    ],
    salam: 'Dengan hormat,',
  };

  if (jenis === 'ASPIRASI') {
    const poin = larik(d.poin);
    return {
      jenis,
      ...kepala,
      isi: [
        {
          jenis: 'paragraf',
          isi: kalimat(
            'Sehubungan dengan beberapa hal yang menjadi perhatian dalam pelaksanaan kegiatan organisasi mahasiswa di lingkungan Fakultas Teknik Universitas Sultan Ageng Tirtayasa, bersama surat ini kami menyampaikan aspirasi kepada Dewan Perwakilan Mahasiswa (DPM) FT-UNTIRTA untuk dapat menjadi bahan perhatian serta ditindaklanjuti sesuai dengan fungsi dan kewenangannya.',
          ),
        },
        blokIsiSurat(n),
        {
          jenis: 'paragraf',
          isi: kalimat(
            'Demikian surat aspirasi ini kami sampaikan. Besar harapan kami agar aspirasi yang disampaikan dapat menjadi bahan pertimbangan bersama guna mendukung keberlangsungan kegiatan organisasi mahasiswa Fakultas Teknik yang lebih baik dan terkoordinasi. Atas perhatian dan kerja sama-nya, kami ucapkan terima kasih.',
          ),
        },
      ],
      ttd: {
        labelAtas: [isi(d.label_atas, 'Salam penutup')],
        kotaTanggalDiAtas: false,
        kanan: penandaKetua(jenis, ketua),
      },
      lampiranHalaman: {
        judul: ['Lampiran I.', 'ASPIRASI KEORGANISASIAN MAHASISWA'],
        isi: poin.length
          ? poin.map((p, i) => ({
              jenis: 'poin' as const,
              nomor: i + 1,
              judul: [isi(p.judul, 'Judul poin')],
              paragraf: (Array.isArray(p.paragraf) ? p.paragraf : [undefined]).map((t) => [isi(t, 'Uraian')]),
            }))
          : [{ jenis: 'paragraf', isi: [{ t: 'kosong', label: 'Poin aspirasi' }] }],
      },
    };
  }

  const bertemplate = info.varian !== null;
  const isiBadan: Blok[] = bertemplate ? badanKepanitiaan(n, d) : [blokIsiSurat(n)];

  return {
    jenis,
    ...kepala,
    isi: isiBadan,
    ttd: {
      // Undangan & Sambutan tidak punya sel nama panitia di atas blok TTD (TEMPLATE_MAPPING §5.4).
      labelAtas: bertemplate && jenis !== 'UNDANGAN_SAMBUTAN' ? [isi(d.label_atas, 'Nama panitia')] : undefined,
      kotaTanggalDiAtas: false,
      kiri: kiri ? { ...kiri, label: undefined } : undefined,
      kanan: penandaKetua(jenis, ketua, kiri ? LABEL_MENGETAHUI : undefined),
    },
    lampiranHalaman:
      jenis === 'UNDANGAN_SAMBUTAN'
        ? {
            judul: ['Lampiran I. Susunan Acara'],
            isi: [
              {
                jenis: 'tabel',
                kepala: ['Hari, Tanggal', 'Waktu', 'Acara', 'Keterangan'],
                baris: larik(d.rundown).map((r) => [
                  [teks(ambil(r.hari_tanggal))],
                  [isi(r.waktu, 'Waktu')],
                  [isi(r.acara, 'Acara')],
                  [teks(ambil(r.keterangan))],
                ]),
                kosong: 'Susunan acara',
              },
            ],
          }
        : undefined,
  };
}

/** Teks baku (bukan isian) sepanjang ≥ `min` karakter — dipakai test pembanding template. */
export function kalimatBaku(model: ModelPratinjau, min = 25): string[] {
  const hasil: string[] = [];
  const dari = (b: Baris | undefined) => b?.forEach((s) => s.t === 'teks' && s.v.trim().length >= min && hasil.push(s.v.trim()));
  const blok = (bs: Blok[]) =>
    bs.forEach((x) => {
      if (x.jenis === 'paragraf') dari(x.isi);
    });
  blok(model.isi);
  if (model.lampiranHalaman) blok(model.lampiranHalaman.isi);
  return hasil;
}
