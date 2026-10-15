import { describe, expect, it } from 'vitest';
import { decodeKursor, encodeKursor } from '@/lib/surat/arsip';
import { filterDariQuery, queryDariFilter } from '@/lib/surat/filter-arsip';

describe('kursor arsip', () => {
  const ID = '0b6b7c55-6f43-4c64-9d0e-2a1d1b9a0c11';

  it('bolak-balik dengan created_at teks Postgres (mikrodetik, offset +00)', () => {
    // Bentuk persis `created_at::text` — Date.parse menolaknya; kursor pernah diabaikan diam-diam.
    const k = { tanggal: '2026-10-01', dibuat: '2026-10-15 05:01:02.123456+00', id: ID };
    expect(decodeKursor(encodeKursor(k))).toEqual(k);
    expect(decodeKursor(encodeKursor({ ...k, dibuat: '2026-10-15 05:01:02+07:00' }))?.dibuat).toBe('2026-10-15 05:01:02+07:00');
  });

  it('kursor rusak atau disunting → null, bukan galat', () => {
    expect(decodeKursor(undefined)).toBeNull();
    expect(decodeKursor('bukan-base64-json')).toBeNull();
    const jahat = Buffer.from(JSON.stringify(['2026-10-01', "x'); DROP TABLE surat;--", ID])).toString('base64url');
    expect(decodeKursor(jahat)).toBeNull();
    const idSalah = Buffer.from(JSON.stringify(['2026-10-01', '2026-10-15 05:01:02+00', 'abc'])).toString('base64url');
    expect(decodeKursor(idSalah)).toBeNull();
  });
});

describe('filter arsip di URL', () => {
  it('nilai sah terbaca; yang rusak diabaikan satu per satu', () => {
    const f = filterDariQuery(
      new URLSearchParams('jenis=PEMINJAMAN_BARANG&bulan=2026-13&status=DIBATALKAN&q=+peminjaman+tandu+&periode=bukan-uuid&kegiatan=KT2HMIF'),
    );
    expect(f).toEqual({ jenis: 'PEMINJAMAN_BARANG', status: 'DIBATALKAN', q: 'peminjaman tandu', kegiatan: 'KT2HMIF' });
  });

  it('menerima objek searchParams Next (nilai larik → yang pertama)', () => {
    expect(filterDariQuery({ status: ['TERBIT', 'DRAFT'], q: undefined })).toEqual({ status: 'TERBIT' });
  });

  it('queryDariFilter membuang kosong dan dapat menimpa/menghapus kunci', () => {
    const f = { jenis: 'PENGAJUAN' as const, q: 'tandu', cursor: 'abc' };
    expect(queryDariFilter(f, { cursor: undefined })).toBe('?jenis=PENGAJUAN&q=tandu');
    expect(queryDariFilter(f, { q: undefined, cursor: undefined })).toBe('?jenis=PENGAJUAN');
    expect(queryDariFilter({})).toBe('');
    // Bolak-balik URL → filter → URL.
    expect(filterDariQuery(new URLSearchParams(queryDariFilter(f).slice(1)))).toEqual(f);
  });
});
