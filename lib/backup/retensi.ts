/**
 * retensi — pembersihan backup lama & batas backup manual. SERVER-ONLY.
 *
 * ADR-016: simpan **12 backup OTOMATIS terbaru** (yang SUKSES). Backup
 * `MANUAL` dan `PRA_RESTORE` TIDAK PERNAH dihapus otomatis — pra-restore
 * adalah jaring pengaman terakhir bila restore berujung salah. Penghapusan
 * mencakup seluruh objek storage di bawah prefix-nya DAN baris `backup`,
 * dicatat di `audit_log` (`BACKUP_HAPUS`).
 *
 * Backup OTOMATIS yang GAGAL tidak dihitung dan tidak dihapus: berkasnya
 * sudah dibersihkan saat gagal, barisnya adalah riwayat kegagalan.
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-111 · PRD F-16.2 · ADR-016
 */

import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db/client';
import { withServiceContext } from '@/lib/db/with-audit-context';
import { storage } from '@/lib/storage';
import type { StorageAdapter } from '@/lib/storage/adapter';
import { keys } from '@/lib/storage/keys';

import { jalankanBackup } from './service';

if (typeof window !== 'undefined') {
  throw new Error('lib/backup/retensi.ts adalah modul server-only.');
}

/** ADR-016. */
export const SIMPAN_OTOMATIS = 12;

export { BATAS_MANUAL_PER_HARI } from './service';

export interface BarisRetensi {
  id: string;
  jenis: 'OTOMATIS' | 'MANUAL' | 'PRA_RESTORE';
  status: 'BERJALAN' | 'SUKSES' | 'GAGAL';
  created_at: Date;
}

/**
 * Murni: id backup yang harus dihapus — OTOMATIS & SUKSES di luar 12 terbaru.
 * Jenis lain tidak pernah terpilih, apa pun jumlahnya.
 */
export function pilihUntukDihapus(baris: BarisRetensi[], simpan = SIMPAN_OTOMATIS): string[] {
  return baris
    .filter((b) => b.jenis === 'OTOMATIS' && b.status === 'SUKSES')
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id.localeCompare(a.id))
    .slice(simpan)
    .map((b) => b.id);
}

export interface HasilRetensi {
  dihapus: string[];
  gagal: { id: string; pesan: string }[];
}

/**
 * Menghapus backup OTOMATIS lama. Berkas dulu, baris kemudian: bila hapus
 * berkas gagal, barisnya dipertahankan supaya percobaan berikutnya masih
 * tahu prefix mana yang harus dibersihkan.
 */
export async function bersihkanBackupLama(
  storage: Pick<StorageAdapter, 'list' | 'delete'>,
): Promise<HasilRetensi> {
  const baris = await db.backup.findMany({
    where: { jenis: 'OTOMATIS', status: 'SUKSES' },
    select: {
      id: true,
      jenis: true,
      status: true,
      created_at: true,
      storage_key: true,
      ukuran_bytes: true,
    },
  });
  const target = new Set(pilihUntukDihapus(baris));
  const hasil: HasilRetensi = { dihapus: [], gagal: [] };

  for (const b of baris.filter((x) => target.has(x.id))) {
    try {
      const objek = await storage.list(keys.backupPrefix(b.id));
      for (const o of objek) await storage.delete(o.key);
      await db.$transaction(async (tx) => {
        await tx.backup.delete({ where: { id: b.id } });
        const nilai = {
          jenis: b.jenis,
          dibuat: b.created_at.toISOString(),
          ukuran_bytes: b.ukuran_bytes === null ? null : Number(b.ukuran_bytes),
          berkas: objek.length,
          alasan: `retensi ADR-016: di luar ${SIMPAN_OTOMATIS} backup otomatis terbaru`,
        };
        await tx.$executeRaw`
          INSERT INTO audit_log (aksi, entitas, entitas_id, nilai_lama, user_agent, periode_id)
          VALUES ('BACKUP_HAPUS', 'backup', ${b.id}, ${nilai as Prisma.InputJsonValue}::jsonb, 'sistem', periode_aktif())
        `;
      });
      hasil.dihapus.push(b.id);
    } catch (e) {
      hasil.gagal.push({ id: b.id, pesan: e instanceof Error ? e.message : String(e) });
    }
  }
  return hasil;
}

export type HasilBackupBulanan =
  | { dijalankan: false; alasan: string }
  | {
      dijalankan: true;
      backup: { ok: true; id: string; peringatan: string | null } | { ok: false; pesan: string };
      retensi: HasilRetensi | null;
    };

/**
 * Cabang tanggal 1 cron harian (ADR-009): backup OTOMATIS lalu retensi.
 * Idempoten per bulan WIB — cron yang terpanggil dua kali pada tanggal 1
 * tidak membuat dua backup bulanan. Retensi hanya dijalankan setelah backup
 * baru SUKSES, supaya kegagalan tidak sekaligus mengurangi cadangan lama.
 */
export async function backupBulanan(): Promise<HasilBackupBulanan> {
  const [ada] = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM backup
    WHERE jenis = 'OTOMATIS' AND status IN ('SUKSES', 'BERJALAN')
      AND created_at >= (date_trunc('month', hari_ini_jakarta())::timestamp AT TIME ZONE 'Asia/Jakarta')
    LIMIT 1`;
  if (ada) return { dijalankan: false, alasan: `Backup otomatis bulan ini sudah ada (${ada.id}).` };

  const h = await jalankanBackup((fn) => withServiceContext(fn), { jenis: 'OTOMATIS' });
  if (!h.ok) {
    return { dijalankan: true, backup: { ok: false, pesan: h.pesan }, retensi: null };
  }
  return {
    dijalankan: true,
    backup: { ok: true, id: h.id, peringatan: h.peringatan },
    retensi: await bersihkanBackupLama(storage),
  };
}
