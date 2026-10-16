/**
 * Analisis keuangan LPJ (T-104, PRD F-12.2, SYSTEM_DESIGN §11.5).
 *
 * `analisisLpj` MURNI — bahan dari RAB (rencana), nota TERVERIFIKASI
 * (realisasi, lewat alokasi) dan pemasukan; tanpa DB sehingga dapat diuji
 * per skenario (`npm run test -- lpj-analyze`). `muatBahanLpj` mengumpulkan
 * bahannya; generator T-105 menyimpan hasilnya sebagai SNAPSHOT di
 * `lpj.analisis` — LPJ yang sudah terbit tidak dihitung ulang (kontrak 5).
 *
 *   kategori item  BELUM_REALISASI (aktual 0) · OVER_BUDGET · UNDER_BUDGET · SESUAI
 *   persen selisih null bila rencana 0 (tidak pernah membagi dengan nol)
 *   di luar RAB    alokasi `rab_item_id IS NULL` (ADR-006) — temuan, bukan daftar kosong
 *   total aktual   Σ total nota terverifikasi (= Σ alokasi, INV-28)
 *   dana tak terduga terpakai = min(cadangan, Σ kelebihan item over-budget
 *                  + Σ pengeluaran di luar RAB); sisanya dilaporkan sebagai
 *                  `kekuranganDanaTakTerduga`
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-104 · ADR-006 · ADR-007
 */

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { hitungTotalItem } from '@/lib/rab/calculate';
import type { NotaRealisasi } from '@/lib/rab/realisasi';
import { muatRab, notaTerverifikasi, sumberPemasukan } from '@/lib/rab/service';

export type KategoriItem = 'SESUAI' | 'OVER_BUDGET' | 'UNDER_BUDGET' | 'BELUM_REALISASI';

export interface ItemRencana {
  id: string;
  jenis_barang: string;
  section: string;
  rencana: number;
}

export interface BahanLpj {
  divisi: { id: string; nama: string; items: ItemRencana[] }[];
  /** Nota TERVERIFIKASI + total notanya. */
  nota: (NotaRealisasi & { total_nota: number })[];
  pemasukan: { keterangan: string; saldo: number }[];
  danaTakTerduga: number;
}

export interface ItemAnalysis {
  id: string;
  divisi: string;
  section: string;
  jenis_barang: string;
  rencana: number;
  aktual: number;
  selisih: number;
  /** null bila rencana 0 — tak ada persentase yang jujur. */
  persenSelisih: number | null;
  kategori: KategoriItem;
}

export interface DivisiAnalysis {
  id: string;
  nama: string;
  rencana: number;
  aktual: number;
  selisih: number;
  persenSelisih: number | null;
  /** Pengeluaran di luar RAB yang dicatat divisi ini (tidak masuk `aktual`). */
  diLuarRab: number;
}

export interface AlokasiLuarRab {
  nota_id: string;
  tanggal: string;
  divisi: string;
  uraian: string;
  nominal: number;
}

export interface AnalisisLpj {
  perItem: ItemAnalysis[];
  perDivisi: DivisiAnalysis[];
  overBudget: ItemAnalysis[];
  underBudget: ItemAnalysis[];
  belumRealisasi: ItemAnalysis[];
  diLuarRab: AlokasiLuarRab[];
  totalRencana: number;
  /** Σ total nota terverifikasi — sama persis dengan jumlah nota (PRD F-12.2). */
  totalAktual: number;
  totalDiLuarRab: number;
  totalPemasukan: number;
  pemasukan: { keterangan: string; saldo: number }[];
  sisaDana: number;
  danaTakTerduga: number;
  danaTakTerdugaTerpakai: number;
  kekuranganDanaTakTerduga: number;
  jumlahNota: number;
  dihitungAt: string;
}

export function persenSelisih(selisih: number, rencana: number): number | null {
  if (rencana === 0) return null;
  return Math.round((selisih / rencana) * 10_000) / 100;
}

export function kategoriItem(rencana: number, aktual: number): KategoriItem {
  if (aktual === 0) return 'BELUM_REALISASI';
  if (aktual > rencana) return 'OVER_BUDGET';
  if (aktual < rencana) return 'UNDER_BUDGET';
  return 'SESUAI';
}

export function analisisLpj(b: BahanLpj, sekarang: Date = new Date()): AnalisisLpj {
  const aktualPerItem = new Map<string, number>();
  const diLuarRab: AlokasiLuarRab[] = [];
  const luarPerDivisi = new Map<string, number>();
  for (const n of b.nota) {
    for (const a of n.alokasi) {
      if (a.rab_item_id) {
        aktualPerItem.set(a.rab_item_id, (aktualPerItem.get(a.rab_item_id) ?? 0) + a.nominal);
      } else {
        diLuarRab.push({
          nota_id: n.id,
          tanggal: n.tanggal,
          divisi: n.divisi,
          uraian: a.uraian_luar_rab ?? '-',
          nominal: a.nominal,
        });
        luarPerDivisi.set(n.divisi, (luarPerDivisi.get(n.divisi) ?? 0) + a.nominal);
      }
    }
  }

  const perItem: ItemAnalysis[] = b.divisi.flatMap((d) =>
    d.items.map((i) => {
      const aktual = aktualPerItem.get(i.id) ?? 0;
      const selisih = aktual - i.rencana;
      return {
        id: i.id,
        divisi: d.nama,
        section: i.section,
        jenis_barang: i.jenis_barang,
        rencana: i.rencana,
        aktual,
        selisih,
        persenSelisih: persenSelisih(selisih, i.rencana),
        kategori: kategoriItem(i.rencana, aktual),
      };
    }),
  );

  const perDivisi: DivisiAnalysis[] = b.divisi.map((d) => {
    const items = perItem.filter((i) => d.items.some((x) => x.id === i.id));
    const rencana = items.reduce((s, i) => s + i.rencana, 0);
    const aktual = items.reduce((s, i) => s + i.aktual, 0);
    return {
      id: d.id,
      nama: d.nama,
      rencana,
      aktual,
      selisih: aktual - rencana,
      persenSelisih: persenSelisih(aktual - rencana, rencana),
      diLuarRab: luarPerDivisi.get(d.nama) ?? 0,
    };
  });

  const totalRencana = perItem.reduce((s, i) => s + i.rencana, 0);
  const totalAktual = b.nota.reduce((s, n) => s + n.total_nota, 0);
  const totalDiLuarRab = diLuarRab.reduce((s, a) => s + a.nominal, 0);
  const totalPemasukan = b.pemasukan.reduce((s, p) => s + p.saldo, 0);
  const overBudget = perItem.filter((i) => i.kategori === 'OVER_BUDGET');
  const kebutuhan = overBudget.reduce((s, i) => s + i.selisih, 0) + totalDiLuarRab;
  const terpakai = Math.min(Math.max(b.danaTakTerduga, 0), kebutuhan);

  return {
    perItem,
    perDivisi,
    overBudget,
    underBudget: perItem.filter((i) => i.kategori === 'UNDER_BUDGET'),
    belumRealisasi: perItem.filter((i) => i.kategori === 'BELUM_REALISASI'),
    diLuarRab,
    totalRencana,
    totalAktual,
    totalDiLuarRab,
    totalPemasukan,
    pemasukan: b.pemasukan,
    sisaDana: totalPemasukan - totalAktual,
    danaTakTerduga: b.danaTakTerduga,
    danaTakTerdugaTerpakai: terpakai,
    kekuranganDanaTakTerduga: kebutuhan - terpakai,
    jumlahNota: b.nota.length,
    dihitungAt: sekarang.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Bahan dari DB
// ---------------------------------------------------------------------------

/** null = acara tak terlihat; 'TERBATAS' = angka RAB bukan hak pengguna. */
export async function muatBahanLpj(
  konteks: Konteks,
  kepanitiaanId: string,
): Promise<BahanLpj | 'TERBATAS' | null> {
  const rab = await muatRab(konteks, kepanitiaanId);
  if (rab === null || rab === 'TERBATAS') return rab;
  const divisiIds = rab.divisi.map((d) => d.id);
  const [nota, totals, pemasukan, peserta] = await Promise.all([
    notaTerverifikasi(divisiIds),
    divisiIds.length
      ? db.nota.findMany({
          where: { divisi_id: { in: divisiIds }, status: 'TERVERIFIKASI' },
          select: { id: true, total_nota: true },
        })
      : Promise.resolve([]),
    db.pemasukan.findMany({
      where: { kepanitiaan_id: kepanitiaanId },
      orderBy: { no_urut: 'asc' },
      select: { keterangan: true, saldo: true },
    }),
    db.peserta.findMany({
      where: { kepanitiaan_id: kepanitiaanId },
      select: { sudah_bayar: true, jumlah: true },
    }),
  ]);
  const total = new Map(totals.map((t) => [t.id, Number(t.total_nota)]));
  return {
    divisi: rab.divisi.map((d) => ({
      id: d.id,
      nama: d.nama,
      items: d.sections.flatMap((s) =>
        s.items.map((i) => ({
          id: i.id,
          jenis_barang: i.jenis_barang,
          section: s.nama,
          rencana: hitungTotalItem(i),
        })),
      ),
    })),
    nota: nota.map((n) => ({
      ...n,
      total_nota: total.get(n.id) ?? n.alokasi.reduce((s, a) => s + a.nominal, 0),
    })),
    pemasukan: sumberPemasukan(rab.nama_acara, peserta, pemasukan),
    danaTakTerduga: rab.dana_tak_terduga,
  };
}
