import fs from 'node:fs';
import path from 'node:path';

import PizZip from 'pizzip';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { renderDocx } from '@/lib/documents/docx-engine';
import { analisisLpj, type BahanLpj } from '@/lib/lpj/analyze';
import { gambarMaster, petakanLpj, ringkasanKeuangan, type MasukanLpj, type SnapshotLpj } from '@/lib/lpj/generate';
import { manualKosong } from '@/lib/lpj/schema';
import { bukuPengeluaran } from '@/lib/rab/realisasi';

const TEMPLATE = fs.readFileSync(path.resolve(__dirname, '../../../templates/lpj.docx'));

function teks(docx: Buffer): string {
  const xml = new PizZip(docx).file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .join('\n');
}

const BAHAN: BahanLpj = {
  divisi: [{ id: '11111111-1111-4111-8111-111111111111', nama: 'Konsumsi', items: [{ id: 'snack', jenis_barang: 'Snack', section: 'MAKAN', rencana: 100_000 }] }],
  nota: [
    {
      id: 'n1',
      tanggal: '2026-10-01',
      diunggah: '2026-10-01T00:00:00Z',
      divisi: 'Konsumsi',
      total_nota: 120_000,
      alokasi: [
        { rab_item_id: 'snack', jenis_barang: 'Snack', uraian_luar_rab: null, nominal: 100_000 },
        { rab_item_id: null, jenis_barang: null, uraian_luar_rab: 'Parkir', nominal: 20_000 },
      ],
    },
  ],
  pemasukan: [
    { keterangan: 'Kas HMIF', saldo: 150_000 },
    { keterangan: 'Sponsor', saldo: 50_000 },
  ],
  danaTakTerduga: 10_000,
};

let jpeg: Buffer;
let snapshot: SnapshotLpj;

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: { r: 240, g: 235, b: 220 } } })
    .jpeg({ quality: 90 })
    .toBuffer();
  snapshot = { ...analisisLpj(BAHAN, new Date('2026-10-16T00:00:00Z')), pengeluaran: bukuPengeluaran(200_000, BAHAN.nota).baris };
});

function masukan(gambar: Awaited<ReturnType<typeof gambarMaster>> | null): MasukanLpj {
  const manual = {
    ...manualKosong(),
    pendahuluan: 'Kegiatan telah dilaksanakan.',
    pelaksanaan_kegiatan: 'Berjalan lancar.',
    penutup: 'Demikian laporan ini.',
    waktu: { hari_tanggal: 'Sabtu, 06 Desember 2026', waktu: '08.00 WIB', tempat: 'Kampus FT' },
    pejabat: { kaprodi: { nama: 'Dr. Kaprodi', nomor: '1981' }, wd3: { nama: 'Dr. WD Tiga', nomor: '1980' } },
    narasi: { '11111111-1111-4111-8111-111111111111': { narasi: 'Divisi konsumsi bekerja baik.', perencanaan: '', pelaksanaan: '', pendukung: '', penghambat: '', saran: '' } },
  };
  return {
    namaKegiatan: 'SYNCHRONIZE 2026',
    tema: 'Satu Langkah',
    tujuan: ['Mengenalkan himpunan'],
    tahun: '2026',
    kota: 'Cilegon',
    tanggal: '2026-12-20',
    ketuaPelaksana: { nama: 'Ketuplak Uji', nim: '3337230084' },
    ketuaHimpunan: { nama: 'Kahim Uji', nim: '3337220099' },
    manual,
    snapshot,
    susunan: [
      { id: 'inti', nama: 'Inti', koordinator: null, anggota: [{ jabatan: 'Ketua Pelaksana', nama: 'Ketuplak Uji' }] },
      { id: '11111111-1111-4111-8111-111111111111', nama: 'Konsumsi', koordinator: 'Koor Uji', anggota: [{ jabatan: 'Koordinator', nama: 'Koor Uji' }, { jabatan: 'Anggota', nama: 'Anggota Uji' }] },
    ],
    rundown: [{ hari_tanggal: 'Sabtu, 06 Desember 2026', waktu: '08:00 - 09:00', acara: 'Pembukaan', pj: 'MC' }],
    lampiranNota: [{ nama_divisi: 'Konsumsi', nota: [{ gambar, keterangan: 'Nota 1: 01 Oktober 2026 · Rp120.000 · Snack 100.000, Di luar RAB: Parkir 20.000' }] }],
    dokumentasi: [{ foto: gambar, caption: 'Sesi pembukaan' }],
  };
}

describe('lpj-generate: templates/lpj.docx v2', () => {
  it('master JPEG disematkan APA ADANYA (byte identik, bukan encode ulang), ukuran tampil dibatasi', async () => {
    const g = await gambarMaster(jpeg, 'image/jpeg', 1200, 1600);
    expect(g.jenis).toBe('jpeg');
    expect(g.png.equals(jpeg)).toBe(true);
    expect(g.lebarPx).toBe(600);
    expect(g.tinggiPx).toBe(800);
    const zip = new PizZip(renderDocx(TEMPLATE, petakanLpj(masukan(g))));
    const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/hmif_gambar'));
    expect(media.every((f) => f.endsWith('.jpeg'))).toBe(true);
    expect(media.length).toBe(2); // nota + foto dokumentasi
    expect(zip.file(media[0]!)!.asNodeBuffer().equals(jpeg)).toBe(true);
    expect(zip.file('[Content_Types].xml')!.asText()).toMatch(/Extension="jpeg" ContentType="image\/jpeg"/);
  });

  it('WebP (tak didukung Word) dikonversi lossless ke PNG', async () => {
    const webp = await sharp(jpeg).webp({ lossless: true }).toBuffer();
    const g = await gambarMaster(webp, 'image/webp', 1200, 1600);
    expect(g.jenis).toBe('png');
    expect((await sharp(g.png).metadata()).format).toBe('png');
  });

  it('semua placeholder terisi: pengesahan, kepanitiaan, narasi, lampiran nota, ringkasan keuangan', async () => {
    const t = teks(renderDocx(TEMPLATE, petakanLpj(masukan(await gambarMaster(jpeg, 'image/jpeg', 1200, 1600)))));
    expect(t).not.toMatch(/[{}]/);
    expect(t).not.toContain('undefined');
    for (const s of [
      'SYNCHRONIZE 2026',
      'NIM. 3337230084',
      'NIP. 1981',
      'Dr. WD Tiga',
      'Ketua Pelaksana: Ketuplak Uji',
      'Divisi konsumsi bekerja baik.',
      'Lampiran Nota Belanja',
      'Nota 1: 01 Oktober 2026',
      'SISA DANA: Rp80.000',
      'PENGELUARAN DI LUAR RAB (TEMUAN)',
      'Sesi pembukaan',
      'Cilegon, 20 Desember 2026',
    ]) {
      expect(t, s).toContain(s);
    }
  });

  it('ringkasan keuangan diambil dari SNAPSHOT (bukan hitungan ulang)', () => {
    const r = ringkasanKeuangan(snapshot);
    expect(r).toContain('Total pemasukan: Rp200.000');
    expect(r).toContain('Total pengeluaran: Rp120.000');
    expect(r).toContain('Parkir: Rp20.000');
    expect(r).toContain('Dana tak terduga: Rp10.000 · terpakai Rp10.000');
  });
});
