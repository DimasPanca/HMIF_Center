/**
 * Ambang deadline dari `app_config` (T-083 #2). Server-only.
 * Sumber: T-083 · migrasi 013/018 (deadline_warning_hari, deadline_critical_hari)
 */

import { db } from '@/lib/db/client';
import { normalkanAmbang, type AmbangDeadline } from '@/lib/deadline';
import { tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

if (typeof window !== 'undefined') {
  throw new Error('lib/deadline-config.ts adalah modul server-only.');
}

export async function ambangDeadline(): Promise<AmbangDeadline> {
  const baris = await db.app_config.findMany({
    where: { key: { in: ['deadline_warning_hari', 'deadline_critical_hari'] } },
    select: { key: true, value: true },
  });
  const nilai = (k: string) => baris.find((b) => b.key === k)?.value;
  return normalkanAmbang(nilai('deadline_warning_hari'), nilai('deadline_critical_hari'));
}

/** Ambang + "hari ini" Jakarta, untuk diteruskan dari halaman server ke klien. */
export async function konteksDeadline(): Promise<{ ambang: AmbangDeadline; hariIni: string }> {
  return { ambang: await ambangDeadline(), hariIni: tanggalHariIniJakarta() };
}
