/**
 * Test import massal pengguna (T-048 · ADR-054). Tanpa database dan Supabase:
 * kueri lewat klien tiruan, `undang()` di-mock.
 *
 * Dua jaminan yang dijaga di sini: pratinjau TIDAK PERNAH menulis, dan simpan
 * memproses per baris dengan laporan yang cocok untuk batch 100 baris.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Konteks } from '../guard';

const undangTiruan = vi.fn();
vi.mock('../invitation', () => ({ undang: (...a: unknown[]) => undangTiruan(...a) }));

const {
  KOLOM_IMPORT_PENGGUNA,
  pratinjauImportPengguna,
  simpanImportPengguna,
  skemaBarisPengguna,
} = await import('../import-pengguna');

const DEPT = { id: '33333333-3333-4333-8333-333333333333', kode: 'KAD', nama: 'Kaderisasi' };
const KONTEKS = {
  sesi: { userId: '11111111-1111-4111-8111-111111111111' },
  periodeId: '22222222-2222-4222-8222-222222222222',
  roles: ['ADMIN'],
  departemenIds: [],
} as unknown as Konteks;

const HEADER = ['Nama Lengkap', 'NIM', 'Email', 'Angkatan', 'Peran', 'Departemen'];

function klienTiruan(hasil: unknown[][]) {
  const sql: string[] = [];
  let ke = 0;
  const rekam = (strings: TemplateStringsArray) => {
    sql.push(strings.join('?').replace(/\s+/g, ' ').trim());
    return Promise.resolve(hasil[ke++] ?? []);
  };
  return { sql, klien: { $queryRaw: rekam, $executeRaw: rekam } as never };
}

const jalankan = vi.fn(async (fn: (tx: never) => Promise<unknown>) => fn({} as never)) as never;

beforeEach(() => {
  undangTiruan.mockReset();
  (jalankan as unknown as ReturnType<typeof vi.fn>).mockClear();
});

// ---------------------------------------------------------------------------

describe('skemaBarisPengguna — teks sel menjadi undangan', () => {
  const skema = skemaBarisPengguna([DEPT]);
  const baris = (ubah: Record<string, string>) =>
    skema.safeParse({
      nama_lengkap: 'Nadia Putri',
      nim: '3337220100',
      email: 'Nadia@Untirta.ac.id',
      angkatan: '2022',
      peran: 'Anggota',
      departemen: 'KAD',
      no_hp: '',
      ...ubah,
    });

  it('label peran dan kode departemen dipetakan ke peran berdepartemen', () => {
    const h = baris({ peran: 'Kepala Departemen' });
    expect(h.success).toBe(true);
    expect(h.data?.roles).toEqual([{ role: 'KADEPT', departemen_id: DEPT.id }]);
    expect(h.data?.email).toBe('nadia@untirta.ac.id');
  });

  it('beberapa peran dalam satu sel; departemen hanya untuk peran yang memerlukannya', () => {
    const h = baris({ peran: 'Sekum, Anggota', departemen: 'Departemen Kaderisasi' });
    expect(h.data?.roles).toEqual([{ role: 'SEKUM' }, { role: 'ANGGOTA', departemen_id: DEPT.id }]);
  });

  it('peran tak dikenal menjadi error pada kolom peran', () => {
    const h = baris({ peran: 'Presiden' });
    expect(h.success).toBe(false);
    expect(h.error?.issues[0]?.path).toEqual(['peran']);
  });

  it('KADEPT tanpa departemen ditolak dengan aturan yang sama seperti undangan satuan', () => {
    const h = baris({ peran: 'Kadept', departemen: '' });
    expect(h.success).toBe(false);
    expect(h.error?.issues.some((i) => i.message.includes('wajib memiliki departemen'))).toBe(true);
  });

  it('departemen tak dikenal dan angkatan bukan tahun ditolak', () => {
    expect(baris({ departemen: 'Humas' }).error?.issues[0]?.path).toEqual(['departemen']);
    expect(baris({ angkatan: '22' }).error?.issues[0]?.path).toEqual(['angkatan']);
  });
});

// ---------------------------------------------------------------------------

describe('pratinjauImportPengguna — tidak menulis apa pun', () => {
  it('menandai duplikat berkas & sistem, dan hanya menjalankan SELECT', async () => {
    const matriks = [
      HEADER,
      ['Ayu Lestari', '3337220001', 'ayu@uji.test', '2022', 'Anggota', 'KAD'],
      ['Budi Santoso', '3337220002', 'budi@uji.test', '2022', 'Sekum', ''], // NIM sudah ada
      ['Citra Dewi', '3337220003', 'sama@uji.test', '2023', 'Anggota', 'KAD'],
      ['Dimas Raka', '3337220004', 'sama@uji.test', '2023', 'Anggota', 'KAD'], // email kembar
      ['Eka', '3337220005', '', '2023', 'Anggota', 'KAD'], // error: nama pendek, email kosong
    ];
    const { sql, klien } = klienTiruan([[DEPT], [{ nim: '3337220002', email: 'lama@uji.test' }]]);

    const p = await pratinjauImportPengguna(matriks, {}, klien);

    expect(p.baris.map((b) => b.status)).toEqual(['VALID', 'PERINGATAN', 'PERINGATAN', 'PERINGATAN', 'ERROR']);
    expect(p.baris.find((b) => b.nomor === 3)?.terdaftar).toBe(true);
    expect(p.baris.find((b) => b.nomor === 2)?.terdaftar).toBe(false);
    expect(p.baris[4]?.sel[0]).toBe('Eka'); // sel mentah tetap ada untuk baris ERROR
    expect(p.ringkas).toEqual({ total: 5, valid: 1, peringatan: 3, error: 1 });

    // Klausa "Jangan" T-048: tidak ada penulisan sebelum konfirmasi.
    expect(sql.every((s) => s.startsWith('SELECT'))).toBe(true);
    expect(undangTiruan).not.toHaveBeenCalled();
  });

  it('kolom wajib yang hilang dilaporkan untuk layar pemetaan', async () => {
    const { klien } = klienTiruan([[DEPT]]);
    const p = await pratinjauImportPengguna([['Nama', 'NIM'], ['Ayu Lestari', '3337220001']], {}, klien);
    expect(p.hilang).toEqual(expect.arrayContaining(['email', 'peran']));
    expect(p.header).toEqual(['Nama', 'NIM']);
  });
});

// ---------------------------------------------------------------------------

function seratusBaris(): string[][] {
  const m = [HEADER];
  for (let i = 1; i <= 100; i++) {
    const n = String(i).padStart(3, '0');
    m.push([`Pengurus Uji ${n}`, `3337229${n}`, `uji${n}@uji.test`, '2023', 'Anggota', 'KAD']);
  }
  return m;
}

describe('simpanImportPengguna — per baris, dengan laporan', () => {
  it('batch 100 baris: dilewati tidak pernah diundang, gagal satu baris tidak menghentikan sisanya', async () => {
    const { klien } = klienTiruan([[DEPT], []]);
    undangTiruan.mockImplementation(async (_tx, _k, data: { email: string }) => {
      if (['uji020@uji.test', 'uji040@uji.test', 'uji060@uji.test'].includes(data.email)) {
        return { ok: false, kode: 'EMAIL_TERDAFTAR', pesan: `Email ${data.email} sudah terdaftar.` };
      }
      if (data.email === 'uji080@uji.test') throw new Error('koneksi putus');
      return { ok: true, nilai: { tautan: `http://x/undangan/${data.email}`, kedaluwarsa: '2026-10-04' } };
    });

    // Nomor baris berkas: data ke-5 = baris 6, data ke-10 = baris 11.
    const h = await simpanImportPengguna(jalankan, KONTEKS, seratusBaris(), { lewati: [6, 11] }, 'http://x', klien);

    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.nilai.berhasil).toHaveLength(94);
    expect(h.nilai.gagal).toHaveLength(4);
    expect(h.nilai.dilewati.map((d) => d.nomor)).toEqual([6, 11]);
    expect(h.nilai.gagal.find((g) => g.email === 'uji080@uji.test')?.pesan).toMatch(/Kesalahan sistem/);

    // Setiap baris adalah unit sendiri — satu transaksi berkonteks audit per baris.
    expect(jalankan).toHaveBeenCalledTimes(98);
    const diundang = undangTiruan.mock.calls.map((c) => (c[2] as { email: string }).email);
    expect(diundang).not.toContain('uji005@uji.test');
    expect(diundang).not.toContain('uji010@uji.test');
    // Tautan dikembalikan per nomor baris supaya Admin tahu milik siapa.
    expect(h.nilai.berhasil[0]).toMatchObject({ nomor: 2, email: 'uji001@uji.test' });
  });

  it('kegagalan sistem beruntun menghentikan percobaan sisa baris', async () => {
    const { klien } = klienTiruan([[DEPT], []]);
    undangTiruan.mockRejectedValue(new Error('Supabase mati'));

    const h = await simpanImportPengguna(jalankan, KONTEKS, seratusBaris().slice(0, 11), {}, 'http://x', klien);

    expect(undangTiruan).toHaveBeenCalledTimes(3);
    if (!h.ok) throw new Error('harus ok');
    expect(h.nilai.gagal).toHaveLength(10);
    expect(h.nilai.gagal[9]?.pesan).toMatch(/Tidak dicoba/);
  });

  it('kolom wajib belum dipetakan: tidak ada satu pun undangan', async () => {
    const { klien } = klienTiruan([[DEPT]]);
    const h = await simpanImportPengguna(jalankan, KONTEKS, [['Nama'], ['Ayu Lestari']], {}, 'http://x', klien);

    expect(h.ok).toBe(false);
    expect(undangTiruan).not.toHaveBeenCalled();
  });

  it('definisi kolom memuat seluruh medan wajib undangan', () => {
    const wajib = KOLOM_IMPORT_PENGGUNA.filter((k) => k.wajib).map((k) => k.kunci);
    expect(wajib).toEqual(['nama_lengkap', 'nim', 'email', 'peran']);
  });
});
