import { notFound, redirect } from 'next/navigation';

import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';

/**
 * Penjaga akses Arsip Surat. Ditaruh di LAYOUT, bukan hanya di halaman:
 * `loading.tsx` segmen ini membuat Next mulai streaming sebelum halaman
 * berjalan, sehingga `notFound()` dari halaman menghasilkan HTTP 200 dengan
 * isi 404 (diukur di gate arsip-surat). Layout dirender sebelum batas loading,
 * jadi penolakan di sini tetap 404 sungguhan.
 */
export default async function ArsipLayout({ children }: { children: React.ReactNode }) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'surat.read')) notFound();
  return children;
}
