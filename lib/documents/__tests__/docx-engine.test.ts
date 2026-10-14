import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { paragrafDariIsiHtml, petakanSurat } from '@/lib/documents/data-mapper';
import { GalatTemplate, renderDocx } from '@/lib/documents/docx-engine';
import {
  TINGGI_BARIS_PX,
  UKURAN_TTD,
  gabungTtdStempel,
  rapikanTtd,
  ttdMelayang,
  type GambarDocx,
} from '@/lib/documents/image-module';
import { DAFTAR_JENIS, buatSkemaSurat, infoJenis, nilaiAwalSurat, type JenisSurat, type KonfigSurat } from '@/lib/surat/field-schemas';
import { TEMPLATE_SURAT, TEMPLATE_UMUM } from '@/lib/surat/template-registry';

const AKAR = path.resolve(__dirname, '../../..');
const KONFIG: KonfigSurat = { kodeKegiatanDefault: 'HMIF', kotaDefault: 'Cilegon', kodeAdministrasi: 'UN43.3.7', pdfAktif: false };
const KETUA = { nama: 'Ketua Uji Himpunan', nim: '3337220099' };
const KETUPLAK = { jabatan: 'Ketua Pelaksana', nama: 'Pelaksana Uji', nim: '3337230084' };

const UMUM = { perihal: 'Perihal Uji Generator', tujuan_preset: 'Lainnya (isi manual)', tujuan_nama: 'Tujuan Uji', tujuan_alamat: 'di Tempat' };
const KEGIATAN = { nama_kegiatan: 'KEGIATANUJI', tema_kegiatan: 'Tema Uji', hari_tanggal: 'Rabu, 20 Agustus 2025', tempat: 'Kampus Uji' };

const CONTOH: Record<JenisSurat, Record<string, unknown>> = {
  PENGAJUAN: { ...UMUM, isi_surat: '<p>Paragraf pertama.</p><ul><li><p>Butir satu</p></li></ul>', data_dinamis: {} },
  KETERANGAN_AKTIF: {
    data_dinamis: { nama_pemohon: 'Pemohon Uji', nim_pemohon: '3337220011', jabatan_pemohon: 'Staff Uji', keperluan: 'Keperluan Uji' },
  },
  ASPIRASI: {
    ...UMUM,
    isi_surat: '<p>Aspirasi uji.</p>',
    data_dinamis: { poin: [{ judul: 'Poin Uji', paragraf: ['Uraian satu.', 'Uraian dua.'] }] },
  },
  UNDANGAN_PEMATERI: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: { ...KEGIATAN, topik_materi: 'Topik Uji', waktu: '08.10 - 09.00 WIB' },
  },
  UNDANGAN_SAMBUTAN: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: {
      ...KEGIATAN,
      waktu: '16.00 WIB s.d. Selesai',
      rundown: [{ hari_tanggal: 'Senin, 06 Oktober 2025', waktu: '16.00-16.30', acara: 'Absensi Uji', keterangan: '' }],
    },
  },
  PEMINJAMAN_BARANG: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: { ...KEGIATAN, barang: 'Tandu', items: [{ kebutuhan: 'Tandu Uji', banyaknya: '2 unit' }] },
  },
  PEMINJAMAN_RUANGAN: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: { ...KEGIATAN, ruangan: 'Ruang Uji', tujuan_jabatan: 'Instansi Uji', waktu: '16.00 - selesai' },
  },
  PERINGATAN: { ...UMUM, isi_surat: '<p>Isi peringatan.</p>', data_dinamis: {} },
  KEPUTUSAN: { ...UMUM, penandatangan_tambahan: [KETUPLAK], isi_surat: '<p>Isi keputusan.</p>', data_dinamis: {} },
  KERJA_SAMA: { ...UMUM, penandatangan_tambahan: [KETUPLAK], data_dinamis: { ...KEGIATAN, jenis_mitra: 'Rumah Sakit' } },
  PIAGAM: { ...UMUM, isi_surat: '<p>Isi piagam.</p>', data_dinamis: {} },
};

function nilai(jenis: JenisSurat): Record<string, unknown> & { jenis: JenisSurat } {
  const awal = nilaiAwalSurat(KONFIG, jenis) as Record<string, unknown>;
  const c = CONTOH[jenis];
  const r = buatSkemaSurat(KONFIG).safeParse({
    ...awal,
    tanggal_surat: '2025-08-02',
    ...c,
    data_dinamis: { ...(awal.data_dinamis as object), ...(c.data_dinamis as object) },
  });
  if (!r.success) throw new Error(`${jenis}: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  return r.data as Record<string, unknown> & { jenis: JenisSurat };
}

function berkasUntuk(jenis: JenisSurat): string {
  const slug = TEMPLATE_SURAT.find((t) => t.jenis === jenis)?.slug ?? TEMPLATE_UMUM.slug;
  return path.join(AKAR, 'templates', `${slug}.docx`);
}

function nomor(jenis: JenisSurat): string {
  return `${infoJenis(jenis).kode}/007/UN43.3.7/HMIF/VIII/2025`;
}

/** Teks dokumen: paragraf dipisah baris, isi `<w:t>` digabung. */
function teksDokumen(zip: PizZip): string {
  const xml = zip.file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .join('\n');
}

let ttd: GambarDocx;

beforeAll(async () => {
  // Tanda tangan tiruan: goresan hitam di atas latar transparan.
  const coretan = await sharp({ create: { width: 600, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="600" height="300"><path d="M20 250 C 150 20, 300 280, 580 40" stroke="black" stroke-width="12" fill="none"/></svg>') }])
    .png()
    .toBuffer();
  const stempel = fs.readFileSync(path.join(AKAR, 'public', 'stempel-hmif.png'));
  ttd = (await gabungTtdStempel(coretan, stempel))!;
}, 60_000);

describe('paragrafDariIsiHtml', () => {
  it('satu <p> satu paragraf; <br> pindah baris; tebal/miring dibuang', () => {
    expect(paragrafDariIsiHtml('<p>Satu <strong>tebal</strong> dan <em>miring</em>.</p><p>Dua<br>baris</p>')).toEqual([
      'Satu tebal dan miring.',
      'Dua\nbaris',
    ]);
  });

  it('butir daftar TipTap (<li><p>) diberi awalan, bernomor untuk <ol>', () => {
    expect(
      paragrafDariIsiHtml('<ul><li><p>Apel</p></li><li><p>Jeruk</p></li></ul><ol><li><p>Pertama</p></li><li><p>Kedua</p></li></ol>'),
    ).toEqual(['• Apel', '• Jeruk', '1. Pertama', '2. Kedua']);
  });

  it('tag tak didukung dibuang beserta isinya bila berbahaya; entitas di-decode', () => {
    expect(paragrafDariIsiHtml('<p>A &amp; B <script>alert(1)</script><a href="x">tautan</a></p><h1>Judul</h1>')).toEqual([
      'A & B tautan',
      'Judul',
    ]);
  });

  it('paragraf dan butir kosong tidak menghasilkan baris', () => {
    expect(paragrafDariIsiHtml('<p></p><p>  </p><ul><li><p></p></li></ul><p>Isi</p>')).toEqual(['Isi']);
    expect(paragrafDariIsiHtml('')).toEqual([]);
  });
});

describe('rapikanTtd', () => {
  it('latar putih hasil scan menjadi transparan dan margin kosong dipangkas', async () => {
    // Goresan hitam 100×40 di tengah kertas putih 400×200 tanpa alpha (JPEG).
    const scan = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ffffff' } })
      .composite([{ input: { create: { width: 100, height: 40, channels: 3, background: '#111111' } }, left: 250, top: 20 }])
      .jpeg({ quality: 90 })
      .toBuffer();
    const r = await rapikanTtd(scan);
    const m = await sharp(r).metadata();
    expect(m.hasAlpha).toBe(true);
    expect(m.width).toBeGreaterThanOrEqual(100);
    expect(m.width).toBeLessThanOrEqual(106);
    expect(m.height).toBeLessThanOrEqual(46);
    const { data } = await sharp(r).raw().toBuffer({ resolveWithObject: true });
    // Pojok kiri atas sudah tinta; tidak ada piksel putih buram tersisa.
    expect(data[3]).toBeGreaterThan(200);
  });

  it('gambar kosong dikembalikan tanpa melempar', async () => {
    const kosong = await sharp({ create: { width: 50, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(rapikanTtd(kosong)).resolves.toBeInstanceOf(Buffer);
  });
});

describe('ttdMelayang', () => {
  it('dasar gambar jatuh tepat di atas nama, dari tambatan mana pun', () => {
    const g = { png: Buffer.alloc(0), ...UKURAN_TTD };
    // Tambatan di baris kosong di atas nama: naik setinggi gambar dikurangi satu baris.
    expect(ttdMelayang(g, 'BARIS_ATAS_NAMA').melayang?.naikPx).toBe(UKURAN_TTD.tinggiPx - TINGGI_BARIS_PX + 2);
    expect(ttdMelayang(g, 'PARAGRAF_NAMA').melayang?.naikPx).toBe(UKURAN_TTD.tinggiPx + 2);
  });
});

describe('gabungTtdStempel', () => {
  it('menghasilkan satu PNG berukuran tampil tetap, dengan kanvas resolusi tinggi', async () => {
    expect(ttd.lebarPx).toBe(UKURAN_TTD.lebarPx);
    expect(ttd.tinggiPx).toBe(UKURAN_TTD.tinggiPx);
    const m = await sharp(ttd.png).metadata();
    expect(m.format).toBe('png');
    expect(m.width! / m.height!).toBe(2);
    expect(m.width).toBeGreaterThanOrEqual(UKURAN_TTD.lebarPx * 2);
  });

  it('tanpa keduanya → null', async () => {
    expect(await gabungTtdStempel(null, null)).toBeNull();
  });
});

describe('template surat', () => {
  const berkas = fs.readdirSync(path.join(AKAR, 'templates')).filter((f) => f.startsWith('surat-'));

  it('tag gambar selalu di akhir teks run-nya (teks sesudahnya kehilangan format)', () => {
    expect(berkas.length).toBe(8);
    for (const f of berkas) {
      const xml = new PizZip(fs.readFileSync(path.join(AKAR, 'templates', f))).file('word/document.xml')!.asText();
      const sisa = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
        .map((m) => m[1]!)
        .filter((t) => t.includes('{%'))
        .map((t) => t.slice(t.lastIndexOf('}') + 1));
      expect(sisa.length, f).toBeGreaterThan(0);
      expect(sisa.filter((t) => t !== ''), f).toEqual([]);
    }
  });

  it('tidak berakhir dengan paragraf pindah halaman (halaman kosong di akhir surat)', () => {
    for (const f of berkas) {
      const xml = new PizZip(fs.readFileSync(path.join(AKAR, 'templates', f))).file('word/document.xml')!.asText();
      const badan = xml.slice(0, xml.lastIndexOf('<w:sectPr'));
      const paragrafAkhir = [...badan.matchAll(/<w:p(?=[\s>/])(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g)].slice(-3).map((m) => m[0]);
      const pindahKosong = paragrafAkhir.filter(
        (p) => /<w:br\s[^>]*w:type="page"/.test(p) && !/<w:t(?:\s[^>]*)?>[^<]*\S/.test(p),
      );
      expect(pindahKosong, f).toEqual([]);
    }
  });

  it('tidak ada gambar di badan template — tanda tangan contoh sudah dibuang', () => {
    for (const f of berkas) {
      const zip = new PizZip(fs.readFileSync(path.join(AKAR, 'templates', f)));
      expect(zip.file('word/document.xml')!.asText(), f).not.toContain('<w:drawing>');
      const relsDoc = zip.file('word/_rels/document.xml.rels')!.asText();
      expect(relsDoc, f).not.toContain('/relationships/image"');
    }
  });
});

describe('renderDocx — seluruh 11 jenis (9 kode) dari template sungguhan', () => {
  it.each(DAFTAR_JENIS)('%s', (jenis) => {
    const n = nilai(jenis);
    const data = petakanSurat({ nilai: n, nomorLengkap: nomor(jenis), ketua: KETUA, ttdKetua: ttd });
    const hasil = renderDocx(fs.readFileSync(berkasUntuk(jenis)), data);
    const zip = new PizZip(hasil);
    const xml = zip.file('word/document.xml')!.asText();
    const teks = teksDokumen(zip);

    // Isian sampai ke dokumen
    expect(teks).toContain(nomor(jenis));
    expect(teks).toContain('02 Agustus 2025');
    expect(teks).toContain(KETUA.nama);
    expect(teks).toContain(KETUA.nim);
    if (jenis !== 'KETERANGAN_AKTIF') expect(teks).toContain('Perihal Uji Generator');

    // Tak ada sisa placeholder atau "undefined"
    expect(teks).not.toMatch(/\{[#/^%@]?[a-z_]+\}/);
    expect(teks).not.toContain('undefined');
    expect(teks).not.toContain('[object Object]');

    // Tepat SATU gambar di badan: TTD+stempel Ketua. Tanda tangan contoh sudah dibuang.
    expect(xml.match(/<w:drawing>/g) ?? []).toHaveLength(1);
    expect(xml).toContain('r:embed="rIdHmifGambar1"');
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).toContain('Target="media/hmif_gambar1.png"');
    expect(zip.file('word/media/hmif_gambar1.png')).not.toBeNull();
    // Tepat satu Default png — duplikatnya membuat Word menyebut berkas "corrupted" (diukur, T-061).
    expect(zip.file('[Content_Types].xml')!.asText().match(/<Default\b[^>]*\bExtension="png"/gi) ?? []).toHaveLength(1);

    // Struktur run tetap seimbang setelah gambar menutup/membuka <w:t> (proksi "tidak korup").
    expect((xml.match(/<w:r>|<w:r\s[^>]*>/g) ?? []).length).toBe((xml.match(/<\/w:r>/g) ?? []).length);
    expect((xml.match(/<w:t>|<w:t\s[^>]*>/g) ?? []).length).toBe((xml.match(/<\/w:t>/g) ?? []).length);

    // Kop surat tetap utuh di header.
    expect(zip.file(/^word\/header\d*\.xml$/).length).toBeGreaterThan(0);
  });

  it('penandatangan kiri muncul bersama "Mengetahui,"; tanpa kiri, label itu tidak ada', () => {
    const tanpa = petakanSurat({ nilai: nilai('PERINGATAN'), nomorLengkap: nomor('PERINGATAN'), ketua: KETUA, ttdKetua: ttd });
    const teksTanpa = teksDokumen(new PizZip(renderDocx(fs.readFileSync(berkasUntuk('PERINGATAN')), tanpa)));
    expect(teksTanpa).not.toContain('Mengetahui,');
    expect(teksTanpa).not.toContain(KETUPLAK.nama);

    const dengan = petakanSurat({ nilai: nilai('KEPUTUSAN'), nomorLengkap: nomor('KEPUTUSAN'), ketua: KETUA, ttdKetua: ttd });
    const teksDengan = teksDokumen(new PizZip(renderDocx(fs.readFileSync(berkasUntuk('KEPUTUSAN')), dengan)));
    expect(teksDengan).toContain('Mengetahui,');
    expect(teksDengan).toContain(KETUPLAK.nama);
    expect(teksDengan).toContain(`NIM. ${KETUPLAK.nim}`);
  });

  it('template umum: tiap paragraf isi menjadi paragraf dokumen; baris instansi opsional hilang bila kosong', () => {
    const data = petakanSurat({ nilai: nilai('PENGAJUAN'), nomorLengkap: nomor('PENGAJUAN'), ketua: KETUA, ttdKetua: ttd });
    const baris = teksDokumen(new PizZip(renderDocx(fs.readFileSync(berkasUntuk('PENGAJUAN')), data))).split('\n');
    expect(baris).toContain('Paragraf pertama.');
    expect(baris).toContain('• Butir satu');
    const iTujuan = baris.indexOf('Tujuan Uji');
    expect(baris[iTujuan + 1]).toBe('di Tempat');
  });

  it('Aspirasi: tak ada butir/nomor kosong di lampiran poin', () => {
    const data = petakanSurat({ nilai: nilai('ASPIRASI'), nomorLengkap: nomor('ASPIRASI'), ketua: KETUA, ttdKetua: ttd });
    const xml = new PizZip(renderDocx(fs.readFileSync(berkasUntuk('ASPIRASI')), data)).file('word/document.xml')!.asText();
    const kosongBerbutir = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
      .map((m) => m[0])
      .filter((p) => p.includes('<w:numPr>') && ![...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].some((t) => t[1]!.trim()));
    expect(kosongBerbutir).toHaveLength(0);
  });

  it('Keterangan Aktif menulis "NIM" tanpa titik dan jabatan lengkap', () => {
    const data = petakanSurat({ nilai: nilai('KETERANGAN_AKTIF'), nomorLengkap: nomor('KETERANGAN_AKTIF'), ketua: KETUA, ttdKetua: ttd });
    const teks = teksDokumen(new PizZip(renderDocx(fs.readFileSync(berkasUntuk('KETERANGAN_AKTIF')), data)));
    expect(teks).toContain(`NIM ${KETUA.nim}`);
    expect(teks).toContain('Ketua HMIF FT UNTIRTA');
    expect(teks).toContain('Pemohon Uji');
  });

  it('tanpa gambar TTD, dokumen tetap sah dan tidak memuat gambar badan', () => {
    const data = petakanSurat({ nilai: nilai('PIAGAM'), nomorLengkap: nomor('PIAGAM'), ketua: KETUA, ttdKetua: null });
    const zip = new PizZip(renderDocx(fs.readFileSync(berkasUntuk('PIAGAM')), data));
    expect(zip.file('word/document.xml')!.asText()).not.toContain('<w:drawing>');
  });

  it('placeholder tanpa data → GalatTemplate yang menyebut tag-nya, bukan "undefined"', () => {
    const data = petakanSurat({ nilai: nilai('KERJA_SAMA'), nomorLengkap: nomor('KERJA_SAMA'), ketua: KETUA, ttdKetua: ttd });
    delete data.jenis_mitra;
    expect(() => renderDocx(fs.readFileSync(berkasUntuk('KERJA_SAMA')), data)).toThrowError(GalatTemplate);
    try {
      renderDocx(fs.readFileSync(berkasUntuk('KERJA_SAMA')), data);
    } catch (e) {
      expect((e as GalatTemplate).tagKosong).toEqual(['jenis_mitra']);
    }
  });

  it('berkas bukan .docx → GalatTemplate', () => {
    expect(() => renderDocx(Buffer.from('bukan zip'), {})).toThrowError(GalatTemplate);
  });
});
