import { describe, expect, it } from 'vitest';

import { tanyaAi } from '@/lib/dhana/penyedia';

type Jawab = { status: number; jawaban: string | null; galat?: string };
const penyedia = (nama: string, jawab: Jawab | Error, tersedia = true) => ({
  nama,
  tersedia: () => tersedia,
  tanya: async () => {
    if (jawab instanceof Error) throw jawab;
    return jawab;
  },
});

describe('rantai penyedia AI Dhana (ADR-063)', () => {
  it('penyedia pertama berhasil → dipakai, sisanya tidak dicoba', async () => {
    const r = await tanyaAi('s', [{ peran: 'pengguna', teks: 'halo' }], [penyedia('gemini', { status: 200, jawaban: 'A' }), penyedia('groq', new Error('tak boleh dipanggil'))]);
    expect(r.hasil).toEqual({ jawaban: 'A', penyedia: 'gemini' });
    expect(r.gagal).toEqual([]);
  });

  it('kuota habis (429) → pindah ke berikutnya; galat jaringan → pindah lagi', async () => {
    const r = await tanyaAi(
      's',
      [{ peran: 'pengguna', teks: 'halo' }],
      [penyedia('gemini', { status: 429, jawaban: null, galat: 'quota' }), penyedia('groq', new Error('timeout')), penyedia('openrouter', { status: 200, jawaban: 'C' })],
    );
    expect(r.hasil).toEqual({ jawaban: 'C', penyedia: 'openrouter' });
    expect(r.gagal.map((g) => [g.penyedia, g.status])).toEqual([
      ['gemini', 429],
      ['groq', 0],
    ]);
  });

  it('penyedia tanpa kunci dilewati; semua gagal → hasil null', async () => {
    const r = await tanyaAi('s', [{ peran: 'pengguna', teks: 'halo' }], [penyedia('gemini', { status: 200, jawaban: 'A' }, false), penyedia('groq', { status: 503, jawaban: null })]);
    expect(r.hasil).toBeNull();
    expect(r.gagal.map((g) => g.penyedia)).toEqual(['groq']);
  });
});
