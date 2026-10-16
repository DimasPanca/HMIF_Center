import fs from 'node:fs';
import path from 'node:path';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { renderDocx } from '@/lib/documents/docx-engine';
import { petakanProposal, rincianRab } from '@/lib/proposal/generate';
import { terapkanPrefill, usulanPrefill, type SumberPrefill } from '@/lib/proposal/prefill';
import { FIELD_PROPOSAL, SkemaDataProposal, kurangProposal, proposalKosong, ukurPrefill, type FaktaTarikan } from '@/lib/proposal/schema';
import type { DivisiRab } from '@/lib/rab/item';
import type { DataTor } from '@/lib/tor/schema';

const TEMPLATE = fs.readFileSync(path.resolve(__dirname, '../../../templates/proposal.docx'));

function teksDokumen(docx: Buffer): string {
  const xml = new PizZip(docx).file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .join('\n');
}

const doc = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });

const TOR_LENGKAP: DataTor = {
  nama_kegiatan: 'SYNCHRONIZE 2028',
  tema: 'Satu Langkah',
  gambaran_umum: doc('Kegiatan pengenalan prodi.'),
  tujuan: ['Mengenalkan himpunan', 'Mempererat angkatan'],
  bentuk_acara: { uraian: doc('Kegiatan luring.'), sub: [{ judul: 'Outdoor', uraian: 'Pos to pos' }] },
  waktu_tempat: [{ sesi: 'Hari H', tanggal: '2028-12-06', waktu: '07.00 WIB', tempat: 'Kampus FT' }],
  sasaran: { uraian: doc('Mahasiswa baru.'), estimasi_jumlah: 120, jumlah_kelompok: 12 },
  kondisi: [{ sesi: 'Hari H', ketentuan: 'Dresscode' }],
  parameter: [{ kriteria: 'Kehadiran', bobot: 100, kkm: 60 }],
  rangkaian: [{ nama: 'Pembukaan', uraian: 'Sambutan' }],
  penutup: doc('Demikian proposal ini.'),
};

const SUMBER: SumberPrefill = {
  nama_acara: 'Nama di acara',
  tor: TOR_LENGKAP,
  proker: { deskripsi: 'Mahasiswa baru perlu mengenal prodi.', tujuan: null, sasaran: null },
  sekretaris: null,
  proposalLain: null,
};

const TARIKAN_LENGKAP: FaktaTarikan = {
  tahun: true,
  ketua_pelaksana: true,
  ketua_himpunan: true,
  susunan_kepanitiaan: true,
  anggaran: true,
  rincian_rab: true,
  rundown: true,
};

describe('prefill proposal dari TOR', () => {
  it('setelah TOR lengkap ≥ 60% field terisi otomatis (kontrak 2)', () => {
    const d = terapkanPrefill(null, SUMBER);
    const u = ukurPrefill(d, TARIKAN_LENGKAP);
    expect(u.total).toBe(23);
    expect(u.dari_sumber).toBe(9); // 8 dari TOR + latar belakang dari proker
    expect(u.persen_otomatis).toBeGreaterThanOrEqual(60);
    expect(SkemaDataProposal.safeParse(d).success).toBe(true);
  });

  it('field hasil prefill bertanda asal; nama, tujuan, sesi sama dengan TOR', () => {
    const d = terapkanPrefill(null, SUMBER);
    expect(d.asal).toMatchObject({ nama_kegiatan: 'TOR', tujuan: 'TOR', sesi: 'TOR', gambaran_umum: 'TOR', latar_belakang: 'PROKER' });
    expect(d.nama_kegiatan).toBe('SYNCHRONIZE 2028');
    expect(d.tujuan).toEqual(TOR_LENGKAP.tujuan);
    expect(d.sesi).toEqual(TOR_LENGKAP.waktu_tempat);
    expect(JSON.stringify(d.sasaran)).toContain('Estimasi jumlah peserta 120 orang');
    expect(JSON.stringify(d.bentuk_acara)).toContain('Outdoor: Pos to pos');
  });

  it('suntingan pengguna (manual) tidak pernah ditimpa — termasuk yang dikosongkan', () => {
    const awal = terapkanPrefill(null, SUMBER);
    const disunting = { ...awal, nama_kegiatan: 'Nama resmi', tujuan: [], asal: { ...awal.asal }, manual: ['nama_kegiatan', 'tujuan'] as typeof awal.manual };
    delete disunting.asal.nama_kegiatan;
    delete disunting.asal.tujuan;
    const ulang = terapkanPrefill(disunting, SUMBER);
    expect(ulang.nama_kegiatan).toBe('Nama resmi');
    expect(ulang.tujuan).toEqual([]);
    expect(ulang.asal.nama_kegiatan).toBeUndefined();
  });

  it('field otomatis yang belum disunting mengikuti TOR terbaru', () => {
    const awal = terapkanPrefill(null, SUMBER);
    const ulang = terapkanPrefill(awal, { ...SUMBER, tor: { ...TOR_LENGKAP, tujuan: ['Tujuan baru'] } });
    expect(ulang.tujuan).toEqual(['Tujuan baru']);
    expect(ulang.asal.tujuan).toBe('TOR');
  });

  it('tanpa TOR: nama dari acara, tujuan dari proker; pejabat dari proposal lain periode ini', () => {
    const lain = { ...proposalKosong(), wd3: { nama: 'Dr. WD Tiga', nomor: '1980' }, landasan_kegiatan: doc('AD/ART HMIF') };
    const u = usulanPrefill({ ...SUMBER, tor: null, proker: { deskripsi: null, tujuan: 'Satu\nDua', sasaran: null }, proposalLain: lain });
    expect(u.nama_kegiatan).toEqual({ nilai: 'Nama di acara', asal: 'PROKER' });
    expect(u.tujuan?.nilai).toEqual(['Satu', 'Dua']);
    expect(u.wd3).toEqual({ nilai: { nama: 'Dr. WD Tiga', nomor: '1980' }, asal: 'PROPOSAL_LAIN' });
    expect(u.landasan_kegiatan?.asal).toBe('PROPOSAL_LAIN');
    expect(u.kaprodi).toBeUndefined();
  });

  it('16 field dapat disunting; susunan kepanitiaan & anggaran BUKAN field (kontrak "Jangan")', () => {
    expect(FIELD_PROPOSAL).toHaveLength(16);
    const ids = FIELD_PROPOSAL.map((f) => f.id as string);
    expect(ids).not.toContain('susunan_kepanitiaan');
    expect(ids).not.toContain('anggaran');
    expect(SkemaDataProposal.safeParse({ ...proposalKosong(), anggaran: 1 }).success).toBe(false);
  });

  it('field wajib generate', () => {
    const d = terapkanPrefill(null, SUMBER);
    expect(kurangProposal(d)).toEqual(['Sekretaris', 'Ketua BEM FT', 'Wakil Dekan Bidang III', 'Ketua Program Studi', 'Landasan kegiatan']);
  });
});

describe('proposal-generate: templates/proposal.docx', () => {
  const RAB: DivisiRab[] = [
    {
      id: 'd1',
      nama: 'Konsumsi',
      warna: null,
      boleh_tulis: false,
      sections: [
        {
          id: 's1',
          nama: 'MAKAN',
          urutan: 1,
          items: [
            { id: 'i1', section_id: 's1', no_urut: 1, jenis_barang: 'Nasi kotak', jumlah_teks: '10', jumlah_numerik: 10, harga_satuan: 25000, total: 0, total_manual: false, keterangan: null },
            { id: 'i2', section_id: 's1', no_urut: 2, jenis_barang: 'Sewa alat', jumlah_teks: '1 Paket', jumlah_numerik: null, harga_satuan: 0, total: 150000, total_manual: true, keterangan: null },
          ],
        },
      ],
    },
  ];

  it('rincian RAB memakai rumus hitungRab', () => {
    expect(rincianRab(RAB)).toEqual([
      {
        divisi: 'Konsumsi',
        item: [
          { no: '1', jenis_barang: 'Nasi kotak', jumlah: '10', harga_satuan: 'Rp25.000', total: 'Rp250.000' },
          { no: '2', jenis_barang: 'Sewa alat', jumlah: '1 Paket', harga_satuan: '-', total: 'Rp150.000' },
        ],
      },
    ]);
  });

  it('semua placeholder terisi; kepanitiaan, anggaran, rincian, rundown tertarik', () => {
    const data = {
      ...terapkanPrefill(null, SUMBER),
      sekretaris: { nama: 'Sekre Uji', nomor: '3337230001' },
      ketua_bem: { nama: 'BEM Uji', nomor: '3337210001' },
      wd3: { nama: 'Dr. WD Tiga', nomor: '198001012005011001' },
      kaprodi: { nama: 'Dr. Kaprodi', nomor: '198101012006041002' },
      landasan_kegiatan: doc('AD/ART HMIF.'),
      asas: ['Kekeluargaan'],
    };
    const teks = teksDokumen(
      renderDocx(
        TEMPLATE,
        petakanProposal({
          data,
          tahun: '2028',
          kota: 'Cilegon',
          tanggal: '2028-11-01',
          ketuaPelaksana: { nama: 'Ketuplak Uji', nim: '3337230084' },
          ketuaHimpunan: { nama: 'Kahim Uji', nim: '3337220099' },
          susunan: [
            { nama_divisi: 'Inti', anggota: [{ jabatan: 'Ketua Pelaksana', nama: 'Ketuplak Uji', nim: '3337230084' }] },
            { nama_divisi: 'Konsumsi', anggota: [{ jabatan: 'Koordinator', nama: 'Koor Konsumsi', nim: '3337230002' }] },
          ],
          anggaran: { divisi: [{ nama: 'Konsumsi', total: 400000 }], total_divisi: 400000, dana_tak_terduga: 0, total: 400000 },
          rincian: rincianRab(RAB),
          rundown: [{ id: 'r1', tanggal: '2028-12-06', waktu_mulai: '07:00', waktu_selesai: '07:30', acara: 'Registrasi', keterangan: 'Acara' }],
        }),
      ),
    );
    expect(teks).not.toMatch(/[{}]/);
    expect(teks).not.toContain('undefined');
    for (const s of ['SYNCHRONIZE 2028', 'NIM. 3337230084', 'Dr. WD Tiga', 'NIP. 198101012006041002', 'Kekeluargaan', 'Mengenalkan himpunan', 'Koordinator: Koor Konsumsi', 'Rp400.000', 'Nasi kotak', 'Registrasi', '30 Menit', 'Cilegon, 01 November 2028']) {
      expect(teks, s).toContain(s);
    }
  });
});
