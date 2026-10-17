'use client';

import { useState } from 'react';
import { FileInput } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PratinjauRestore } from '@/lib/backup/restore';

import { TabelPratinjau, kirimRestore } from './RestoreDialog';

/** Urutan & label 12 modul PRD F-16.1 (nilai = nama berkas `modules/{nilai}.json`). */
const MODUL = [
  ['prokers', 'Program kerja'],
  ['kepanitiaan', 'Kepanitiaan & dokumen acara'],
  ['rab', 'RAB'],
  ['nota', 'Nota'],
  ['surat', 'Persuratan'],
  ['notulensi', 'Notulensi'],
  ['gantt', 'Gantt'],
  ['users', 'Pengguna'],
  ['pengurus', 'Pengurus & role'],
  ['departemen', 'Departemen & ruangan'],
  ['periode', 'Periode & konfigurasi'],
  ['audit-log', 'Audit log (hanya Tambah)'],
] as const;

const STRATEGI = [
  ['TAMBAH', 'Tambah', 'lewati yang sudah ada'],
  ['TIMPA', 'Timpa', 'ganti yang sudah ada'],
  ['GABUNG', 'Gabung', 'perbarui kolom yang berbeda'],
] as const;

type Strategi = (typeof STRATEGI)[number][0];

/** Restore PER MODUL dengan strategi Tambah/Timpa/Gabung + pratinjau (PRD F-16.3). */
export function ImportModulDialog({
  backupId,
  label,
  onMulai,
}: {
  backupId: string;
  label: string;
  onMulai: () => void;
}) {
  const [buka, setBuka] = useState(false);
  const [pilih, setPilih] = useState<string[]>([]);
  const [strategi, setStrategi] = useState<Strategi>('TAMBAH');
  const [p, setP] = useState<PratinjauRestore | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const permintaan = { mode: 'MODUL', modul: pilih, strategi };

  async function pratinjau() {
    setSibuk(true);
    setGalat(null);
    setP(null);
    const h = await kirimRestore<PratinjauRestore>(backupId, { aksi: 'pratinjau', permintaan });
    setSibuk(false);
    if (h.ok) setP(h.data);
    else setGalat(h.pesan);
  }

  async function jalankan() {
    setSibuk(true);
    setGalat(null);
    const h = await kirimRestore<{ id: string }>(backupId, { aksi: 'mulai', permintaan });
    setSibuk(false);
    if (!h.ok) return setGalat(h.pesan);
    setBuka(false);
    onMulai();
  }

  const ubah =
    <T,>(f: (x: T) => void) =>
    (x: T) => {
      setP(null);
      f(x);
    };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setBuka(true);
          setP(null);
          setGalat(null);
        }}
        data-testid="buka-import-modul"
      >
        <FileInput className="size-4" aria-hidden="true" />
        Impor per modul
      </Button>
      <Dialog open={buka} onOpenChange={setBuka}>
        <DialogContent data-testid="dialog-import-modul">
          <DialogHeader>
            <DialogTitle>Impor per modul</DialogTitle>
            <DialogDescription>
              Pulihkan modul tertentu dari backup {label}. Backup kondisi saat ini dibuat lebih
              dulu; pratinjau menunjukkan perubahannya sebelum diterapkan.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="grid grid-cols-1 gap-1 text-[13px] sm:grid-cols-2">
            <legend className="mb-1 font-medium">Modul</legend>
            {MODUL.map(([nilai, nama]) => (
              <label key={nilai} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={pilih.includes(nilai)}
                  onChange={ubah((e: React.ChangeEvent<HTMLInputElement>) =>
                    setPilih((x) =>
                      e.target.checked ? [...x, nilai] : x.filter((y) => y !== nilai),
                    ),
                  )}
                  data-testid={`modul-${nilai}`}
                />
                {nama}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-1 text-[13px]">
            <legend className="mb-1 font-medium">Strategi</legend>
            {STRATEGI.map(([nilai, nama, ket]) => (
              <label key={nilai} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="strategi-restore"
                  className="size-4 accent-[var(--primary)]"
                  checked={strategi === nilai}
                  onChange={ubah(() => setStrategi(nilai))}
                  data-testid={`strategi-${nilai}`}
                />
                <span>
                  <strong>{nama}</strong> — {ket}
                </span>
              </label>
            ))}
          </fieldset>
          {p ? <TabelPratinjau p={p} strategi={strategi} /> : null}
          {galat ? (
            <p role="alert" className="text-[13px] text-danger" data-testid="import-galat">
              {galat}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={!pilih.length || sibuk}
              onClick={() => void pratinjau()}
              data-testid="pratinjau-modul"
            >
              {sibuk && !p ? 'Menghitung…' : 'Pratinjau'}
            </Button>
            <Button
              disabled={!p || !!p.ditolak || sibuk}
              onClick={() => void jalankan()}
              data-testid="jalankan-import-modul"
            >
              Jalankan impor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
