'use client';

/**
 * Tabel Data Pengurus (T-107): cari & saring (di URL), tambah/ubah, import,
 * export, dan pilih banyak → "Buat Surat Aktif" (ke /surat/massal?pilih=).
 *
 * Test id: pengurus-tabel, pengurus-baris-{nim}, pengurus-cari, pengurus-filter-departemen,
 * pengurus-filter-status, pengurus-tambah, pengurus-import, pengurus-export,
 * pengurus-pilih-{id}, pengurus-pilih-semua, pengurus-ubah-{id}, pengurus-buat-surat, pengurus-jumlah.
 */

import { Download, FileSignature, Pencil, Upload, UserPlus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { FormPengurusDialog, type PengurusForm } from '@/components/pengurus/FormPengurusDialog';
import { ImportPengurusDialog } from '@/components/pengurus/ImportPengurusDialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DepartemenPilihan } from '@/lib/pengurus/skema';
import type { BarisPengurus } from '@/lib/pengurus/service';

const MAKS_SURAT = 50;

export function PengurusTable({
  baris,
  departemen,
  filter,
  izin,
}: {
  baris: BarisPengurus[];
  departemen: DepartemenPilihan[];
  filter: { q?: string; departemen?: string; status?: string };
  izin: { tulis: boolean; hapus: boolean; buatSurat: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(filter.q ?? '');
  const [pilih, setPilih] = React.useState<Set<string>>(new Set());
  const [form, setForm] = React.useState<{ buka: boolean; awal: PengurusForm | null }>({ buka: false, awal: null });
  const [importBuka, setImportBuka] = React.useState(false);

  const query = (ubah: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const g = { ...filter, ...ubah };
    for (const [k, v] of Object.entries(g)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const terapkan = (ubah: Record<string, string | undefined>) => router.push(`${pathname}${query(ubah)}`);

  const bisaDipilih = baris.filter((b) => b.is_aktif);
  const semuaTerpilih = bisaDipilih.length > 0 && bisaDipilih.every((b) => pilih.has(b.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <form
          role="search"
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            terapkan({ q: q.trim() || undefined });
          }}
        >
          <div className="min-w-0 flex-1">
            <Input type="search" aria-label="Cari pengurus" placeholder="Cari nama, NIM, atau jabatan…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="pengurus-cari" />
          </div>
          <Button type="submit" variant="secondary">
            Cari
          </Button>
        </form>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select aria-label="Departemen" placeholder={null} value={filter.departemen ?? ''} onChange={(e) => terapkan({ departemen: e.target.value || undefined })} data-testid="pengurus-filter-departemen">
            <option value="">Semua departemen</option>
            {departemen.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nama}
              </option>
            ))}
          </Select>
          <Select aria-label="Status" placeholder={null} value={filter.status ?? 'aktif'} onChange={(e) => terapkan({ status: e.target.value === 'aktif' ? undefined : e.target.value })} data-testid="pengurus-filter-status">
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="semua">Semua status</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-secondary" data-testid="pengurus-jumlah">
          <span className="tabular-nums">{baris.length}</span> pengurus
          {pilih.size ? (
            <>
              {' '}
              · <span className="tabular-nums font-semibold text-primary">{pilih.size}</span> dipilih
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {izin.buatSurat && pilih.size > 0 ? (
            <Button
              type="button"
              onClick={() => router.push(`/surat/massal?pilih=${[...pilih].join(',')}`)}
              disabled={pilih.size > MAKS_SURAT}
              title={pilih.size > MAKS_SURAT ? `Maksimal ${MAKS_SURAT} per batch` : undefined}
              data-testid="pengurus-buat-surat"
            >
              <FileSignature aria-hidden="true" /> Buat Surat Aktif ({pilih.size})
            </Button>
          ) : null}
          <a href={`/api/pengurus/export${query({})}`} className={buttonVariants({ variant: 'secondary' })} data-testid="pengurus-export" download>
            <Download aria-hidden="true" /> Export Excel
          </a>
          {izin.tulis ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setImportBuka(true)} data-testid="pengurus-import">
                <Upload aria-hidden="true" /> Import CSV/XLSX
              </Button>
              <Button type="button" onClick={() => setForm({ buka: true, awal: null })} data-testid="pengurus-tambah">
                <UserPlus aria-hidden="true" /> Tambah
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <Table
          aria-label="Data pengurus"
          data-testid="pengurus-tabel"
          rowCount={baris.length}
          emptyState={
            <div className="py-4">
              <p className="text-[14px] font-semibold text-primary">Belum ada pengurus</p>
              <p className="mt-1 text-[12px] text-secondary">
                {filter.q || filter.departemen || filter.status ? 'Tidak ada yang cocok dengan filter.' : 'Import berkas hasil form pendataan atau tambah satu per satu.'}
              </p>
            </div>
          }
        >
          <TableHeader>
            <TableRow>
              {izin.buatSurat ? (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Pilih semua pengurus aktif"
                    checked={semuaTerpilih}
                    onChange={(e) => setPilih(e.target.checked ? new Set(bisaDipilih.map((b) => b.id)) : new Set())}
                    data-testid="pengurus-pilih-semua"
                  />
                </TableHead>
              ) : null}
              <TableHead>Nama</TableHead>
              <TableHead>NIM</TableHead>
              <TableHead>Jabatan</TableHead>
              <TableHead>Departemen</TableHead>
              <TableHead>Angkatan</TableHead>
              <TableHead>Status</TableHead>
              {izin.tulis ? <TableHead>Aksi</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {baris.map((b) => (
              <TableRow key={b.id} data-testid={`pengurus-baris-${b.nim}`}>
                {izin.buatSurat ? (
                  <TableCell>
                    <Checkbox
                      aria-label={`Pilih ${b.nama_lengkap}`}
                      disabled={!b.is_aktif}
                      checked={pilih.has(b.id)}
                      onChange={() =>
                        setPilih((s) => {
                          const n = new Set(s);
                          if (n.has(b.id)) n.delete(b.id);
                          else n.add(b.id);
                          return n;
                        })
                      }
                      data-testid={`pengurus-pilih-${b.id}`}
                    />
                  </TableCell>
                ) : null}
                <TableCell className="font-medium">
                  {b.nama_lengkap}
                  {b.punya_akun ? <span className="ml-2 text-[11px] font-normal text-tertiary">• punya akun</span> : null}
                </TableCell>
                <TableCell className="font-mono text-[12px]">{b.nim}</TableCell>
                <TableCell className="text-[13px]">{b.jabatan}</TableCell>
                <TableCell className="text-[13px]">{b.nama_departemen ?? '—'}</TableCell>
                <TableCell className="tabular-nums text-[13px]">{b.angkatan ?? '—'}</TableCell>
                <TableCell className="text-[13px]">{b.is_aktif ? 'Aktif' : <span className="text-tertiary">Nonaktif</span>}</TableCell>
                {izin.tulis ? (
                  <TableCell action>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Ubah ${b.nama_lengkap}`}
                      onClick={() =>
                        setForm({
                          buka: true,
                          awal: { id: b.id, nama_lengkap: b.nama_lengkap, nim: b.nim, jabatan: b.jabatan, departemen_id: b.departemen_id, angkatan: b.angkatan, is_aktif: b.is_aktif },
                        })
                      }
                      data-testid={`pengurus-ubah-${b.id}`}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {izin.tulis ? (
        <>
          <FormPengurusDialog
            open={form.buka}
            onOpenChange={(buka) => setForm((f) => ({ ...f, buka }))}
            awal={form.awal}
            departemen={departemen}
            bolehHapus={izin.hapus}
            onSelesai={() => router.refresh()}
          />
          <ImportPengurusDialog open={importBuka} onOpenChange={setImportBuka} contohDepartemen={departemen[0]?.nama} onSelesai={() => router.refresh()} />
        </>
      ) : null}
    </div>
  );
}
