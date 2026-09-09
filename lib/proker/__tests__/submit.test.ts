/**
 * Test service submit wizard (murni, lewat klien tiruan — tanpa database).
 *
 * Yang dijaga di sini justru yang mudah rusak diam-diam dan tak terlihat dari
 * tampilan: status hasil per kategori (MENUNGGU_APPROVAL vs DISETUJUI), bahwa
 * submit TIDAK PERNAH menyentuh `proker_lock` (INV-10), bahwa rencana kepanitiaan
 * disimpan untuk TERJADWAL dan tidak untuk yang lain, dan bahwa draft dihapus
 * hanya di jalur sukses. Perilaku SQL nyata terhadap skema diuji lewat migrasi
 * + gate E2E (integrasi setelah T-069-UI); di sini yang diperiksa keputusannya.
 *
 * Klien tiruan meniru $queryRaw Prisma (tagged template) dan mengembalikan hasil
 * per panggilan sesuai urutan — cukup untuk memeriksa jumlah round-trip, status
 * yang dipaksakan, dan tabel yang (tidak) disentuh.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-069 · ADR-056 ·
 *         docs/ai/WIZARD_SUBMIT_CONTRACT.md · INV-09, INV-10
 */

import { describe, expect, it } from 'vitest';

import { submitWizard } from '../submit';
import type { WizardDraft } from '../wizard-state';

// ---------------------------------------------------------------------------
// Klien tiruan
// ---------------------------------------------------------------------------

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
    tx: { $queryRaw: rekam, $executeRaw: rekam } as unknown as Parameters<typeof submitWizard>[0],
  };
}

const DEPT = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';
const KETUA = '55555555-5555-4555-8555-555555555555';
const PROKER = '99999999-9999-4999-8999-999999999999';

const KONTEKS = {
  sesi: { userId: USER, email: 'admin@hmif.test', namaLengkap: 'Admin', isActive: true },
  periodeId: '22222222-2222-4222-8222-222222222222',
  roles: ['ADMIN'] as const,
  departemenIds: [DEPT],
};
const konteks = (ubah: Partial<typeof KONTEKS> = {}) =>
  ({ ...KONTEKS, ...ubah }) as unknown as Parameters<typeof submitWizard>[1];

const DRAFT_TERJADWAL: WizardDraft = {
  departemen_id: DEPT,
  nama: 'SYNCHRONIZE',
  kategori: 'TERJADWAL',
  tanggal_mulai_persiapan: '2026-11-01',
  tanggal_hari_h_mulai: '2026-12-06',
  tanggal_hari_h_selesai: '2026-12-07',
  kepanitiaan: { ketua_pelaksana: KETUA, divisi: [{ nama: 'Acara' }] },
  gantt: {
    groups: [
      { nama: 'Persiapan', tasks: [{ nama: 'Rapat', tanggal_mulai: '2026-11-01', tanggal_selesai: '2026-11-02' }] },
    ],
  },
};

const DRAFT_BERKALA: WizardDraft = {
  departemen_id: DEPT,
  nama: 'Latihan Rutin',
  kategori: 'BERKALA',
  pola_ulang: { frekuensi: 'MINGGUAN', hari: ['SABTU'], mulai: '2026-09-01', selesai: '2027-06-30' },
};

/** Baris draft seperti dikembalikan SELECT proker_draft. */
const barisDraft = (data: WizardDraft, langkah = 6) => [
  { id: 'draft-1', data, langkah, updated_at: '2026-09-09T00:00:00+07' },
];

function adaSql(panggilan: Panggilan[], cuplikan: string): boolean {
  return panggilan.some((p) => p.sql.includes(cuplikan));
}

// ---------------------------------------------------------------------------
// Jalur sukses
// ---------------------------------------------------------------------------

describe('submitWizard — TERJADWAL', () => {
  it('membuat proker MENUNGGU_APPROVAL, menyimpan rencana, menghapus draft', async () => {
    const { tx, panggilan } = klienTiruan([
      barisDraft(DRAFT_TERJADWAL), // ambilDraft
      [{ id: KETUA }], // cek pengurus aktif
      [{ id: PROKER }], // INSERT proker
      [{ id: 'rencana-1' }], // simpanRencana
      [{ id: 'draft-1' }], // hapusDraft
    ]);

    const r = await submitWizard(tx, konteks());

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.status).toBe('MENUNGGU_APPROVAL');
    // Status yang dipaksakan ke INSERT proker.
    expect(panggilan.some((p) => p.params.includes('MENUNGGU_APPROVAL'))).toBe(true);
    // Rencana disimpan; draft dihapus.
    expect(adaSql(panggilan, 'INSERT INTO proker_rencana')).toBe(true);
    expect(adaSql(panggilan, 'DELETE FROM proker_draft')).toBe(true);
  });

  it('TIDAK PERNAH menyentuh proker_lock (INV-10)', async () => {
    const { tx, panggilan } = klienTiruan([
      barisDraft(DRAFT_TERJADWAL),
      [{ id: KETUA }],
      [{ id: PROKER }],
      [{ id: 'rencana-1' }],
      [{ id: 'draft-1' }],
    ]);
    await submitWizard(tx, konteks());
    expect(adaSql(panggilan, 'proker_lock')).toBe(false);
  });

  it('gagal ANGGOTA_TIDAK_SAH bila ketua bukan pengurus aktif', async () => {
    const { tx } = klienTiruan([
      barisDraft(DRAFT_TERJADWAL),
      [], // cek pengurus: tidak ada yang cocok
    ]);
    const r = await submitWizard(tx, konteks());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('ANGGOTA_TIDAK_SAH');
  });

  it('gagal TIDAK_VALID bila kepanitiaan tanpa Ketua Pelaksana', async () => {
    const draft = { ...DRAFT_TERJADWAL, kepanitiaan: { divisi: [{ nama: 'Acara' }] } };
    const { tx } = klienTiruan([barisDraft(draft)]);
    const r = await submitWizard(tx, konteks());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kode).toBe('TIDAK_VALID');
      expect(r.isu?.some((i) => i.path.startsWith('kepanitiaan'))).toBe(true);
    }
  });

  it('gagal TIDAK_VALID bila Gantt tanpa task', async () => {
    const draft = { ...DRAFT_TERJADWAL, gantt: { groups: [{ nama: 'Persiapan', tasks: [] }] } };
    const { tx } = klienTiruan([barisDraft(draft), [{ id: KETUA }]]);
    const r = await submitWizard(tx, konteks());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kode).toBe('TIDAK_VALID');
      expect(r.isu?.some((i) => i.path.startsWith('gantt'))).toBe(true);
    }
  });
});

describe('submitWizard — BERKALA', () => {
  it('langsung DISETUJUI, tanpa rencana, tanpa proker_lock', async () => {
    const { tx, panggilan } = klienTiruan([
      barisDraft(DRAFT_BERKALA), // ambilDraft
      [{ id: PROKER }], // INSERT proker
      [{ id: 'draft-1' }], // hapusDraft
    ]);

    const r = await submitWizard(tx, konteks());

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.status).toBe('DISETUJUI');
    expect(panggilan.some((p) => p.params.includes('DISETUJUI'))).toBe(true);
    expect(adaSql(panggilan, 'INSERT INTO proker_rencana')).toBe(false);
    expect(adaSql(panggilan, 'proker_lock')).toBe(false);
    expect(adaSql(panggilan, 'DELETE FROM proker_draft')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Jalur gagal awal
// ---------------------------------------------------------------------------

describe('submitWizard — penjagaan', () => {
  it('DRAFT_KOSONG bila tidak ada draft', async () => {
    const { tx } = klienTiruan([[]]); // ambilDraft → kosong
    const r = await submitWizard(tx, konteks());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('DRAFT_KOSONG');
  });

  it('TIDAK_ADA_PERIODE_AKTIF bila konteks tanpa periode', async () => {
    const { tx } = klienTiruan([]);
    const r = await submitWizard(tx, konteks({ periodeId: undefined }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('TIDAK_ADA_PERIODE_AKTIF');
  });

  it('TIDAK_VALID bila langkah 1-3 belum lengkap (mis. tanpa nama)', async () => {
    const draft = { ...DRAFT_BERKALA, nama: undefined };
    const { tx } = klienTiruan([barisDraft(draft as WizardDraft)]);
    const r = await submitWizard(tx, konteks());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kode).toBe('TIDAK_VALID');
  });
});
