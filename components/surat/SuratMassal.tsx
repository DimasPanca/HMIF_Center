'use client';

/**
 * Generate massal Surat Keterangan Aktif (T-064, USER_FLOW §5.3).
 *
 *   BuatBatch    Sekum memilih pengurus + satu keperluan → pratinjau daftar →
 *                konfirmasi → seluruhnya diajukan dalam satu request.
 *   AksiBatch    Approver menyetujui SATU batch dalam satu request; progres
 *                per dokumen dibaca dari respons NDJSON yang di-stream.
 *
 * Test id: massal-pengurus, massal-pilih-{id}, massal-pilih-semua,
 * massal-terpilih, massal-keperluan, massal-tanggal, massal-pratinjau,
 * massal-buat, massal-konfirmasi, massal-dibuat, massal-galat,
 * batch-{id}, batch-setujui-{id}, batch-progres, batch-item-{suratId},
 * batch-ringkasan, batch-terbitkan-{id}, batch-zip-{id}, batch-tolak-{id}.
 */

import { CheckCircle2, Download, Loader2, Send, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface PengurusUi {
  id: string;
  nama_lengkap: string;
  nim: string;
  jabatan: string;
  nama_departemen: string | null;
}

export interface BatchUi {
  batch_id: string;
  jumlah: number;
  menunggu: number;
  disetujui: number;
  terbit: number;
  ditolak: number;
  dibatalkan: number;
  keperluan: string;
  nama_pembuat: string;
  nomor_awal: string | null;
  nomor_akhir: string | null;
}

const MAKS = 50;

// ---------------------------------------------------------------------------

export function BuatBatch({ pengurus, tanggalAwal }: { pengurus: PengurusUi[]; tanggalAwal: string }) {
  const router = useRouter();
  const [pilih, setPilih] = React.useState<Set<string>>(new Set());
  const [keperluan, setKeperluan] = React.useState('');
  const [tanggal, setTanggal] = React.useState(tanggalAwal);
  const [konfirmasi, setKonfirmasi] = React.useState(false);
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const [dibuat, setDibuat] = React.useState<number | null>(null);
  const idKeperluan = React.useId();
  const idTanggal = React.useId();

  const terpilih = pengurus.filter((p) => pilih.has(p.id));
  const kebanyakan = terpilih.length > MAKS;
  const siap = terpilih.length > 0 && !kebanyakan && keperluan.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(tanggal);

  const ubah = (id: string) =>
    setPilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function kirim() {
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch('/api/surat/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aksi: 'buat', pengurus: terpilih.map((p) => p.id), keperluan: keperluan.trim(), tanggal_surat: tanggal }),
      });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; data?: { jumlah: number }; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok) {
        setGalat(isi?.error?.message ?? 'Batch gagal dibuat.');
        return;
      }
      setDibuat(isi.data?.jumlah ?? terpilih.length);
      setPilih(new Set());
      setKonfirmasi(false);
      router.refresh();
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  if (pengurus.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pilih pengurus</CardTitle>
          <CardDescription>
            Data Pengurus periode ini masih kosong. Isi lewat menu Data Pengurus terlebih dahulu, atau buat surat satuan.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pilih pengurus</CardTitle>
        <CardDescription>Satu surat per pengurus, dengan satu keperluan yang sama. Maksimal {MAKS} per batch.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {dibuat !== null ? (
          <InlineAlert data-testid="massal-dibuat" title={`${dibuat} surat diajukan`} detail="Batch masuk antrian persetujuan di bawah." />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={pilih.size > 0 && pilih.size === pengurus.length}
              onChange={(e) => setPilih(e.target.checked ? new Set(pengurus.map((p) => p.id)) : new Set())}
              data-testid="massal-pilih-semua"
            />
            Pilih semua ({pengurus.length})
          </label>
          <span data-testid="massal-terpilih" className={kebanyakan ? 'font-semibold text-danger' : 'text-secondary'}>
            Terpilih: <span className="tabular-nums">{terpilih.length}</span> orang
            {kebanyakan ? ` — lebih dari ${MAKS}, pecah menjadi beberapa batch` : ''}
          </span>
        </div>

        <ul className="max-h-80 divide-y divide-[var(--border-subtle)] overflow-y-auto rounded-sm border border-default" data-testid="massal-pengurus">
          {pengurus.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-subtle">
                <Checkbox checked={pilih.has(p.id)} onChange={() => ubah(p.id)} data-testid={`massal-pilih-${p.id}`} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{p.nama_lengkap}</span>
                  <span className="ml-2 font-mono text-[12px] text-secondary">{p.nim}</span>
                  <span className="block text-[12px] text-secondary">
                    {p.jabatan}
                    {p.nama_departemen ? ` · ${p.nama_departemen}` : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="space-y-1.5">
            <Label htmlFor={idKeperluan}>Keperluan (berlaku untuk semua)</Label>
            <Textarea
              id={idKeperluan}
              rows={2}
              maxLength={300}
              value={keperluan}
              onChange={(e) => setKeperluan(e.target.value)}
              placeholder="Contoh: Kelengkapan Persyaratan Administrasi Beasiswa"
              data-testid="massal-keperluan"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={idTanggal}>Tanggal surat</Label>
            <Input id={idTanggal} type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} data-testid="massal-tanggal" />
          </div>
        </div>

        {galat ? <InlineAlert data-testid="massal-galat" title="Batch tidak dapat dibuat" detail={galat} /> : null}

        {konfirmasi ? (
          <div className="space-y-3 rounded-sm border border-default p-3" data-testid="massal-pratinjau">
            <p className="text-[13px] font-semibold">
              Ajukan {terpilih.length} Surat Keterangan Aktif untuk keperluan “{keperluan.trim()}”?
            </p>
            <ol className="max-h-48 list-decimal overflow-y-auto pl-5 text-[13px] text-secondary">
              {terpilih
                .slice()
                .sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap, 'id'))
                .map((p) => (
                  <li key={p.id}>
                    {p.nama_lengkap} — {p.nim} — {p.jabatan}
                  </li>
                ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void kirim()} disabled={proses} data-testid="massal-konfirmasi">
                <Send aria-hidden="true" /> {proses ? 'Mengajukan…' : `Ajukan ${terpilih.length} surat`}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setKonfirmasi(false)} disabled={proses}>
                Kembali
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" onClick={() => setKonfirmasi(true)} disabled={!siap} data-testid="massal-buat">
            Pratinjau {terpilih.length > 0 ? `${terpilih.length} surat` : ''}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

type BarisProgres = { id: string; nama: string; nomor: string; ok: boolean; pesan?: string };

export function AksiBatch({ batch, bolehSetujui }: { batch: BatchUi; bolehSetujui: boolean }) {
  const router = useRouter();
  const [proses, setProses] = React.useState(false);
  const [total, setTotal] = React.useState(0);
  const [baris, setBaris] = React.useState<BarisProgres[]>([]);
  const [ringkasan, setRingkasan] = React.useState<{ berhasil: number; gagal: number } | null>(null);
  const [galat, setGalat] = React.useState<string | null>(null);
  const [tolak, setTolak] = React.useState(false);
  const [alasan, setAlasan] = React.useState('');
  const id = batch.batch_id;

  async function jalankan(aksi: 'setujui' | 'terbitkan') {
    setProses(true);
    setGalat(null);
    setBaris([]);
    setRingkasan(null);
    try {
      const r = await fetch('/api/surat/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aksi, batch: id }),
      });
      if (!r.ok || !r.body) {
        const isi = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        setGalat(isi?.error?.message ?? 'Batch tidak dapat diproses.');
        return;
      }
      const baca = r.body.getReader();
      const dek = new TextDecoder();
      let sisa = '';
      for (;;) {
        const { value, done } = await baca.read();
        if (done) break;
        sisa += dek.decode(value, { stream: true });
        const potong = sisa.split('\n');
        sisa = potong.pop() ?? '';
        for (const l of potong) {
          if (!l.trim()) continue;
          const e = JSON.parse(l) as { tipe: string } & Record<string, unknown>;
          if (e.tipe === 'mulai') setTotal(Number(e.total));
          else if (e.tipe === 'dokumen') setBaris((b) => [...b, e as unknown as BarisProgres]);
          else if (e.tipe === 'selesai') setRingkasan({ berhasil: Number(e.berhasil), gagal: Number(e.gagal) });
        }
      }
    } catch {
      setGalat('Koneksi terputus. Nomor yang sudah dialokasikan tetap sah; terbitkan ulang sisanya.');
    } finally {
      setProses(false);
      router.refresh();
    }
  }

  async function kirimTolak() {
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch('/api/surat/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aksi: 'tolak', batch: id, alasan: alasan.trim() }),
      });
      const isi = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !isi?.ok) setGalat(isi?.error?.message ?? 'Batch tidak dapat ditolak.');
      else router.refresh();
    } finally {
      setProses(false);
    }
  }

  const persen = total > 0 ? Math.round((baris.length / total) * 100) : 0;

  return (
    <Card data-testid={`batch-${id}`}>
      <CardHeader>
        <CardTitle>
          {batch.jumlah} Surat Keterangan Aktif · {batch.keperluan}
        </CardTitle>
        <CardDescription>
          {[
            `Diajukan oleh ${batch.nama_pembuat}`,
            batch.nomor_awal ? `nomor ${batch.nomor_awal} s.d. ${batch.nomor_akhir}` : null,
            batch.menunggu > 0 ? `${batch.menunggu} menunggu persetujuan` : null,
            batch.terbit > 0 ? `${batch.terbit} terbit` : null,
            batch.disetujui > 0 ? `${batch.disetujui} belum terbit` : null,
            batch.ditolak > 0 ? `${batch.ditolak} ditolak` : null,
            batch.dibatalkan > 0 ? `${batch.dibatalkan} dibatalkan` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {galat ? <InlineAlert data-testid="batch-galat" title="Tidak dapat diproses" detail={galat} /> : null}

        {total > 0 ? (
          <div className="space-y-2" data-testid="batch-progres" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={baris.length}>
              <div className="h-full bg-[var(--primary)] transition-[width] duration-fast" style={{ width: `${persen}%` }} />
            </div>
            <p className="text-[13px] text-secondary">
              {baris.length} / {total} dokumen
            </p>
            <ul className="max-h-60 space-y-1 overflow-y-auto text-[12px]">
              {baris.map((b) => (
                <li key={b.id} data-testid={`batch-item-${b.id}`} data-ok={b.ok ? 'ya' : 'tidak'} className="flex items-start gap-1.5">
                  {b.ok ? (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" />
                  ) : (
                    <XCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  )}
                  <span>
                    <span className="font-mono">{b.nomor}</span> — {b.nama}
                    {b.pesan ? <span className="block text-danger">{b.pesan}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ringkasan ? (
          <InlineAlert
            data-testid="batch-ringkasan"
            title={ringkasan.gagal === 0 ? `${ringkasan.berhasil} dokumen terbit` : `${ringkasan.berhasil} terbit, ${ringkasan.gagal} gagal`}
            detail={
              ringkasan.gagal === 0
                ? 'Unduh ZIP untuk seluruh dokumen.'
                : 'Surat yang gagal tetap bernomor. Bereskan penyebabnya lalu tekan "Terbitkan ulang yang gagal".'
            }
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {bolehSetujui && batch.menunggu === batch.jumlah ? (
            <>
              <Button type="button" onClick={() => void jalankan('setujui')} disabled={proses} data-testid={`batch-setujui-${id}`}>
                {proses ? <Loader2 aria-hidden="true" className="animate-spin" /> : <CheckCircle2 aria-hidden="true" />}
                {proses ? 'Memproses…' : `Setujui & terbitkan ${batch.jumlah} surat`}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setTolak((t) => !t)} disabled={proses} data-testid={`batch-tolak-${id}`}>
                Tolak batch
              </Button>
            </>
          ) : null}
          {bolehSetujui && batch.disetujui > 0 && !proses ? (
            <Button type="button" variant="secondary" onClick={() => void jalankan('terbitkan')} data-testid={`batch-terbitkan-${id}`}>
              Terbitkan ulang yang gagal ({batch.disetujui})
            </Button>
          ) : null}
          {batch.terbit > 0 ? (
            <a href={`/api/surat/batch?batch=${id}`} className={buttonVariants({ variant: 'secondary' })} data-testid={`batch-zip-${id}`} download>
              <Download aria-hidden="true" /> Unduh ZIP ({batch.terbit})
            </a>
          ) : null}
        </div>

        {tolak ? (
          <div className="space-y-2 rounded-sm border border-default p-3">
            <Label htmlFor={`alasan-${id}`}>Alasan penolakan</Label>
            <Textarea id={`alasan-${id}`} rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={1000} />
            <Button type="button" variant="danger" disabled={proses || alasan.trim().length < 5} onClick={() => void kirimTolak()}>
              Tolak {batch.jumlah} surat
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
