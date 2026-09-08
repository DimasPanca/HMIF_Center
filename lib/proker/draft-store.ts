/**
 * draft-store — persistensi draft wizard proker. SERVER-ONLY.
 *
 * Dipisahkan dari `wizard-state.ts` justru karena berkas itu harus tetap aman
 * diimpor komponen klien. Berkas INI menyentuh database, jadi ia tidak boleh
 * pernah ikut ke bundle browser — penjaga runtime di bawah melengkapi
 * `npm run check:secrets` dan `npm run check:lazy-env`.
 *
 * ===========================================================================
 * DRAFT DI SERVER, BUKAN localStorage (kontrak T-068, klausa "Jangan")
 * ===========================================================================
 * Satu draft per pengguna per periode (UNIQUE di migrasi 020). `simpanDraft`
 * memakai UPSERT: menyimpan berulang saat wizard berpindah langkah tidak
 * menumpuk baris, hanya memperbarui yang ada. Meninggalkan wizard lalu kembali
 * memanggil `ambilDraft` dan memulihkan seluruh isian — itu sebabnya draft tidak
 * boleh hanya di localStorage: perangkat lain, atau tab yang tertutup, tetap
 * dapat melanjutkan.
 *
 * `data` disimpan apa adanya sebagai JSONB parsial. Validasinya milik
 * `wizard-state.ts`; store ini hanya menyimpan dan mengembalikan, tidak menilai
 * kelengkapan — draft memang boleh separuh jadi.
 *
 * Seluruh mutasi menerima `tx` dari `withAuditContext` (K-09), sama seperti
 * service proker dan periode.
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-068 · docs/ai/WIZARD_PROKER_CONTRACT.md
 *         · migrasi 020 · K-09
 */

import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import type { Konteks } from '@/lib/auth/guard';
import type { NomorLangkah, WizardDraft } from './wizard-state';

if (typeof window !== 'undefined') {
  throw new Error('lib/proker/draft-store.ts adalah modul server-only.');
}

export interface DraftTersimpan {
  id: string;
  data: WizardDraft;
  langkah: NomorLangkah;
  updated_at: string;
}

export type KodeGagalDraft = 'TIDAK_ADA_PERIODE_AKTIF';

export interface GagalDraft {
  ok: false;
  kode: KodeGagalDraft;
  pesan: string;
}

export type Hasil<T> = { ok: true; nilai: T } | GagalDraft;

export const STATUS_GAGAL: Record<KodeGagalDraft, number> = {
  TIDAK_ADA_PERIODE_AKTIF: 409,
};

/**
 * Draft milik pengguna pada periode aktif, atau `null` bila belum ada.
 *
 * `user_id` diambil dari konteks sesi, tidak pernah dari parameter pemanggil —
 * draft bersifat pribadi (RLS `user_id = auth.uid()`), dan menerima user_id dari
 * luar membuka jalan membaca draft orang lain.
 */
export async function ambilDraft(
  konteks: Konteks,
  klien: TxKlien | typeof db = db,
): Promise<DraftTersimpan | null> {
  if (!konteks.periodeId) return null;

  const baris = await klien.$queryRaw<
    { id: string; data: WizardDraft; langkah: number; updated_at: string }[]
  >`
    SELECT id, data,
           langkah,
           to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
    FROM proker_draft
    WHERE user_id = ${konteks.sesi.userId}::uuid AND periode_id = ${konteks.periodeId}::uuid
  `;

  const d = baris[0];
  if (!d) return null;
  return { id: d.id, data: d.data, langkah: d.langkah as NomorLangkah, updated_at: d.updated_at };
}

/**
 * Menyimpan (atau memperbarui) draft pengguna pada periode aktif.
 *
 * UPSERT lewat `proker_draft_satu_per_user_periode`: langkah demi langkah wizard
 * menimpa baris yang sama, tidak menumpuk. `langkah` menyimpan posisi terjauh
 * supaya wizard dapat memulihkan tempat berhenti.
 */
export async function simpanDraft(
  tx: TxKlien,
  konteks: Konteks,
  data: WizardDraft,
  langkah: NomorLangkah,
): Promise<Hasil<{ id: string }>> {
  if (!konteks.periodeId) {
    return {
      ok: false,
      kode: 'TIDAK_ADA_PERIODE_AKTIF',
      pesan: 'Belum ada periode kepengurusan yang aktif.',
    };
  }

  const baris = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO proker_draft (user_id, periode_id, data, langkah)
    VALUES (
      ${konteks.sesi.userId}::uuid,
      ${konteks.periodeId}::uuid,
      ${data as Prisma.InputJsonValue}::jsonb,
      ${langkah}::int
    )
    ON CONFLICT (user_id, periode_id) DO UPDATE
      SET data = EXCLUDED.data, langkah = EXCLUDED.langkah, updated_at = now()
    RETURNING id
  `;

  return { ok: true, nilai: { id: baris[0]!.id } };
}

/**
 * Menghapus draft pengguna pada periode aktif.
 *
 * Dipanggil setelah submit berhasil (T-069) supaya wizard berikutnya mulai
 * bersih, atau saat pengguna membuang draft. Tidak melempar bila draft tidak
 * ada — menghapus yang sudah tiada bukan kegagalan.
 */
export async function hapusDraft(tx: TxKlien, konteks: Konteks): Promise<Hasil<{ terhapus: number }>> {
  if (!konteks.periodeId) {
    return {
      ok: false,
      kode: 'TIDAK_ADA_PERIODE_AKTIF',
      pesan: 'Belum ada periode kepengurusan yang aktif.',
    };
  }

  const baris = await tx.$queryRaw<{ id: string }[]>`
    DELETE FROM proker_draft
    WHERE user_id = ${konteks.sesi.userId}::uuid AND periode_id = ${konteks.periodeId}::uuid
    RETURNING id
  `;

  return { ok: true, nilai: { terhapus: baris.length } };
}
