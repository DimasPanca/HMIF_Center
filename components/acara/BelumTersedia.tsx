'use client';

/**
 * `EmptyState` untuk bagian ruang kerja yang kosong atau belum tersedia
 * (T-084 kontrak 2): setiap tab menjelaskan dirinya, tidak ada halaman kosong.
 *
 * Pembungkus klien karena aksi `EmptyState` harus berupa `<Button>`, sedangkan
 * halaman ruang kerja adalah server component.
 */

import { CalendarRange, ClipboardList, FileText, FolderOpen, Receipt, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

const IKON = {
  gantt: CalendarRange,
  tugas: ClipboardList,
  dokumen: FileText,
  folder: FolderOpen,
  nota: Receipt,
  uang: Wallet,
} as const;

export function BelumTersedia({
  ikon,
  judul,
  penjelasan,
  aksi,
  testid,
}: {
  ikon: keyof typeof IKON;
  judul: string;
  penjelasan: string;
  aksi: { label: string; href: string };
  testid?: string;
}) {
  const router = useRouter();
  const Ikon = IKON[ikon];
  return (
    <EmptyState
      data-testid={testid}
      icon={<Ikon />}
      title={judul}
      description={penjelasan}
      action={<Button onClick={() => router.push(aksi.href)}>{aksi.label}</Button>}
    />
  );
}
