'use client';

import { KanbanSquare, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import type { ActionItemNotulensi } from '@/lib/notulensi/service';
import { SkemaActionItemInput } from '@/lib/notulensi/skema';
import { formatTanggalPendek } from '@/lib/utils/format-tanggal';

export interface OpsiDepartemen {
  id: string;
  nama: string;
  kode: string;
}
export interface OpsiPengurus {
  user_id: string;
  nama_lengkap: string;
}

interface ActionItemListProps {
  /** `null` selama notulensi belum tersimpan: item disimpan bersama notulensi. */
  notulensiId: string | null;
  departemenNotulensi: string | null;
  items: ActionItemNotulensi[];
  onUbah: (items: ActionItemNotulensi[]) => void;
  pengurus: OpsiPengurus[];
  departemen: OpsiDepartemen[];
  editable: boolean;
}

interface ResponsApi<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

async function kirim<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({ ok: false }))) as ResponsApi<T>;
  if (!res.ok || !json.ok) throw new Error(json.error?.message ?? 'Permintaan gagal.');
  return json.data as T;
}

let nomorDraf = 0;

export function ActionItemList({
  notulensiId,
  departemenNotulensi,
  items,
  onUbah,
  pengurus,
  departemen,
  editable,
}: ActionItemListProps) {
  const toast = useToast();
  const himpunan = departemenNotulensi === null;
  const [tugas, setTugas] = useState('');
  const [picId, setPicId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [deptBaru, setDeptBaru] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);

  const namaPengurus = (id: string | null) => pengurus.find((p) => p.user_id === id)?.nama_lengkap ?? null;
  const dept = (id: string | null) => departemen.find((d) => d.id === id);

  async function tambah() {
    const input = {
      tugas,
      pic_id: picId || null,
      deadline: deadline || null,
      departemen_id: himpunan ? deptBaru || null : departemenNotulensi,
    };
    const parsed = SkemaActionItemInput.safeParse(input);
    if (!parsed.success) {
      setGalat('Tugas wajib diisi (maksimal 500 karakter).');
      return;
    }
    setGalat(null);
    const dasar: Omit<ActionItemNotulensi, 'id'> = {
      tugas: parsed.data.tugas,
      pic_id: parsed.data.pic_id ?? null,
      pic_nama: namaPengurus(parsed.data.pic_id ?? null),
      deadline: parsed.data.deadline ?? null,
      departemen_id: parsed.data.departemen_id ?? null,
      kanban_card_id: null,
    };
    if (!notulensiId) {
      onUbah([...items, { ...dasar, id: `draf-${++nomorDraf}` }]);
    } else {
      setSibuk('tambah');
      try {
        const { id } = await kirim<{ id: string }>(`/api/notulensi/${notulensiId}/action-item`, 'POST', parsed.data);
        onUbah([...items, { ...dasar, id }]);
      } catch (e) {
        toast.error({ description: e instanceof Error ? e.message : 'Action item gagal ditambahkan.', suggestion: 'Periksa isian lalu coba lagi.' });
        return;
      } finally {
        setSibuk(null);
      }
    }
    setTugas('');
    setPicId('');
    setDeadline('');
  }

  async function hapus(item: ActionItemNotulensi) {
    if (notulensiId) {
      setSibuk(item.id);
      try {
        await kirim(`/api/notulensi/${notulensiId}/action-item/${item.id}`, 'DELETE');
      } catch (e) {
        toast.error({ description: e instanceof Error ? e.message : 'Action item gagal dihapus.', suggestion: 'Muat ulang halaman lalu coba lagi.' });
        return;
      } finally {
        setSibuk(null);
      }
    }
    onUbah(items.filter((x) => x.id !== item.id));
  }

  async function konversi(item: ActionItemNotulensi) {
    if (!notulensiId) return;
    const tujuan = departemenNotulensi ?? item.departemen_id;
    if (!tujuan) {
      toast.error({ description: 'Departemen tujuan belum dipilih.', suggestion: 'Pilih departemen tujuan, lalu jadikan kartu Kanban.' });
      return;
    }
    setSibuk(item.id);
    try {
      const { kanban_card_id } = await kirim<{ kanban_card_id: string }>(
        `/api/notulensi/${notulensiId}/action-item/${item.id}/convert`,
        'POST',
        { departemen_id: himpunan ? tujuan : undefined },
      );
      onUbah(items.map((x) => (x.id === item.id ? { ...x, kanban_card_id, departemen_id: tujuan } : x)));
      toast.success({ description: `Kartu Kanban dibuat di ${dept(tujuan)?.nama ?? 'departemen tujuan'}.` });
    } catch (e) {
      toast.error({ description: e instanceof Error ? e.message : 'Konversi gagal.', suggestion: 'Muat ulang halaman untuk melihat status terbaru.' });
    } finally {
      setSibuk(null);
    }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="text-[13px] text-secondary">Belum ada action item.</p> : null}
      <ul className="space-y-2">
        {items.map((item) => {
          const tujuan = dept(departemenNotulensi ?? item.departemen_id);
          const sudah = Boolean(item.kanban_card_id);
          return (
            <li
              key={item.id}
              data-testid={`notulensi-action-item-${item.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-default px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium break-words text-primary">{item.tugas}</p>
                <p className="text-[12px] text-secondary">
                  PIC: {item.pic_nama ?? '—'} · Deadline: {item.deadline ? formatTanggalPendek(item.deadline) : '—'}
                  {!himpunan || sudah ? ` · ${tujuan?.nama ?? '—'}` : null}
                </p>
              </div>

              {sudah ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--success)]">
                  <KanbanSquare className="size-3.5" aria-hidden="true" />
                  Sudah jadi kartu Kanban
                  {tujuan ? (
                    <Link href={`/departemen/${tujuan.kode}/kanban`} className="text-link underline-offset-4 hover:underline">
                      Buka
                    </Link>
                  ) : null}
                </span>
              ) : editable ? (
                <div className="flex flex-wrap items-center gap-2">
                  {himpunan ? (
                    <Select
                      data-testid={`notulensi-action-dept-${item.id}`}
                      aria-label={`Departemen tujuan untuk ${item.tugas}`}
                      placeholder="Departemen tujuan"
                      className="w-48"
                      value={item.departemen_id ?? ''}
                      onChange={(e) =>
                        onUbah(items.map((x) => (x.id === item.id ? { ...x, departemen_id: e.target.value || null } : x)))
                      }
                    >
                      {departemen.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nama}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  {notulensiId ? (
                    <Button
                      variant="secondary"
                      data-testid={`notulensi-action-konversi-${item.id}`}
                      loading={sibuk === item.id}
                      onClick={() => void konversi(item)}
                    >
                      <KanbanSquare aria-hidden="true" />
                      Jadikan kartu Kanban
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    className="w-[34px] px-0"
                    aria-label={`Hapus action item ${item.tugas}`}
                    disabled={sibuk === item.id}
                    onClick={() => void hapus(item)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!notulensiId && editable && items.length > 0 ? (
        <p className="text-[12px] text-secondary">
          Tombol &quot;Jadikan kartu Kanban&quot; tersedia setelah notulensi disimpan.
        </p>
      ) : null}

      {editable ? (
        <div className="grid gap-2 rounded-sm border border-dashed border-default p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_10rem_auto] sm:items-start">
          <Input
            aria-label="Tugas action item"
            placeholder="Tugas yang harus dikerjakan"
            value={tugas}
            maxLength={500}
            error={galat ?? undefined}
            onChange={(e) => setTugas(e.target.value)}
          />
          <Select aria-label="PIC" placeholder={null} value={picId} onChange={(e) => setPicId(e.target.value)}>
            <option value="">PIC (opsional)</option>
            {pengurus.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.nama_lengkap}
              </option>
            ))}
          </Select>
          <Input type="date" aria-label="Deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <Button variant="secondary" loading={sibuk === 'tambah'} onClick={() => void tambah()}>
            <Plus aria-hidden="true" />
            Tambah
          </Button>
          {himpunan ? (
            <Select
              aria-label="Departemen tujuan action item baru"
              placeholder={null}
              className="sm:col-span-2"
              value={deptBaru}
              onChange={(e) => setDeptBaru(e.target.value)}
            >
              <option value="">Departemen tujuan (bisa dipilih nanti)</option>
              {departemen.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nama}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
