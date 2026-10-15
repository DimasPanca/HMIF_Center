import { describe, expect, it } from 'vitest';
import { MAKS_BATCH, SkemaBuatBatch, namaBerkasBatch, terbitkanBatch, type ProgresBatch } from '@/lib/surat/batch';

const ID = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

describe('terbitkanBatch', () => {
  const items = [1, 2, 3, 4].map((i) => ({ id: ID(i), nama: `Pengurus ${i}`, nomor: `02/0${10 + i}/UN43.3.7/HMIF/X/2026` }));

  it('satu dokumen gagal tidak menghentikan sisanya; kegagalan dilaporkan di ringkasan', async () => {
    const progres: ProgresBatch[] = [];
    const dipanggil: string[] = [];
    const hasil = await terbitkanBatch(items, (p) => void progres.push(p), async (id) => {
      dipanggil.push(id);
      if (id === ID(2)) return { ok: false, status: 'DISETUJUI', pesan: 'Template tidak dapat diisi.' };
      if (id === ID(3)) throw new Error('storage putus');
      return { ok: true, status: 'TERBIT', pdf: false, peringatan: null };
    });

    expect(dipanggil).toEqual(items.map((x) => x.id));
    expect(hasil).toEqual({ berhasil: 2, gagal: 2 });
    const dok = progres.filter((p) => p.tipe === 'dokumen');
    expect(dok.map((p) => [p.i, p.total, p.ok])).toEqual([
      [1, 4, true],
      [2, 4, false],
      [3, 4, false],
      [4, 4, true],
    ]);
    expect(dok[1]).toMatchObject({ nomor: items[1]!.nomor, nama: 'Pengurus 2', pesan: 'Template tidak dapat diisi.' });
    expect(dok[2]).toMatchObject({ pesan: 'Kesalahan tak terduga saat menerbitkan dokumen.' });
    expect(progres.at(-1)).toEqual({ tipe: 'selesai', total: 4, berhasil: 2, gagal: 2 });
  });

  it('dokumen diterbitkan berurutan — progres mengikuti urutan nomor', async () => {
    const urutan: string[] = [];
    await terbitkanBatch(items, () => undefined, async (id) => {
      urutan.push(id);
      await new Promise((r) => setTimeout(r, id === ID(1) ? 15 : 1));
      return { ok: true, status: 'TERBIT', pdf: false, peringatan: null };
    });
    expect(urutan).toEqual(items.map((x) => x.id));
  });
});

describe('SkemaBuatBatch', () => {
  const dasar = { keperluan: 'Kelengkapan beasiswa', tanggal_surat: '2026-10-15' };

  it(`maksimal ${MAKS_BATCH} per batch, minimal satu`, () => {
    expect(SkemaBuatBatch.safeParse({ ...dasar, pengurus: Array.from({ length: 50 }, (_, i) => ID(i + 1)) }).success).toBe(true);
    const lebih = SkemaBuatBatch.safeParse({ ...dasar, pengurus: Array.from({ length: 51 }, (_, i) => ID(i + 1)) });
    expect(lebih.success).toBe(false);
    expect(lebih.error?.issues[0]?.message).toMatch(/pecah menjadi beberapa batch/);
    expect(SkemaBuatBatch.safeParse({ ...dasar, pengurus: [] }).error?.issues[0]?.message).toBe('Pilih minimal satu pengurus.');
  });

  it('keperluan wajib', () => {
    expect(SkemaBuatBatch.safeParse({ ...dasar, keperluan: '  ', pengurus: [ID(1)] }).error?.issues[0]?.message).toBe('Keperluan wajib diisi.');
  });
});

describe('namaBerkasBatch', () => {
  it('{nomor}-{nama}.docx dengan "/" → "-" dan nama aman untuk berkas', () => {
    expect(namaBerkasBatch('02/015/UN43.3.7/HMIF/X/2026', 'Dimas Panca Pamungkas')).toBe('02-015-UN43.3.7-HMIF-X-2026-dimas-panca-pamungkas.docx');
    expect(namaBerkasBatch('02/016/UN43.3.7/HMIF/X/2026', 'Siti Nur’aini / "Ketua"')).toBe('02-016-UN43.3.7-HMIF-X-2026-siti-nur-aini-ketua.docx');
  });
});
