'use client';

import { useState } from 'react';
import { History } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PratinjauRestore } from '@/lib/backup/restore';

type ResponsApi<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function kirimRestore<T>(
  backupId: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; pesan: string }> {
  const r = await fetch(`/api/backup/${backupId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const b = (await r.json().catch(() => null)) as ResponsApi<T> | null;
  return b?.ok
    ? { ok: true, data: b.data }
    : { ok: false, pesan: b && !b.ok ? b.error.message : 'Permintaan restore gagal.' };
}

/** Ringkasan pratinjau: per modul, berapa ditambah / ditimpa / dilewati (kontrak 5). */
export function TabelPratinjau({ p, strategi }: { p: PratinjauRestore; strategi?: string }) {
  return (
    <div className="space-y-2 text-[13px]" data-testid="pratinjau-restore">
      {p.ditolak ? (
        <p role="alert" className="text-danger" data-testid="restore-ditolak">
          {p.ditolak}
        </p>
      ) : null}
      {p.peringatan.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-warning">
          {p.peringatan.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      {p.modul.length ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-default text-left text-secondary">
                <th className="py-1 font-medium">Modul / tabel</th>
                {p.mode === 'PENUH' ? (
                  <>
                    <th className="py-1 text-right font-medium">Sekarang</th>
                    <th className="py-1 text-right font-medium">Dari backup</th>
                  </>
                ) : (
                  <>
                    <th className="py-1 text-right font-medium">Ditambah</th>
                    <th className="py-1 text-right font-medium">
                      {strategi === 'TAMBAH' ? 'Dilewati (beda)' : 'Ditimpa'}
                    </th>
                    <th className="py-1 text-right font-medium">Sama</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {p.mode === 'PENUH'
                ? p.modul.map((m) => (
                    <tr key={m.modul} className="border-b border-default">
                      <td className="py-1">{m.modul}</td>
                      <td className="py-1 text-right tabular-nums">{m.sekarang ?? 0}</td>
                      <td className="py-1 text-right tabular-nums">{m.backup}</td>
                    </tr>
                  ))
                : p.modul.flatMap((m) =>
                    (m.tabel ?? []).map((t) => (
                      <tr
                        key={`${m.modul}.${t.tabel}`}
                        className="border-b border-default"
                        data-testid={`pratinjau-${t.tabel}`}
                      >
                        <td className="py-1">
                          {m.modul} · {t.tabel}
                        </td>
                        <td className="py-1 text-right tabular-nums">{t.baru}</td>
                        <td className="py-1 text-right tabular-nums">{t.berubah}</td>
                        <td className="py-1 text-right tabular-nums">{t.sama}</td>
                      </tr>
                    )),
                  )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/** Restore PENUH — konfirmasi tingkat kritis: ketik nama sistem (ADR-034). */
export function RestoreDialog({
  backupId,
  label,
  namaSistem,
  onMulai,
}: {
  backupId: string;
  label: string;
  namaSistem: string;
  onMulai: () => void;
}) {
  const [buka, setBuka] = useState(false);
  const [p, setP] = useState<PratinjauRestore | null>(null);
  const [ketik, setKetik] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function pratinjau() {
    setSibuk(true);
    setGalat(null);
    const h = await kirimRestore<PratinjauRestore>(backupId, {
      aksi: 'pratinjau',
      permintaan: { mode: 'PENUH', konfirmasi: '' },
    });
    setSibuk(false);
    if (h.ok) setP(h.data);
    else setGalat(h.pesan);
  }

  async function jalankan() {
    setSibuk(true);
    setGalat(null);
    const h = await kirimRestore<{ id: string }>(backupId, {
      aksi: 'mulai',
      permintaan: { mode: 'PENUH', konfirmasi: ketik },
    });
    setSibuk(false);
    if (!h.ok) return setGalat(h.pesan);
    setBuka(false);
    onMulai();
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setBuka(true);
          setP(null);
          setKetik('');
          void pratinjau();
        }}
        data-testid="buka-restore-penuh"
      >
        <History className="size-4" aria-hidden="true" />
        Restore penuh
      </Button>
      <Dialog open={buka} onOpenChange={setBuka}>
        <DialogContent data-testid="dialog-restore-penuh">
          <DialogHeader>
            <DialogTitle>Restore penuh</DialogTitle>
            <DialogDescription>
              Seluruh data diganti dengan isi backup {label}. Sistem membuat backup kondisi saat ini
              lebih dulu (wajib), lalu memverifikasi checksum seluruh berkas sebelum apa pun diubah.
            </DialogDescription>
          </DialogHeader>
          {p ? (
            <TabelPratinjau p={p} />
          ) : (
            <p className="text-[13px] text-secondary">{sibuk ? 'Memeriksa bundel…' : ''}</p>
          )}
          {p && !p.ditolak ? (
            <div className="grid gap-1.5">
              <Label htmlFor="konfirmasi-restore">
                Ketik <strong>{namaSistem}</strong> untuk mengonfirmasi
              </Label>
              <Input
                id="konfirmasi-restore"
                value={ketik}
                onChange={(e) => setKetik(e.target.value)}
                autoComplete="off"
                data-testid="konfirmasi-restore"
              />
            </div>
          ) : null}
          {galat ? (
            <p role="alert" className="text-[13px] text-danger">
              {galat}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBuka(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={!p || !!p.ditolak || ketik !== namaSistem || sibuk}
              onClick={() => void jalankan()}
              data-testid="jalankan-restore-penuh"
            >
              Jalankan restore penuh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
