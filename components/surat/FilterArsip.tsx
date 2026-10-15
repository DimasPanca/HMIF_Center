'use client';

/**
 * Bilah filter Arsip Surat (T-063). Setiap perubahan ditulis ke URL —
 * filter dapat dibagikan sebagai tautan — dan kursor halaman dibuang supaya
 * hasil selalu mulai dari halaman pertama.
 *
 * Test id: arsip-cari, arsip-cari-kirim, arsip-filter-{periode|jenis|bulan|
 * status|departemen|kegiatan}, arsip-filter-reset.
 */

import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DAFTAR_JENIS, infoJenis } from '@/lib/surat/field-schemas';
import { STATUS_ARSIP, queryDariFilter, type FilterArsip, type StatusArsip } from '@/lib/surat/filter-arsip';

export const LABEL_STATUS_ARSIP: Record<StatusArsip, string> = {
  DRAFT: 'Draf (milik saya)',
  MENUNGGU_APPROVAL: 'Menunggu persetujuan',
  DISETUJUI: 'Disetujui, belum terbit',
  TERBIT: 'Terbit',
  DITOLAK: 'Ditolak (milik saya)',
  DIBATALKAN: 'Dibatalkan',
};

export interface PilihanFilterArsip {
  periode: { id: string; nama: string; aktif: boolean }[];
  departemen: { id: string; nama: string }[];
  kegiatan: string[];
}

export function FilterArsipBar({
  filter,
  pilihan,
  periodeAktif,
}: {
  filter: FilterArsip;
  pilihan: PilihanFilterArsip;
  periodeAktif: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(filter.q ?? '');
  React.useEffect(() => setQ(filter.q ?? ''), [filter.q]);

  const terapkan = (ubah: Partial<Record<keyof FilterArsip, string | undefined>>) =>
    router.push(`${pathname}${queryDariFilter(filter, { ...ubah, cursor: undefined })}`);
  const pilih = (k: keyof FilterArsip) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    terapkan({ [k]: e.target.value || undefined });

  const adaFilter = Object.entries(filter).some(([k, v]) => k !== 'cursor' && v);

  return (
    <div className="space-y-3">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          terapkan({ q: q.trim() || undefined });
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            type="search"
            aria-label="Cari surat"
            placeholder="Cari perihal, tujuan, atau isi surat…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            data-testid="arsip-cari"
          />
        </div>
        <Button type="submit" variant="secondary" data-testid="arsip-cari-kirim">
          <Search aria-hidden="true" /> Cari
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Select
          aria-label="Periode"
          placeholder={null}
          value={filter.periode ?? periodeAktif}
          onChange={(e) => terapkan({ periode: e.target.value === periodeAktif ? undefined : e.target.value })}
          data-testid="arsip-filter-periode"
        >
          {pilihan.periode.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
              {p.aktif ? ' (aktif)' : ''}
            </option>
          ))}
        </Select>
        <Select aria-label="Jenis surat" placeholder={null} value={filter.jenis ?? ''} onChange={pilih('jenis')} data-testid="arsip-filter-jenis">
          <option value="">Semua jenis</option>
          {DAFTAR_JENIS.map((j) => (
            <option key={j} value={j}>
              {infoJenis(j).kode} · {infoJenis(j).nama}
            </option>
          ))}
        </Select>
        <Input
          type="month"
          aria-label="Bulan surat"
          value={filter.bulan ?? ''}
          onChange={pilih('bulan')}
          data-testid="arsip-filter-bulan"
        />
        <Select aria-label="Status" placeholder={null} value={filter.status ?? ''} onChange={pilih('status')} data-testid="arsip-filter-status">
          <option value="">Semua status</option>
          {STATUS_ARSIP.map((s) => (
            <option key={s} value={s}>
              {LABEL_STATUS_ARSIP[s]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Departemen"
          placeholder={null}
          value={filter.departemen ?? ''}
          onChange={pilih('departemen')}
          data-testid="arsip-filter-departemen"
        >
          <option value="">Semua departemen</option>
          {pilihan.departemen.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nama}
            </option>
          ))}
        </Select>
        <Select aria-label="Kegiatan" placeholder={null} value={filter.kegiatan ?? ''} onChange={pilih('kegiatan')} data-testid="arsip-filter-kegiatan">
          <option value="">Semua kegiatan</option>
          {pilihan.kegiatan.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </div>

      {adaFilter ? (
        <Link href={pathname} className={buttonVariants({ variant: 'ghost' })} data-testid="arsip-filter-reset">
          <X aria-hidden="true" /> Hapus semua filter
        </Link>
      ) : null}
    </div>
  );
}
