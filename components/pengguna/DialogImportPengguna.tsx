'use client';

import { Check, Copy, Download, FileSpreadsheet, KeyRound, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { ImportPreview } from '@/components/shared/ImportPreview';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { LaporanImport, PratinjauImport } from '@/lib/auth/import-pengguna';
import { KOLOM_IMPORT_PENGGUNA } from '@/lib/auth/skema-pengguna';


type Respons<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

function unduh(nama: string, isi: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  a.click();
  URL.revokeObjectURL(url);
}

const kutip = (s: string) => `"${s.replace(/"/g, '""')}"`;

interface DialogImportPenggunaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contohDepartemen?: string;
  onSelesai: () => void;
}

export function DialogImportPengguna({ open, onOpenChange, contohDepartemen = 'Kaderisasi', onSelesai }: DialogImportPenggunaProps) {
  const input = useRef<HTMLInputElement>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<PratinjauImport | null>(null);
  const [peta, setPeta] = useState<Record<string, number>>({});
  const [lewati, setLewati] = useState<Set<number>>(new Set());
  const [laporan, setLaporan] = useState<LaporanImport | null>(null);
  const [memuat, setMemuat] = useState<'pratinjau' | 'simpan' | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [tersalin, setTersalin] = useState(false);

  function reset() {
    setBerkas(null);
    setPratinjau(null);
    setPeta({});
    setLewati(new Set());
    setLaporan(null);
    setPesan(null);
    setTersalin(false);
    if (input.current) input.current.value = '';
  }

  async function kirim<T>(mode: 'pratinjau' | 'simpan', f: File, petaManual?: Record<string, number>, lewatiBaris?: number[]) {
    const fd = new FormData();
    fd.set('berkas', f);
    fd.set('mode', mode);
    if (petaManual) fd.set('peta', JSON.stringify(petaManual));
    if (lewatiBaris) fd.set('lewati', JSON.stringify(lewatiBaris));
    const res = await fetch('/api/users/bulk-import', { method: 'POST', body: fd });
    const body = (await res.json().catch(() => null)) as Respons<T> | null;
    if (!res.ok || !body || !body.ok) throw new Error(body && !body.ok ? body.error.message : 'Permintaan gagal.');
    return body.data;
  }

  async function muatPratinjau(f: File, petaManual?: Record<string, number>, awal = false) {
    setMemuat('pratinjau');
    setPesan(null);
    try {
      const p = await kirim<PratinjauImport>('pratinjau', f, petaManual);
      setPratinjau(p);
      setPeta(p.peta);
      // NIM/email yang sudah terdaftar pasti ditolak — dicentang lewati. Dijalankan pada
      // setiap pratinjau: baris baru bisa "terdaftar" setelah pemetaan kolom diperbaiki.
      const terdaftar = p.baris.filter((b) => b.terdaftar).map((b) => b.nomor);
      setLewati((lama) => new Set([...(awal ? [] : lama), ...terdaftar]));
    } catch (e) {
      setPesan(e instanceof Error ? e.message : 'Pratinjau gagal.');
    } finally {
      setMemuat(null);
    }
  }

  async function simpan() {
    if (!berkas || !pratinjau) return;
    setMemuat('simpan');
    setPesan(null);
    try {
      setLaporan(await kirim<LaporanImport>('simpan', berkas, peta, [...lewati]));
      onSelesai();
    } catch (e) {
      setPesan(e instanceof Error ? e.message : 'Import gagal.');
    } finally {
      setMemuat(null);
    }
  }

  function unduhTemplat() {
    const baris = [
      ['Nama Lengkap', 'NIM', 'Email', 'Angkatan', 'Peran', 'Departemen', 'No HP'],
      ['Nadia Putri', '3337220100', 'nadia@example.com', '2022', 'Anggota', contohDepartemen, '081234567890'],
      ['Raka Pratama', '3337210050', 'raka@example.com', '2021', 'Kepala Departemen', contohDepartemen, ''],
      ['Salsa Amelia', '3337210051', 'salsa@example.com', '2021', 'Sekum', '', ''],
    ];
    unduh('templat-import-pengguna.csv', baris.map((b) => b.map(kutip).join(';')).join('\r\n'));
  }

  const akanDiimpor = pratinjau
    ? pratinjau.baris.filter((b) => b.status !== 'ERROR' && !lewati.has(b.nomor)).length
    : 0;

  function csvHasil(l: LaporanImport) {
    const baris = [['baris', 'nama', 'email', 'status', 'tautan_atau_alasan']];
    for (const b of l.berhasil) baris.push([String(b.nomor), b.nama_lengkap, b.email, 'BERHASIL', b.tautan]);
    for (const g of l.gagal) baris.push([String(g.nomor), g.nama_lengkap, g.email, 'GAGAL', g.pesan]);
    for (const d of l.dilewati) baris.push([String(d.nomor), '', '', 'DILEWATI', d.alasan]);
    baris.sort((a, b) => Number(a[0]) - Number(b[0]));
    return baris.map((b) => b.map(kutip).join(',')).join('\r\n');
  }

  async function salinSemua(l: LaporanImport) {
    const teks = l.berhasil.map((b) => `${b.nama_lengkap} <${b.email}>: ${b.tautan}`).join('\n');
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(true);
    } catch {
      setPesan('Browser menolak akses clipboard. Gunakan "Unduh hasil (CSV)".');
    }
  }

  const tutup = (buka: boolean) => {
    if (memuat === 'simpan') return;
    if (!buka) reset();
    onOpenChange(buka);
  };

  return (
    <Dialog open={open} onOpenChange={tutup}>
      <DialogContent className="max-w-6xl" showCloseButton={memuat !== 'simpan'}>
        {laporan ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Hasil import</DialogTitle>
              <DialogDescription>
                {laporan.berhasil.length} diundang · {laporan.gagal.length} gagal · {laporan.dilewati.length} dilewati
              </DialogDescription>
            </DialogHeader>
            {laporan.berhasil.length ? (
              <p className="flex items-start gap-2 rounded-sm border border-[var(--warning)] bg-[var(--warning-subtle)] p-3 text-[13px] leading-[18px]">
                <KeyRound className="mt-px size-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
                Tautan aktivasi hanya ditampilkan sekarang. Salin atau unduh sebelum menutup dialog.
              </p>
            ) : null}
            <div className="max-h-[45vh] overflow-auto rounded-sm border border-default">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-subtle text-left text-[12px] text-secondary">
                  <tr>
                    <th className="px-2 py-2 font-medium">Baris</th>
                    <th className="px-2 py-2 font-medium">Nama</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Tautan / alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {laporan.berhasil.map((b) => (
                    <tr key={`b${b.nomor}`} className="h-9 border-t border-subtle">
                      <td className="px-2 tabular-nums">{b.nomor}</td>
                      <td className="px-2">{b.nama_lengkap}</td>
                      <td className="px-2 text-[var(--success)]">Diundang</td>
                      <td className="max-w-[28rem] truncate px-2 font-mono text-[12px]">{b.tautan}</td>
                    </tr>
                  ))}
                  {laporan.gagal.map((g) => (
                    <tr key={`g${g.nomor}`} className="h-9 border-t border-subtle">
                      <td className="px-2 tabular-nums">{g.nomor}</td>
                      <td className="px-2">{g.nama_lengkap}</td>
                      <td className="px-2 text-danger">Gagal</td>
                      <td className="px-2 text-secondary">{g.pesan}</td>
                    </tr>
                  ))}
                  {laporan.dilewati.map((d) => (
                    <tr key={`d${d.nomor}`} className="h-9 border-t border-subtle">
                      <td className="px-2 tabular-nums">{d.nomor}</td>
                      <td className="px-2 text-tertiary">—</td>
                      <td className="px-2 text-secondary">Dilewati</td>
                      <td className="px-2 text-secondary">{d.alasan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pesan ? <p role="alert" className="text-[13px] text-danger">{pesan}</p> : null}
            <DialogFooter>
              {laporan.berhasil.length ? (
                <Button variant="secondary" onClick={() => void salinSemua(laporan)}>
                  {tersalin ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {tersalin ? 'Tersalin' : 'Salin semua tautan'}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => unduh('hasil-import-pengguna.csv', csvHasil(laporan))}>
                <Download aria-hidden="true" />
                Unduh hasil (CSV)
              </Button>
              <Button onClick={() => tutup(false)}>Selesai</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Import pengguna massal</DialogTitle>
              <DialogDescription>
                Unggah CSV atau XLSX (maks. 200 baris). Tidak ada yang disimpan sebelum Anda menekan Import.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={input}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                id="import-berkas"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBerkas(f);
                  setPratinjau(null);
                  void muatPratinjau(f, undefined, true);
                }}
              />
              <Button variant="secondary" disabled={memuat !== null} onClick={() => input.current?.click()}>
                <Upload aria-hidden="true" />
                {berkas ? 'Ganti berkas' : 'Pilih berkas'}
              </Button>
              {berkas ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-secondary">
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                  {berkas.name}
                </span>
              ) : (
                <Button variant="ghost" onClick={unduhTemplat}>
                  <Download aria-hidden="true" />
                  Unduh templat CSV
                </Button>
              )}
            </div>

            {memuat === 'pratinjau' && !pratinjau ? (
              <p className="text-[13px] text-secondary" role="status">Membaca berkas…</p>
            ) : null}

            {pratinjau ? (
              <>
                {pratinjau.terpotong ? (
                  <p className="text-[13px] text-[var(--warning)]">
                    Berkas memuat lebih dari 200 baris data; hanya 200 baris pertama yang dibaca. Pecah berkasnya.
                  </p>
                ) : null}
                <ImportPreview
                  kolom={KOLOM_IMPORT_PENGGUNA}
                  header={pratinjau.header}
                  peta={peta}
                  hilang={pratinjau.hilang}
                  baris={pratinjau.baris}
                  lewati={lewati}
                  memuat={memuat !== null}
                  namaLaporan="masalah-import-pengguna.csv"
                  onUbahPeta={(kunci, indeks) => {
                    const baru = { ...peta, [kunci]: indeks };
                    setPeta(baru);
                    if (berkas) void muatPratinjau(berkas, baru);
                  }}
                  onUbahLewati={(nomor, lewat) =>
                    setLewati((s) => {
                      const n = new Set(s);
                      if (lewat) n.add(nomor);
                      else n.delete(nomor);
                      return n;
                    })
                  }
                />
              </>
            ) : null}

            {pesan ? (
              <p role="alert" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px]">
                {pesan}
              </p>
            ) : null}

            <DialogFooter>
              <Button variant="secondary" disabled={memuat === 'simpan'} onClick={() => tutup(false)}>
                Batal
              </Button>
              <Button
                disabled={!pratinjau || pratinjau.hilang.length > 0 || akanDiimpor === 0 || memuat === 'pratinjau'}
                loading={memuat === 'simpan'}
                onClick={() => void simpan()}
              >
                Import {akanDiimpor} baris
              </Button>
            </DialogFooter>
            {memuat === 'simpan' ? (
              <p className="text-right text-[12px] text-secondary" role="status">
                Mengundang {akanDiimpor} pengguna satu per satu — jangan tutup halaman ini.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
