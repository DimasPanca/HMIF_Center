import { describe, expect, it } from 'vitest';

import {
  SkemaDraftSurat,
  buatSkemaSurat,
  kunciKhusus,
  nilaiAwalSurat,
  periksaKelengkapan,
  type KonfigSurat,
} from '@/lib/surat/field-schemas';
import { sanitasiIsiHtml, teksDariIsiHtml } from '@/lib/surat/isi-html';

const KONFIG: KonfigSurat = { kodeKegiatanDefault: 'UJIKEG', kotaDefault: 'Kota Uji', kodeAdministrasi: 'UJI.1', pdfAktif: false };

describe('sanitasiIsiHtml — allowlist isi surat (S8)', () => {
  it('keluaran editor yang sah dipertahankan', () => {
    const html = '<p>Dengan <strong>hormat</strong>, <em>kami</em>:</p><ul><li>satu</li></ul><ol><li>dua</li></ol><p>a<br>b</p>';
    expect(sanitasiIsiHtml(html)).toBe(html);
  });

  it.each([
    ['<script>alert(1)</script><p>x</p>', '<p>x</p>'],
    ['<p onclick="alert(1)">x</p>', '<p>x</p>'],
    ['<img src=x onerror=alert(1)><p>x</p>', '<p>x</p>'],
    ['<a href="javascript:alert(1)">klik</a>', 'klik'],
    ['<p style="color:red">x</p>', '<p>x</p>'],
    ['<iframe src="https://evil"></iframe>ok', 'ok'],
    ['<svg><script>alert(1)</script></svg>', ''],
    ['<style>p{}</style><p>x</p>', '<p>x</p>'],
    ['<!-- <script>x</script> --><p>x</p>', '<p>x</p>'],
    // Sisa tag yang terpecah menjadi teks ter-escape — terlihat, tetapi tidak dapat dieksekusi.
    ['<scr<script>ipt>alert(1)</script>', 'ipt&gt;alert(1)'],
    ['< script>alert(1)</script>', '&lt; script&gt;alert(1)'],
    ['<SCRIPT >alert(1)</SCRIPT><p>x</p>', '<p>x</p>'],
    ['<p>a "kutip" > b < c</p>', '<p>a &quot;kutip&quot; &gt; b &lt; c</p>'],
  ])('%s', (masuk, keluar) => {
    expect(sanitasiIsiHtml(masuk)).toBe(keluar);
  });

  it('tidak ada tag selain tujuh yang diizinkan, apa pun masukannya', () => {
    const jahat = '<div><table><tr><td><input value="x"><button>b</button></td></tr></table></div><h1>j</h1><blockquote>q</blockquote>';
    const hasil = sanitasiIsiHtml(jahat);
    for (const t of hasil.match(/<\/?([a-z]+)/g) ?? []) expect(t.replace(/[</]/g, '')).toMatch(/^(p|strong|em|ul|ol|li|br)$/);
  });

  it('b dan i dari tempelan Word dipetakan ke strong dan em', () => {
    expect(sanitasiIsiHtml('<b>t</b><i>m</i>')).toBe('<strong>t</strong><em>m</em>');
  });

  it('entitas yang sudah benar tidak di-escape dua kali', () => {
    expect(sanitasiIsiHtml('<p>R&amp;D &copy; &#169; & lain</p>')).toBe('<p>R&amp;D &copy; &#169; &amp; lain</p>');
  });

  it('masukan bukan teks → kosong', () => {
    expect(sanitasiIsiHtml(undefined)).toBe('');
    expect(sanitasiIsiHtml({ html: '<p>x</p>' })).toBe('');
  });
});

describe('teksDariIsiHtml', () => {
  it('blok menjadi baris, entitas diurai', () => {
    expect(teksDariIsiHtml('<p>Satu &amp; dua</p><ul><li>tiga</li></ul><p>a<br>b</p>')).toBe('Satu & dua\ntiga\na\nb');
  });

  it('editor kosong tidak dianggap berisi', () => {
    expect(teksDariIsiHtml('<p></p>')).toBe('');
    expect(teksDariIsiHtml('<p> &nbsp; </p><p><br></p>')).toBe('');
  });
});

describe('isi surat wajib dinilai dari teksnya', () => {
  const dasar = {
    jenis: 'PENGAJUAN',
    perihal: 'P',
    tujuan_preset: 'X',
    tujuan_nama: 'N',
    tujuan_alamat: 'di Tempat',
    data_dinamis: {},
  };
  it('<p></p> dari editor kosong ditolak', () => {
    const r = buatSkemaSurat(KONFIG).safeParse({ ...dasar, isi_surat: '<p></p>' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain('Isi surat wajib diisi.');
  });
  it('isi bertekst diterima', () => {
    expect(buatSkemaSurat(KONFIG).safeParse({ ...dasar, isi_surat: '<p>Ada isi</p>' }).success).toBe(true);
  });
});

describe('SkemaDraftSurat — auto-save menerima isian setengah jadi', () => {
  it('draft kosong selain jenis diterima', () => {
    expect(SkemaDraftSurat.safeParse({ jenis: 'KERJA_SAMA' }).success).toBe(true);
  });

  it('nilai awal form diterima apa adanya', () => {
    expect(SkemaDraftSurat.safeParse(nilaiAwalSurat(KONFIG, 'PEMINJAMAN_BARANG')).success).toBe(true);
  });

  it('jenis tidak dikenal dan tipe salah ditolak dengan pesan Indonesia', () => {
    expect(SkemaDraftSurat.safeParse({ jenis: 'X' }).error?.issues[0]?.message).toBe('Jenis surat tidak dikenal.');
    expect(SkemaDraftSurat.safeParse({ jenis: 'PIAGAM', perihal: 12 }).error?.issues[0]?.message).toBe('Isian harus berupa teks.');
  });

  it('lebih dari satu penandatangan tambahan ditolak', () => {
    const r = SkemaDraftSurat.safeParse({ jenis: 'PIAGAM', penandatangan_tambahan: [{}, {}] });
    expect(r.success).toBe(false);
  });

  it('JSON data_dinamis raksasa ditolak', () => {
    const r = SkemaDraftSurat.safeParse({ jenis: 'PIAGAM', data_dinamis: { x: 'a'.repeat(100_001) } });
    expect(r.success).toBe(false);
  });

  it('kunci khusus mengikuti skema jenisnya', () => {
    expect(kunciKhusus('PEMINJAMAN_BARANG')).toContain('items');
    expect(kunciKhusus('PIAGAM')).toEqual([]);
  });
});

describe('periksaKelengkapan — daftar field yang kurang', () => {
  it('nilai awal Peminjaman Barang: daftar berlabel manusia, tanpa duplikat', () => {
    const m = periksaKelengkapan(KONFIG, nilaiAwalSurat(KONFIG, 'PEMINJAMAN_BARANG'));
    const label = m.map((x) => x.label);
    expect(label).toContain('Perihal');
    expect(label).toContain('Nama kegiatan');
    expect(label).toContain('Tabel kebutuhan');
    expect(label).toContain('Penandatangan kolom kiri');
    expect(new Set(m.map((x) => x.path)).size).toBe(m.length);
  });

  it('galat di dalam baris daftar menyebut nomor baris dan subfield', () => {
    const awal = nilaiAwalSurat(KONFIG, 'PEMINJAMAN_BARANG') as Record<string, unknown>;
    const m = periksaKelengkapan(KONFIG, { ...awal, data_dinamis: { items: [{ kebutuhan: '', banyaknya: '2' }] } });
    expect(m.find((x) => x.path === 'data_dinamis.items.0.kebutuhan')?.label).toBe('Tabel kebutuhan #1 — Kebutuhan');
  });

  it('jenis tidak sah → satu masalah: pilih jenis surat', () => {
    expect(periksaKelengkapan(KONFIG, { jenis: 'X' })).toEqual([{ path: 'jenis', label: 'Jenis surat', pesan: 'Pilih jenis surat.' }]);
  });
});
