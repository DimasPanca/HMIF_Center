// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { salinStruktur } from '@/lib/form/service';
import { SkemaStruktur, syaratBuka, TUJUAN_SELESAI } from '@/lib/form/skema';
import { TEMPLATE_BAWAAN } from '@/lib/form/template-bawaan';

describe('template bawaan (ADR-038 #3)', () => {
  it('lima template, semuanya lolos SkemaStruktur dan syarat bukanya', () => {
    expect(TEMPLATE_BAWAAN.map((t) => t.nama)).toEqual([
      'Form Evaluasi Acara',
      'Form Pendaftaran Peserta',
      'Form Open Recruitment',
      'Form Pendataan Pengurus',
      'Template KT1',
    ]);
    for (const t of TEMPLATE_BAWAAN) {
      expect(SkemaStruktur.safeParse(t.isi).success, t.nama).toBe(true);
      expect(syaratBuka(t.kategori, t.isi), t.nama).toEqual([]);
    }
  });
  it('unggahan template tidak melewati batas 4 MB', () => {
    const unggah = TEMPLATE_BAWAAN.flatMap((t) => t.isi.bagian.flatMap((b) => b.pertanyaan)).filter((p) => p.tipe === 'UNGGAH_BERKAS');
    expect(unggah.length).toBeGreaterThan(0);
    for (const p of unggah) expect(p.opsi.maks_mb).toBeLessThanOrEqual(4);
  });
});

describe('salinStruktur — setiap form mendapat id baru', () => {
  const asal = {
    bagian: [
      {
        id: 'a',
        judul: 'A',
        deskripsi: '',
        lanjut_ke: null,
        pertanyaan: [
          {
            id: 'q1',
            tipe: 'PILIHAN_GANDA' as const,
            judul: 'Status',
            deskripsi: '',
            wajib: true,
            peran: null,
            opsi: { pilihan: [{ id: 'o1', label: 'Ke B', lompat_ke: 'b' }, { id: 'o2', label: 'Selesai', lompat_ke: TUJUAN_SELESAI }] },
          },
        ],
      },
      { id: 'b', judul: 'B', deskripsi: '', lanjut_ke: 'a', pertanyaan: [] },
    ],
  };

  it('semua id diganti dan rujukan lompat/lanjut ikut dipetakan', () => {
    let n = 0;
    const s = salinStruktur(asal, () => `baru-${++n}`);
    const [a, b] = s.bagian;
    expect(a!.id).not.toBe('a');
    expect(b!.lanjut_ke).toBe(a!.id);
    const pil = a!.pertanyaan[0]!.opsi.pilihan!;
    expect(pil[0]!.lompat_ke).toBe(b!.id);
    expect(pil[1]!.lompat_ke).toBe(TUJUAN_SELESAI);
    const semua = [a!.id, b!.id, a!.pertanyaan[0]!.id, ...pil.map((x) => x.id)];
    expect(new Set(semua).size).toBe(semua.length);
    expect(semua.some((x) => ['a', 'b', 'q1', 'o1', 'o2'].includes(x))).toBe(false);
    expect(SkemaStruktur.safeParse(s).success).toBe(true);
  });
});
