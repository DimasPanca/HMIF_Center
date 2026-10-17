import { DatabaseBackup } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { BackupPanel } from '@/components/backup/BackupPanel';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { NAMA_SISTEM } from '@/lib/backup/restore';

export const dynamic = 'force-dynamic';

/** Backup tiga lapis (T-110, PRD F-16.1): riwayat, progres, dan "Backup Sekarang" untuk Admin. */
export default async function BackupPage() {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'backup.read')) notFound();

  return (
    <main data-testid="backup-page" className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <DatabaseBackup className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
              Administrasi sistem
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold">Backup</h1>
            <p className="mt-1 max-w-3xl text-[14px] leading-5 text-secondary">
              Setiap bundel berisi dump database, ekspor JSON 12 modul, Excel RAB & daftar surat,
              serta arsip seluruh berkas — masing-masing dengan checksum SHA-256 di manifest. Backup
              hanya dinyatakan sukses setelah seluruh berkasnya terverifikasi ulang.
            </p>
          </div>
        </header>

        <BackupPanel bolehKelola={can(konteks.roles, 'backup.manage')} namaSistem={NAMA_SISTEM} />
      </div>
    </main>
  );
}
