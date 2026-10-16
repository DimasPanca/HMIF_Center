import fs from 'node:fs';
import path from 'node:path';

import PizZip from 'pizzip';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { renderDocx } from '@/lib/documents/docx-engine';
import { gabungTtdStempel, type GambarDocx } from '@/lib/documents/image-module';
import { kelompokRundown, paragrafTeksKaya, petakanTor, type MasukanTor } from '@/lib/tor/generate';
import type { DataTor } from '@/lib/tor/schema';

const TEMPLATE = fs.readFileSync(path.resolve(__dirname, '../../../templates/tor.docx'));

function teksDokumen(docx: Buffer): string {
  const xml = new PizZip(docx).file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .join('\n');
}

const doc = (...par: string[]) => ({
  type: 'doc',
  content: par.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});

const DATA: DataTor = {
  nama_kegiatan: 'SYNCHRONIZE 2028',
  tema: 'Satu Langkah Bersama',
  gambaran_umum: doc('Kegiatan pengenalan prodi.', 'Diikuti mahasiswa baru.'),
  tujuan: ['Mengenalkan himpunan', '', 'Mempererat angkatan'],
  bentuk_acara: {
    uraian: doc('Kegiatan luring.'),
    sub: [{ judul: 'Outdoor', uraian: 'Pos to pos' }],
  },
  waktu_tempat: [
    { sesi: 'Technical Meeting', tanggal: '2028-11-26', waktu: '19.00 WIB', tempat: 'Zoom' },
    { sesi: 'Hari H', tanggal: '2028-12-06', waktu: '07.00 WIB', tempat: 'Kampus FT' },
  ],
  sasaran: {
    uraian: doc('Mahasiswa baru Informatika.'),
    estimasi_jumlah: 1200,
    jumlah_kelompok: 24,
  },
  kondisi: [{ sesi: 'Hari H', ketentuan: 'Dresscode hitam putih' }],
  parameter: [
    { kriteria: 'Kehadiran', bobot: 40, kkm: 60 },
    { kriteria: 'Sikap', bobot: 60, kkm: 60 },
  ],
  rangkaian: [{ nama: 'Pembukaan', uraian: 'Sambutan ketua' }],
  penutup: doc('Demikian TOR ini dibuat.'),
};

const RUNDOWN = [
  {
    id: '00000000-0000-4000-8000-000000000002',
    tanggal: '2028-12-06',
    waktu_mulai: '07:00',
    waktu_selesai: '07:30',
    acara: 'Registrasi',
    keterangan: 'Acara',
  },
  {
    id: '00000000-0000-4000-8000-000000000001',
    tanggal: '2028-11-26',
    waktu_mulai: '19:00',
    waktu_selesai: '19:05',
    acara: 'Pembukaan TM',
    keterangan: 'MC',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    tanggal: '2028-12-06',
    waktu_mulai: '07:30',
    waktu_selesai: '08:15',
    acara: 'Upacara',
    keterangan: 'Korlap',
  },
];

let ttd: GambarDocx;

beforeAll(async () => {
  const png = await sharp({
    create: {
      width: 200,
      height: 80,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="200" height="80"><path d="M10 60 Q 80 0 190 50" stroke="black" stroke-width="6" fill="none"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  ttd = (await gabungTtdStempel(png, null))!;
});

function masukan(anggaranTotal = 300_000): MasukanTor {
  return {
    data: DATA,
    rundown: RUNDOWN,
    anggaran: {
      divisi: [
        { nama: 'Konsumsi', total: anggaranTotal - 50_000 },
        { nama: 'PDD', total: 50_000 },
      ],
      total_divisi: anggaranTotal,
      dana_tak_terduga: 0,
      total: anggaranTotal,
    },
    tahun: '2028',
    kota: 'Cilegon',
    tanggal: '2028-11-01',
    penandatangan: [
      { jabatan: 'Ketua Pelaksana', nama: 'Pelaksana Uji', nim: '3337230084', ttd: null },
      {
        jabatan: 'Ketua Himpunan Mahasiswa Informatika',
        nama: 'Ketua Uji',
        nim: '3337220099',
        ttd,
      },
    ],
  };
}

describe('tor-generate: pemetaan ke templates/tor.docx', () => {
  it('semua placeholder terisi dan ketujuh loop wajib bekerja', () => {
    const teks = teksDokumen(renderDocx(TEMPLATE, petakanTor(masukan())));
    expect(teks).not.toMatch(/[{}]/);
    expect(teks).not.toContain('undefined');
    // {#tujuan} — butir kosong dibuang
    expect(teks).toContain('Mengenalkan himpunan');
    expect(teks).toContain('Mempererat angkatan');
    // {#sesi} (= waktu_tempat)
    expect(teks).toContain('Technical Meeting');
    expect(teks).toContain('Hari, Tanggal: Rabu, 06 Desember 2028');
    expect(teks).toContain('Tempat: Kampus FT');
    // {#kondisi}
    expect(teks).toContain('Hari H: Dresscode hitam putih');
    // {#parameter} + KKM seragam
    expect(teks).toContain('Kehadiran (bobot 40%)');
    expect(teks).toContain('Sikap (bobot 60%)');
    expect(teks).toContain('KKM: 60');
    // {#rangkaian}
    expect(teks).toContain('Sambutan ketua');
    // {#rab_divisi} (= anggaran_divisi) + total
    expect(teks).toContain('Konsumsi');
    expect(teks).toContain('Rp250.000');
    expect(teks).toContain('Rp300.000');
    // {#sesi_rundown}{#rundown}
    expect(teks).toContain('Pembukaan TM');
    expect(teks).toContain('45 Menit');
    expect(teks).toContain('75 Menit');
    expect(teks).toContain('07:00 - 08:15 Selesai');
    // Penandatangan: Ketua Pelaksana + Ketua Himpunan
    expect(teks).toContain('Pelaksana Uji');
    expect(teks).toContain('NIM. 3337220099');
    expect(teks).toContain('Cilegon, 01 November 2028');
  });

  it('teks kaya: paragraf dipertahankan, daftar menjadi butir', () => {
    expect(
      paragrafTeksKaya({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Pembuka' }] },
          {
            type: 'orderedList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Satu' }] }],
              },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dua' }] }],
              },
            ],
          },
          { type: 'paragraph' },
        ],
      }),
    ).toEqual(['Pembuka', '1. Satu', '• Dua']);
  });

  it('rundown dikelompokkan per tanggal, berurutan; tanggal hanya di baris pertama', () => {
    const g = kelompokRundown(RUNDOWN, DATA.waktu_tempat);
    expect(g.map((x) => x.nama_sesi)).toEqual(['Technical Meeting', 'Hari H']);
    expect(g[1]!.rundown.map((r) => [r.hari_tanggal, r.mulai, r.durasi, r.pj])).toEqual([
      ['Rabu, 06 Desember 2028', '07:00', '30 Menit', 'Acara'],
      ['', '07:30', '45 Menit', 'Korlap'],
    ]);
    expect(g[1]!.total_durasi).toBe('75 Menit');
  });

  it('angka anggaran berasal dari masukan RAB saat generate — RAB berubah, dokumen berubah', () => {
    const a = teksDokumen(renderDocx(TEMPLATE, petakanTor(masukan(300_000))));
    const b = teksDokumen(renderDocx(TEMPLATE, petakanTor(masukan(450_000))));
    expect(a).toContain('Rp300.000');
    expect(b).toContain('Rp450.000');
    expect(b).not.toContain('Rp300.000');
  });

  it('gambar TTD Ketua tersisip; TTD Ketua Pelaksana boleh kosong', () => {
    const zip = new PizZip(renderDocx(TEMPLATE, petakanTor(masukan())));
    const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
    expect(media.length).toBeGreaterThan(0);
  });

  it('KKM berbeda per kriteria dirinci', () => {
    const d = petakanTor({
      ...masukan(),
      data: {
        ...DATA,
        parameter: [
          { kriteria: 'A', bobot: 50, kkm: 60 },
          { kriteria: 'B', bobot: 50, kkm: 70 },
        ],
      },
    });
    expect(d.kkm).toBe('A 60; B 70');
  });
});
