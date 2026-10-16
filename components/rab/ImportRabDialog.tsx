'use client';

/**
 * Impor RAB dari Excel berformat template (T-091). PRATINJAU WAJIB: berkas
 * dibaca server lebih dulu, pengguna melihat item yang akan ditambah, diubah,
 * sama, atau dilewati (beserta alasannya), dan dapat mengisi "jumlah untuk
 * perhitungan" pada baris yang ditandai. Baru sesudah itu tombol Simpan aktif;
 * server menjalankan rencana yang sama persis.
 *
 * Impor tidak pernah menghapus item yang tidak ada di berkas.
 *
 * Test id: rab-impor (tombol), impor-berkas, impor-ringkas, impor-baris
 * (data-aksi, data-baris), impor-manual-{baris}, impor-simpan, impor-galat.
 */

import { FileUp } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AksiImpor, DataRab, RencanaImpor } from '@/lib/rab/service';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';

const NADA: Record<AksiImpor, 'success' | 'info' | 'neutral' | 'warning'> = { TAMBAH: 'success', UBAH: 'info', SAMA: 'neutral', LEWATI: 'warning' };
const LABEL: Record<AksiImpor, string> = { TAMBAH: 'Ditambah', UBAH: 'Diubah', SAMA: 'Sama', LEWATI: 'Dilewati' };

type Jawaban<T> = { ok?: boolean; data?: T; error?: { message?: string } };

export function ImportRabDialog({ kepanitiaanId, onSelesai }: { kepanitiaanId: string; onSelesai: (rab: DataRab) => void }) {
  const [buka, setBuka] = React.useState(false);
  const [berkas, setBerkas] = React.useState<File | null>(null);
  const [rencana, setRencana] = React.useState<RencanaImpor | null>(null);
  const [manual, setManual] = React.useState<Record<number, string>>({});
  const [semua, setSemua] = React.useState(false);
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  const reset = () => {
    setBerkas(null);
    setRencana(null);
    setManual({});
    setGalat(null);
    setSemua(false);
  };

  const angkaManual = () =>
    Object.fromEntries(
      Object.entries(manual)
        .map(([k, v]) => [k, Number(v.replace(',', '.'))] as const)
        .filter(([, v]) => Number.isFinite(v) && v >= 0),
    );

  async function kirim<T>(mode: 'pratinjau' | 'simpan', f: File): Promise<T | null> {
    setProses(true);
    setGalat(null);
    try {
      const fd = new FormData();
      fd.set('berkas', f);
      fd.set('mode', mode);
      fd.set('manual', JSON.stringify(angkaManual()));
      const r = await fetch(`/api/rab/${kepanitiaanId}/import`, { method: 'POST', body: fd });
      const isi = (await r.json().catch(() => null)) as Jawaban<T> | null;
      if (!r.ok || !isi?.ok || !isi.data) {
        setGalat(isi?.error?.message ?? 'Berkas gagal diproses.');
        return null;
      }
      return isi.data;
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
      return null;
    } finally {
      setProses(false);
    }
  }

  async function pratinjau(f: File) {
    setBerkas(f);
    setRencana(null);
    const r = await kirim<RencanaImpor>('pratinjau', f);
    if (r) setRencana(r);
  }

  async function simpan() {
    if (!berkas) return;
    const r = await kirim<{ rab: DataRab | null }>('simpan', berkas);
    if (r?.rab) {
      onSelesai(r.rab);
      setBuka(false);
      reset();
    }
  }

  const items = rencana?.baris.filter((b) => b.tingkat === 'ITEM') ?? [];
  const tampil = semua ? (rencana?.baris ?? []) : (rencana?.baris ?? []).filter((b) => b.aksi !== 'SAMA');
  const adaPerubahan = !!rencana && (rencana.ringkas.TAMBAH > 0 || rencana.ringkas.UBAH > 0);

  return (
    <>
      <Button variant="secondary" onClick={() => setBuka(true)} data-testid="rab-impor">
        <FileUp aria-hidden="true" /> Impor Excel
      </Button>
      <Dialog
        open={buka}
        onOpenChange={(b) => {
          if (proses) return;
          setBuka(b);
          if (!b) reset();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Impor RAB dari Excel</DialogTitle>
            <DialogDescription>
              Berkas harus berformat template RAB HMIF (sheet &quot;RAB&quot;). Item yang ada ditambah atau diperbarui; tidak ada yang dihapus.
            </DialogDescription>
          </DialogHeader>

          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pratinjau(f);
            }}
            data-testid="impor-berkas"
            className="text-[13px]"
          />

          {galat ? (
            <p role="alert" data-testid="impor-galat" className="rounded-sm bg-[var(--danger-subtle)] p-2 text-[13px]">
              {galat}
            </p>
          ) : null}

          {rencana ? (
            <div className="grid gap-2">
              <p data-testid="impor-ringkas" className="text-[13px]">
                {items.length} item di berkas: {rencana.ringkas.TAMBAH} ditambah · {rencana.ringkas.UBAH} diubah · {rencana.ringkas.SAMA} sama ·{' '}
                {rencana.ringkas.LEWATI} dilewati
              </p>
              <label className="flex items-center gap-2 text-[12px] text-secondary">
                <input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} /> Tampilkan juga baris yang sama
              </label>
              <div className="max-h-[50dvh] overflow-auto rounded-sm border border-default">
                <table className="w-full min-w-[640px] border-collapse text-[12px]">
                  <thead className="sticky top-0 bg-subtle text-left text-[11px] tracking-wide text-tertiary uppercase">
                    <tr>
                      <th className="px-2 py-1">Baris</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Divisi / sub-section / item</th>
                      <th className="px-2 py-1">Jumlah</th>
                      <th className="px-2 py-1 text-right">Total</th>
                      <th className="px-2 py-1">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tampil.map((b) => (
                      <tr key={`${b.tingkat}-${b.baris}`} data-testid="impor-baris" data-aksi={b.aksi} data-baris={b.baris} className={cn('border-t border-default align-top', b.butuhManual && 'bg-[var(--warning-subtle)]')}>
                        <td className="px-2 py-1 tabular-nums text-secondary">{b.baris}</td>
                        <td className="px-2 py-1">
                          <Badge tone={NADA[b.aksi]}>{LABEL[b.aksi]}</Badge>
                        </td>
                        <td className="px-2 py-1">
                          {b.tingkat === 'DIVISI' ? <strong>Divisi {b.divisi}</strong> : b.tingkat === 'SUB-SECTION' ? <em>{b.section || '(tanpa sub-section)'}</em> : b.jenis_barang || '—'}
                        </td>
                        <td className="px-2 py-1">
                          {b.tingkat === 'ITEM' ? (
                            <span className="grid gap-0.5">
                              <span>{b.jumlah_teks}</span>
                              {b.butuhManual || manual[b.baris] !== undefined ? (
                                <label className="flex items-center gap-1 text-[11px] text-[var(--warning)]">
                                  Jumlah untuk perhitungan
                                  <input
                                    inputMode="decimal"
                                    value={manual[b.baris] ?? ''}
                                    placeholder={b.jumlah_numerik !== null ? String(b.jumlah_numerik) : ''}
                                    onChange={(e) => setManual((m) => ({ ...m, [b.baris]: e.target.value }))}
                                    onBlur={() => berkas && void pratinjau(berkas)}
                                    data-testid={`impor-manual-${b.baris}`}
                                    className="h-6 w-16 rounded-sm border border-[var(--warning)] bg-panel px-1 text-right text-primary"
                                  />
                                </label>
                              ) : null}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{b.total !== null ? formatRupiah(b.total) : ''}</td>
                        <td className="px-2 py-1 text-secondary">{b.catatan ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={proses}
              onClick={() => {
                setBuka(false);
                reset();
              }}
            >
              Batal
            </Button>
            <Button onClick={() => void simpan()} loading={proses && !!rencana} disabled={!adaPerubahan} data-testid="impor-simpan">
              Simpan {rencana ? rencana.ringkas.TAMBAH + rencana.ringkas.UBAH : 0} perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
