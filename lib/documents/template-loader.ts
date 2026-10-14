/**
 * template-loader — berkas template dan aset dari storage, dengan cache memori.
 * Server-only.
 *
 * Cache aman tanpa invalidasi: setiap versi template punya key storage sendiri
 * (`template/{slug}_v{n}.docx`) dan isinya tidak pernah ditimpa (ADR-027).
 * Revisi template menghasilkan key baru, jadi entri lama tidak pernah basi —
 * ia hanya berhenti diminta.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-061 · SYSTEM_DESIGN §12.2 · ADR-027
 */

import { keys, storage } from '@/lib/storage';
import { TEMPLATE_UMUM, templateById } from '@/lib/surat/template-registry';

if (typeof window !== 'undefined') {
  throw new Error('lib/documents/template-loader.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

/** Nama aset stempel di `aset/` (SYSTEM_DESIGN §12.2). */
export const ASET_STEMPEL = 'stempel-hmif.png';

/** Batas jumlah entri; template + aset HMIF jauh di bawahnya. */
const MAKS_ENTRI = 32;
const cache = new Map<string, Promise<Buffer>>();

/**
 * Isi sebuah key storage, sekali unduh per proses. Unduhan yang gagal tidak
 * disimpan — percobaan berikutnya mengunduh lagi.
 */
export function muatBerkas(key: string): Promise<Buffer> {
  const ada = cache.get(key);
  if (ada) return ada;
  if (cache.size >= MAKS_ENTRI) cache.delete(cache.keys().next().value!);
  const janji = storage.get(key).catch((e: unknown) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, janji);
  return janji;
}

export function kosongkanCacheTemplate(): void {
  cache.clear();
}

export interface SumberTemplate {
  key: string;
  /** Untuk pesan galat dan log. */
  label: string;
}

/**
 * Template yang dipakai sebuah surat: versi yang TERCATAT di surat
 * (`template_id` menunjuk satu baris versi), bukan versi aktif saat ini —
 * surat lama yang di-generate ulang tetap memakai template aslinya.
 * Surat generik (01/06/07/09) tidak punya `template_id` dan memakai template
 * umum (ADR-028, ADR-029).
 */
export async function sumberTemplateSurat(templateId: string | null): Promise<SumberTemplate | null> {
  if (!templateId) {
    return { key: keys.template(TEMPLATE_UMUM.slug, TEMPLATE_UMUM.versi), label: `${TEMPLATE_UMUM.slug} v${TEMPLATE_UMUM.versi}` };
  }
  const t = await templateById(templateId);
  return t ? { key: t.storage_key, label: `${t.nama} v${t.versi}` } : null;
}

export function muatStempel(): Promise<Buffer> {
  return muatBerkas(keys.aset(ASET_STEMPEL));
}
