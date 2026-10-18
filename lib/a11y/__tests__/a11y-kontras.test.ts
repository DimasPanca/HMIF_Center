import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { auditKontras, rasio } from '@/lib/a11y/kontras';

const CSS = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf8');

describe('a11y-kontras: WCAG AA kedua tema (T-115 kontrak 1)', () => {
  it('rumus rasio sesuai WCAG (hitam/putih 21:1, sama 1:1)', () => {
    expect(rasio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(rasio('#777777', '#777777')).toBe(1);
  });

  it('nol pasangan teks < 4,5:1 dan non-teks < 3:1, terang maupun gelap', () => {
    const hasil = auditKontras(CSS);
    expect(hasil.length).toBeGreaterThan(100);
    const gagal = hasil
      .filter((h) => !h.lulus)
      .map((h) => `${h.tema} ${h.depan}/${h.latar} ${h.nilai}`);
    expect(gagal).toEqual([]);
  });
});
