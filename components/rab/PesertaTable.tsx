'use client';

/**
 * Data peserta acara (T-092, PRD F-9.4): No · Nama Lengkap · NIM · Status Bayar
 * (centang — boolean, bukan teks) · Tanggal Bayar · Jumlah. Mencentang "bayar"
 * langsung tersimpan dan mengisi tanggal hari ini bila kosong; membatalkannya
 * mengosongkan tanggal (CHECK peserta_tanggal_konsisten).
 *
 * Import massal CSV/XLSX lewat parse-tabel (T-048): pratinjau valid/peringatan/
 * error dulu, simpan sesudah dikonfirmasi.
 *
 * Tanpa hak tulis: teks biasa, tanpa input (pola INV-30).
 *
 * Test id: peserta-tabel, peserta-item (data-id), peserta-bayar, peserta-tanggal,
 * peserta-jumlah, peserta-hapus, peserta-baru-{nama|nim|jumlah}, peserta-tambah,
 * peserta-impor, peserta-impor-berkas, peserta-impor-ringkas, peserta-impor-simpan,
 * peserta-impor-laporan, peserta-galat.
 */

import { FileUp, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { CurrencyInput } from '@/components/rab/CurrencyInput';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LabelKolomOtomatis } from '@/components/ui/table-label';
import type { DataPemasukan, IzinPemasukan, LaporanImportPeserta, PratinjauImportPeserta } from '@/lib/rab/pemasukan';
import type { BarisPeserta } from '@/lib/rab/pemasukan-skema';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPendek, tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

type Jawaban<T> = { ok?: boolean; data?: T; error?: { message?: string } };

const SEL = 'h-8 w-full rounded-sm border border-transparent bg-transparent px-1.5 text-[13px] outline-none hover:border-default focus:border-[var(--border-focus)] focus:bg-panel';

function ImporPeserta({ url, onSelesai }: { url: string; onSelesai: () => void }) {
  const [buka, setBuka] = React.useState(false);
  const [berkas, setBerkas] = React.useState<File | null>(null);
  const [pratinjau, setPratinjau] = React.useState<PratinjauImportPeserta | null>(null);
  const [laporan, setLaporan] = React.useState<LaporanImportPeserta | null>(null);
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  async function kirim<T>(mode: 'pratinjau' | 'simpan', f: File): Promise<T | null> {
    setProses(true);
    setGalat(null);
    try {
      const fd = new FormData();
      fd.set('berkas', f);
      fd.set('mode', mode);
      const r = await fetch(url, { method: 'POST', body: fd });
      const isi = (await r.json().catch(() => null)) as Jawaban<T> | null;
      if (!r.ok || !isi?.ok || !isi.data) {
        setGalat(isi?.error?.message ?? 'Berkas gagal diproses.');
        return null;
      }
      return isi.data;
    } catch {
      setGalat('Tidak dapat menghubungi server.');
      return null;
    } finally {
      setProses(false);
    }
  }

  const tersimpan = pratinjau ? pratinjau.ringkas.valid + pratinjau.ringkas.peringatan : 0;

  return (
    <>
      <Button variant="secondary" onClick={() => setBuka(true)} data-testid="peserta-impor">
        <FileUp aria-hidden="true" /> Import peserta
      </Button>
      <Dialog
        open={buka}
        onOpenChange={(b) => {
          if (proses) return;
          setBuka(b);
          if (!b) {
            setBerkas(null);
            setPratinjau(null);
            setLaporan(null);
            setGalat(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import data peserta</DialogTitle>
            <DialogDescription>CSV atau XLSX dengan kolom Nama Lengkap (wajib), NIM, Status Bayar (Ya/Belum), Tanggal Bayar, Jumlah. NIM yang sudah terdaftar diperbarui.</DialogDescription>
          </DialogHeader>
          {laporan ? (
            <p data-testid="peserta-impor-laporan" className="text-[13px]">
              {laporan.baru} peserta baru · {laporan.diperbarui} diperbarui · {laporan.dilewati.length} dilewati
            </p>
          ) : (
            <>
              <input
                type="file"
                accept=".csv,.xlsx"
                data-testid="peserta-impor-berkas"
                className="text-[13px]"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBerkas(f);
                  void kirim<PratinjauImportPeserta>('pratinjau', f).then((p) => p && setPratinjau(p));
                }}
              />
              {pratinjau ? (
                <div className="grid gap-2">
                  <p data-testid="peserta-impor-ringkas" className="text-[13px]">
                    {pratinjau.ringkas.valid} baris valid · {pratinjau.ringkas.peringatan} baris peringatan · {pratinjau.ringkas.error} baris error
                    {pratinjau.hilang.length ? ` · kolom wajib tidak ditemukan: ${pratinjau.hilang.join(', ')}` : ''}
                  </p>
                  <div className="max-h-[45dvh] overflow-auto rounded-sm border border-default">
                    <table className="w-full border-collapse text-[12px]">
                      <thead className="sticky top-0 bg-subtle text-left text-[11px] text-tertiary uppercase">
                        <tr>
                          <th className="px-2 py-1">Baris</th>
                          <th className="px-2 py-1">Status</th>
                          {pratinjau.header.map((h, i) => (
                            <th key={i} className="px-2 py-1">
                              {h}
                            </th>
                          ))}
                          <th className="px-2 py-1">Catatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pratinjau.baris.map((b) => (
                          <tr key={b.nomor} data-status={b.status} className="border-t border-default">
                            <td className="px-2 py-1 tabular-nums">{b.nomor}</td>
                            <td className="px-2 py-1">{b.status === 'VALID' ? 'Valid' : b.status === 'PERINGATAN' ? 'Peringatan' : 'Error'}</td>
                            {pratinjau.header.map((_, i) => (
                              <td key={i} className="px-2 py-1">
                                {b.sel[i] ?? ''}
                              </td>
                            ))}
                            <td className="px-2 py-1 text-secondary">{b.masalah.map((m) => m.pesan).join(' ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
          {galat ? (
            <p role="alert" data-testid="peserta-galat" className="text-[13px] text-danger">
              {galat}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={proses} onClick={() => setBuka(false)}>
              {laporan ? 'Tutup' : 'Batal'}
            </Button>
            {!laporan ? (
              <Button
                loading={proses && !!pratinjau}
                disabled={!pratinjau || !berkas || tersimpan === 0 || pratinjau.hilang.length > 0}
                data-testid="peserta-impor-simpan"
                onClick={() =>
                  berkas &&
                  void kirim<LaporanImportPeserta>('simpan', berkas).then((l) => {
                    if (l) {
                      setLaporan(l);
                      onSelesai();
                    }
                  })
                }
              >
                Import {tersimpan} baris
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PesertaTable({
  kepanitiaanId,
  peserta,
  izin,
  onData,
  onGalat,
}: {
  kepanitiaanId: string;
  peserta: BarisPeserta[];
  izin: IzinPemasukan;
  onData: (d: DataPemasukan) => void;
  onGalat: (pesan: string) => void;
}) {
  const url = `/api/kepanitiaan/${kepanitiaanId}/peserta`;
  const [baru, setBaru] = React.useState({ nama: '', nim: '', jumlah: 0 });
  const [jumlahDraf, setJumlahDraf] = React.useState<Record<string, number>>({});
  // Centang optimistis: berubah seketika, kembali bila server menolak.
  const [bayarSementara, setBayarSementara] = React.useState<Record<string, boolean>>({});
  const [sibuk, setSibuk] = React.useState(false);

  async function panggil(method: string, body?: unknown, query = '') {
    setSibuk(true);
    try {
      const r = await fetch(`${url}${query}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const isi = (await r.json().catch(() => null)) as Jawaban<DataPemasukan> | null;
      if (!r.ok || !isi?.ok || !isi.data) throw new Error(isi?.error?.message ?? 'Perubahan gagal disimpan.');
      onData(isi.data);
      return true;
    } catch (e) {
      onGalat(e instanceof Error ? e.message : 'Perubahan gagal disimpan.');
      return false;
    } finally {
      setSibuk(false);
    }
  }

  async function muatUlang() {
    const r = await fetch(url);
    const isi = (await r.json().catch(() => null)) as Jawaban<DataPemasukan> | null;
    if (isi?.ok && isi.data) onData(isi.data);
  }

  return (
    <div className="grid gap-2" data-testid="peserta-tabel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">Data peserta</h3>
        {izin.tulis ? <ImporPeserta url={url} onSelesai={() => void muatUlang()} /> : null}
      </div>
      <div data-kartu-hp="" className="rounded-sm border border-default md:overflow-x-auto">
        <LabelKolomOtomatis />
        <table className="w-full border-collapse text-[13px] md:min-w-[640px]">
          <thead className="bg-subtle text-left text-[11px] font-semibold tracking-wide text-tertiary uppercase">
            <tr>
              <th className="w-10 px-2 py-1.5">No</th>
              <th className="px-2 py-1.5">Nama lengkap</th>
              <th className="px-2 py-1.5">NIM</th>
              <th className="px-2 py-1.5">Bayar</th>
              <th className="px-2 py-1.5">Tgl bayar</th>
              <th className="px-2 py-1.5 text-right">Jumlah</th>
              <th className="w-9" aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {peserta.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-secondary">
                  Belum ada peserta.
                </td>
              </tr>
            ) : null}
            {peserta.map((p) => (
              <tr key={p.id} data-testid="peserta-item" data-id={p.id} className="border-t border-default">
                <td className="px-2 py-1 tabular-nums text-secondary">{p.no_urut}</td>
                <td className="px-2 py-1">{p.nama_lengkap}</td>
                <td className="px-2 py-1 tabular-nums">{p.nim ?? '—'}</td>
                <td className="px-2 py-1">
                  {izin.tulis ? (
                    <input
                      type="checkbox"
                      checked={bayarSementara[p.id] ?? p.sudah_bayar}
                      aria-label={`Status bayar ${p.nama_lengkap}`}
                      data-testid="peserta-bayar"
                      className="size-4"
                      onChange={(e) => {
                        const centang = e.target.checked;
                        setBayarSementara((b) => ({ ...b, [p.id]: centang }));
                        void panggil('PATCH', {
                          id: p.id,
                          sudah_bayar: centang,
                          ...(centang && !p.tanggal_bayar ? { tanggal_bayar: tanggalHariIniJakarta() } : {}),
                        }).finally(() => setBayarSementara((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== p.id))));
                      }}
                    />
                  ) : p.sudah_bayar ? (
                    'Sudah'
                  ) : (
                    'Belum'
                  )}
                </td>
                <td className="px-2 py-1">
                  {izin.tulis && p.sudah_bayar ? (
                    <input
                      type="date"
                      value={p.tanggal_bayar ?? ''}
                      aria-label={`Tanggal bayar ${p.nama_lengkap}`}
                      data-testid="peserta-tanggal"
                      className={SEL}
                      onChange={(e) => void panggil('PATCH', { id: p.id, tanggal_bayar: e.target.value || null })}
                    />
                  ) : p.tanggal_bayar ? (
                    formatTanggalPendek(p.tanggal_bayar)
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {izin.tulis ? (
                    <CurrencyInput
                      value={jumlahDraf[p.id] ?? p.jumlah}
                      onNilai={(n) => setJumlahDraf((d) => ({ ...d, [p.id]: n }))}
                      onBlur={() => {
                        const n = jumlahDraf[p.id];
                        if (n !== undefined && n !== p.jumlah) void panggil('PATCH', { id: p.id, jumlah: n });
                        setJumlahDraf((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== p.id)));
                      }}
                      aria-label={`Jumlah ${p.nama_lengkap}`}
                      data-testid="peserta-jumlah"
                      className={SEL}
                    />
                  ) : (
                    formatRupiah(p.jumlah)
                  )}
                </td>
                <td className="py-1">
                  {izin.hapus ? (
                    <button
                      type="button"
                      onClick={() => void panggil('DELETE', undefined, `?baris=${p.id}`)}
                      aria-label={`Hapus peserta ${p.nama_lengkap}`}
                      data-testid="peserta-hapus"
                      className="flex size-8 items-center justify-center rounded-sm text-tertiary hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {izin.tulis ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void panggil('POST', { nama_lengkap: baru.nama, nim: baru.nim || null, jumlah: baru.jumlah, sudah_bayar: false }).then(
              (ok) => ok && setBaru({ nama: '', nim: '', jumlah: 0 }),
            );
          }}
        >
          <input value={baru.nama} onChange={(e) => setBaru((b) => ({ ...b, nama: e.target.value }))} placeholder="Nama lengkap" aria-label="Nama peserta baru" data-testid="peserta-baru-nama" maxLength={150} className="h-8 min-w-44 flex-1 rounded-sm border border-default bg-panel px-2 text-[13px]" />
          <input value={baru.nim} onChange={(e) => setBaru((b) => ({ ...b, nim: e.target.value }))} placeholder="NIM (opsional)" inputMode="numeric" aria-label="NIM peserta baru" data-testid="peserta-baru-nim" maxLength={20} className="h-8 w-36 rounded-sm border border-default bg-panel px-2 text-[13px]" />
          <CurrencyInput value={baru.jumlah} onNilai={(n) => setBaru((b) => ({ ...b, jumlah: n }))} aria-label="Jumlah peserta baru" data-testid="peserta-baru-jumlah" className="h-8 w-32 rounded-sm border border-default bg-panel px-2 text-[13px]" />
          <Button type="submit" variant="secondary" disabled={sibuk || !baru.nama.trim()} data-testid="peserta-tambah">
            <Plus aria-hidden="true" /> Tambah peserta
          </Button>
        </form>
      ) : null}
    </div>
  );
}
