/**
 * Gate T-099 — unduhan master apa adanya & tidak ada varian master di UI.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: {} }));

const { responsMaster } = await import('@/lib/images/download');

const baca = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');

describe('responsMaster', () => {
  const isi = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

  it('mengirim JPEG sebagai lampiran dengan header kontrak', async () => {
    const r = responsMaster({ master_mime_type: 'image/jpeg', original_filename: 'nota toko.jpg' }, isi);
    expect(r.headers.get('Content-Type')).toBe('image/jpeg');
    expect(r.headers.get('Content-Disposition')).toMatch(/^attachment; filename="nota toko\.jpg"/);
    expect(r.headers.get('Content-Length')).toBe(String(isi.length));
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=3600');
    // Byte demi byte: tanpa transform.
    expect(Buffer.from(await r.arrayBuffer()).equals(isi)).toBe(true);
  });

  it('nama berkas disanitasi: tanpa path traversal, tanpa kutip, non-ASCII aman', () => {
    const r = responsMaster({ master_mime_type: 'image/jpeg', original_filename: '../../etc/"nota" Rp½.jpg' }, isi);
    const cd = r.headers.get('Content-Disposition')!;
    expect(cd).not.toContain('..');
    expect(cd).not.toContain('/');
    expect(cd).toMatch(/filename="nota Rp_\.jpg"/);
    expect(cd).toContain(`filename*=UTF-8''${encodeURIComponent('nota Rp½.jpg')}`);
  });
});

describe('penjaga sumber (INV-19, INV-24)', () => {
  it('endpoint unduh membaca master_path, tanpa preview/thumbnail dan tanpa parameter resize', () => {
    const route = baca('app/api/images/[id]/download/route.ts');
    expect(route).toMatch(/storage\.get\(g\.master_path\)/);
    expect(route).not.toMatch(/storage\.get\([^)]*(preview_path|thumbnail_path)/);
    expect(route).not.toMatch(/searchParams|sharp|resize/);
  });

  it('NotaImage hanya mengenal varian thumb & preview', () => {
    const komponen = baca('components/nota/NotaImage.tsx');
    expect(komponen).toMatch(/export type VarianNotaImage = 'thumb' \| 'preview';/);
    expect(komponen.toLowerCase()).not.toContain('master');
  });
});
