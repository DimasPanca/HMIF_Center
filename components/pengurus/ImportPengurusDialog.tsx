'use client';

/**
 * Import Data Pengurus dari CSV/XLSX (T-107, USER_FLOW §9.1): unggah →
 * pemetaan kolom → pratinjau valid/peringatan/error → simpan → laporan.
 * Tidak ada yang disimpan sebelum tombol Import ditekan.
 *
 * NIM yang sudah ada di Data Pengurus periode ini dicentang "lewati" secara
 * bawaan; menghapus centangnya MEMPERBARUI data lama.
 *
 * Test id: import-pengurus-berkas, import-pengurus-simpan, import-pengurus-laporan, import-pengurus-galat.
 */

import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { ImportPreview } from '@/components/shared/ImportPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KOLOM_IMPORT_PENGURUS } from '@/lib/pengurus/skema';
import type { LaporanImportPengurus, PratinjauImportPengurus } from '@/lib/pengurus/service';

type Respons<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

const kutip = (s: string) => `"${s.replace(/"/g, '""')}"`;

function unduh(nama: string, isi: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPengurusDialog({
  open,
  onOpenChange,
  contohDepartemen = 'Kaderisasi',
  onSelesai,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contohDepartemen?: string;
  onSelesai: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<PratinjauImportPengurus | null>(null);
  const [peta, setPeta] = useState<Record<string, number>>({});
  const [lewati, setLewati] = useState<Set<number>>(new Set());
  const [laporan, setLaporan] = useState<LaporanImportPengurus | null>(null);
  const [memuat, setMemuat] = useState<'pratinjau' | 'simpan' | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  function reset() {
    setBerkas(null);
    setPratinjau(null);
    setPeta({});
    setLewati(new Set());
    setLaporan(null);
    setPesan(null);
    if (input.current) input.current.value = '';
  }

  async function kirim<T>(mode: 'pratinjau' | 'simpan', f: File, petaManual?: Record<string, number>, lewatiBaris?: number[]) {
    const fd = new FormData();
    fd.set('berkas', f);
    fd.set('mode', mode);
    if (petaManual) fd.set('peta', JSON.stringify(petaManual));
    if (lewatiBaris) fd.set('lewati', JSON.stringify(lewatiBaris));
    const res = await fetch('/api/pengurus/import', { method: 'POST', body: fd });
    const body = (await res.json().catch(() => null)) as Respons<T> | null;
    if (!res.ok || !body || !body.ok) throw new Error(body && !body.ok ? body.error.message : 'Permintaan gagal.');
    return body.data;
  }

  async function muatPratinjau(f: File, petaManual?: Record<string, number>, awal = false) {
    setMemuat('pratinjau');
    setPesan(null);
    try {
      const p = await kirim<PratinjauImportPengurus>('pratinjau', f, petaManual);
      setPratinjau(p);
      setPeta(p.peta);
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
      setLaporan(await kirim<LaporanImportPengurus>('simpan', berkas, peta, [...lewati]));
      onSelesai();
    } catch (e) {
      setPesan(e instanceof Error ? e.message : 'Import gagal.');
    } finally {
      setMemuat(null);
    }
  }

  function unduhTemplat() {
    const baris = [
      ['Nama Lengkap', 'NIM', 'Jabatan', 'Departemen', 'Angkatan', 'Status'],
      ['Nadia Putri', '3337220100', 'Staff Departemen', contohDepartemen, '2022', 'Aktif'],
      ['Raka Pratama', '3337210050', 'Kepala Departemen', contohDepartemen, '2021', 'Aktif'],
      ['Salsa Amelia', '3337210051', 'Sekretaris Umum', '', '2021', 'Aktif'],
    ];
    unduh('templat-import-pengurus.csv', baris.map((b) => b.map(kutip).join(';')).join('\r\n'));
  }

  const akanDiimpor = pratinjau ? pratinjau.baris.filter((b) => b.status !== 'ERROR' && !lewati.has(b.nomor)).length : 0;
  const akanDiperbarui = pratinjau ? pratinjau.baris.filter((b) => b.terdaftar && b.status !== 'ERROR' && !lewati.has(b.nomor)).length : 0;

  const tutup = (buka: boolean) => {
    if (memuat === 'simpan') return;
    if (!buka) reset();
    onOpenChange(buka);
  };

  return (
    <Dialog open={open} onOpenChange={tutup}>
      <DialogContent className="max-w-6xl" showCloseButton={memuat !== 'simpan'}>
        {laporan ? (
          <div className="grid gap-4" data-testid="import-pengurus-laporan">
            <DialogHeader>
              <DialogTitle>Hasil import</DialogTitle>
              <DialogDescription>
                {laporan.baru} pengurus baru · {laporan.diperbarui} diperbarui · {laporan.dilewati.length} dilewati
              </DialogDescription>
            </DialogHeader>
            {laporan.dilewati.length ? (
              <div className="max-h-[40vh] overflow-auto rounded-sm border border-default">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-subtle text-left text-[12px] text-secondary">
                    <tr>
                      <th className="px-2 py-2 font-medium">Baris</th>
                      <th className="px-2 py-2 font-medium">Alasan dilewati</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laporan.dilewati.map((d) => (
                      <tr key={d.nomor} className="h-9 border-t border-subtle">
                        <td className="px-2 tabular-nums">{d.nomor}</td>
                        <td className="px-2 text-secondary">{d.alasan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <DialogFooter>
              {laporan.dilewati.length ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    unduh(
                      'laporan-import-pengurus.csv',
                      [['baris', 'alasan'], ...laporan.dilewati.map((d) => [String(d.nomor), d.alasan])].map((b) => b.map(kutip).join(',')).join('\r\n'),
                    )
                  }
                >
                  <Download aria-hidden="true" /> Unduh laporan
                </Button>
              ) : null}
              <Button onClick={() => tutup(false)}>Selesai</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Import Data Pengurus</DialogTitle>
              <DialogDescription>
                Unggah CSV atau XLSX hasil form pendataan (maks. 500 baris). Tidak ada yang disimpan sebelum Anda menekan Import. Akun
                pengguna tidak dibuat dari data ini.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={input}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                id="import-pengurus-berkas"
                data-testid="import-pengurus-berkas"
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
              <p className="text-[13px] text-secondary" role="status">
                Membaca berkas…
              </p>
            ) : null}

            {pratinjau ? (
              <>
                {pratinjau.terpotong ? (
                  <p className="text-[13px] text-[var(--warning)]">Berkas memuat lebih dari 500 baris; hanya 500 pertama yang dibaca. Pecah berkasnya.</p>
                ) : null}
                {pratinjau.baris.some((b) => b.terdaftar) ? (
                  <p className="text-[13px] text-secondary">
                    Baris ber-NIM yang sudah ada di Data Pengurus dicentang <strong>lewati</strong>. Hapus centangnya untuk memperbarui data
                    lama dengan isi berkas.
                  </p>
                ) : null}
                <ImportPreview
                  kolom={KOLOM_IMPORT_PENGURUS}
                  header={pratinjau.header}
                  peta={peta}
                  hilang={pratinjau.hilang}
                  baris={pratinjau.baris}
                  lewati={lewati}
                  memuat={memuat !== null}
                  namaLaporan="masalah-import-pengurus.csv"
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
              <p role="alert" data-testid="import-pengurus-galat" className="rounded-sm border border-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-[13px]">
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
                data-testid="import-pengurus-simpan"
              >
                Import {akanDiimpor} baris{akanDiperbarui ? ` (${akanDiperbarui} memperbarui)` : ''}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
