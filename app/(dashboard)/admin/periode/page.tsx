'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, CalendarRange, Pencil, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, type ConfirmationPayload } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusPill } from '@/components/ui/status-pill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RingkasPeriode } from '@/lib/periode/service';
import { formatRentangTanggal } from '@/lib/utils/format-tanggal';

type ResponsApi<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

type NilaiForm = {
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  nomor_surat_awal: string;
};

type ModeForm = { jenis: 'buat' } | { jenis: 'ubah'; periode: RingkasPeriode };

const FORM_KOSONG: NilaiForm = {
  nama: '',
  tanggal_mulai: '',
  tanggal_selesai: '',
  nomor_surat_awal: '1',
};

async function panggilApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const body = (await response.json().catch(() => null)) as ResponsApi<T> | null;

  if (!response.ok || !body || body.ok !== true) {
    const pesan =
      body && body.ok === false ? body.error.message : 'Permintaan belum dapat diproses.';
    throw new Error(pesan);
  }
  return body.data;
}

function nilaiDariPeriode(periode: RingkasPeriode): NilaiForm {
  return {
    nama: periode.nama,
    tanggal_mulai: periode.tanggal_mulai,
    tanggal_selesai: periode.tanggal_selesai,
    nomor_surat_awal: String(periode.nomor_surat_awal),
  };
}

function Ringkasan({ periode }: { periode: RingkasPeriode[] }) {
  const jumlah = useMemo(
    () => ({
      aktif: periode.filter((item) => item.status === 'AKTIF').length,
      persiapan: periode.filter((item) => item.status === 'PERSIAPAN').length,
      arsip: periode.filter((item) => item.status === 'ARSIP').length,
    }),
    [periode],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Ringkasan periode">
      {[
        ['Periode aktif', jumlah.aktif, 'Tepat satu periode berjalan'],
        ['Dalam persiapan', jumlah.persiapan, 'Dapat diubah dan diaktifkan'],
        ['Periode arsip', jumlah.arsip, 'Tersedia dalam mode baca saja'],
      ].map(([label, nilai, keterangan]) => (
        <Card key={label}>
          <CardContent className="p-4">
            <p className="text-[12px] font-medium text-secondary">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{nilai}</p>
            <p className="mt-1 text-[11px] leading-4 text-tertiary">{keterangan}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PeriodePage() {
  const [periode, setPeriode] = useState<RingkasPeriode[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [modeForm, setModeForm] = useState<ModeForm | null>(null);
  const [nilaiForm, setNilaiForm] = useState<NilaiForm>(FORM_KOSONG);
  const [prosesId, setProsesId] = useState<string | null>(null);
  const [pesanGagal, setPesanGagal] = useState<string | null>(null);
  const [pesanSukses, setPesanSukses] = useState<string | null>(null);

  const muatPeriode = useCallback(async () => {
    setMemuat(true);
    setPesanGagal(null);
    try {
      setPeriode(await panggilApi<RingkasPeriode[]>('/api/periode'));
    } catch (error) {
      setPesanGagal(error instanceof Error ? error.message : 'Daftar periode belum dapat dimuat.');
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muatPeriode();
  }, [muatPeriode]);

  function bukaFormBuat() {
    setNilaiForm(FORM_KOSONG);
    setModeForm({ jenis: 'buat' });
  }

  function bukaFormUbah(item: RingkasPeriode) {
    setNilaiForm(nilaiDariPeriode(item));
    setModeForm({ jenis: 'ubah', periode: item });
  }

  async function simpan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modeForm) return;

    const id = modeForm.jenis === 'ubah' ? modeForm.periode.id : 'buat';
    setProsesId(id);
    setPesanGagal(null);
    setPesanSukses(null);

    try {
      const url =
        modeForm.jenis === 'ubah' ? `/api/periode/${modeForm.periode.id}` : '/api/periode';
      await panggilApi(url, {
        method: modeForm.jenis === 'ubah' ? 'PATCH' : 'POST',
        body: JSON.stringify({
          nama: nilaiForm.nama,
          tanggal_mulai: nilaiForm.tanggal_mulai,
          tanggal_selesai: nilaiForm.tanggal_selesai,
          nomor_surat_awal: Number(nilaiForm.nomor_surat_awal),
        }),
      });
      setPesanSukses(
        modeForm.jenis === 'ubah'
          ? 'Periode berhasil diperbarui.'
          : 'Periode persiapan berhasil dibuat.',
      );
      setModeForm(null);
      await muatPeriode();
    } catch (error) {
      setPesanGagal(error instanceof Error ? error.message : 'Periode belum dapat disimpan.');
    } finally {
      setProsesId(null);
    }
  }

  async function aktifkan(item: RingkasPeriode, payload: ConfirmationPayload) {
    if (payload.level !== 'typed') return;
    setProsesId(item.id);
    setPesanGagal(null);
    setPesanSukses(null);
    try {
      await panggilApi(`/api/periode/${item.id}/activate`, {
        method: 'POST',
        body: JSON.stringify({ konfirmasi: payload.typedText }),
      });
      setPesanSukses(`${item.nama} berhasil diaktifkan. Periode sebelumnya kini menjadi arsip.`);
      await muatPeriode();
    } catch (error) {
      setPesanGagal(error instanceof Error ? error.message : 'Periode belum dapat diaktifkan.');
    } finally {
      setProsesId(null);
    }
  }

  async function hapus(item: RingkasPeriode) {
    setProsesId(item.id);
    setPesanGagal(null);
    setPesanSukses(null);
    try {
      await panggilApi(`/api/periode/${item.id}`, { method: 'DELETE' });
      setPesanSukses(`${item.nama} berhasil dihapus.`);
      await muatPeriode();
    } catch (error) {
      setPesanGagal(error instanceof Error ? error.message : 'Periode belum dapat dihapus.');
    } finally {
      setProsesId(null);
    }
  }

  return (
    <main data-testid="periode-page" className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
              aria-hidden="true"
            >
              <CalendarRange className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
                Administrasi sistem
              </p>
              <h1 className="mt-0.5 text-2xl font-semibold">Periode kepengurusan</h1>
              <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
                Atur rentang kepengurusan dan nomor awal surat. Hanya satu periode yang dapat aktif
                pada satu waktu.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              aria-label="Muat ulang daftar periode"
              onClick={() => void muatPeriode()}
              disabled={memuat || prosesId !== null}
            >
              <RefreshCw aria-hidden="true" />
              Muat ulang
            </Button>
            <Button onClick={bukaFormBuat} disabled={prosesId !== null} data-testid="periode-buat">
              <Plus aria-hidden="true" />
              Tambah periode
            </Button>
          </div>
        </header>

        <div aria-live="polite" className="space-y-3">
          {pesanSukses ? (
            <div
              role="status"
              className="rounded-sm border border-[var(--success)] bg-[var(--success-subtle)] p-3 text-[13px] leading-[18px]"
            >
              {pesanSukses}
            </div>
          ) : null}
          {pesanGagal ? (
            <div
              role="alert"
              className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] leading-[18px] text-[var(--danger)]"
            >
              {pesanGagal}
            </div>
          ) : null}
        </div>

        <Ringkasan periode={periode} />

        <Card>
          <CardHeader>
            <CardTitle>Daftar periode</CardTitle>
            <CardDescription>
              Periode arsip tetap dapat dilihat, tetapi seluruh isinya berada dalam mode baca saja.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table
              rowCount={periode.length}
              loading={memuat}
              loadingColumnCount={5}
              emptyState={
                <EmptyState
                  icon={<CalendarRange />}
                  title="Belum ada periode"
                  description="Buat periode persiapan pertama untuk memulai pengelolaan kepengurusan."
                  action={<Button onClick={bukaFormBuat}>Tambah periode</Button>}
                />
              }
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Rentang tanggal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead numeric>Nomor awal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periode.map((item) => {
                  const bacaSaja = item.status === 'ARSIP';
                  const sedangDiproses = prosesId === item.id;
                  return (
                    <TableRow key={item.id} data-testid={`periode-row-${item.id}`}>
                      <TableCell>
                        <div className="font-medium">{item.nama}</div>
                        {bacaSaja ? (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-tertiary">
                            <Archive aria-hidden="true" className="size-3" />
                            Mode baca saja
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatRentangTanggal(item.tanggal_mulai, item.tanggal_selesai)}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={item.status} />
                      </TableCell>
                      <TableCell numeric>
                        {String(item.nomor_surat_awal).padStart(3, '0')}
                      </TableCell>
                      <TableCell className="min-w-64 text-right">
                        {bacaSaja ? (
                          <span className="text-[12px] text-tertiary">Tidak ada aksi</span>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              onClick={() => bukaFormUbah(item)}
                              disabled={prosesId !== null}
                              aria-label={`Ubah ${item.nama}`}
                            >
                              <Pencil aria-hidden="true" />
                              Ubah
                            </Button>
                            {item.status === 'PERSIAPAN' ? (
                              <ConfirmDialog
                                level="typed"
                                confirmationText={item.nama}
                                title="Aktifkan periode?"
                                description="Periode yang sedang aktif akan langsung menjadi arsip dan nomor surat dimulai ulang. Tindakan ini berdampak pada seluruh organisasi."
                                confirmLabel="Aktifkan periode"
                                confirmVariant="danger"
                                loading={sedangDiproses}
                                onConfirm={(payload) => void aktifkan(item, payload)}
                                trigger={
                                  <Button variant="secondary" disabled={prosesId !== null}>
                                    <ShieldAlert aria-hidden="true" />
                                    Aktifkan
                                  </Button>
                                }
                              />
                            ) : null}
                            {item.status === 'PERSIAPAN' ? (
                              <ConfirmDialog
                                level="simple"
                                title="Hapus periode persiapan?"
                                description={
                                  item.ada_surat_terbit
                                    ? 'Periode memiliki surat terbit dan tidak dapat dihapus.'
                                    : `Periode ${item.nama} akan dihapus permanen.`
                                }
                                confirmLabel="Hapus periode"
                                disabled={item.ada_surat_terbit || prosesId !== null}
                                loading={sedangDiproses}
                                onConfirm={() => void hapus(item)}
                                trigger={
                                  <Button
                                    variant="ghost"
                                    disabled={item.ada_surat_terbit || prosesId !== null}
                                    aria-label={`Hapus ${item.nama}`}
                                  >
                                    <Trash2 aria-hidden="true" />
                                    Hapus
                                  </Button>
                                }
                              />
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={modeForm !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka && prosesId === null) setModeForm(null);
        }}
      >
        <DialogContent>
          <form onSubmit={simpan} className="grid gap-4" data-testid="periode-form">
            <DialogHeader>
              <DialogTitle>
                {modeForm?.jenis === 'ubah' ? 'Ubah periode' : 'Tambah periode'}
              </DialogTitle>
              <DialogDescription>
                Periode baru selalu dibuat dalam status Persiapan. Aktivasi dilakukan terpisah
                dengan konfirmasi kritis.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="periode-nama" required>
                  Nama periode
                </Label>
                <Input
                  id="periode-nama"
                  value={nilaiForm.nama}
                  onChange={(event) =>
                    setNilaiForm((nilai) => ({ ...nilai, nama: event.target.value }))
                  }
                  placeholder="Contoh: HMIF 3.0 2026/2027"
                  minLength={3}
                  maxLength={150}
                  required
                  disabled={prosesId !== null}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="periode-mulai" required>
                    Tanggal mulai
                  </Label>
                  <Input
                    id="periode-mulai"
                    type="date"
                    value={nilaiForm.tanggal_mulai}
                    onChange={(event) =>
                      setNilaiForm((nilai) => ({ ...nilai, tanggal_mulai: event.target.value }))
                    }
                    required
                    disabled={prosesId !== null}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="periode-selesai" required>
                    Tanggal selesai
                  </Label>
                  <Input
                    id="periode-selesai"
                    type="date"
                    value={nilaiForm.tanggal_selesai}
                    min={nilaiForm.tanggal_mulai || undefined}
                    onChange={(event) =>
                      setNilaiForm((nilai) => ({ ...nilai, tanggal_selesai: event.target.value }))
                    }
                    required
                    disabled={prosesId !== null}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="periode-nomor-awal" required>
                  Nomor surat awal
                </Label>
                <Input
                  id="periode-nomor-awal"
                  type="number"
                  min={1}
                  step={1}
                  value={nilaiForm.nomor_surat_awal}
                  onChange={(event) =>
                    setNilaiForm((nilai) => ({ ...nilai, nomor_surat_awal: event.target.value }))
                  }
                  helperText="Nilai 1 membuat surat pertama bernomor 001."
                  required
                  disabled={prosesId !== null}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModeForm(null)}
                disabled={prosesId !== null}
              >
                Batal
              </Button>
              <Button type="submit" loading={prosesId !== null}>
                {modeForm?.jenis === 'ubah' ? 'Simpan perubahan' : 'Buat periode'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
