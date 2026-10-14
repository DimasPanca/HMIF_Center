import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { DAFTAR_JENIS, nilaiAwalSurat, type JenisSurat, type KonfigSurat } from '@/lib/surat/field-schemas';
import { kalimatBaku, susunPratinjau, type Baris, type Blok, type ModelPratinjau } from '@/lib/surat/render-preview';
import { formatTanggalSurat } from '@/lib/utils/format-tanggal';

const AKAR = path.resolve(__dirname, '../../..');
const KONFIG: KonfigSurat = { kodeKegiatanDefault: 'UJIKEG', kotaDefault: 'Kota Uji', kodeAdministrasi: 'UJI.1', pdfAktif: false };
const KETUA = { nama: 'Dicky Saputra', nim: '3337220032' };

const BERKAS: Partial<Record<JenisSurat, string>> = {
  KETERANGAN_AKTIF: 'surat-02-keterangan-aktif.docx',
  ASPIRASI: 'surat-03-aspirasi.docx',
  UNDANGAN_PEMATERI: 'surat-04-undangan-pemateri.docx',
  UNDANGAN_SAMBUTAN: 'surat-04-undangan-sambutan.docx',
  PEMINJAMAN_BARANG: 'surat-05-peminjaman-barang.docx',
  PEMINJAMAN_RUANGAN: 'surat-05-peminjaman-ruangan.docx',
  KERJA_SAMA: 'surat-08-kerja-sama.docx',
};

function teksTemplate(berkas: string): string {
  const xml = new PizZip(fs.readFileSync(path.join(AKAR, 'templates', berkas))).file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/\s+/g, ' ');
}

function semuaSegmen(m: ModelPratinjau): Baris {
  const hasil: Baris = [...m.kotaTanggal, ...(m.lampiran ?? []), ...(m.perihal ?? []), ...(m.tujuan ?? []).flat()];
  const blok = (b: Blok) => {
    if (b.jenis === 'paragraf') hasil.push(...b.isi);
    if (b.jenis === 'rincian') b.baris.forEach((x) => hasil.push(...x.nilai));
    if (b.jenis === 'tabel') {
      if (b.baris.length === 0) hasil.push({ t: 'kosong', label: b.kosong });
      b.baris.forEach((r) => r.forEach((s) => hasil.push(...s)));
    }
    if (b.jenis === 'poin') hasil.push(...b.judul, ...b.paragraf.flat());
    if (b.jenis === 'html' && b.kosong) hasil.push({ t: 'kosong', label: b.kosong });
  };
  m.isi.forEach(blok);
  m.lampiranHalaman?.isi.forEach(blok);
  for (const p of [m.ttd.kiri, m.ttd.kanan]) if (p) hasil.push(...p.jabatan, ...p.nama, ...p.nim);
  if (m.ttd.labelAtas) hasil.push(...m.ttd.labelAtas);
  return hasil;
}
const kosong = (m: ModelPratinjau) => semuaSegmen(m).flatMap((s) => (s.t === 'kosong' ? [s.label] : []));
const teksModel = (m: ModelPratinjau) => semuaSegmen(m).map((s) => (s.t === 'teks' ? s.v : '')).join(' ');

describe('pratinjau dapat digambar untuk setiap jenis', () => {
  it.each(DAFTAR_JENIS)('%s — nilai awal tidak melempar', (jenis) => {
    expect(() => susunPratinjau(nilaiAwalSurat(KONFIG, jenis), KONFIG, KETUA)).not.toThrow();
  });

  it('isian setengah jadi atau rusak pun tetap tergambar', () => {
    expect(() =>
      susunPratinjau({ jenis: 'PEMINJAMAN_BARANG', tanggal_surat: '2026-1', data_dinamis: { items: 'bukan larik' } }, KONFIG, null),
    ).not.toThrow();
  });
});

describe('kalimat baku pratinjau = kalimat di template DOCX', () => {
  for (const [jenis, berkas] of Object.entries(BERKAS) as [JenisSurat, string][]) {
    it(`${jenis} ↔ ${berkas}`, () => {
      const tpl = teksTemplate(berkas);
      const baku = kalimatBaku(susunPratinjau(nilaiAwalSurat(KONFIG, jenis), KONFIG, KETUA));
      expect(baku.length, 'tidak ada kalimat baku yang diperiksa').toBeGreaterThan(0);
      for (const k of baku) expect(tpl, `kalimat pratinjau tidak ada di template:\n  "${k}"`).toContain(k.replace(/\s+/g, ' '));
    });
  }
});

describe('bagian kosong ditandai, bukan dihilangkan', () => {
  it('nilai awal Peminjaman Barang menandai isian wajib yang belum diisi', () => {
    const k = kosong(susunPratinjau(nilaiAwalSurat(KONFIG, 'PEMINJAMAN_BARANG'), KONFIG, KETUA));
    for (const label of ['Perihal', 'Nama/jabatan tujuan', 'Nama kegiatan', 'Tema kegiatan', 'Barang yang dipinjam', 'Hari, tanggal', 'Tempat', 'Tabel kebutuhan', 'Nama', 'NIM']) {
      expect(k, label).toContain(label);
    }
  });

  it('setelah diisi, penandanya hilang dan nilainya muncul', () => {
    const awal = nilaiAwalSurat(KONFIG, 'PEMINJAMAN_RUANGAN') as Record<string, unknown>;
    const m = susunPratinjau(
      {
        ...awal,
        perihal: 'Permohonan Peminjaman Ruang Auditorium FT',
        data_dinamis: { ruangan: 'Ruangan Auditorium FT', nama_kegiatan: 'MUSMAIF' },
      },
      KONFIG,
      KETUA,
    );
    expect(kosong(m)).not.toContain('Perihal');
    expect(kosong(m)).not.toContain('Nama ruangan');
    expect(teksModel(m)).toContain('Ruangan Auditorium FT');
    expect(teksModel(m)).toContain('Permohonan Peminjaman Ruang Auditorium FT');
  });

  it('Ketua Himpunan belum terdaftar ditandai, tidak dikarang', () => {
    expect(kosong(susunPratinjau(nilaiAwalSurat(KONFIG, 'PIAGAM'), KONFIG, null))).toContain('Ketua Himpunan belum terdaftar');
  });
});

describe('kepala surat', () => {
  it('nomor sementara dengan kode administrasi dari konfigurasi', () => {
    const m = susunPratinjau({ ...nilaiAwalSurat(KONFIG, 'KERJA_SAMA'), tanggal_surat: '2026-10-20' }, KONFIG, KETUA);
    expect(m.nomor).toBe('08/???/UNJIKEG'.replace('UNJIKEG', 'UJI.1') + '/UJIKEG/X/2026');
  });

  it('baris kota dan tanggal memakai formatter yang sama dengan generator', () => {
    const m = susunPratinjau({ ...nilaiAwalSurat(KONFIG, 'KERJA_SAMA'), tanggal_surat: '2025-08-02' }, KONFIG, KETUA);
    expect(m.kotaTanggal.map((s) => (s.t === 'teks' ? s.v : '')).join('')).toBe(`Kota Uji, ${formatTanggalSurat('2025-08-02')}`);
    expect(formatTanggalSurat('2025-08-02')).toBe('02 Agustus 2025');
  });

  it('Keterangan Aktif berjudul, tanpa perihal dan tujuan, kota-tanggal di blok TTD', () => {
    const m = susunPratinjau(nilaiAwalSurat(KONFIG, 'KETERANGAN_AKTIF'), KONFIG, KETUA);
    expect(m.judul).toBe('SURAT KETERANGAN AKTIF BERORGANISASI');
    expect(m.perihal).toBeUndefined();
    expect(m.tujuan).toBeUndefined();
    expect(m.ttd.kotaTanggalDiAtas).toBe(true);
    expect(m.ttd.kanan.awalanNim).toBe('NIM ');
  });
});

describe('blok tanda tangan (ADR-004, ADR-021)', () => {
  it('surat kepanitiaan: kiri Ketua Pelaksana, kanan "Mengetahui," Ketua HMIF bertanda tangan dan berstempel', () => {
    const m = susunPratinjau(
      {
        ...nilaiAwalSurat(KONFIG, 'PEMINJAMAN_BARANG'),
        penandatangan_tambahan: [{ jabatan: 'Ketua Pelaksana', nama: 'Muhammad Zidan', nim: '3337230084' }],
      },
      KONFIG,
      KETUA,
    );
    expect(m.ttd.kiri?.jabatan).toEqual([{ t: 'teks', v: 'Ketua Pelaksana' }]);
    expect(m.ttd.kiri?.ttd).toBe(false);
    expect(m.ttd.kanan.label).toBe('Mengetahui,');
    expect(m.ttd.kanan.nama).toEqual([{ t: 'teks', v: 'Dicky Saputra' }]);
    expect(m.ttd.kanan.ttd && m.ttd.kanan.stempel).toBe(true);
  });

  it('surat satu penandatangan tidak punya kolom kiri dan tanpa "Mengetahui,"', () => {
    for (const jenis of ['KETERANGAN_AKTIF', 'ASPIRASI'] as const) {
      const m = susunPratinjau(nilaiAwalSurat(KONFIG, jenis), KONFIG, KETUA);
      expect(m.ttd.kiri, jenis).toBeUndefined();
      expect(m.ttd.kanan.label, jenis).toBeUndefined();
    }
  });

  it('Undangan & Sambutan tanpa baris nama panitia; Peminjaman Barang dengan', () => {
    expect(susunPratinjau(nilaiAwalSurat(KONFIG, 'UNDANGAN_SAMBUTAN'), KONFIG, KETUA).ttd.labelAtas).toBeUndefined();
    expect(susunPratinjau(nilaiAwalSurat(KONFIG, 'PEMINJAMAN_BARANG'), KONFIG, KETUA).ttd.labelAtas).toBeDefined();
  });
});

describe('isi dan lampiran', () => {
  it('isi surat dibersihkan sebelum masuk pratinjau', () => {
    const m = susunPratinjau(
      { ...nilaiAwalSurat(KONFIG, 'PENGAJUAN'), isi_surat: '<p onclick="x()">Halo<script>alert(1)</script></p>' },
      KONFIG,
      KETUA,
    );
    expect(m.isi).toEqual([{ jenis: 'html', html: '<p>Halo</p>' }]);
  });

  it('isi kosong ditandai', () => {
    expect(susunPratinjau(nilaiAwalSurat(KONFIG, 'PENGAJUAN'), KONFIG, KETUA).isi).toEqual([{ jenis: 'html', html: '', kosong: 'Isi surat' }]);
  });

  it('Aspirasi: poin bernomor di Lampiran I', () => {
    const m = susunPratinjau(
      { ...nilaiAwalSurat(KONFIG, 'ASPIRASI'), data_dinamis: { poin: [{ judul: 'Timeline', paragraf: ['A', 'B'] }, { judul: 'Komitmen', paragraf: ['C'] }] } },
      KONFIG,
      KETUA,
    );
    expect(m.lampiranHalaman?.judul).toEqual(['Lampiran I.', 'ASPIRASI KEORGANISASIAN MAHASISWA']);
    expect(m.lampiranHalaman?.isi.map((b) => (b.jenis === 'poin' ? b.nomor : 0))).toEqual([1, 2]);
  });

  it('Undangan & Sambutan: susunan acara di Lampiran I', () => {
    const m = susunPratinjau(
      { ...nilaiAwalSurat(KONFIG, 'UNDANGAN_SAMBUTAN'), data_dinamis: { rundown: [{ waktu: '16.00', acara: 'Absensi' }] } },
      KONFIG,
      KETUA,
    );
    const t = m.lampiranHalaman?.isi[0];
    expect(t?.jenis === 'tabel' && t.baris.length).toBe(1);
  });
});
