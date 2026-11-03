/** Pengambil fakta untuk jalur dokumen & tugas saya (ADR-039). Server saja. */

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { bolehBacaLpj } from '@/lib/lpj/generate';
import { bacaKetuaHimpunan } from '@/lib/surat/konfig';
import { kelengkapanTor, normalisasiTor } from '@/lib/tor/schema';

import type { FaktaJalur, StatusLpj, TugasSaya } from './jalur';
import type { RuangAcara } from './service';

/** Fakta jalur untuk acara yang sudah lolos `muatAcara` (visibilitas sudah dicek di sana). */
export async function muatJalur(konteks: Konteks, acara: RuangAcara): Promise<FaktaJalur> {
  const bacaLpj = bolehBacaLpj(konteks.roles);
  const [tor, rundown, proposal, lpj, ketuaHimpunan] = await Promise.all([
    db.tor.findUnique({ where: { kepanitiaan_id: acara.id }, select: { data: true } }),
    db.rundown.count({ where: { kepanitiaan_id: acara.id } }),
    db.proposal.findUnique({ where: { kepanitiaan_id: acara.id }, select: { id: true } }),
    bacaLpj ? db.lpj.findUnique({ where: { kepanitiaan_id: acara.id }, select: { status: true } }) : Promise.resolve(null),
    konteks.periodeId ? bacaKetuaHimpunan(konteks.periodeId) : Promise.resolve(null),
  ]);
  const k = kelengkapanTor(normalisasiTor(tor?.data ?? null, { nama_kegiatan: acara.nama_acara, tema: acara.tema }), {
    rundown,
    anggaran: (acara.ringkasan.total_rab ?? 0) > 0,
    penandatangan: !!acara.ketua_pelaksana && !!ketuaHimpunan,
  });
  return {
    acaraId: acara.id,
    dibatalkan: acara.status === 'DIBATALKAN',
    // TOR yang belum pernah disimpan tetap terhitung "belum" walau nama & tema terisi otomatis.
    tor: tor ? { terisi: k.terisi, total: k.total } : { terisi: 0, total: k.total },
    rab: acara.boleh_rab ? { status: acara.ringkasan.status_rab } : null,
    proposalTersimpan: !!proposal,
    hariH: { mulai: acara.hari_h_mulai, selesai: acara.hari_h_selesai },
    nota: acara.ringkasan.nota,
    lpj: bacaLpj ? ((lpj?.status as StatusLpj | undefined) ?? null) : 'TERBATAS',
  };
}

/** Kartu kanban acara ini yang ditugaskan ke pengguna dan belum selesai, tenggat terdekat dulu. */
export async function muatTugasSaya(konteks: Konteks, acara: RuangAcara): Promise<TugasSaya[]> {
  const divisi = new Map(acara.divisi.map((d) => [d.id, d.nama]));
  if (!divisi.size) return [];
  const kartu = await db.kanban_card.findMany({
    where: { assignee_id: konteks.sesi.userId, divisi_id: { in: [...divisi.keys()] }, kolom: { not: 'DONE' } },
    select: { id: true, judul: true, kolom: true, deadline: true, divisi_id: true },
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { urutan: 'asc' }],
    take: 8,
  });
  return kartu.map((k) => ({
    id: k.id,
    judul: k.judul,
    kolom: k.kolom as TugasSaya['kolom'],
    deadline: k.deadline ? k.deadline.toISOString().slice(0, 10) : null,
    divisi: { id: k.divisi_id!, nama: divisi.get(k.divisi_id!) ?? '' },
  }));
}
