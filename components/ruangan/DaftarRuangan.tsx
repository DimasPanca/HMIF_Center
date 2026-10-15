'use client';

/**
 * Daftar ruangan yang dikelola sendiri oleh Sekretaris (T-108, PRD F-14.2) —
 * form input bebas karena ketersediaannya bergantung pada Dekanat, bukan data
 * yang dapat ditarik dari mana pun.
 *
 * "Hapus" menonaktifkan: riwayat booking tetap merujuk ruangannya.
 *
 * Test id: ruangan-tambah, ruangan-item, ruangan-ubah,
 * form-ruangan-{nama|lokasi|kapasitas|pengelola|catatan}, form-ruangan-simpan,
 * form-ruangan-hapus, form-ruangan-galat.
 */

import { Building2, MapPin, Pencil, Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SkemaRuangan } from '@/lib/ruangan/skema';
import type { BarisRuangan } from '@/lib/ruangan/service';

interface Isian {
  nama: string;
  lokasi: string;
  kapasitas: string;
  pengelola: string;
  catatan: string;
}

const dariBaris = (r: BarisRuangan | null): Isian => ({
  nama: r?.nama ?? '',
  lokasi: r?.lokasi ?? '',
  kapasitas: r?.kapasitas ? String(r.kapasitas) : '',
  pengelola: r?.pengelola ?? '',
  catatan: r?.catatan ?? '',
});

function FormRuangan({
  open,
  onOpenChange,
  awal,
  onSelesai,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  awal: BarisRuangan | null;
  onSelesai: () => void;
}) {
  const [nilai, setNilai] = React.useState<Isian>(() => dariBaris(awal));
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const [yakinHapus, setYakinHapus] = React.useState(false);
  const id = React.useId();

  React.useEffect(() => {
    if (open) {
      setNilai(dariBaris(awal));
      setGalat(null);
      setYakinHapus(false);
    }
  }, [open, awal]);

  const ubah = (k: keyof Isian, v: string) => setNilai((n) => ({ ...n, [k]: v }));

  async function panggil(url: string, method: string, body?: unknown) {
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok) {
        setGalat(isi?.error?.message ?? 'Gagal menyimpan.');
        return;
      }
      onSelesai();
      onOpenChange(false);
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  function simpan(e: React.FormEvent) {
    e.preventDefault();
    const p = SkemaRuangan.safeParse({ ...nilai, kapasitas: nilai.kapasitas.trim() ? Number(nilai.kapasitas) : null });
    if (!p.success) {
      setGalat(p.error.issues[0]?.message ?? 'Isian tidak valid.');
      return;
    }
    void panggil(awal ? `/api/ruangan/${awal.id}` : '/api/ruangan', awal ? 'PATCH' : 'POST', p.data);
  }

  const kolom = (k: keyof Isian, label: string, maks: number, extra?: React.ComponentProps<typeof Input>) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-${k}`}>{label}</Label>
      <Input id={`${id}-${k}`} value={nilai[k]} onChange={(e) => ubah(k, e.target.value)} maxLength={maks} data-testid={`form-ruangan-${k}`} {...extra} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(b) => !proses && onOpenChange(b)}>
      <DialogContent className="max-w-lg">
        <form onSubmit={simpan} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{awal ? 'Ubah ruangan' : 'Tambah ruangan'}</DialogTitle>
            <DialogDescription>Daftar ini dikelola Sekretaris; ketersediaan sebenarnya tetap diputuskan pengelola ruangan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {kolom('nama', 'Nama ruangan', 150, { placeholder: 'Contoh: Auditorium FT' })}
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              {kolom('lokasi', 'Lokasi', 200, { placeholder: 'Gedung FT Lt.1' })}
              {kolom('kapasitas', 'Kapasitas', 6, { inputMode: 'numeric' })}
            </div>
            {kolom('pengelola', 'Instansi pengelola', 200, { placeholder: 'Contoh: Kepala Bagian Sekretariat FT' })}
            {kolom('catatan', 'Catatan', 500, { placeholder: 'Contoh: Perlu izin H-7' })}
          </div>
          {galat ? (
            <p role="alert" data-testid="form-ruangan-galat" className="text-[13px] text-danger">
              {galat}
            </p>
          ) : null}
          <DialogFooter className="sm:justify-between">
            {awal ? (
              yakinHapus ? (
                <Button type="button" variant="danger" disabled={proses} onClick={() => void panggil(`/api/ruangan/${awal.id}`, 'DELETE')} data-testid="form-ruangan-hapus">
                  Ya, nonaktifkan
                </Button>
              ) : (
                <Button type="button" variant="ghost" disabled={proses} onClick={() => setYakinHapus(true)}>
                  Nonaktifkan
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={proses} onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type="submit" loading={proses} data-testid="form-ruangan-simpan">
                Simpan
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DaftarRuangan({ ruangan, bolehKelola }: { ruangan: BarisRuangan[]; bolehKelola: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState<{ open: boolean; awal: BarisRuangan | null }>({ open: false, awal: null });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Daftar ruangan</h2>
        {bolehKelola ? (
          <Button variant="secondary" onClick={() => setForm({ open: true, awal: null })} data-testid="ruangan-tambah">
            <Plus aria-hidden="true" /> Tambah
          </Button>
        ) : null}
      </div>

      {ruangan.length === 0 ? (
        <p className="mt-3 text-[13px] text-secondary">
          {bolehKelola ? 'Belum ada ruangan. Tambahkan ruangan yang biasa dipinjam HMIF.' : 'Belum ada ruangan terdaftar. Minta Sekretaris menambahkannya.'}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {ruangan.map((r) => (
            <li key={r.id} data-testid="ruangan-item" className="rounded-sm border border-default p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[14px] font-medium">
                    <Building2 aria-hidden="true" className="size-4 shrink-0 text-tertiary" />
                    <span className="truncate">{r.nama}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-secondary">
                    {r.lokasi ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin aria-hidden="true" className="size-3.5" /> {r.lokasi}
                      </span>
                    ) : null}
                    {r.kapasitas ? (
                      <span className="inline-flex items-center gap-1">
                        <Users aria-hidden="true" className="size-3.5" /> {r.kapasitas} orang
                      </span>
                    ) : null}
                  </p>
                  {r.pengelola ? <p className="mt-0.5 text-[12px] text-secondary">Pengelola: {r.pengelola}</p> : null}
                  {r.catatan ? <p className="mt-0.5 text-[12px] text-tertiary">{r.catatan}</p> : null}
                </div>
                {bolehKelola ? (
                  <Button variant="ghost" aria-label={`Ubah ${r.nama}`} onClick={() => setForm({ open: true, awal: r })} data-testid="ruangan-ubah">
                    <Pencil aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormRuangan open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} awal={form.awal} onSelesai={() => router.refresh()} />
    </Card>
  );
}
