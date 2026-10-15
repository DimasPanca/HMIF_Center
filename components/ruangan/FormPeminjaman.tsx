'use client';

/**
 * Form peminjaman ruangan (T-108, USER_FLOW §9.3). Validasi klien memakai
 * `SkemaBooking` yang sama dengan server (K-04).
 *
 * Bentrok dijawab server 409 `BENTROK`; form lalu menampilkan
 * `PeringatanBentrok` dan "Tetap simpan" mengirim ulang dengan
 * `lanjutkan_meski_bentrok: true`. Sesudah tersimpan, pengguna ditawari
 * langsung membuat Surat Peminjaman Ruangan.
 *
 * Test id: form-booking-{ruangan|kegiatan|tanggal|mulai|selesai|peserta|keperluan},
 * form-booking-simpan, form-booking-galat, form-booking-buat-surat.
 */

import * as React from 'react';

import { PeringatanBentrok } from '@/components/ruangan/PeringatanBentrok';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { DetailBentrok } from '@/lib/ruangan/bentrok';
import { SkemaBooking } from '@/lib/ruangan/skema';
import type { BarisRuangan } from '@/lib/ruangan/service';

interface Isian {
  ruangan_id: string;
  kegiatan: string;
  tanggal: string;
  waktu_mulai: string;
  waktu_selesai: string;
  jumlah_peserta: string;
  keperluan: string;
}

const kosong = (tanggal: string): Isian => ({
  ruangan_id: '',
  kegiatan: '',
  tanggal,
  waktu_mulai: '',
  waktu_selesai: '',
  jumlah_peserta: '',
  keperluan: '',
});

type Jawaban = { ok?: boolean; data?: { id: string }; error?: { code?: string; message?: string; details?: { bentrok?: DetailBentrok[] } } };

export function FormPeminjaman({
  open,
  onOpenChange,
  ruangan,
  tanggalAwal,
  bolehSurat,
  onTersimpan,
  onBuatSurat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruangan: BarisRuangan[];
  tanggalAwal: string;
  bolehSurat: boolean;
  onTersimpan: () => void;
  onBuatSurat: (bookingId: string) => Promise<void>;
}) {
  const [nilai, setNilai] = React.useState<Isian>(() => kosong(tanggalAwal));
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const [bentrok, setBentrok] = React.useState<DetailBentrok[] | null>(null);
  const [tersimpan, setTersimpan] = React.useState<string | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (open) {
      setNilai(kosong(tanggalAwal));
      setGalat(null);
      setBentrok(null);
      setTersimpan(null);
    }
  }, [open, tanggalAwal]);

  const ubah = (k: keyof Isian, v: string) => {
    setNilai((n) => ({ ...n, [k]: v }));
    // Jadwal berubah → peringatan lama tidak lagi berlaku.
    if (k === 'ruangan_id' || k === 'tanggal' || k === 'waktu_mulai' || k === 'waktu_selesai') setBentrok(null);
  };

  async function kirim(lanjut: boolean) {
    const data = {
      ...nilai,
      waktu_selesai: nilai.waktu_selesai || null,
      jumlah_peserta: nilai.jumlah_peserta.trim() ? Number(nilai.jumlah_peserta) : null,
      keperluan: nilai.keperluan || null,
    };
    const p = SkemaBooking.safeParse(data);
    if (!p.success) {
      setGalat(p.error.issues[0]?.message ?? 'Isian tidak valid.');
      return;
    }
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch('/api/ruangan/booking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...p.data, lanjutkan_meski_bentrok: lanjut }),
      });
      const isi = (await r.json().catch(() => null)) as Jawaban | null;
      if (isi?.error?.code === 'BENTROK') {
        setBentrok(isi.error.details?.bentrok ?? []);
        return;
      }
      if (!r.ok || !isi?.ok || !isi.data) {
        setGalat(isi?.error?.message ?? 'Gagal menyimpan peminjaman.');
        return;
      }
      setBentrok(null);
      setTersimpan(isi.data.id);
      onTersimpan();
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  async function buatSurat() {
    if (!tersimpan) return;
    setProses(true);
    try {
      await onBuatSurat(tersimpan);
    } finally {
      setProses(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(b) => !proses && onOpenChange(b)}>
      <DialogContent className="max-w-lg">
        {tersimpan ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Peminjaman tercatat</DialogTitle>
              <DialogDescription>Jadwal sudah tampil di kalender booking. Buat surat peminjamannya sekarang?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={proses} onClick={() => onOpenChange(false)}>
                Nanti
              </Button>
              {bolehSurat ? (
                <Button type="button" loading={proses} onClick={() => void buatSurat()} data-testid="form-booking-buat-surat">
                  Buat Surat Peminjaman Ruangan
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void kirim(false);
            }}
            className="grid gap-4"
            noValidate
          >
            <DialogHeader>
              <DialogTitle>Catat peminjaman ruangan</DialogTitle>
              <DialogDescription>Jadwal bentrok hanya diperingatkan — keputusan akhir ada di Dekanat.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-ruangan`}>Ruangan</Label>
                <Select
                  id={`${id}-ruangan`}
                  placeholder={null}
                  value={nilai.ruangan_id}
                  onChange={(e) => ubah('ruangan_id', e.target.value)}
                  data-testid="form-booking-ruangan"
                >
                  <option value="">— Pilih ruangan —</option>
                  {ruangan.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nama}
                      {r.kapasitas ? ` (${r.kapasitas} orang)` : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-kegiatan`}>Kegiatan</Label>
                <Input
                  id={`${id}-kegiatan`}
                  value={nilai.kegiatan}
                  onChange={(e) => ubah('kegiatan', e.target.value)}
                  maxLength={200}
                  placeholder="Contoh: MUSMAIF"
                  data-testid="form-booking-kegiatan"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-tanggal`}>Hari, tanggal</Label>
                  <Input id={`${id}-tanggal`} type="date" value={nilai.tanggal} onChange={(e) => ubah('tanggal', e.target.value)} data-testid="form-booking-tanggal" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-mulai`}>Mulai</Label>
                  <Input id={`${id}-mulai`} type="time" value={nilai.waktu_mulai} onChange={(e) => ubah('waktu_mulai', e.target.value)} data-testid="form-booking-mulai" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-selesai`}>Selesai</Label>
                  <Input
                    id={`${id}-selesai`}
                    type="time"
                    value={nilai.waktu_selesai}
                    onChange={(e) => ubah('waktu_selesai', e.target.value)}
                    aria-describedby={`${id}-selesai-bantu`}
                    data-testid="form-booking-selesai"
                  />
                </div>
              </div>
              <p id={`${id}-selesai-bantu`} className="-mt-1.5 text-[12px] text-tertiary">
                Kosongkan jam selesai untuk &quot;s.d. selesai&quot;.
              </p>
              <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-peserta`}>Jumlah peserta</Label>
                  <Input
                    id={`${id}-peserta`}
                    inputMode="numeric"
                    value={nilai.jumlah_peserta}
                    onChange={(e) => ubah('jumlah_peserta', e.target.value)}
                    maxLength={6}
                    data-testid="form-booking-peserta"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-keperluan`}>Keperluan</Label>
                  <Input
                    id={`${id}-keperluan`}
                    value={nilai.keperluan}
                    onChange={(e) => ubah('keperluan', e.target.value)}
                    maxLength={500}
                    placeholder="Contoh: Musyawarah Mahasiswa"
                    data-testid="form-booking-keperluan"
                  />
                </div>
              </div>
            </div>

            {bentrok ? <PeringatanBentrok bentrok={bentrok} proses={proses} onLanjut={() => void kirim(true)} onBatal={() => setBentrok(null)} /> : null}

            {galat ? (
              <p role="alert" data-testid="form-booking-galat" className="text-[13px] text-danger">
                {galat}
              </p>
            ) : null}

            {bentrok ? null : (
              <DialogFooter>
                <Button type="button" variant="secondary" disabled={proses} onClick={() => onOpenChange(false)}>
                  Batal
                </Button>
                <Button type="submit" loading={proses} data-testid="form-booking-simpan">
                  Simpan peminjaman
                </Button>
              </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
