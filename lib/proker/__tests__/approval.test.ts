/**
 * Test service approval (murni, lewat klien tiruan — tanpa database).
 *
 * Yang dijaga: keputusan yang mudah rusak diam-diam — setujui TERJADWAL yang
 * lolos MEMANGGIL bentuk_kepanitiaan; yang bentrok TIDAK, dan meneruskan daftar
 * konfliknya; non-TERJADWAL disetujui tanpa membentuk kepanitiaan; tolak/revisi
 * menuntut alasan dan hanya jalan dari status menunggu. Perilaku SQL nyata
 * (setujui_proker + bentuk_kepanitiaan) dibuktikan smoke DB + gate integrasi.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-070 · PRD F-5.4 · INV-05, INV-09
 */

import { describe, expect, it } from 'vitest';

import { setujuiProker, tolakProker, mintaRevisi } from '../approval';

interface Panggilan {
  sql: string;
  params: unknown[];
}

function klienTiruan(hasil: unknown[][] = []) {
  const panggilan: Panggilan[] = [];
  let ke = 0;
  const rekam = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const sql = strings.raw
      .map((s, i) => s + (i < params.length ? `$${i + 1}` : ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    panggilan.push({ sql, params });
    return Promise.resolve(hasil[ke++] ?? []);
  };
  return {
    panggilan,
    tx: { $queryRaw: rekam, $executeRaw: rekam } as unknown as Parameters<typeof setujuiProker>[0],
  };
}

const KONTEKS = {
  sesi: { userId: '11111111-1111-4111-8111-111111111111', email: 'k@hmif.test', namaLengkap: 'K', isActive: true },
  periodeId: '22222222-2222-4222-8222-222222222222',
  roles: ['KETUA'] as const,
  departemenIds: [] as string[],
};
const konteks = () => KONTEKS as unknown as Parameters<typeof setujuiProker>[1];

const proker = (o: Record<string, unknown>) => [{ id: 'p1', nama_departemen: 'X', ...o }];
const adaSql = (p: Panggilan[], s: string) => p.some((x) => x.sql.includes(s));

describe('setujuiProker', () => {
  it('TERJADWAL lolos: mengunci lalu MEMBENTUK kepanitiaan', async () => {
    const { tx, panggilan } = klienTiruan([
      proker({ status: 'MENUNGGU_APPROVAL', kategori: 'TERJADWAL' }),
      [{ hasil: { ok: true, locked: true } }],
      [{ hasil: { ok: true, dibentuk: true, kepanitiaan_id: 'k1' } }],
    ]);
    const r = await setujuiProker(tx, konteks(), 'p1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nilai.status).toBe('DISETUJUI');
      expect(r.nilai.locked).toBe(true);
      expect(r.nilai.kepanitiaan_id).toBe('k1');
    }
    expect(adaSql(panggilan, 'setujui_proker')).toBe(true);
    expect(adaSql(panggilan, 'bentuk_kepanitiaan')).toBe(true);
  });

  it('bentrok: meneruskan KONFLIK dan TIDAK membentuk kepanitiaan', async () => {
    const { tx, panggilan } = klienTiruan([
      proker({ status: 'MENUNGGU_APPROVAL', kategori: 'TERJADWAL' }),
      [{ hasil: { ok: false, reason: 'KONFLIK', konflik: [{ proker: 'A', departemen: 'B', mulai: '2027-05-01', selesai: '2027-05-02' }] } }],
    ]);
    const r = await setujuiProker(tx, konteks(), 'p1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kode).toBe('KONFLIK');
      expect(r.konflik).toHaveLength(1);
    }
    expect(adaSql(panggilan, 'bentuk_kepanitiaan')).toBe(false);
  });

  it('RESPONSIF: disetujui tanpa membentuk kepanitiaan', async () => {
    const { tx, panggilan } = klienTiruan([
      proker({ status: 'MENUNGGU_APPROVAL', kategori: 'RESPONSIF' }),
      [{ hasil: { ok: true, locked: false } }],
    ]);
    const r = await setujuiProker(tx, konteks(), 'p1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nilai.locked).toBe(false);
      expect(r.nilai.kepanitiaan_id).toBeUndefined();
    }
    expect(adaSql(panggilan, 'bentuk_kepanitiaan')).toBe(false);
  });

  it('TIDAK_DITEMUKAN bila proker tak ada', async () => {
    const { tx } = klienTiruan([[]]);
    const r = await setujuiProker(tx, konteks(), 'p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('TIDAK_DITEMUKAN');
  });

  it('STATUS_TIDAK_SESUAI bila bukan menunggu approval', async () => {
    const { tx, panggilan } = klienTiruan([proker({ status: 'DRAFT', kategori: 'TERJADWAL' })]);
    const r = await setujuiProker(tx, konteks(), 'p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('STATUS_TIDAK_SESUAI');
    expect(adaSql(panggilan, 'setujui_proker')).toBe(false);
  });
});

describe('tolakProker & mintaRevisi', () => {
  it('tolak: alasan wajib', async () => {
    const { tx } = klienTiruan([]);
    const r = await tolakProker(tx, 'p1', '   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('WAJIB_ALASAN');
  });

  it('tolak: dari MENUNGGU_APPROVAL → DITOLAK', async () => {
    const { tx, panggilan } = klienTiruan([
      proker({ status: 'MENUNGGU_APPROVAL', kategori: 'TERJADWAL' }),
      [],
    ]);
    const r = await tolakProker(tx, 'p1', 'Anggaran tidak realistis.');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.status).toBe('DITOLAK');
    expect(panggilan.some((p) => p.sql.includes('UPDATE proker') && p.params.includes('DITOLAK'))).toBe(true);
  });

  it('revisi: dari MENUNGGU_APPROVAL → PERLU_REVISI', async () => {
    const { tx, panggilan } = klienTiruan([
      proker({ status: 'MENUNGGU_APPROVAL', kategori: 'TERJADWAL' }),
      [],
    ]);
    const r = await mintaRevisi(tx, 'p1', 'Lengkapi rincian divisi.');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.status).toBe('PERLU_REVISI');
    expect(panggilan.some((p) => p.params.includes('PERLU_REVISI'))).toBe(true);
  });

  it('tolak: status yang tak dapat ditransisikan ditolak', async () => {
    const { tx } = klienTiruan([proker({ status: 'DISETUJUI', kategori: 'TERJADWAL' })]);
    const r = await tolakProker(tx, 'p1', 'alasan');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('STATUS_TIDAK_SESUAI');
  });
});
