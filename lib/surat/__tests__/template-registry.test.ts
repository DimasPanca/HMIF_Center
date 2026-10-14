import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JENIS_SURAT } from '@/lib/surat/field-schemas';
import {
  TEMPLATE_DOKUMEN,
  TEMPLATE_SURAT,
  berkasTemplate,
  fieldSchemaUntuk,
  hashIsi,
  identitasSurat,
  jsonStabil,
  kunciTemplateDokumen,
  rencanakanDokumen,
  rencanakanSurat,
  type KeadaanSurat,
} from '@/lib/surat/template-registry';

const AKAR = path.resolve(__dirname, '../../..');
const PEMINJAMAN = TEMPLATE_SURAT.find((t) => t.jenis === 'PEMINJAMAN_BARANG')!;
const SKEMA = fieldSchemaUntuk(PEMINJAMAN);

/** Keadaan "sudah terdaftar dan cocok" — tiap test mengubah satu hal saja. */
function keadaan(ubah: Partial<KeadaanSurat> = {}): KeadaanSurat {
  return {
    slug: PEMINJAMAN.slug,
    aktif: {
      id: 'baris-1',
      versi: 1,
      storage_key: 'template/surat-05-peminjaman-barang_v1.docx',
      field_schema: JSON.parse(JSON.stringify(SKEMA)),
    },
    versiTertinggi: 1,
    hashBerkas: 'aaa',
    hashTersimpan: 'aaa',
    fieldSchema: SKEMA,
    ...ubah,
  };
}

describe('daftar template', () => {
  it('11 berkas di templates/ tercakup tepat sekali', () => {
    const diDisk = fs.readdirSync(path.join(AKAR, 'templates')).filter((f) => f.endsWith('.docx')).sort();
    const diKode = [...TEMPLATE_SURAT, ...TEMPLATE_DOKUMEN].map((t) => berkasTemplate(t.slug)).sort();
    expect(diKode).toEqual(diDisk);
    expect(diKode).toHaveLength(11);
  });

  it('7 template surat = 7 jenis bervarian, dengan kode/varian/nama seperti seed 018', () => {
    const bervarian = JENIS_SURAT.filter((j) => j.varian).map((j) => j.jenis).sort();
    expect(TEMPLATE_SURAT.map((t) => t.jenis).sort()).toEqual(bervarian);

    const seed = fs.readFileSync(path.join(AKAR, 'supabase/migrations/018_seed.sql'), 'utf8');
    for (const t of TEMPLATE_SURAT) {
      const { kode_surat, varian, nama } = identitasSurat(t);
      expect(seed, t.slug).toMatch(new RegExp(`\\('${kode_surat}',\\s*'${varian}',\\s*'${nama}'`));
    }
  });

  it('key storage mengikuti keys.template: template/{slug}_v{versi}.docx', () => {
    expect(kunciTemplateDokumen('TOR')).toBe('template/tor_v1.docx');
  });

  it('field_schema yang disimpan adalah JSON murni dan memuat signers (ADR-004)', () => {
    for (const t of TEMPLATE_SURAT) {
      const s = fieldSchemaUntuk(t);
      expect(JSON.parse(JSON.stringify(s)), t.slug).toEqual(s);
      expect(s.signers.some((x) => x.posisi === 'KANAN' && x.wajib), t.slug).toBe(true);
    }
  });
});

describe('rencana template surat', () => {
  it('berkas dan field_schema sama → TETAP (jalan kedua tidak menulis apa pun)', () => {
    expect(rencanakanSurat(keadaan()).aksi).toBe('TETAP');
  });

  it('urutan kunci JSONB berbeda tidak dianggap perubahan', () => {
    const dibalik = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(SKEMA))).reverse());
    expect(rencanakanSurat(keadaan({ aktif: { ...keadaan().aktif!, field_schema: dibalik } })).aksi).toBe('TETAP');
  });

  it('baris seed dengan key lama dan field_schema kosong → ADOPSI di versi yang sama', () => {
    const r = rencanakanSurat(
      keadaan({
        aktif: { id: 'seed', versi: 1, storage_key: 'template/surat-05-peminjaman-barang.docx', field_schema: {} },
        hashTersimpan: null,
      }),
    );
    expect(r).toEqual({ aksi: 'ADOPSI', id: 'seed', versi: 1, kunci: 'template/surat-05-peminjaman-barang_v1.docx' });
  });

  it('berkas hilang dari storage → ADOPSI, unggah ulang di key yang sama', () => {
    expect(rencanakanSurat(keadaan({ hashTersimpan: null })).aksi).toBe('ADOPSI');
  });

  it('isi berkas berubah → VERSI_BARU, versi lama tidak ditimpa', () => {
    const r = rencanakanSurat(keadaan({ hashBerkas: 'bbb' }));
    expect(r).toEqual({
      aksi: 'VERSI_BARU',
      dariId: 'baris-1',
      versi: 2,
      kunci: 'template/surat-05-peminjaman-barang_v2.docx',
    });
  });

  it('field_schema berubah tanpa berkas berubah → tetap VERSI_BARU', () => {
    const lama = { ...SKEMA, fields: SKEMA.fields.slice(1) };
    expect(rencanakanSurat(keadaan({ aktif: { ...keadaan().aktif!, field_schema: lama } })).aksi).toBe('VERSI_BARU');
  });

  it('versi baru melompati versi nonaktif yang lebih tinggi — key tidak pernah dipakai ulang', () => {
    const r = rencanakanSurat(keadaan({ hashBerkas: 'bbb', versiTertinggi: 4 }));
    expect(r.aksi === 'VERSI_BARU' && r.versi).toBe(5);
  });

  it('tidak ada baris sama sekali → BARU', () => {
    expect(rencanakanSurat(keadaan({ aktif: null, versiTertinggi: 0, hashTersimpan: null }))).toEqual({
      aksi: 'BARU',
      versi: 1,
      kunci: 'template/surat-05-peminjaman-barang_v1.docx',
    });
  });
});

describe('rencana template dokumen acara', () => {
  const tor = TEMPLATE_DOKUMEN.find((d) => d.dokumen === 'TOR')!;

  it('belum ada → UNGGAH; sama → TETAP', () => {
    expect(rencanakanDokumen(tor, 'aaa', null).aksi).toBe('UNGGAH');
    expect(rencanakanDokumen(tor, 'aaa', 'aaa').aksi).toBe('TETAP');
  });

  it('isi berbeda di versi yang sama → DITOLAK dengan petunjuk menaikkan versi', () => {
    const r = rencanakanDokumen(tor, 'bbb', 'aaa');
    expect(r.aksi).toBe('DITOLAK');
    expect(r.aksi === 'DITOLAK' && r.alasan).toMatch(/Naikkan versi TOR/);
  });
});

describe('utilitas', () => {
  it('jsonStabil tidak peduli urutan kunci, tetapi peduli urutan larik', () => {
    expect(jsonStabil({ b: 1, a: { d: 2, c: 3 } })).toBe(jsonStabil({ a: { c: 3, d: 2 }, b: 1 }));
    expect(jsonStabil([1, 2])).not.toBe(jsonStabil([2, 1]));
  });

  it('hashIsi menghasilkan sha256 hex', () => {
    expect(hashIsi(Buffer.from('hmif'))).toMatch(/^[0-9a-f]{64}$/);
  });
});
