'use client';

/**
 * Panel PEMASUKAN acara (T-092, PRD F-9.4): ringkasan peserta (terkumpul,
 * sudah bayar, belum bayar), sumber dana lain sebagai baris manual, dan tabel
 * peserta. Ringkasan dihitung `ringkasPeserta` dari baris yang sedang tampil —
 * tidak pernah dari angka terpisah — jadi selalu konsisten dengan barisnya.
 *
 * Total pemasukan (terkumpul + sumber dana) adalah saldo awal sheet
 * PENGELUARAN (ekspor T-090) dan masukan analisis LPJ (T-104).
 *
 * Test id: pemasukan-panel, peserta-ringkas-{total|sudah|belum|terkumpul},
 * pemasukan-total, sumber-item (data-id), sumber-keterangan, sumber-saldo,
 * sumber-hapus, sumber-baru-keterangan, sumber-baru-saldo, sumber-tambah.
 */

import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { CurrencyInput } from '@/components/rab/CurrencyInput';
import { PesertaTable } from '@/components/rab/PesertaTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToastProvider, useToast } from '@/components/ui/toast';
import type { DataPemasukan } from '@/lib/rab/pemasukan';
import { ringkasPeserta, totalPemasukan, type BarisSumberDana } from '@/lib/rab/pemasukan-skema';
import { formatRupiah } from '@/lib/utils/format-rupiah';

type Jawaban<T> = { ok?: boolean; data?: T; error?: { message?: string } };

const SEL = 'h-8 w-full rounded-sm border border-transparent bg-transparent px-1.5 text-[13px] outline-none hover:border-default focus:border-[var(--border-focus)] focus:bg-panel';

function Angka({ label, nilai, testid }: { label: string; nilai: string; testid: string }) {
  return (
    <div className="rounded-sm bg-subtle px-3 py-2">
      <p className="text-[11px] text-secondary">{label}</p>
      <p className="text-[15px] font-semibold tabular-nums" data-testid={testid}>
        {nilai}
      </p>
    </div>
  );
}

function BarisSumber({ s, data, onSimpan, onHapus }: { s: BarisSumberDana; data: DataPemasukan; onSimpan: (u: { keterangan: string; saldo: number }) => void; onHapus: () => void }) {
  const [draf, setDraf] = React.useState({ keterangan: s.keterangan, saldo: s.saldo });
  React.useEffect(() => setDraf({ keterangan: s.keterangan, saldo: s.saldo }), [s.keterangan, s.saldo]);
  const simpan = () => {
    if (draf.keterangan.trim() && (draf.keterangan !== s.keterangan || draf.saldo !== s.saldo)) onSimpan(draf);
  };
  return (
    <li data-testid="sumber-item" data-id={s.id} className="flex items-center gap-2 border-t border-default py-1 first:border-t-0">
      <span className="w-6 text-[12px] text-tertiary tabular-nums">{s.no_urut}</span>
      {data.izin.tulis ? (
        <>
          <input value={draf.keterangan} onChange={(e) => setDraf((d) => ({ ...d, keterangan: e.target.value }))} onBlur={simpan} aria-label="Keterangan sumber dana" data-testid="sumber-keterangan" maxLength={200} className={SEL} />
          <CurrencyInput value={draf.saldo} onNilai={(n) => setDraf((d) => ({ ...d, saldo: n }))} onBlur={simpan} aria-label={`Saldo ${s.keterangan}`} data-testid="sumber-saldo" className={`${SEL} w-40`} />
        </>
      ) : (
        <>
          <span className="flex-1 text-[13px]">{s.keterangan}</span>
          <span className="text-[13px] tabular-nums">{formatRupiah(s.saldo)}</span>
        </>
      )}
      {data.izin.hapus ? (
        <button type="button" onClick={onHapus} aria-label={`Hapus ${s.keterangan}`} data-testid="sumber-hapus" className="flex size-8 shrink-0 items-center justify-center rounded-sm text-tertiary hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)]">
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </li>
  );
}

function Panel({ awal }: { awal: DataPemasukan }) {
  const toast = useToast();
  const [data, setData] = React.useState(awal);
  const [baru, setBaru] = React.useState({ keterangan: '', saldo: 0 });
  const r = ringkasPeserta(data.peserta);
  const galat = (pesan: string) => toast.error({ description: pesan, suggestion: 'Periksa isian lalu coba lagi.' });
  const url = `/api/kepanitiaan/${data.kepanitiaan_id}/pemasukan`;

  async function panggil(method: string, body?: unknown, query = '') {
    try {
      const res = await fetch(`${url}${query}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const isi = (await res.json().catch(() => null)) as Jawaban<DataPemasukan> | null;
      if (!res.ok || !isi?.ok || !isi.data) throw new Error(isi?.error?.message ?? 'Perubahan gagal disimpan.');
      setData(isi.data);
      return true;
    } catch (e) {
      galat(e instanceof Error ? e.message : 'Perubahan gagal disimpan.');
      return false;
    }
  }

  return (
    <Card className="grid gap-4 p-4" data-testid="pemasukan-panel">
      <div>
        <h2 className="text-[15px] font-semibold">Pemasukan</h2>
        <p className="text-[12px] text-secondary">Total pemasukan menjadi saldo awal sheet PENGELUARAN pada unduhan Excel.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <Angka label="Peserta" nilai={`${r.total}`} testid="peserta-ringkas-total" />
        <Angka label="Sudah bayar" nilai={`${r.sudahBayar}`} testid="peserta-ringkas-sudah" />
        <Angka label="Belum bayar" nilai={`${r.belumBayar}`} testid="peserta-ringkas-belum" />
        <Angka label="Terkumpul dari peserta" nilai={formatRupiah(r.terkumpul)} testid="peserta-ringkas-terkumpul" />
        <Angka label="Total pemasukan" nilai={formatRupiah(totalPemasukan(r, data.sumber))} testid="pemasukan-total" />
      </div>

      <section className="grid gap-1">
        <h3 className="text-[14px] font-semibold">Sumber dana lain</h3>
        {data.sumber.length ? (
          <ol>
            {data.sumber.map((s) => (
              <BarisSumber
                key={s.id}
                s={s}
                data={data}
                onSimpan={(u) => void panggil('PATCH', { id: s.id, ...u })}
                onHapus={() => void panggil('DELETE', undefined, `?baris=${s.id}`)}
              />
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-secondary">Belum ada sumber dana lain (mis. Kas Himpunan, Sponsor, Dana Fakultas).</p>
        )}
        {data.izin.tulis ? (
          <form
            className="mt-1 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void panggil('POST', baru).then((ok) => ok && setBaru({ keterangan: '', saldo: 0 }));
            }}
          >
            <input value={baru.keterangan} onChange={(e) => setBaru((b) => ({ ...b, keterangan: e.target.value }))} placeholder="Mis. Kas Himpunan" aria-label="Keterangan sumber dana baru" data-testid="sumber-baru-keterangan" maxLength={200} className="h-8 min-w-48 flex-1 rounded-sm border border-default bg-panel px-2 text-[13px]" />
            <CurrencyInput value={baru.saldo} onNilai={(n) => setBaru((b) => ({ ...b, saldo: n }))} aria-label="Saldo sumber dana baru" data-testid="sumber-baru-saldo" className="h-8 w-40 rounded-sm border border-default bg-panel px-2 text-[13px]" />
            <Button type="submit" variant="secondary" disabled={!baru.keterangan.trim()} data-testid="sumber-tambah">
              <Plus aria-hidden="true" /> Tambah sumber dana
            </Button>
          </form>
        ) : null}
      </section>

      <PesertaTable kepanitiaanId={data.kepanitiaan_id} peserta={data.peserta} izin={data.izin} onData={setData} onGalat={galat} />
    </Card>
  );
}

export function PemasukanPanel(props: { awal: DataPemasukan }) {
  return (
    <ToastProvider>
      <Panel {...props} />
    </ToastProvider>
  );
}
