import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import {
  ATURAN_PENANDATANGAN,
  DAFTAR_JENIS,
  FIELD_UMUM_TERPAKAI,
  JENIS_SURAT,
  buatSkemaSurat,
  infoJenis,
  nilaiAwalSurat,
  opsiFormatOutput,
  serialisasiFieldSchema,
  type JenisSurat,
  type KonfigSurat,
} from '@/lib/surat/field-schemas';
import {
  LABEL_PRESET_LAINNYA,
  PRESET_TUJUAN_BAWAAN,
  terapkanPreset,
} from '@/lib/surat/preset-tujuan';

// Nilai yang sengaja BERBEDA dari seed: bila ada default yang ditulis di kode
// alih-alih dibaca dari konfigurasi, test di bawah gagal.
const KONFIG: KonfigSurat = {
  kodeKegiatanDefault: 'UJIKEG',
  kotaDefault: 'Kota Uji',
  kodeAdministrasi: 'UJI.1.2',
  pdfAktif: false,
};
const KONFIG_PDF: KonfigSurat = { ...KONFIG, pdfAktif: true };

const AKAR = path.resolve(__dirname, '../../..');
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), 'utf8');

const KETUPLAK = { jabatan: 'Ketua Pelaksana', nama: 'Muhammad Zidan', nim: '3337230084' };

const UMUM = {
  perihal: 'Perihal uji',
  tujuan_preset: 'DPM FT UNTIRTA',
  tujuan_nama: 'Ketua DPM FT UNTIRTA',
  tujuan_alamat: 'di Tempat',
};
const KEGIATAN = { nama_kegiatan: 'AKSARA', tema_kegiatan: 'Aktualisasi Kepemimpinan', hari_tanggal: 'Rabu, 20 Agustus 2025', tempat: 'Kampus FT UNTIRTA' };

/** Satu contoh lengkap dan sah per jenis — nilai minimum yang wajib diisi pengguna. */
const CONTOH: Record<JenisSurat, Record<string, unknown>> = {
  PENGAJUAN: { ...UMUM, isi_surat: '<p>Isi</p>', data_dinamis: {} },
  KETERANGAN_AKTIF: {
    data_dinamis: {
      nama_pemohon: 'Dicky Saputra',
      nim_pemohon: '3337220032',
      jabatan_pemohon: 'Staff Departemen Kaderisasi',
      keperluan: 'Kelengkapan Persyaratan Administrasi Beasiswa',
    },
  },
  ASPIRASI: {
    ...UMUM,
    isi_surat: '<p>Aspirasi ini disampaikan…</p>',
    data_dinamis: { poin: [{ judul: 'Penyesuaian Timeline', paragraf: ['Uraian satu.'] }] },
  },
  UNDANGAN_PEMATERI: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: { ...KEGIATAN, topik_materi: 'Kepemimpinan', waktu: '08.10 - 09.00 WIB' },
  },
  UNDANGAN_SAMBUTAN: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: {
      ...KEGIATAN,
      waktu: '16.00 WIB s.d. Selesai',
      rundown: [{ hari_tanggal: 'Senin, 06 Oktober 2025', waktu: '16.00-16.30', acara: 'Absensi' }],
    },
  },
  PEMINJAMAN_BARANG: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: { ...KEGIATAN, barang: 'Tandu', items: [{ kebutuhan: 'Tandu', banyaknya: '2 unit' }] },
  },
  PEMINJAMAN_RUANGAN: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: {
      ...KEGIATAN,
      ruangan: 'Ruangan Auditorium FT',
      tujuan_jabatan: 'Fakultas Teknik UNTIRTA',
      waktu: '16.00 - selesai',
    },
  },
  PERINGATAN: { ...UMUM, isi_surat: '<p>Isi</p>', data_dinamis: {} },
  KEPUTUSAN: { ...UMUM, isi_surat: '<p>Isi</p>', data_dinamis: {} },
  KERJA_SAMA: {
    ...UMUM,
    penandatangan_tambahan: [KETUPLAK],
    data_dinamis: { ...KEGIATAN, jenis_mitra: 'Rumah Sakit' },
  },
  PIAGAM: { ...UMUM, isi_surat: '<p>Isi</p>', data_dinamis: {} },
};

const skema = buatSkemaSurat(KONFIG);
const parse = (jenis: JenisSurat, ubah: Record<string, unknown> = {}, k = KONFIG) =>
  buatSkemaSurat(k).safeParse({ jenis, ...CONTOH[jenis], ...ubah });

function pesan(r: ReturnType<typeof parse>): string[] {
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('katalog jenis surat', () => {
  it('9 kode surat tercakup; 7 varian bertemplate dan 4 form generik', () => {
    expect(new Set(JENIS_SURAT.map((j) => j.kode)).size).toBe(9);
    expect(JENIS_SURAT.filter((j) => j.varian !== null)).toHaveLength(7);
    expect(JENIS_SURAT.filter((j) => j.varian === null).map((j) => j.kode)).toEqual(['01', '06', '07', '09']);
  });

  it('7 jenis bertemplate punya field khusus; generik tidak', () => {
    for (const { jenis, varian } of JENIS_SURAT) {
      const n = serialisasiFieldSchema(jenis).fields.length;
      if (varian) expect(n, jenis).toBeGreaterThan(0);
      else expect(n, jenis).toBe(0);
    }
  });

  it('kode dan varian sama persis dengan baris surat_template di seed 018', () => {
    const sql = baca('supabase/migrations/018_seed.sql');
    const diSeed = [...sql.matchAll(/\('(\d{2})',\s*'([A-Z_]+)',\s*'([^']+)'/g)].map((m) => [m[1], m[2], m[3]]);
    const diKode = JENIS_SURAT.filter((j) => j.varian).map((j) => [j.kode, j.varian, j.nama]);
    expect(diSeed.sort()).toEqual(diKode.sort());
  });

  it('setiap contoh sah lolos validasi', () => {
    for (const jenis of DAFTAR_JENIS) expect(pesan(parse(jenis)), jenis).toEqual([]);
  });
});

describe('validasi menolak field wajib kosong dengan pesan Indonesia', () => {
  it('perihal kosong pada surat beralamat', () => {
    const r = parse('PEMINJAMAN_BARANG', { perihal: '   ' });
    expect(pesan(r)).toContain('perihal: Perihal wajib diisi.');
  });

  it('field khusus kosong', () => {
    const r = parse('KETERANGAN_AKTIF', { data_dinamis: { ...CONTOH.KETERANGAN_AKTIF.data_dinamis as object, keperluan: '' } });
    expect(pesan(r)).toContain('data_dinamis.keperluan: Keperluan wajib diisi.');
  });

  it('field khusus tidak dikirim sama sekali — tetap berbahasa Indonesia', () => {
    const r = parse('KERJA_SAMA', { data_dinamis: {} });
    expect(pesan(r)).toContain('data_dinamis.jenis_mitra: Jenis instansi mitra wajib diisi.');
  });

  it('daftar repeatable kosong', () => {
    expect(pesan(parse('PEMINJAMAN_BARANG', { data_dinamis: { ...KEGIATAN, barang: 'Tandu', items: [] } }))).toContain(
      'data_dinamis.items: Tambahkan minimal satu barang di tabel kebutuhan.',
    );
    expect(pesan(parse('ASPIRASI', { data_dinamis: { poin: [{ judul: 'X', paragraf: [] }] } }))).toContain(
      'data_dinamis.poin.0.paragraf: Setiap poin aspirasi butuh minimal satu paragraf uraian.',
    );
  });

  it('isi surat wajib pada form generik dan Aspirasi', () => {
    expect(pesan(parse('PENGAJUAN', { isi_surat: '' }))).toContain('isi_surat: Isi surat wajib diisi.');
    expect(pesan(parse('ASPIRASI', { isi_surat: '' }))).toContain('isi_surat: Isi surat wajib diisi.');
  });

  it('tidak ada satu pun pesan berbahasa Inggris dari Zod', () => {
    const kosong = DAFTAR_JENIS.flatMap((jenis) =>
      pesan(skema.safeParse({ jenis, perihal: '', tujuan_nama: '', data_dinamis: {}, penandatangan_tambahan: [{}] })),
    );
    expect(kosong.length).toBeGreaterThan(0);
    for (const p of kosong) expect(p).not.toMatch(/expected|Invalid|Too small|Required/);
  });

  it('jenis tidak dikenal', () => {
    const r = skema.safeParse({ jenis: 'SURAT_CINTA' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Jenis surat tidak dikenal.');
  });
});

describe('default dari konfigurasi, bukan hardcode', () => {
  it('kegiatan dan kota mengikuti app_config; lampiran "-"; format DOCX', () => {
    const r = parse('PEMINJAMAN_RUANGAN');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.kode_kegiatan).toBe('UJIKEG');
    expect(r.data.kota).toBe('Kota Uji');
    expect(r.data.lampiran).toBe('-');
    expect(r.data.format_output).toBe('DOCX');
    expect(r.data.penandatangan_utama).toBe('KETUA');
  });

  it('tanggal surat default = hari ini menurut WIB', () => {
    const r = parse('PENGAJUAN');
    const wib = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    expect(r.success && r.data.tanggal_surat).toBe(wib);
  });

  it('modul skema tidak menulis literal kode administrasi, kegiatan, atau kota (AGENT_RULES §4.5)', () => {
    const src = baca('lib/surat/field-schemas.ts');
    expect(src).not.toMatch(/UN43\.3\.7|'HMIF'|"HMIF"|'Cilegon'|"Cilegon"/);
  });
});

describe('field umum', () => {
  it('kode kegiatan dijadikan huruf besar; garis miring dan spasi ditolak', () => {
    const r = parse('PENGAJUAN', { kode_kegiatan: ' kt2hmif ' });
    expect(r.success && r.data.kode_kegiatan).toBe('KT2HMIF');
    expect(parse('PENGAJUAN', { kode_kegiatan: 'KT/2' }).success).toBe(false);
    expect(parse('PENGAJUAN', { kode_kegiatan: 'MUSMA IF' }).success).toBe(false);
  });

  it('tanggal yang tidak ada di kalender ditolak', () => {
    expect(pesan(parse('PENGAJUAN', { tanggal_surat: '2026-02-31' }))).toContain(
      'tanggal_surat: Tanggal surat bukan tanggal yang valid.',
    );
    expect(parse('PENGAJUAN', { tanggal_surat: '2026-10-14' }).success).toBe(true);
  });

  it('penandatangan utama tidak dapat diganti klien', () => {
    expect(parse('PENGAJUAN', { penandatangan_utama: 'SEKUM' }).success).toBe(false);
  });

  it('Keterangan Aktif tidak beralamat: kolom NOT NULL terisi nilai tetap', () => {
    const r = parse('KETERANGAN_AKTIF');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.tujuan_nama).toBe('-');
    expect(r.data.tujuan_alamat).toBe('-');
    expect(r.data.perihal).toBe(infoJenis('KETERANGAN_AKTIF').nama);
    expect(FIELD_UMUM_TERPAKAI.KETERANGAN_AKTIF).not.toContain('tujuan_nama');
  });

  it('kunci asing di data_dinamis ditolak (tidak ada sampah di JSONB)', () => {
    const r = parse('PENGAJUAN', { data_dinamis: { sisipan: 'x' } });
    expect(r.success).toBe(false);
  });
});

describe('format output mengikuti PDF_ENABLED (ADR-010)', () => {
  it('PDF nonaktif: hanya DOCX ditawarkan, PDF dan BOTH ditolak', () => {
    expect(opsiFormatOutput(false).map((o) => o.nilai)).toEqual(['DOCX']);
    expect(pesan(parse('PENGAJUAN', { format_output: 'PDF' }))).toContain('format_output: Format PDF belum tersedia.');
    expect(parse('PENGAJUAN', { format_output: 'BOTH' }).success).toBe(false);
  });

  it('PDF aktif: tiga opsi, label "Keduanya"', () => {
    expect(opsiFormatOutput(true)).toEqual([
      { nilai: 'DOCX', label: 'DOCX' },
      { nilai: 'PDF', label: 'PDF' },
      { nilai: 'BOTH', label: 'Keduanya' },
    ]);
    expect(parse('PENGAJUAN', { format_output: 'BOTH' }, KONFIG_PDF).success).toBe(true);
  });
});

describe('penandatangan (ADR-004, ADR-021)', () => {
  it('Ketua Himpunan selalu di kolom kanan, wajib dan otomatis', () => {
    for (const jenis of DAFTAR_JENIS) {
      expect(ATURAN_PENANDATANGAN[jenis].find((a) => a.posisi === 'KANAN'), jenis).toEqual({
        posisi: 'KANAN',
        wajib: true,
        otomatis: true,
      });
    }
  });

  it('surat kepanitiaan wajib punya kolom kiri', () => {
    expect(pesan(parse('PEMINJAMAN_BARANG', { penandatangan_tambahan: [] }))).toContain(
      'penandatangan_tambahan: Isi satu penandatangan kolom kiri, misalnya Ketua Pelaksana.',
    );
  });

  it('surat satu penandatangan menolak tambahan', () => {
    expect(parse('KETERANGAN_AKTIF', { penandatangan_tambahan: [KETUPLAK] }).success).toBe(false);
  });

  it('form generik: kolom kiri opsional, paling banyak satu', () => {
    expect(parse('PIAGAM', { penandatangan_tambahan: [] }).success).toBe(true);
    expect(parse('PIAGAM', { penandatangan_tambahan: [KETUPLAK] }).success).toBe(true);
    expect(parse('PIAGAM', { penandatangan_tambahan: [KETUPLAK, KETUPLAK] }).success).toBe(false);
  });

  it('NIM penandatangan hanya angka', () => {
    expect(pesan(parse('KERJA_SAMA', { penandatangan_tambahan: [{ ...KETUPLAK, nim: 'NIM. 333' }] }))).toContain(
      'penandatangan_tambahan.0.nim: NIM hanya boleh berisi angka.',
    );
  });
});

describe('serialisasi field_schema (bahan T-055)', () => {
  it('setiap field punya label, dan bentuknya sesuai TEMPLATE_MAPPING §6', () => {
    const ka = serialisasiFieldSchema('KETERANGAN_AKTIF');
    expect(ka.fields.map((d) => [d.key, d.label, d.type, d.required])).toEqual([
      ['nama_pemohon', 'Nama mahasiswa', 'text', true],
      ['nim_pemohon', 'NIM', 'text', true],
      ['jabatan_pemohon', 'Jabatan', 'text', true],
      ['keperluan', 'Dipergunakan sebagai', 'text', true],
    ]);
    expect(ka.signers).toEqual([{ posisi: 'KANAN', wajib: true }]);
    expect(ka.pakai).toEqual(['nomor_lengkap', 'tanggal_surat_format', 'kota']);
  });

  it('daftar repeatable membawa deskripsi item', () => {
    const asp = serialisasiFieldSchema('ASPIRASI');
    const poin = asp.fields.find((d) => d.key === 'poin');
    expect(poin?.type).toBe('list');
    expect(poin?.item).toEqual({
      judul: { label: 'Judul poin', type: 'text', required: true },
      paragraf: { label: 'Uraian', type: 'text[]', required: true },
    });
    expect(asp.fields.find((d) => d.key === 'label_atas')?.default).toBe('Hormat Kami,');
  });

  it('nilai tetap "Mengetahui," dikirim ke generator tetapi tidak dirender form', () => {
    const s = serialisasiFieldSchema('PEMINJAMAN_BARANG');
    expect(s.tetap).toEqual({ label_kanan: 'Mengetahui,' });
    expect(s.fields.map((d) => d.key)).not.toContain('label_kanan');
  });

  it('hasilnya JSON murni, aman disimpan ke kolom JSONB', () => {
    for (const jenis of DAFTAR_JENIS) {
      const s = serialisasiFieldSchema(jenis);
      expect(JSON.parse(JSON.stringify(s)), jenis).toEqual(s);
    }
  });
});

/**
 * Kesalahan paling berbahaya di rantai surat tidak menimbulkan galat:
 * placeholder yang salah ketik dicetak sebagai kata `undefined` di surat resmi
 * (TEMPLATE_MAPPING §2.2). Karena itu nama field dicocokkan dua arah dengan
 * tag yang benar-benar tertulis di berkas .docx.
 */
describe('nama field cocok dengan placeholder template', () => {
  const BERKAS: Partial<Record<JenisSurat, string>> = {
    KETERANGAN_AKTIF: 'surat-02-keterangan-aktif.docx',
    ASPIRASI: 'surat-03-aspirasi.docx',
    UNDANGAN_PEMATERI: 'surat-04-undangan-pemateri.docx',
    UNDANGAN_SAMBUTAN: 'surat-04-undangan-sambutan.docx',
    PEMINJAMAN_BARANG: 'surat-05-peminjaman-barang.docx',
    PEMINJAMAN_RUANGAN: 'surat-05-peminjaman-ruangan.docx',
    KERJA_SAMA: 'surat-08-kerja-sama.docx',
  };

  // Placeholder yang diisi generator dari kolom `surat` atau `surat_signer`,
  // bukan dari field khusus.
  const DARI_GENERATOR = new Set([
    'nomor_lengkap', 'tanggal_surat_format', 'kota', 'lampiran', 'perihal',
    'tujuan_nama', 'tujuan_alamat', 'isi_paragraf',
    'kiri', 'kanan', 'jabatan', 'nama', 'nim', '%ttd', '%ttd_nama', '%stempel',
    'no', // nomor baris tabel kebutuhan, dihitung generator
  ]);
  // Field khusus yang bukan placeholder, beserta alasannya.
  const BUKAN_PLACEHOLDER = new Set(['lampirkan_tor']); // generator menambahkan TOR sebagai lampiran
  // Placeholder blok tanda tangan yang nilainya datang dari `tetap`.
  const DARI_TETAP: Record<string, string> = { label: 'label_kanan' };

  function tagTemplate(berkas: string): Set<string> {
    const zip = new PizZip(fs.readFileSync(path.join(AKAR, 'templates', berkas)));
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    const teks = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1] ?? '').join('');
    return new Set([...teks.matchAll(/\{([#/]?)([^{}]+)\}/g)].map((m) => m[2]!.trim()));
  }

  for (const [jenis, berkas] of Object.entries(BERKAS) as [JenisSurat, string][]) {
    it(`${jenis} ↔ ${berkas}`, () => {
      const tag = tagTemplate(berkas);
      const s = serialisasiFieldSchema(jenis);

      const dariSkema = new Set<string>();
      for (const d of s.fields) {
        if (BUKAN_PLACEHOLDER.has(d.key)) continue;
        dariSkema.add(d.key);
        for (const [k, sub] of Object.entries(d.item ?? {})) {
          dariSkema.add(k);
          // Larik teks dirender `{#paragraf}{teks}{/paragraf}` (TEMPLATE_MAPPING §4.1).
          if (sub.type === 'text[]') dariSkema.add('teks');
        }
      }

      // Arah 1: setiap field khusus punya tempat di template.
      for (const k of dariSkema) expect(tag.has(k), `field "${k}" tidak ada di ${berkas}`).toBe(true);

      // Arah 2: setiap tag template punya sumber data.
      for (const t of tag) {
        if (DARI_GENERATOR.has(t) || dariSkema.has(t)) continue;
        const kunciTetap = DARI_TETAP[t];
        expect(kunciTetap !== undefined && kunciTetap in s.tetap, `tag {${t}} di ${berkas} tidak punya sumber`).toBe(true);
      }

      // Placeholder umum yang dicetak template ≡ daftar `pakai`.
      for (const ph of s.pakai) expect(tag.has(ph), `pakai "${ph}" tidak ada di ${berkas}`).toBe(true);
    });
  }
});

describe('nilai awal form', () => {
  it('memuat default konfigurasi dan mengosongkan field wajib', () => {
    const awal = nilaiAwalSurat(KONFIG, 'PEMINJAMAN_BARANG') as Record<string, unknown> & {
      data_dinamis: Record<string, unknown>;
    };
    expect(awal.jenis).toBe('PEMINJAMAN_BARANG');
    expect(awal.kode_kegiatan).toBe('UJIKEG');
    expect(awal.kota).toBe('Kota Uji');
    expect(awal.perihal).toBe('');
    expect(awal.data_dinamis.items).toEqual([]);
    expect(awal.data_dinamis.label_kanan).toBe('Mengetahui,');
  });

  it('nilai awal + isian minimum = surat sah, untuk setiap jenis', () => {
    for (const jenis of DAFTAR_JENIS) {
      const awal = nilaiAwalSurat(KONFIG, jenis) as Record<string, unknown> & { data_dinamis: object };
      const contoh = CONTOH[jenis] as { data_dinamis?: object };
      const gabung = { ...awal, ...contoh, data_dinamis: { ...awal.data_dinamis, ...contoh.data_dinamis } };
      expect(pesan(skema.safeParse(gabung) as ReturnType<typeof parse>), jenis).toEqual([]);
    }
  });
});

describe('preset tujuan', () => {
  it('6 preset, sama persis dengan seed tujuan_surat_preset', () => {
    const sql = baca('supabase/migrations/018_seed.sql');
    const blok = sql.slice(sql.indexOf('INSERT INTO tujuan_surat_preset'));
    for (const p of PRESET_TUJUAN_BAWAAN) {
      expect(blok, p.label).toContain(`'${p.label}'`);
      if (p.nama) expect(blok, p.label).toContain(`'${p.nama}'`);
    }
    expect(PRESET_TUJUAN_BAWAAN).toHaveLength(6);
  });

  it('memilih BEM FT UNTIRTA mengisi nama dan alamat', () => {
    expect(terapkanPreset('BEM FT UNTIRTA', PRESET_TUJUAN_BAWAAN)).toEqual({
      tujuan_preset: 'BEM FT UNTIRTA',
      tujuan_nama: 'Ketua BEM FT UNTIRTA',
      tujuan_alamat: 'di Tempat',
    });
  });

  it('"Lainnya" mengosongkan isian supaya sisa preset sebelumnya tidak terbawa', () => {
    expect(terapkanPreset(LABEL_PRESET_LAINNYA, PRESET_TUJUAN_BAWAAN)).toEqual({
      tujuan_preset: LABEL_PRESET_LAINNYA,
      tujuan_nama: '',
      tujuan_alamat: '',
    });
  });
});

describe('satu skema untuk klien dan server (K-04)', () => {
  it('modul skema dan preset bebas akses server, jadi aman diimpor komponen klien', () => {
    for (const berkas of ['lib/surat/field-schemas.ts', 'lib/surat/preset-tujuan.ts']) {
      const src = baca(berkas);
      expect(src, berkas).not.toMatch(/from '@\/lib\/db|process\.env|from 'node:/);
    }
  });

  it('pembaca konfigurasi server memakai tipe dari modul skema yang sama', () => {
    expect(baca('lib/surat/konfig.ts')).toMatch(/import type \{ KonfigSurat \} from '@\/lib\/surat\/field-schemas'/);
  });
});
