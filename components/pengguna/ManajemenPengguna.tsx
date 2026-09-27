'use client';

import { FileUp, Pencil, Power, PowerOff, Search, UserPlus, Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { DialogImportPengguna } from '@/components/pengguna/DialogImportPengguna';
import { DialogUbahPengguna } from '@/components/pengguna/DialogUbahPengguna';
import { DialogUndang } from '@/components/pengguna/DialogUndang';
import type { OpsiDepartemen } from '@/components/pengguna/EditorPeran';
import { LABEL_PERAN } from '@/components/pengguna/peran';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToastProvider, useToast } from '@/components/ui/toast';
import type { KeadaanPengguna, RingkasPengguna } from '@/lib/auth/invitation';

const KEADAAN: Record<KeadaanPengguna, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
  AKTIF: { label: 'Aktif', tone: 'success' },
  MENUNGGU_AKTIVASI: { label: 'Menunggu aktivasi', tone: 'info' },
  UNDANGAN_KEDALUWARSA: { label: 'Undangan kedaluwarsa', tone: 'warning' },
  NONAKTIF: { label: 'Nonaktif', tone: 'neutral' },
};

interface ManajemenPenggunaProps {
  awal: RingkasPengguna[];
  departemen: OpsiDepartemen[];
  userIdSaya: string;
  bolehUndang: boolean;
  bolehUbah: boolean;
}

function Manajemen({ awal, departemen, userIdSaya, bolehUndang, bolehUbah }: ManajemenPenggunaProps) {
  const toast = useToast();
  const [pengguna, setPengguna] = useState(awal);
  const [q, setQ] = useState('');
  const [keadaan, setKeadaan] = useState<KeadaanPengguna | ''>('');
  const [undangTerbuka, setUndangTerbuka] = useState(false);
  const [importTerbuka, setImportTerbuka] = useState(false);
  const [diubah, setDiubah] = useState<RingkasPengguna | null>(null);
  const [akanDinonaktifkan, setAkanDinonaktifkan] = useState<RingkasPengguna | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);

  const muatUlang = useCallback(async () => {
    const res = await fetch('/api/users', { cache: 'no-store' });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: RingkasPengguna[] } | null;
    if (res.ok && body?.ok && body.data) setPengguna(body.data);
  }, []);

  async function setAktif(p: RingkasPengguna, aktif: boolean) {
    setSibuk(p.id);
    try {
      const res = await fetch(`/api/users/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: aktif }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!res.ok || !body?.ok) {
        toast.error({
          description: body?.error?.message ?? 'Perubahan gagal disimpan.',
          suggestion: 'Muat ulang halaman lalu coba lagi.',
        });
        return;
      }
      toast.success({ description: `${p.nama_lengkap} ${aktif ? 'diaktifkan kembali' : 'dinonaktifkan'}.` });
      await muatUlang();
    } finally {
      setSibuk(null);
    }
  }

  const tersaring = useMemo(() => {
    const kata = q.trim().toLowerCase();
    return pengguna.filter(
      (p) =>
        (!keadaan || p.keadaan === keadaan) &&
        (!kata || [p.nama_lengkap, p.nim, p.email].some((v) => v.toLowerCase().includes(kata))),
    );
  }, [pengguna, q, keadaan]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-sm sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tertiary" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Cari pengguna"
              placeholder="Cari nama, NIM, atau email"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select
            aria-label="Saring keadaan"
            placeholder={null}
            className="sm:w-52"
            value={keadaan}
            onChange={(e) => setKeadaan(e.target.value as KeadaanPengguna | '')}
          >
            <option value="">Semua keadaan</option>
            {(Object.keys(KEADAAN) as KeadaanPengguna[]).map((k) => (
              <option key={k} value={k}>
                {KEADAAN[k].label}
              </option>
            ))}
          </Select>
        </div>
        {bolehUndang ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" data-testid="import-buka" onClick={() => setImportTerbuka(true)}>
              <FileUp aria-hidden="true" />
              Import massal
            </Button>
            <Button data-testid="undang-buka" onClick={() => setUndangTerbuka(true)}>
              <UserPlus aria-hidden="true" />
              Undang pengurus
            </Button>
          </div>
        ) : null}
      </div>

      <Card className="overflow-hidden p-0">
        <Table
          data-testid="pengguna-tabel"
          aria-label="Pengguna periode aktif"
          rowCount={tersaring.length}
          emptyState={
            <div className="py-4">
              <Users className="mx-auto size-8 text-tertiary" aria-hidden="true" />
              <p className="mt-3 text-[14px] font-semibold text-primary">
                {pengguna.length ? 'Tidak ada pengguna yang cocok' : 'Belum ada pengguna pada periode aktif'}
              </p>
            </div>
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>NIM</TableHead>
              <TableHead>Angkatan</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Keadaan</TableHead>
              {bolehUbah ? <TableHead className="text-right">Aksi</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tersaring.map((p) => (
              <TableRow key={p.id} data-testid={`pengguna-baris-${p.id}`}>
                <TableCell>
                  <p className="font-medium text-primary">{p.nama_lengkap}</p>
                  <p className="text-[12px] break-all text-secondary">{p.email}</p>
                </TableCell>
                <TableCell className="tabular-nums">{p.nim}</TableCell>
                <TableCell className="tabular-nums">{p.angkatan ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.roles.map((r) => (
                      <Badge key={`${r.role}-${r.departemen_id ?? ''}`} tone="primary">
                        {LABEL_PERAN[r.role]}
                        {r.nama_departemen ? ` · ${r.nama_departemen}` : ''}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell data-testid="pengguna-keadaan">
                  <Badge tone={KEADAAN[p.keadaan].tone}>{KEADAAN[p.keadaan].label}</Badge>
                </TableCell>
                {bolehUbah ? (
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      className="w-[34px] px-0"
                      aria-label={`Ubah ${p.nama_lengkap}`}
                      title="Ubah"
                      onClick={() => setDiubah(p)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    {p.keadaan === 'AKTIF' && p.id !== userIdSaya ? (
                      <Button
                        variant="ghost"
                        className="w-[34px] px-0"
                        aria-label={`Nonaktifkan ${p.nama_lengkap}`}
                        title="Nonaktifkan"
                        disabled={sibuk === p.id}
                        onClick={() => setAkanDinonaktifkan(p)}
                      >
                        <PowerOff aria-hidden="true" />
                      </Button>
                    ) : null}
                    {p.keadaan === 'NONAKTIF' ? (
                      <Button
                        variant="ghost"
                        className="w-[34px] px-0"
                        aria-label={`Aktifkan kembali ${p.nama_lengkap}`}
                        title="Aktifkan kembali"
                        disabled={sibuk === p.id}
                        onClick={() => void setAktif(p, true)}
                      >
                        <Power aria-hidden="true" />
                      </Button>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {bolehUndang ? (
        <DialogImportPengguna
          open={importTerbuka}
          onOpenChange={setImportTerbuka}
          contohDepartemen={departemen[0]?.nama}
          onSelesai={() => void muatUlang()}
        />
      ) : null}

      {bolehUndang ? (
        <DialogUndang
          open={undangTerbuka}
          onOpenChange={setUndangTerbuka}
          departemen={departemen}
          onBerhasil={() => void muatUlang()}
        />
      ) : null}

      {diubah ? (
        <DialogUbahPengguna
          key={diubah.id}
          pengguna={diubah}
          departemen={departemen}
          onTutup={() => setDiubah(null)}
          onBerhasil={(pesan) => {
            setDiubah(null);
            toast.success({ description: pesan });
            void muatUlang();
          }}
        />
      ) : null}

      <ConfirmDialog
        level="simple"
        open={akanDinonaktifkan !== null}
        onOpenChange={(buka) => !buka && setAkanDinonaktifkan(null)}
        title={`Nonaktifkan ${akanDinonaktifkan?.nama_lengkap ?? ''}?`}
        description="Ia tidak dapat masuk lagi. Proker, surat, dan nota yang pernah dibuatnya tetap tersimpan, dan akunnya dapat diaktifkan kembali kapan saja."
        confirmLabel="Nonaktifkan"
        onConfirm={() => {
          if (akanDinonaktifkan) void setAktif(akanDinonaktifkan, false);
        }}
      />
    </div>
  );
}

export function ManajemenPengguna(props: ManajemenPenggunaProps) {
  return (
    <ToastProvider>
      <Manajemen {...props} />
    </ToastProvider>
  );
}
