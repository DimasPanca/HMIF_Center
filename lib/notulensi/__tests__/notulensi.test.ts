/**
 * Unit notulensi (murni, klien tiruan). Menjaga: allowlist sanitasi TipTap,
 * ekstraksi teks pencarian, skema (K-04), pemetaan kode, dan lingkup tulis yang
 * diturunkan dari notulensi induk. Perilaku SQL/RLS nyata: 027_notulensi.sql +
 * e2e/notulensi.spec.ts.
 *
 * Sumber: docs/ai/tasks/P8-kesekretariatan.md T-106 · docs/ai/NOTULENSI_CONTRACT.md
 */

import { describe, expect, it } from 'vitest';

import type { Konteks } from '@/lib/auth/guard';
import { ekstrakBlok, ekstrakTeks, sanitasiKonten } from '../sanitasi';
import {
  SkemaActionItemInput,
  SkemaBuatNotulensi,
  STATUS_GAGAL_NOTULENSI,
  buatNotulensi,
  type GagalNotulensi,
} from '../service';

// ---------------------------------------------------------------------------
// Sanitasi
// ---------------------------------------------------------------------------

describe('sanitasiKonten (allowlist TipTap)', () => {
  it('membuang node & mark asing, mempertahankan yang diizinkan', () => {
    const kotor = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 9 }, content: [{ type: 'text', text: 'Judul' }] },
        { type: 'script', content: [{ type: 'text', text: 'jahat()' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'tebal', marks: [{ type: 'bold' }, { type: 'evilMark' }] },
          ],
        },
      ],
    };
    const bersih = sanitasiKonten(kotor);
    const heading = bersih.content!.find((n) => n.type === 'heading')!;
    expect(heading.attrs).toEqual({ level: 2 }); // level 9 → 2
    expect(bersih.content!.some((n) => n.type === 'script')).toBe(false);
    const teks = bersih.content!.find((n) => n.type === 'paragraph')!.content![0]!;
    expect(teks.marks).toEqual([{ type: 'bold' }]); // evilMark dibuang
  });

  it('membuang tautan berskema tidak aman, menyimpan http/mailto', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'y', marks: [{ type: 'link', attrs: { href: 'https://a.test' } }] }] },
      ],
    };
    const bersih = sanitasiKonten(doc);
    expect(bersih.content![0]!.content![0]!.marks).toBeUndefined(); // javascript: dibuang
    expect(bersih.content![1]!.content![0]!.marks).toEqual([{ type: 'link', attrs: { href: 'https://a.test' } }]);
  });

  it('mempertahankan tabel & task-list', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'sel' }] }] }] }] },
      ],
    };
    const bersih = sanitasiKonten(doc);
    expect(bersih.content!.map((n) => n.type)).toEqual(['taskList', 'table']);
  });

  it('input tak sah → dokumen kosong yang sah', () => {
    expect(sanitasiKonten(null)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(sanitasiKonten({ type: 'paragraph' })).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});

describe('ekstraksi teks', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', content: [{ type: 'text', text: 'Rapat Koordinasi' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Membahas anggaran' }] },
    ],
  };
  it('ekstrakTeks menggabung semua teks', () => {
    expect(ekstrakTeks(doc)).toBe('Rapat Koordinasi Membahas anggaran');
  });
  it('ekstrakBlok memisah per blok tingkat atas', () => {
    expect(ekstrakBlok(doc)).toEqual(['Rapat Koordinasi', 'Membahas anggaran']);
  });
});

// ---------------------------------------------------------------------------
// Skema
// ---------------------------------------------------------------------------

describe('skema notulensi', () => {
  it('SkemaBuatNotulensi: judul & tanggal wajib, waktu selesai > mulai', () => {
    expect(SkemaBuatNotulensi.safeParse({ judul: 'R', tanggal: '2026-09-01', departemen_id: null }).success).toBe(true);
    expect(SkemaBuatNotulensi.safeParse({ judul: '', tanggal: '2026-09-01', departemen_id: null }).success).toBe(false);
    expect(
      SkemaBuatNotulensi.safeParse({ judul: 'R', tanggal: '2026-09-01', departemen_id: null, waktu_mulai: '18:00', waktu_selesai: '16:00' }).success,
    ).toBe(false);
  });
  it('SkemaActionItemInput: tugas wajib, PIC/deadline/dept opsional', () => {
    expect(SkemaActionItemInput.safeParse({ tugas: 'Revisi RAB' }).success).toBe(true);
    expect(SkemaActionItemInput.safeParse({ tugas: '' }).success).toBe(false);
  });
  it('kode gagal → HTTP', () => {
    expect(STATUS_GAGAL_NOTULENSI).toEqual({ TIDAK_DITEMUKAN: 404, TIDAK_BERWENANG: 403, TIDAK_VALID: 422, KONFLIK: 409 });
  });
});

// ---------------------------------------------------------------------------
// Lingkup (klien tiruan)
// ---------------------------------------------------------------------------

function klienTiruan(hasil: unknown[][] = []) {
  let ke = 0;
  const rekam = () => Promise.resolve(hasil[ke++] ?? []);
  return { tx: { $queryRaw: rekam, $executeRaw: rekam } as unknown as Parameters<typeof buatNotulensi>[0] };
}
const konteks = (over: Partial<Konteks> = {}): Konteks =>
  ({ sesi: { userId: 'u1' }, periodeId: 'per1', roles: ['SEKUM'], departemenIds: [], ...over }) as unknown as Konteks;

describe('lingkup buatNotulensi', () => {
  it('SEKUM (peran global) boleh membuat notulensi himpunan', async () => {
    const { tx } = klienTiruan([[{ id: 'n1' }]]); // INSERT notulensi RETURNING id
    const hasil = await buatNotulensi(tx, konteks(), { judul: 'Rapat', tanggal: '2026-09-01', departemen_id: null });
    expect(hasil.ok).toBe(true);
  });

  it('KADEPT tanpa baris user_role cocok ditolak', async () => {
    const { tx } = klienTiruan([[]]); // user_role lookup kosong
    const hasil = await buatNotulensi(tx, konteks({ roles: ['KADEPT'] as Konteks['roles'] }), {
      judul: 'Rapat',
      tanggal: '2026-09-01',
      departemen_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(hasil.ok).toBe(false);
    expect((hasil as GagalNotulensi).kode).toBe('TIDAK_BERWENANG');
  });

  it('input tak valid → TIDAK_VALID sebelum menyentuh DB', async () => {
    const { tx } = klienTiruan([]);
    const hasil = await buatNotulensi(tx, konteks(), { judul: '', tanggal: 'x', departemen_id: null });
    expect((hasil as GagalNotulensi).kode).toBe('TIDAK_VALID');
  });
});
