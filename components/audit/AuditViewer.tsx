'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Download, Eye, Filter, History, RefreshCw } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

type NilaiJson = null | boolean | number | string | NilaiJson[] | { [key: string]: NilaiJson };

type ItemAudit = {
  aksi: string;
  created_at: string;
  entitas: string;
  entitas_id: string | null;
  id: string;
  ip_address: string | null;
  nilai_baru: NilaiJson;
  nilai_lama: NilaiJson;
  pengguna: { email: string | null; id: string; nama: string } | null;
  user_agent: string | null;
};

type PilihanAudit = {
  aksi: string[];
  entitas: string[];
  pengguna: Array<{ email: string; id: string; nama_lengkap: string }>;
};

type DataAudit = {
  items: ItemAudit[];
  next_cursor: string | null;
  pilihan: PilihanAudit;
};

type ResponsApi =
  { ok: true; data: DataAudit } | { ok: false; error: { code: string; message: string } };

type FilterAudit = {
  aksi: string;
  dari: string;
  entitas: string;
  sampai: string;
  user: string;
};

const FILTER_KOSONG: FilterAudit = {
  aksi: '',
  dari: '',
  entitas: '',
  sampai: '',
  user: '',
};

const LABEL_ENTITAS: Record<string, string> = {
  app_user: 'Pengguna',
  divisi: 'Divisi',
  kepanitiaan: 'Kepanitiaan',
  lpj: 'LPJ',
  nota: 'Nota',
  periode: 'Periode',
  proker: 'Program kerja',
  proker_lock: 'Kunci kalender',
  rab_item: 'Item RAB',
  rab_meta: 'RAB',
  surat: 'Surat',
  user_role: 'Role pengguna',
};

const LABEL_AKSI: Record<string, string> = {
  APPROVE: 'Menyetujui',
  CREATE: 'Membuat',
  DELETE: 'Menghapus',
  LOGIN: 'Masuk',
  LOGIN_GAGAL: 'Gagal masuk',
  REJECT: 'Menolak',
  RESTORE: 'Memulihkan',
  UPDATE: 'Memperbarui',
};

function labelEntitas(nilai: string): string {
  return LABEL_ENTITAS[nilai] ?? nilai.replaceAll('_', ' ');
}

function labelAksi(nilai: string): string {
  return LABEL_AKSI[nilai] ?? nilai.replaceAll('_', ' ');
}

function toneAksi(aksi: string): BadgeTone {
  if (aksi === 'DELETE' || aksi === 'REJECT' || aksi === 'LOGIN_GAGAL') return 'danger';
  if (aksi === 'CREATE' || aksi === 'APPROVE') return 'success';
  if (aksi === 'UPDATE') return 'info';
  return 'neutral';
}

function buatQuery(filter: FilterAudit, cursor?: string | null): string {
  const query = new URLSearchParams();
  for (const [kunci, nilai] of Object.entries(filter)) {
    if (nilai) query.set(kunci, nilai);
  }
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}

function keObjek(nilai: NilaiJson): Record<string, NilaiJson | undefined> {
  return nilai && typeof nilai === 'object' && !Array.isArray(nilai) ? nilai : {};
}

function teksNilai(nilai: NilaiJson | undefined): string {
  if (nilai === undefined) return '—';
  if (nilai === null) return 'null';
  if (typeof nilai === 'string') return nilai || '(kosong)';
  return JSON.stringify(nilai, null, 2);
}

function DetailPerubahan({ item }: { item: ItemAudit }) {
  const lama = keObjek(item.nilai_lama);
  const baru = keObjek(item.nilai_baru);
  const bidang = [...new Set([...Object.keys(lama), ...Object.keys(baru)])].sort();

  if (bidang.length === 0) {
    return (
      <p
        role="status"
        className="rounded-sm border border-default bg-subtle p-3 text-[13px] text-secondary"
      >
        Snapshot nilai tidak tersedia untuk entri ini.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="audit-detail-perubahan">
      <div className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 text-[11px] font-semibold tracking-wide text-tertiary uppercase">
        <span>Bidang</span>
        <span>Nilai lama</span>
        <span>Nilai baru</span>
      </div>
      {bidang.map((nama) => {
        const berubah = JSON.stringify(lama[nama]) !== JSON.stringify(baru[nama]);
        return (
          <div
            key={nama}
            data-changed={berubah ? 'true' : 'false'}
            className={cn(
              'grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-sm border p-3',
              berubah
                ? 'border-[var(--warning)] bg-[var(--warning-subtle)]'
                : 'border-subtle bg-panel',
            )}
          >
            <div className="min-w-0">
              <p className="break-all text-[12px] font-semibold text-primary">{nama}</p>
              {berubah ? (
                <span className="mt-1 inline-flex text-[10px] font-medium text-[var(--warning)]">
                  Diubah
                </span>
              ) : null}
            </div>
            <pre className="min-w-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-secondary">
              {teksNilai(lama[nama])}
            </pre>
            <pre className="min-w-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-secondary">
              {teksNilai(baru[nama])}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

export function AuditViewer() {
  const [draftFilter, setDraftFilter] = useState<FilterAudit>(FILTER_KOSONG);
  const [filter, setFilter] = useState<FilterAudit>(FILTER_KOSONG);
  const [cursor, setCursor] = useState<string | null>(null);
  const [riwayatCursor, setRiwayatCursor] = useState<string[]>([]);
  const [data, setData] = useState<DataAudit>({
    items: [],
    next_cursor: null,
    pilihan: { aksi: [], entitas: [], pengguna: [] },
  });
  const [memuat, setMemuat] = useState(true);
  const [pesanGagal, setPesanGagal] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemAudit | null>(null);

  const muat = useCallback(
    async (signal?: AbortSignal) => {
      setMemuat(true);
      setPesanGagal(null);
      try {
        const query = buatQuery(filter, cursor);
        const response = await fetch(`/api/audit${query ? `?${query}` : ''}`, {
          cache: 'no-store',
          signal,
        });
        const body = (await response.json().catch(() => null)) as ResponsApi | null;
        if (!response.ok || !body || body.ok !== true) {
          throw new Error(
            body && body.ok === false ? body.error.message : 'Audit log belum dapat dimuat.',
          );
        }
        setData(body.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPesanGagal(error instanceof Error ? error.message : 'Audit log belum dapat dimuat.');
      } finally {
        if (!signal?.aborted) setMemuat(false);
      }
    },
    [cursor, filter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void muat(controller.signal);
    return () => controller.abort();
  }, [muat]);

  const hrefEkspor = useMemo(() => {
    const query = new URLSearchParams(buatQuery(filter));
    query.set('format', 'csv');
    return `/api/audit?${query.toString()}`;
  }, [filter]);

  function terapkanFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCursor(null);
    setRiwayatCursor([]);
    setFilter(draftFilter);
  }

  function resetFilter() {
    setDraftFilter(FILTER_KOSONG);
    setCursor(null);
    setRiwayatCursor([]);
    setFilter(FILTER_KOSONG);
  }

  function halamanBerikutnya() {
    if (!data.next_cursor) return;
    setRiwayatCursor((nilai) => [...nilai, cursor ?? '']);
    setCursor(data.next_cursor);
  }

  function halamanSebelumnya() {
    setRiwayatCursor((nilai) => {
      if (nilai.length === 0) return nilai;
      const salinan = nilai.slice(0, -1);
      setCursor(nilai[nilai.length - 1] || null);
      return salinan;
    });
  }

  return (
    <div data-testid="audit-viewer" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filter jejak audit</CardTitle>
          <CardDescription>
            Kombinasikan filter pengguna, entitas, tindakan, dan rentang tanggal. Ekspor CSV akan
            mengikuti filter yang sedang diterapkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={terapkanFilter} className="grid gap-3 xl:grid-cols-5">
            <div className="grid gap-1.5">
              <Label htmlFor="audit-user">Pengguna</Label>
              <Select
                id="audit-user"
                data-testid="audit-filter-user"
                value={draftFilter.user}
                placeholder={null}
                onChange={(event) =>
                  setDraftFilter((nilai) => ({ ...nilai, user: event.target.value }))
                }
              >
                <option value="">Semua pengguna</option>
                <option value="sistem">Sistem</option>
                {data.pilihan.pengguna.map((pengguna) => (
                  <option key={pengguna.id} value={pengguna.id}>
                    {pengguna.nama_lengkap} ({pengguna.email})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="audit-entitas">Entitas</Label>
              <Select
                id="audit-entitas"
                data-testid="audit-filter-entitas"
                value={draftFilter.entitas}
                placeholder={null}
                onChange={(event) =>
                  setDraftFilter((nilai) => ({ ...nilai, entitas: event.target.value }))
                }
              >
                <option value="">Semua entitas</option>
                {data.pilihan.entitas.map((entitas) => (
                  <option key={entitas} value={entitas}>
                    {labelEntitas(entitas)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="audit-aksi">Tindakan</Label>
              <Select
                id="audit-aksi"
                data-testid="audit-filter-aksi"
                value={draftFilter.aksi}
                placeholder={null}
                onChange={(event) =>
                  setDraftFilter((nilai) => ({ ...nilai, aksi: event.target.value }))
                }
              >
                <option value="">Semua tindakan</option>
                {data.pilihan.aksi.map((aksi) => (
                  <option key={aksi} value={aksi}>
                    {labelAksi(aksi)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="audit-dari">Dari tanggal</Label>
              <Input
                id="audit-dari"
                type="date"
                data-testid="audit-filter-dari"
                value={draftFilter.dari}
                max={draftFilter.sampai || undefined}
                onChange={(event) =>
                  setDraftFilter((nilai) => ({ ...nilai, dari: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="audit-sampai">Sampai tanggal</Label>
              <Input
                id="audit-sampai"
                type="date"
                data-testid="audit-filter-sampai"
                value={draftFilter.sampai}
                min={draftFilter.dari || undefined}
                onChange={(event) =>
                  setDraftFilter((nilai) => ({ ...nilai, sampai: event.target.value }))
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:col-span-5">
              <Button type="submit" disabled={memuat} data-testid="audit-filter-terapkan">
                <Filter aria-hidden="true" />
                Terapkan filter
              </Button>
              <Button type="button" variant="secondary" onClick={resetFilter} disabled={memuat}>
                Reset
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void muat()}
                disabled={memuat}
                aria-label="Muat ulang audit log"
              >
                <RefreshCw aria-hidden="true" />
                Muat ulang
              </Button>
              <a
                href={hrefEkspor}
                data-testid="audit-export"
                className={cn(buttonVariants({ variant: 'secondary' }), 'ml-auto')}
              >
                <Download aria-hidden="true" />
                Ekspor CSV
              </a>
            </div>
          </form>
        </CardContent>
      </Card>

      {pesanGagal ? (
        <div
          role="alert"
          className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] text-[var(--danger)]"
        >
          {pesanGagal}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Riwayat perubahan</CardTitle>
          <CardDescription>
            Log bersifat permanen dan hanya dapat dibaca. Entri terbaru ditampilkan lebih dulu.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table
            data-testid="audit-table"
            rowCount={data.items.length}
            loading={memuat}
            loadingColumnCount={6}
            emptyState={
              <EmptyState
                icon={<History />}
                title="Belum ada jejak audit"
                description="Tidak ada entri yang cocok dengan filter yang sedang diterapkan."
                action={
                  <Button variant="secondary" onClick={resetFilter}>
                    Reset filter
                  </Button>
                }
              />
            }
            pagination={
              <nav
                aria-label="Paginasi audit log"
                className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4"
              >
                <span className="text-[12px] text-secondary tabular-nums">
                  {data.items.length} entri pada halaman ini
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={memuat || riwayatCursor.length === 0}
                    onClick={halamanSebelumnya}
                    data-testid="audit-prev"
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={memuat || !data.next_cursor}
                    onClick={halamanBerikutnya}
                    data-testid="audit-next"
                  >
                    Berikutnya
                  </Button>
                </div>
              </nav>
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Pengguna</TableHead>
                <TableHead>Tindakan</TableHead>
                <TableHead>Entitas</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead className="text-right">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id} data-testid={`audit-row-${item.id}`}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatTanggalWaktu(item.created_at)}
                  </TableCell>
                  <TableCell className="min-w-48">
                    <p className="font-medium text-primary">{item.pengguna?.nama ?? 'Sistem'}</p>
                    <p className="text-[11px] text-tertiary">
                      {item.pengguna?.email ?? 'Proses otomatis'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge tone={toneAksi(item.aksi)}>{labelAksi(item.aksi)}</Badge>
                  </TableCell>
                  <TableCell className="min-w-44">
                    <p className="font-medium text-primary">{labelEntitas(item.entitas)}</p>
                    <p className="max-w-52 truncate font-mono text-[10px] text-tertiary">
                      {item.entitas_id ?? 'Tanpa ID'}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-36">
                    <p className="text-[12px] text-secondary">
                      {item.ip_address ?? 'IP tidak tersedia'}
                    </p>
                    <p
                      className="max-w-48 truncate text-[10px] text-tertiary"
                      title={item.user_agent ?? undefined}
                    >
                      {item.user_agent ?? 'User agent tidak tersedia'}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      onClick={() => setDetail(item)}
                      data-testid={`audit-detail-${item.id}`}
                      aria-label={`Lihat detail audit ${item.id}`}
                    >
                      <Eye aria-hidden="true" />
                      Lihat detail
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={detail !== null} onOpenChange={(terbuka) => !terbuka && setDetail(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Detail jejak audit</DialogTitle>
            <DialogDescription>
              {detail
                ? `${labelAksi(detail.aksi)} ${labelEntitas(detail.entitas)} pada ${formatTanggalWaktu(detail.created_at)}.`
                : 'Bandingkan nilai sebelum dan sesudah perubahan.'}
            </DialogDescription>
          </DialogHeader>
          {detail ? <DetailPerubahan item={detail} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
