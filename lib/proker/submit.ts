/**
 * submit — mengubah draft wizard menjadi proker sungguhan, dalam SATU transaksi.
 * SERVER-ONLY.
 *
 * ===========================================================================
 * SATU REQUEST ATOMIK, BUKAN DUA (ADR-056 §4)
 * ===========================================================================
 * Wizard belum punya proker_id sebelum submit — prokernya justru LAHIR dari
 * submit. Karena itu jalurnya `POST /api/proker/submit` (tanpa `[id]`), bukan
 * `/[id]/submit`. Alur `/[id]/submit` akan menuntut proker DRAFT dibuat lebih
 * dulu (request pertama) lalu diajukan (request kedua): dua request non-atomik
 * yang, bila yang kedua gagal, meninggalkan proker DRAFT yatim. Di sini semua
 * terjadi dalam satu `withAuditContext` (K-09): baca draft → validasi → buat
 * proker → simpan rencana → hapus draft. Bila apa pun gagal, seluruhnya urung.
 *
 * ===========================================================================
 * SUBMIT TIDAK MENGUNCI KALENDER (INV-10)
 * ===========================================================================
 * TERJADWAL/RESPONSIF lahir `MENUNGGU_APPROVAL`; BERKALA langsung `DISETUJUI`
 * karena tidak melewati approval (PRD F-5.1). TIDAK ada `proker_lock` yang
 * ditulis di sini — kunci hanya lahir dari `setujui_proker` saat approval (T-070,
 * INV-09). Bahkan BERKALA yang DISETUJUI tidak mengunci apa pun (ia bebas
 * bentrok). Kepanitiaan & Gantt disimpan sebagai RENCANA (proker_rencana),
 * bukan dibentuk — pembentukannya milik approval (kontrak T-069 "Jangan").
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-069 · ADR-056 ·
 *         docs/ai/WIZARD_SUBMIT_CONTRACT.md · PRD F-5.1, F-8.1 · INV-09, INV-10
 */

import type { Prisma } from '@prisma/client';

import type { TxKlien } from '@/lib/db/with-audit-context';
import type { Konteks } from '@/lib/auth/guard';

import { SkemaProker, type InputProker } from './schema';
import { butuhApproval, type ProkerStatus } from './status';
import { dalamLingkup } from './service';
import { ambilDraft, hapusDraft } from './draft-store';
import {
  keInputProker,
  keRencana,
  SkemaKepanitiaanRencana,
  SkemaGanttRencana,
  type RencanaKepanitiaan,
  type RencanaGantt,
} from './wizard-state';
import { simpanRencana } from './rencana-store';

// ---------------------------------------------------------------------------
// Hasil
// ---------------------------------------------------------------------------

export type KodeGagalSubmit =
  | 'TIDAK_ADA_PERIODE_AKTIF'
  | 'DRAFT_KOSONG'
  | 'TIDAK_VALID'
  | 'DI_LUAR_LINGKUP'
  | 'ANGGOTA_TIDAK_SAH';

export interface GagalSubmit {
  ok: false;
  kode: KodeGagalSubmit;
  pesan: string;
  /** Terisi untuk `TIDAK_VALID`/`ANGGOTA_TIDAK_SAH`: path field → pesan. */
  isu?: { path: string; pesan: string }[];
}

export interface SubmitTersimpan {
  proker_id: string;
  status: ProkerStatus;
}

export type HasilSubmit = { ok: true; nilai: SubmitTersimpan } | GagalSubmit;

/** Peta kode kegagalan → status HTTP (K-02/K-03). */
export const STATUS_GAGAL: Record<KodeGagalSubmit, number> = {
  TIDAK_ADA_PERIODE_AKTIF: 409,
  DRAFT_KOSONG: 409,
  TIDAK_VALID: 422,
  DI_LUAR_LINGKUP: 403,
  ANGGOTA_TIDAK_SAH: 422,
};

const DI_LUAR_LINGKUP: GagalSubmit = {
  ok: false,
  kode: 'DI_LUAR_LINGKUP',
  pesan: 'Proker ini bukan milik departemen Anda.',
};

function keIsu(e: unknown, awalan?: string): { path: string; pesan: string }[] {
  const issues = (e as { issues?: { path: PropertyKey[]; message: string }[] }).issues ?? [];
  return issues.map((i) => ({
    path: [awalan, ...i.path.map(String)].filter((x) => x !== undefined && x !== '').join('.'),
    pesan: i.message,
  }));
}

/** Seluruh app_user id yang dirujuk rencana kepanitiaan, tanpa duplikat. */
function idPengurusDirujuk(kepanitiaan: RencanaKepanitiaan): string[] {
  const set = new Set<string>();
  for (const id of [
    kepanitiaan.ketua_pelaksana,
    kepanitiaan.wakil_pelaksana,
    kepanitiaan.sekretaris,
    kepanitiaan.bendahara,
  ]) {
    if (id) set.add(id);
  }
  for (const d of kepanitiaan.divisi) {
    if (d.koordinator_id) set.add(d.koordinator_id);
    for (const a of d.anggota) set.add(a);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

/**
 * Mengajukan draft wizard milik sesi sebagai proker.
 *
 * `tx` wajib (K-09): audit context transaction-local, dan seluruh langkah harus
 * atomik. Tidak menerima proker_id — prokernya dibuat di sini dari draft.
 */
export async function submitWizard(tx: TxKlien, konteks: Konteks): Promise<HasilSubmit> {
  if (!konteks.periodeId) {
    return {
      ok: false,
      kode: 'TIDAK_ADA_PERIODE_AKTIF',
      pesan: 'Belum ada periode kepengurusan yang aktif.',
    };
  }

  const draft = await ambilDraft(konteks, tx);
  if (!draft) {
    return { ok: false, kode: 'DRAFT_KOSONG', pesan: 'Tidak ada draft proker untuk diajukan.' };
  }

  // Langkah 1-3 divalidasi penuh oleh SkemaProker (discriminated union).
  const parsed = SkemaProker.safeParse(keInputProker(draft.data));
  if (!parsed.success) {
    return {
      ok: false,
      kode: 'TIDAK_VALID',
      pesan: 'Data proker belum lengkap atau tidak memenuhi aturan.',
      isu: keIsu(parsed.error),
    };
  }
  const v: InputProker = parsed.data;

  if (!dalamLingkup(konteks, 'proker.create', v.departemen_id)) return DI_LUAR_LINGKUP;

  // Langkah 4-5 hanya untuk TERJADWAL. Divalidasi lalu diperiksa keanggotaannya.
  let rencana: { kepanitiaan: RencanaKepanitiaan; gantt: RencanaGantt } | null = null;
  if (v.kategori === 'TERJADWAL') {
    const mentah = keRencana(draft.data);

    const kp = SkemaKepanitiaanRencana.safeParse(mentah.kepanitiaan);
    if (!kp.success) {
      return {
        ok: false,
        kode: 'TIDAK_VALID',
        pesan: 'Susunan kepanitiaan belum lengkap.',
        isu: keIsu(kp.error, 'kepanitiaan'),
      };
    }
    const gt = SkemaGanttRencana.safeParse(mentah.gantt);
    if (!gt.success) {
      return {
        ok: false,
        kode: 'TIDAK_VALID',
        pesan: 'Struktur Gantt belum lengkap.',
        isu: keIsu(gt.error, 'gantt'),
      };
    }

    // Ketua Pelaksana & anggota harus pengurus AKTIF (boleh lintas departemen —
    // PRD F-8.1). Dicek terhadap app_user.is_active, sumber yang sama dengan
    // picker /proker/baru. Divalidasi di server karena wizard-state (klien)
    // tak dapat memastikan keaktifan.
    const dirujuk = idPengurusDirujuk(kp.data);
    if (dirujuk.length > 0) {
      const aktif = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM app_user WHERE id = ANY(${dirujuk}::uuid[]) AND is_active = true
      `;
      if (aktif.length !== dirujuk.length) {
        return {
          ok: false,
          kode: 'ANGGOTA_TIDAK_SAH',
          pesan: 'Ada anggota kepanitiaan yang bukan pengurus aktif.',
          isu: [{ path: 'kepanitiaan', pesan: 'Pilih hanya pengurus yang masih aktif.' }],
        };
      }
    }

    rencana = { kepanitiaan: kp.data, gantt: gt.data };
  }

  // TERJADWAL/RESPONSIF menunggu approval; BERKALA langsung disetujui (PRD F-5.1).
  const status: ProkerStatus = butuhApproval(v.kategori) ? 'MENUNGGU_APPROVAL' : 'DISETUJUI';

  // INSERT langsung dalam status target — BUKAN lewat buatProker() yang memaksa
  // DRAFT lalu menuntut transisi terlarang DRAFT->DISETUJUI. `disetujui_at`
  // diisi hanya untuk BERKALA (auto), tanpa `disetujui_oleh` karena tak ada
  // approver manusia. TIDAK ada proker_lock: kunci hanya dari setujui_proker.
  const baris = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO proker (
      periode_id, departemen_id, nama, kategori, status,
      deskripsi, tujuan, sasaran, estimasi_peserta, penanggung_jawab,
      tanggal_mulai_persiapan, tanggal_hari_h_mulai, tanggal_hari_h_selesai,
      pola_ulang, estimasi_anggaran, sumber_dana, dibuat_oleh,
      diajukan_at, disetujui_at
    ) VALUES (
      ${konteks.periodeId}::uuid,
      ${v.departemen_id}::uuid,
      ${v.nama},
      ${v.kategori}::proker_kategori,
      ${status}::proker_status,
      ${v.deskripsi ?? null},
      ${v.tujuan ?? null},
      ${v.sasaran ?? null},
      ${v.estimasi_peserta ?? null}::int,
      ${v.penanggung_jawab ?? null}::uuid,
      ${v.tanggal_mulai_persiapan ?? null}::date,
      ${v.tanggal_hari_h_mulai ?? null}::date,
      ${v.tanggal_hari_h_selesai ?? null}::date,
      ${(v.pola_ulang ?? null) as Prisma.InputJsonValue | null}::jsonb,
      ${v.estimasi_anggaran ?? null}::numeric,
      ${v.sumber_dana ?? []}::text[],
      ${konteks.sesi.userId}::uuid,
      now(),
      CASE WHEN ${status}::proker_status = 'DISETUJUI' THEN now() ELSE NULL END
    )
    RETURNING id
  `;
  const prokerId = baris[0]!.id;

  if (rencana) {
    await simpanRencana(tx, prokerId, konteks.periodeId, rencana.kepanitiaan, rencana.gantt);
  }

  // Hapus draft HANYA setelah semua sukses (kontrak T-068). Dalam transaksi yang
  // sama, jadi kegagalan mana pun mengurungkan penghapusan ini juga.
  await hapusDraft(tx, konteks);

  return { ok: true, nilai: { proker_id: prokerId, status } };
}
