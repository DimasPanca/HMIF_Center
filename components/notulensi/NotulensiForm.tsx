'use client';

import type { JSONContent } from '@tiptap/react';
import { FileDown, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ActionItemList, type OpsiDepartemen } from '@/components/notulensi/ActionItemList';
import { DaftarHadir, type BarisHadir } from '@/components/notulensi/DaftarHadir';
import { NotulensiEditor } from '@/components/notulensi/NotulensiEditor';
import { PoinKeputusan } from '@/components/notulensi/PoinKeputusan';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ToastProvider, useToast } from '@/components/ui/toast';
import type { ActionItemNotulensi, NotulensiDetail, Pengurus } from '@/lib/notulensi/service';
import { SkemaBuatNotulensi, SkemaPerbaruiNotulensi, type StatusKehadiran } from '@/lib/notulensi/skema';
import { formatTanggalPanjang, tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

const HIMPUNAN = 'HIMPUNAN';
const DOKUMEN_KOSONG: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

type Galat = Partial<Record<'judul' | 'tanggal' | 'waktu_mulai' | 'waktu_selesai' | 'tempat' | 'departemen_id', string>>;

const PESAN_FIELD: Record<keyof Galat, string> = {
  judul: 'Judul rapat wajib diisi (maksimal 300 karakter).',
  tanggal: 'Tanggal rapat wajib diisi.',
  waktu_mulai: 'Format waktu tidak valid.',
  waktu_selesai: 'Waktu selesai harus setelah waktu mulai.',
  tempat: 'Tempat maksimal 300 karakter.',
  departemen_id: 'Pilih tujuan notulensi.',
};

interface NotulensiFormProps {
  /** `null` = notulensi baru. */
  awal: NotulensiDetail | null;
  editable: boolean;
  /** Tujuan yang boleh dipilih saat membuat (mode baru saja). */
  pilihanTujuan?: { himpunan: boolean; departemen: OpsiDepartemen[] };
  /** Seluruh departemen aktif — untuk tujuan action item & tautan Kanban. */
  departemen: OpsiDepartemen[];
}

interface Meta {
  judul: string;
  tanggal: string;
  waktu_mulai: string;
  waktu_selesai: string;
  tempat: string;
  pemimpin_id: string;
  notulis_id: string;
  tujuan: string;
}

function metaAwal(awal: NotulensiDetail | null, pilihan: NotulensiFormProps['pilihanTujuan']): Meta {
  return {
    judul: awal?.judul ?? '',
    tanggal: awal?.tanggal ?? tanggalHariIniJakarta(),
    waktu_mulai: awal?.waktu_mulai ?? '',
    waktu_selesai: awal?.waktu_selesai ?? '',
    tempat: awal?.tempat ?? '',
    pemimpin_id: awal?.pemimpin_id ?? '',
    notulis_id: awal?.notulis_id ?? '',
    tujuan: awal
      ? (awal.departemen_id ?? HIMPUNAN)
      : pilihan?.himpunan
        ? HIMPUNAN
        : (pilihan?.departemen[0]?.id ?? ''),
  };
}

const kosongJadiNull = (v: string) => (v.trim() === '' ? null : v.trim());

function Form({ awal, editable, pilihanTujuan, departemen }: NotulensiFormProps) {
  const router = useRouter();
  const toast = useToast();
  const baru = awal === null;

  const [meta, setMeta] = useState<Meta>(() => metaAwal(awal, pilihanTujuan));
  const konten = useRef<JSONContent>((awal?.konten as JSONContent | undefined) ?? DOKUMEN_KOSONG);
  const [keputusan, setKeputusan] = useState<string[]>(awal?.keputusan ?? []);
  const [status, setStatus] = useState<Record<string, StatusKehadiran>>(() =>
    Object.fromEntries((awal?.kehadiran ?? []).map((k) => [k.user_id, k.status])),
  );
  const [items, setItems] = useState<ActionItemNotulensi[]>(awal?.action_items ?? []);
  const [pengurus, setPengurus] = useState<Pengurus[]>([]);
  const [memuatPengurus, setMemuatPengurus] = useState(editable);
  const [galat, setGalat] = useState<Galat>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [membuatDocx, setMembuatDocx] = useState(false);

  useEffect(() => {
    if (!editable) return;
    let aktif = true;
    fetch('/api/notulensi/pengurus', { cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json()) as { ok: boolean; data?: Pengurus[]; error?: { message?: string } };
        if (!res.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? 'Daftar pengurus gagal dimuat.');
        if (aktif) setPengurus(body.data);
      })
      .catch((e: unknown) => {
        if (aktif) {
          toast.error({
            description: e instanceof Error ? e.message : 'Daftar pengurus gagal dimuat.',
            suggestion: 'Muat ulang halaman untuk mencoba lagi.',
          });
        }
      })
      .finally(() => {
        if (aktif) setMemuatPengurus(false);
      });
    return () => {
      aktif = false;
    };
  }, [editable, toast]);

  // Satu orang bisa punya beberapa baris pengurus (jabatan); opsi orang cukup sekali.
  const opsiOrang = useMemo(
    () => [...new Map(pengurus.map((p) => [p.user_id, { user_id: p.user_id, nama_lengkap: p.nama_lengkap }])).values()],
    [pengurus],
  );

  const departemenNotulensi = meta.tujuan === HIMPUNAN || meta.tujuan === '' ? null : meta.tujuan;

  const barisHadir = useMemo<BarisHadir[]>(() => {
    const peta = new Map<string, BarisHadir>();
    if (editable) {
      for (const p of pengurus) {
        if (departemenNotulensi && p.departemen_id !== departemenNotulensi) continue;
        const ada = peta.get(p.user_id);
        peta.set(p.user_id, {
          user_id: p.user_id,
          nama: p.nama_lengkap,
          jabatan: ada?.jabatan ? `${ada.jabatan}, ${p.jabatan}` : p.jabatan,
        });
      }
    }
    // Orang yang sudah tercatat hadir tetap tampil walau kini tak lagi di daftar pengurus.
    for (const k of awal?.kehadiran ?? []) {
      if (!peta.has(k.user_id)) peta.set(k.user_id, { user_id: k.user_id, nama: k.nama, jabatan: null });
    }
    return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'));
  }, [awal, editable, pengurus, departemenNotulensi]);

  const ubahMeta = (kunci: keyof Meta) => (e: { target: { value: string } }) =>
    setMeta((m) => ({ ...m, [kunci]: e.target.value }));

  function ubahHadir(userId: string, s: StatusKehadiran | null) {
    setStatus((lama) => {
      const baruStatus = { ...lama };
      if (s) baruStatus[userId] = s;
      else delete baruStatus[userId];
      return baruStatus;
    });
  }

  function tandaiSemuaHadir() {
    setStatus((lama) => {
      const baruStatus = { ...lama };
      for (const b of barisHadir) baruStatus[b.user_id] ??= 'HADIR';
      return baruStatus;
    });
  }

  function petakanGalat(issues: { path: PropertyKey[] }[]): Galat {
    const hasil: Galat = {};
    for (const isu of issues) {
      const kunci = String(isu.path[0]) as keyof Galat;
      if (kunci in PESAN_FIELD && !hasil[kunci]) hasil[kunci] = PESAN_FIELD[kunci];
    }
    return hasil;
  }

  async function simpan() {
    const terlihat = new Set(barisHadir.map((b) => b.user_id));
    const kehadiran = Object.entries(status)
      .filter(([id]) => terlihat.has(id))
      .map(([user_id, s]) => ({ user_id, status: s }));
    const umum = {
      judul: meta.judul,
      tanggal: meta.tanggal,
      waktu_mulai: kosongJadiNull(meta.waktu_mulai),
      waktu_selesai: kosongJadiNull(meta.waktu_selesai),
      tempat: kosongJadiNull(meta.tempat),
      pemimpin_id: kosongJadiNull(meta.pemimpin_id),
      notulis_id: kosongJadiNull(meta.notulis_id),
      konten: konten.current,
      keputusan,
      kehadiran,
    };

    if (baru && meta.tujuan === '') {
      setGalat({ departemen_id: PESAN_FIELD.departemen_id });
      return;
    }
    const payload = baru
      ? {
          ...umum,
          departemen_id: departemenNotulensi,
          action_items: items.map(({ tugas, pic_id, deadline, departemen_id }) => ({
            tugas,
            pic_id,
            deadline,
            departemen_id: departemenNotulensi ?? departemen_id,
          })),
        }
      : umum;
    const cek = (baru ? SkemaBuatNotulensi : SkemaPerbaruiNotulensi).safeParse(payload);
    if (!cek.success) {
      setGalat(petakanGalat(cek.error.issues));
      return;
    }
    setGalat({});

    setMenyimpan(true);
    try {
      const res = await fetch(baru ? '/api/notulensi' : `/api/notulensi/${awal!.id}`, {
        method: baru ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({ ok: false }))) as {
        ok: boolean;
        data?: { id: string };
        error?: { message?: string; details?: unknown };
      };
      if (!res.ok || !body.ok || !body.data) {
        if (Array.isArray(body.error?.details)) setGalat(petakanGalat(body.error.details as { path: PropertyKey[] }[]));
        toast.error({
          description: body.error?.message ?? 'Notulensi gagal disimpan.',
          suggestion: 'Periksa isian yang ditandai lalu coba lagi.',
        });
        return;
      }
      if (baru) {
        router.push(`/sekretariat/notulensi/${body.data.id}`);
      } else {
        toast.success({ description: 'Notulensi tersimpan.' });
        router.refresh();
      }
    } catch {
      toast.error({ description: 'Tidak dapat terhubung ke server.', suggestion: 'Periksa koneksi lalu coba lagi.' });
    } finally {
      setMenyimpan(false);
    }
  }

  async function unduhDocx() {
    if (!awal) return;
    setMembuatDocx(true);
    try {
      const res = await fetch(`/api/notulensi/${awal.id}/generate`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Dokumen gagal dibuat.');
      }
      const nama = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'notulensi.docx';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = nama;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error({
        description: e instanceof Error ? e.message : 'Dokumen gagal dibuat.',
        suggestion: 'Coba lagi beberapa saat lagi.',
      });
    } finally {
      setMembuatDocx(false);
    }
  }

  const namaTujuan =
    departemenNotulensi === null ? 'Himpunan' : (departemen.find((d) => d.id === departemenNotulensi)?.nama ?? '—');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        {!baru ? (
          <Button variant="secondary" data-testid="notulensi-generate" loading={membuatDocx} onClick={() => void unduhDocx()}>
            <FileDown aria-hidden="true" />
            Unduh DOCX
          </Button>
        ) : null}
        {editable ? (
          <Button data-testid="notulensi-simpan" loading={menyimpan} onClick={() => void simpan()}>
            <Save aria-hidden="true" />
            {baru ? 'Simpan notulensi' : 'Simpan perubahan'}
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi rapat</CardTitle>
        </CardHeader>
        <CardContent>
          {editable ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notulensi-judul" required>
                  Judul rapat
                </Label>
                <Input id="notulensi-judul" value={meta.judul} maxLength={300} onChange={ubahMeta('judul')} error={galat.judul} />
              </div>
              {baru ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="notulensi-tujuan" required>
                    Tingkat rapat
                  </Label>
                  <Select
                    id="notulensi-tujuan"
                    placeholder={null}
                    value={meta.tujuan}
                    onChange={ubahMeta('tujuan')}
                    error={galat.departemen_id}
                    helperText="Daftar hadir diambil dari pengurus sesuai tingkat rapat."
                  >
                    {pilihanTujuan?.himpunan ? <option value={HIMPUNAN}>Himpunan (seluruh pengurus)</option> : null}
                    {pilihanTujuan?.departemen.map((d) => (
                      <option key={d.id} value={d.id}>
                        Departemen {d.nama}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="notulensi-tanggal" required>
                  Tanggal
                </Label>
                <Input id="notulensi-tanggal" type="date" value={meta.tanggal} onChange={ubahMeta('tanggal')} error={galat.tanggal} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="notulensi-mulai">Mulai</Label>
                  <Input id="notulensi-mulai" type="time" value={meta.waktu_mulai} onChange={ubahMeta('waktu_mulai')} error={galat.waktu_mulai} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notulensi-selesai">Selesai</Label>
                  <Input id="notulensi-selesai" type="time" value={meta.waktu_selesai} onChange={ubahMeta('waktu_selesai')} error={galat.waktu_selesai} />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notulensi-tempat">Tempat</Label>
                <Input id="notulensi-tempat" value={meta.tempat} maxLength={300} onChange={ubahMeta('tempat')} error={galat.tempat} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notulensi-pemimpin">Pemimpin rapat</Label>
                <Select id="notulensi-pemimpin" placeholder={null} loading={memuatPengurus} value={meta.pemimpin_id} onChange={ubahMeta('pemimpin_id')}>
                  <option value="">— Belum dipilih —</option>
                  {awal?.pemimpin_id && !opsiOrang.some((o) => o.user_id === awal.pemimpin_id) ? (
                    <option value={awal.pemimpin_id}>{awal.pemimpin_nama}</option>
                  ) : null}
                  {opsiOrang.map((o) => (
                    <option key={o.user_id} value={o.user_id}>
                      {o.nama_lengkap}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notulensi-notulis">Notulis</Label>
                <Select id="notulensi-notulis" placeholder={null} loading={memuatPengurus} value={meta.notulis_id} onChange={ubahMeta('notulis_id')}>
                  <option value="">— Belum dipilih —</option>
                  {awal?.notulis_id && !opsiOrang.some((o) => o.user_id === awal.notulis_id) ? (
                    <option value={awal.notulis_id}>{awal.notulis_nama}</option>
                  ) : null}
                  {opsiOrang.map((o) => (
                    <option key={o.user_id} value={o.user_id}>
                      {o.nama_lengkap}
                    </option>
                  ))}
                </Select>
              </div>
              {!baru ? (
                <p className="text-[13px] text-secondary sm:col-span-2">
                  Tingkat rapat: <span className="font-medium text-primary">{namaTujuan}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
              {[
                ['Tanggal', awal ? formatTanggalPanjang(awal.tanggal) : '—'],
                ['Waktu', awal?.waktu_mulai ? `${awal.waktu_mulai}${awal.waktu_selesai ? ` – ${awal.waktu_selesai}` : ''}` : '—'],
                ['Tempat', awal?.tempat || '—'],
                ['Tingkat rapat', namaTujuan],
                ['Pemimpin rapat', awal?.pemimpin_nama ?? '—'],
                ['Notulis', awal?.notulis_nama ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-secondary">{k}</dt>
                  <dd className="text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Isi notulensi</CardTitle>
          <CardDescription>Pembahasan rapat. Daftar hadir dan keputusan dicatat terpisah di bawah.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotulensiEditor
            konten={konten.current}
            editable={editable}
            onChange={(k) => {
              konten.current = k;
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar hadir</CardTitle>
        </CardHeader>
        <CardContent>
          <DaftarHadir
            baris={barisHadir}
            status={status}
            editable={editable}
            memuat={memuatPengurus}
            onUbah={ubahHadir}
            onTandaiSemuaHadir={tandaiSemuaHadir}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Poin keputusan</CardTitle>
        </CardHeader>
        <CardContent>
          <PoinKeputusan keputusan={keputusan} editable={editable} onUbah={setKeputusan} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action item</CardTitle>
          <CardDescription>Tugas tindak lanjut; bisa dijadikan kartu Kanban departemen tujuan.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionItemList
            notulensiId={awal?.id ?? null}
            departemenNotulensi={departemenNotulensi}
            items={items}
            onUbah={setItems}
            pengurus={opsiOrang}
            departemen={departemen}
            editable={editable}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function NotulensiForm(props: NotulensiFormProps) {
  return (
    <ToastProvider>
      <Form {...props} />
    </ToastProvider>
  );
}
