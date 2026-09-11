'use client';

import { AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { klasifikasiPerubahan } from '@/lib/proker/klasifikasi-perubahan';
import type { ProkerKategori, ProkerStatus } from '@/lib/proker/status';

export interface OpsiEditProker {
  id: string;
  nama: string;
}

export interface DataEditProker {
  departemen_id: string;
  deskripsi: string | null;
  id: string;
  kategori: ProkerKategori;
  nama: string;
  sasaran: string | null;
  status: ProkerStatus;
  tanggal_hari_h_mulai: string | null;
  tanggal_hari_h_selesai: string | null;
  tanggal_mulai_persiapan: string | null;
  tujuan: string | null;
}

interface EditProkerFormProps {
  departemen: OpsiEditProker[];
  proker: DataEditProker;
}

interface FormEdit {
  departemen_id: string;
  deskripsi: string;
  kategori: ProkerKategori;
  nama: string;
  sasaran: string;
  tanggal_hari_h_mulai: string;
  tanggal_hari_h_selesai: string;
  tanggal_mulai_persiapan: string;
  tujuan: string;
}

interface ResponsEdit {
  data?: { id?: string; jenis?: 'TIDAK_ADA' | 'MINOR' | 'MAYOR'; status?: ProkerStatus };
  error?: {
    code?: string;
    details?: Array<{ path?: string; pesan?: string }>;
    message?: string;
  };
  ok: boolean;
}

function nilaiAwal(proker: DataEditProker): FormEdit {
  return {
    departemen_id: proker.departemen_id,
    deskripsi: proker.deskripsi ?? '',
    kategori: proker.kategori,
    nama: proker.nama,
    sasaran: proker.sasaran ?? '',
    tanggal_hari_h_mulai: proker.tanggal_hari_h_mulai ?? '',
    tanggal_hari_h_selesai: proker.tanggal_hari_h_selesai ?? '',
    tanggal_mulai_persiapan: proker.tanggal_mulai_persiapan ?? '',
    tujuan: proker.tujuan ?? '',
  };
}

function sama(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buatPerubahan(lama: FormEdit, baru: FormEdit): Record<string, unknown> {
  const perubahan: Record<string, unknown> = {};
  for (const key of Object.keys(baru) as Array<keyof FormEdit>) {
    if (!sama(lama[key], baru[key])) perubahan[key] = baru[key];
  }
  return perubahan;
}

export function EditProkerForm({ departemen, proker }: EditProkerFormProps) {
  const [baseline, setBaseline] = useState<FormEdit>(() => nilaiAwal(proker));
  const [form, setForm] = useState<FormEdit>(() => nilaiAwal(proker));
  const [sedangMenyimpan, setSedangMenyimpan] = useState(false);
  const [pesanError, setPesanError] = useState<string | null>(null);
  const [pesanSukses, setPesanSukses] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(proker.status);

  const perubahan = useMemo(() => buatPerubahan(baseline, form), [baseline, form]);
  const klasifikasi = useMemo(
    () => klasifikasiPerubahan({ ...baseline }, perubahan),
    [baseline, perubahan],
  );
  const adaPerubahan = Object.keys(perubahan).length > 0;
  const perubahanMayor = klasifikasi.jenis === 'MAYOR';
  const dapatDisunting = ['DRAFT', 'PERLU_REVISI', 'DITOLAK', 'DISETUJUI'].includes(status);

  function ubah<K extends keyof FormEdit>(key: K, value: FormEdit[K]) {
    setForm((nilai) => ({ ...nilai, [key]: value }));
    setPesanError(null);
    setPesanSukses(null);
    setErrorField((nilai) => {
      if (!nilai[key]) return nilai;
      const berikutnya = { ...nilai };
      delete berikutnya[key];
      return berikutnya;
    });
  }

  async function simpan() {
    if (!adaPerubahan || sedangMenyimpan || !dapatDisunting) return;
    setSedangMenyimpan(true);
    setPesanError(null);
    setPesanSukses(null);
    setErrorField({});

    try {
      const response = await fetch(`/api/proker/${proker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perubahan),
      });
      const body = (await response.json().catch(() => null)) as ResponsEdit | null;
      if (!response.ok || body?.ok !== true) {
        const field = Object.fromEntries(
          (body?.error?.details ?? [])
            .filter(
              (item): item is { path: string; pesan: string } =>
                typeof item.path === 'string' && typeof item.pesan === 'string',
            )
            .map((item) => [item.path, item.pesan]),
        );
        setErrorField(field);
        throw new Error(body?.error?.message ?? 'Perubahan proker belum dapat disimpan.');
      }

      const statusBaru = body.data?.status ?? status;
      setStatus(statusBaru);
      setBaseline(form);
      setPesanSukses(
        body.data?.jenis === 'MAYOR'
          ? 'Perubahan mayor diajukan. Jadwal lama tetap terkunci sampai Ketua/Wakil memutuskan.'
          : 'Perubahan tersimpan. Status dan kunci kalender tetap seperti sebelumnya.',
      );
    } catch (error) {
      setPesanError(
        error instanceof Error ? error.message : 'Perubahan proker belum dapat disimpan.',
      );
    } finally {
      setSedangMenyimpan(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void simpan();
      }}
    >
      <Card>
        <div className="border-b border-subtle pb-3">
          <h2 className="text-[16px] font-semibold text-primary">Informasi program kerja</h2>
          <p className="mt-1 text-[12px] leading-[18px] text-secondary">
            Ubah informasi dasar. Perubahan departemen atau kategori termasuk perubahan mayor.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-departemen" required>
              Departemen
            </Label>
            <Select
              id="edit-departemen"
              value={form.departemen_id}
              disabled={departemen.length <= 1 || !dapatDisunting}
              error={errorField.departemen_id}
              placeholder={null}
              onChange={(event) => ubah('departemen_id', event.target.value)}
            >
              {departemen.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nama}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-kategori" required>
              Kategori
            </Label>
            <Select
              id="edit-kategori"
              value={form.kategori}
              disabled={baseline.kategori === 'BERKALA' || !dapatDisunting}
              error={errorField.kategori}
              placeholder={null}
              helperText={
                baseline.kategori === 'BERKALA'
                  ? 'Pola berulang dipertahankan; kategori tidak dapat diubah dari editor ini.'
                  : undefined
              }
              onChange={(event) => ubah('kategori', event.target.value as ProkerKategori)}
            >
              <option value="TERJADWAL">Terjadwal</option>
              <option value="RESPONSIF">Responsif</option>
              {baseline.kategori === 'BERKALA' ? <option value="BERKALA">Berkala</option> : null}
            </Select>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="edit-nama" required>
            Nama program kerja
          </Label>
          <Input
            id="edit-nama"
            value={form.nama}
            maxLength={200}
            disabled={!dapatDisunting}
            error={errorField.nama}
            onChange={(event) => ubah('nama', event.target.value)}
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="edit-deskripsi">Deskripsi</Label>
          <Textarea
            id="edit-deskripsi"
            data-testid="edit-field-deskripsi"
            value={form.deskripsi}
            maxLength={4000}
            disabled={!dapatDisunting}
            error={errorField.deskripsi}
            onChange={(event) => ubah('deskripsi', event.target.value)}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-tujuan">Tujuan</Label>
            <Textarea
              id="edit-tujuan"
              value={form.tujuan}
              maxLength={4000}
              disabled={!dapatDisunting}
              error={errorField.tujuan}
              onChange={(event) => ubah('tujuan', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-sasaran">Sasaran</Label>
            <Textarea
              id="edit-sasaran"
              value={form.sasaran}
              maxLength={4000}
              disabled={!dapatDisunting}
              error={errorField.sasaran}
              onChange={(event) => ubah('sasaran', event.target.value)}
            />
          </div>
        </div>
      </Card>

      {form.kategori !== 'BERKALA' ? (
        <Card>
          <div className="border-b border-subtle pb-3">
            <h2 className="text-[16px] font-semibold text-primary">Jadwal</h2>
            <p className="mt-1 text-[12px] leading-[18px] text-secondary">
              Mengubah tanggal akan melewati persetujuan ulang bila proker sudah disetujui.
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-persiapan" required={form.kategori === 'TERJADWAL'}>
                Mulai persiapan
              </Label>
              <Input
                id="edit-persiapan"
                type="date"
                value={form.tanggal_mulai_persiapan}
                disabled={!dapatDisunting}
                error={errorField.tanggal_mulai_persiapan}
                onChange={(event) => ubah('tanggal_mulai_persiapan', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-harih-mulai" required>
                Hari-H mulai
              </Label>
              <Input
                id="edit-harih-mulai"
                type="date"
                value={form.tanggal_hari_h_mulai}
                disabled={!dapatDisunting}
                error={errorField.tanggal_hari_h_mulai}
                onChange={(event) => ubah('tanggal_hari_h_mulai', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-harih-selesai" required>
                Hari-H selesai
              </Label>
              <Input
                id="edit-harih-selesai"
                data-testid="edit-field-harih-selesai"
                type="date"
                value={form.tanggal_hari_h_selesai}
                disabled={!dapatDisunting}
                error={errorField.tanggal_hari_h_selesai}
                onChange={(event) => ubah('tanggal_hari_h_selesai', event.target.value)}
              />
            </div>
          </div>
        </Card>
      ) : null}

      {perubahanMayor && proker.status === 'DISETUJUI' ? (
        <div
          data-testid="edit-peringatan-mayor"
          role="alert"
          className="flex items-start gap-2.5 rounded-sm border border-[var(--warning)] bg-[var(--warning-subtle)] p-3 text-primary"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-[var(--warning)]"
            aria-hidden="true"
          />
          <div>
            <p className="text-[13px] font-semibold">
              Perubahan tanggal memerlukan persetujuan ulang Ketua/Wakil.
            </p>
            <p className="mt-1 text-[12px] leading-4 text-secondary">
              Kunci kalender lama tetap aktif sampai perubahan ini disetujui atau ditolak.
            </p>
          </div>
        </div>
      ) : null}

      {pesanError ? (
        <div
          role="alert"
          className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px] text-danger"
        >
          {pesanError}
        </div>
      ) : null}

      {pesanSukses ? (
        <div
          data-testid="edit-sukses"
          role="status"
          className="flex items-start gap-2.5 rounded-sm border border-[var(--success)] bg-[var(--success-subtle)] p-3 text-[var(--success)]"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-[13px] font-medium">{pesanSukses}</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          data-testid="edit-simpan"
          loading={sedangMenyimpan}
          disabled={!adaPerubahan || !dapatDisunting}
        >
          <Save aria-hidden="true" />
          Simpan perubahan
        </Button>
      </div>
    </form>
  );
}
