// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NomorSuratBadge, TEKS_SEMENTARA, salinNomor } from '@/components/surat/NomorSuratBadge';
import { ToastProvider } from '@/components/ui/toast';
import type { Konteks } from '@/lib/auth/guard';
import type { TxKlien } from '@/lib/db/with-audit-context';
import {
  MAKS_BATCH_NOMOR,
  PENANDA_SEMENTARA,
  adalahNomorSementara,
  alokasiNomor,
  alokasiNomorBatch,
  previewNomor,
} from '@/lib/surat/nomor';

const AKAR = path.resolve(__dirname, '../../..');

const DASAR = { kodeSurat: '05', kodeKegiatan: 'HMIF', tanggalSurat: '2026-10-14', kodeAdministrasi: 'UN43.3.7' };

describe('previewNomor', () => {
  it('contoh kontrak: 05/???/UN43.3.7/HMIF/X/2026', () => {
    expect(previewNomor(DASAR)).toBe('05/???/UN43.3.7/HMIF/X/2026');
  });

  it('bulan dalam angka Romawi, bukan angka biasa', () => {
    expect(previewNomor({ ...DASAR, tanggalSurat: '2025-08-04' })).toBe('05/???/UN43.3.7/HMIF/VIII/2025');
    expect(previewNomor({ ...DASAR, tanggalSurat: '2026-01-31' })).toMatch(/\/I\/2026$/);
    expect(previewNomor({ ...DASAR, tanggalSurat: '2026-12-01' })).toMatch(/\/XII\/2026$/);
  });

  it('tanggal awal bulan tidak bergeser ke bulan sebelumnya karena zona waktu', () => {
    expect(previewNomor({ ...DASAR, tanggalSurat: '2026-11-01' })).toMatch(/\/XI\/2026$/);
  });

  it('kode kegiatan dijadikan huruf besar, sama seperti skema form', () => {
    expect(previewNomor({ ...DASAR, kodeKegiatan: 'kt2hmif' })).toBe('05/???/UN43.3.7/KT2HMIF/X/2026');
  });

  it('kode administrasi berasal dari masukan, tidak pernah literal', () => {
    expect(previewNomor({ ...DASAR, kodeAdministrasi: 'UN43.3.3.7' })).toBe('05/???/UN43.3.3.7/HMIF/X/2026');
  });

  it('bagian yang belum terisi tetap enam segmen bertanda ?', () => {
    expect(previewNomor({ kodeSurat: '', kodeKegiatan: '', tanggalSurat: '', kodeAdministrasi: 'UN43.3.7' })).toBe(
      '?/???/UN43.3.7/?/?/?',
    );
  });

  it('urutan segmen sama dengan format() di alokasi_nomor_surat', () => {
    const sql = fs.readFileSync(path.join(AKAR, 'supabase/migrations/014b_functions_surat.sql'), 'utf8');
    const blok = sql.slice(sql.indexOf("v_nomor := format('%s/%s/%s/%s/%s/%s'"));
    const urutan = ['v_surat.kode_surat', 'lpad(v_next', 'v_kode_adm', 'v_surat.kode_kegiatan', 'v_bulan_romawi', 'EXTRACT(YEAR'];
    const posisi = urutan.map((u) => blok.indexOf(u));
    expect(posisi.every((p) => p > 0)).toBe(true);
    expect([...posisi].sort((a, b) => a - b)).toEqual(posisi);

    // Nomor arsip sungguhan dari PRD F-4.1, dengan nomor urutnya diganti penanda.
    expect(previewNomor({ kodeSurat: '05', kodeKegiatan: 'KT2HMIF', tanggalSurat: '2025-08-04', kodeAdministrasi: 'UN43.3.7' }))
      .toBe('05/379/UN43.3.7/KT2HMIF/VIII/2025'.replace('/379/', `/${PENANDA_SEMENTARA}/`));
  });

  it('adalahNomorSementara membedakan pratinjau dari nomor final', () => {
    expect(adalahNomorSementara(previewNomor(DASAR))).toBe(true);
    expect(adalahNomorSementara('05/379/UN43.3.7/KT2HMIF/VIII/2025')).toBe(false);
  });
});

describe('INV-15: nomor final tidak dirakit di TypeScript', () => {
  it('tidak ada lpad/padStart di lib/surat', () => {
    const dir = path.join(AKAR, 'lib/surat');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      expect(fs.readFileSync(path.join(dir, f), 'utf8'), f).not.toMatch(/lpad|padStart/);
    }
  });

  it('pratinjau tidak membaca nomor berikutnya dari database', () => {
    // Komentar dibuang: modul itu sendiri menjelaskan kenapa MAX() dilarang.
    const kode = fs
      .readFileSync(path.join(AKAR, 'lib/surat/nomor.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(kode).not.toMatch(/MAX\s*\(|nomor_terakhir/i);
  });
});

// ---------------------------------------------------------------------------
// Alokasi — transaksi tiruan yang mencatat setiap query
// ---------------------------------------------------------------------------

interface BarisUji {
  id: string;
  periode_id: string;
  status: string;
  nomor_lengkap: string | null;
}

function txTiruan(baris: BarisUji[], hasilFungsi: unknown[] = []) {
  const query: { sql: string; nilai: unknown[] }[] = [];
  const tx = {
    $queryRaw: (strings: TemplateStringsArray, ...nilai: unknown[]) => {
      const sql = strings.join('?');
      query.push({ sql, nilai });
      if (sql.includes('FROM surat WHERE id = ANY')) {
        const ids = nilai[0] as string[];
        return Promise.resolve(baris.filter((b) => ids.includes(b.id)));
      }
      return Promise.resolve(hasilFungsi);
    },
  } as unknown as TxKlien;
  const panggilFungsi = () => query.filter((q) => /alokasi_nomor_(surat|batch)/.test(q.sql));
  return { tx, query, panggilFungsi };
}

const KONTEKS = { sesi: { userId: 'approver-1' }, periodeId: 'periode-1', roles: ['SEKUM'] } as unknown as Konteks;
const MENUNGGU = (id: string): BarisUji => ({ id, periode_id: 'periode-1', status: 'MENUNGGU_APPROVAL', nomor_lengkap: null });

describe('alokasiNomor', () => {
  it('memanggil alokasi_nomor_surat dengan approver dari sesi', async () => {
    const t = txTiruan([MENUNGGU('s1')], [{ nomor: '05/001/UN43.3.7/HMIF/X/2026' }]);
    expect(await alokasiNomor(t.tx, KONTEKS, 's1')).toEqual({ ok: true, nomor: '05/001/UN43.3.7/HMIF/X/2026' });
    const [panggil] = t.panggilFungsi();
    expect(panggil?.nilai).toEqual(['s1', 'approver-1']);
  });

  it('surat tidak ada atau milik periode lain → TIDAK_DITEMUKAN, counter tidak disentuh', async () => {
    for (const baris of [[], [{ ...MENUNGGU('s1'), periode_id: 'periode-lama' }]]) {
      const t = txTiruan(baris);
      expect(await alokasiNomor(t.tx, KONTEKS, 's1')).toMatchObject({ ok: false, kode: 'TIDAK_DITEMUKAN' });
      expect(t.panggilFungsi()).toHaveLength(0);
    }
  });

  it('draft tidak mendapat nomor (INV-14)', async () => {
    const t = txTiruan([{ ...MENUNGGU('s1'), status: 'DRAFT' }]);
    const r = await alokasiNomor(t.tx, KONTEKS, 's1');
    expect(r).toMatchObject({ ok: false, kode: 'STATUS_TIDAK_SESUAI' });
    expect(r.ok === false && r.pesan).toMatch(/DRAFT/);
    expect(t.panggilFungsi()).toHaveLength(0);
  });

  it('surat yang sudah bernomor mengembalikan nomor yang sama (retry approval)', async () => {
    const t = txTiruan([{ ...MENUNGGU('s1'), status: 'DISETUJUI', nomor_lengkap: '05/007/UN43.3.7/HMIF/X/2026' }]);
    expect(await alokasiNomor(t.tx, KONTEKS, 's1')).toEqual({ ok: true, nomor: '05/007/UN43.3.7/HMIF/X/2026' });
    expect(t.panggilFungsi()).toHaveLength(0);
  });
});

describe('alokasiNomorBatch', () => {
  it('semua sah → satu panggilan alokasi_nomor_batch, id duplikat dibuang', async () => {
    const t = txTiruan([MENUNGGU('a'), MENUNGGU('b')], [
      { surat_id: 'a', nomor: '02/010/UN43.3.7/HMIF/X/2026' },
      { surat_id: 'b', nomor: '02/011/UN43.3.7/HMIF/X/2026' },
    ]);
    const r = await alokasiNomorBatch(t.tx, KONTEKS, ['a', 'b', 'a']);
    expect(r).toEqual({
      ok: true,
      nomor: [
        { suratId: 'a', nomor: '02/010/UN43.3.7/HMIF/X/2026' },
        { suratId: 'b', nomor: '02/011/UN43.3.7/HMIF/X/2026' },
      ],
    });
    expect(t.panggilFungsi()).toHaveLength(1);
    expect(t.panggilFungsi()[0]?.nilai).toEqual([['a', 'b'], 'approver-1']);
  });

  it('satu surat tidak sah menggagalkan seluruh batch sebelum counter disentuh', async () => {
    const t = txTiruan([MENUNGGU('a'), { ...MENUNGGU('b'), status: 'DITOLAK' }]);
    expect(await alokasiNomorBatch(t.tx, KONTEKS, ['a', 'b'])).toMatchObject({
      ok: false,
      kode: 'STATUS_TIDAK_SESUAI',
      suratId: 'b',
    });
    expect(t.panggilFungsi()).toHaveLength(0);
  });

  it(`lebih dari ${MAKS_BATCH_NOMOR} surat ditolak tanpa query`, async () => {
    const t = txTiruan([]);
    const ids = Array.from({ length: MAKS_BATCH_NOMOR + 1 }, (_, i) => `s${i}`);
    expect(await alokasiNomorBatch(t.tx, KONTEKS, ids)).toMatchObject({ ok: false, kode: 'BATCH_TERLALU_BESAR' });
    expect(t.query).toHaveLength(0);
  });

  it('batas batch sama dengan fungsi database', () => {
    const sql = fs.readFileSync(path.join(AKAR, 'supabase/migrations/014b_functions_surat.sql'), 'utf8');
    expect(sql).toMatch(new RegExp(`> ${MAKS_BATCH_NOMOR}\\b`));
  });
});

// ---------------------------------------------------------------------------
// Badge & salin
// ---------------------------------------------------------------------------

describe('NomorSuratBadge', () => {
  const FINAL = '05/379/UN43.3.7/KT2HMIF/VIII/2025';

  it('sementara: keterangan tertulis, ikon, tanpa tombol salin', () => {
    const html = renderToStaticMarkup(React.createElement(NomorSuratBadge, { nomor: previewNomor(DASAR) }));
    expect(html).toContain('data-keadaan="sementara"');
    expect(html).toContain(TEKS_SEMENTARA);
    expect(html).toContain('lucide-clock');
    expect(html).not.toContain('<button');
  });

  it('final: font mono, ikon centang, tombol salin berlabel — tanpa teks sementara', () => {
    const html = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(NomorSuratBadge, { nomor: FINAL })),
    );
    expect(html).toContain('data-keadaan="final"');
    expect(html).toMatch(/class="mono[^"]*"[^>]*>05\/379\/UN43\.3\.7\/KT2HMIF\/VIII\/2025</);
    expect(html).toContain('lucide-badge-check');
    expect(html).toContain(`aria-label="Salin nomor surat ${FINAL}"`);
    expect(html).not.toContain(TEKS_SEMENTARA);
  });

  it('keadaan dapat dipaksa lewat prop', () => {
    const html = renderToStaticMarkup(React.createElement(NomorSuratBadge, { nomor: FINAL, sementara: true }));
    expect(html).toContain('data-keadaan="sementara"');
  });
});

describe('salinNomor', () => {
  const asli = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  afterEach(() => {
    if (asli) Object.defineProperty(navigator, 'clipboard', asli);
    else Reflect.deleteProperty(navigator, 'clipboard');
  });

  function pasangClipboard(writeText: (t: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  }
  const toastTiruan = () => ({ success: vi.fn(), error: vi.fn() });

  it('berhasil → isi clipboard = nomor, toast sukses', async () => {
    const tulis = vi.fn().mockResolvedValue(undefined);
    pasangClipboard(tulis);
    const toast = toastTiruan();
    expect(await salinNomor('05/379/UN43.3.7/KT2HMIF/VIII/2025', toast)).toBe(true);
    expect(tulis).toHaveBeenCalledWith('05/379/UN43.3.7/KT2HMIF/VIII/2025');
    expect(toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nomor surat disalin' }));
  });

  it('browser menolak clipboard → toast galat dengan saran', async () => {
    pasangClipboard(() => Promise.reject(new Error('NotAllowedError')));
    const toast = toastTiruan();
    expect(await salinNomor('05/379/UN43.3.7/KT2HMIF/VIII/2025', toast)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.objectContaining({ suggestion: expect.any(String) }));
  });

  it('nomor sementara tidak pernah sampai ke clipboard', async () => {
    const tulis = vi.fn().mockResolvedValue(undefined);
    pasangClipboard(tulis);
    const toast = toastTiruan();
    expect(await salinNomor(previewNomor(DASAR), toast)).toBe(false);
    expect(tulis).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
