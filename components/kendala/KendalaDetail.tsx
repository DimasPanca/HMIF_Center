'use client';

/**
 * Detail satu kendala (T-082): status/prioritas/assignee, catatan
 * penyelesaian wajib saat SELESAI (#5), lampiran, dan diskusi berulir.
 * Kontrol ubah hanya tampil bila `bolehUbah` — server tetap menolak bila
 * tidak berhak (BPH baca saja).
 *
 * Test id: kendala-detail, kendala-status, kendala-prioritas, kendala-assignee,
 * kendala-simpan, kendala-catatan, kendala-galat, kendala-hapus,
 * lampiran-unggah, lampiran-{id}, lampiran-hapus-{id}.
 */

import { Paperclip, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  LABEL_PRIORITAS,
  LABEL_STATUS_KENDALA,
  MIN_CATATAN,
  PRIORITAS,
  STATUS_KENDALA,
  SkemaUbahKendala,
  type Prioritas,
  type StatusKendala,
} from '@/lib/kendala/skema';
import type { DetailKendala } from '@/lib/kendala/service';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

import type { OrangMention } from './MentionInput';
import { ReplyThread } from './ReplyThread';
import { tonePrioritas, toneStatus } from './tone';

function ukuran(b: number) {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

async function kirim(url: string, init: RequestInit): Promise<string | null> {
  try {
    const r = await fetch(url, init);
    const b = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
    return r.ok && b?.ok ? null : (b?.error?.message ?? 'Permintaan gagal.');
  } catch {
    return 'Tidak dapat menghubungi server. Coba lagi.';
  }
}

export function KendalaDetail({
  k,
  orang,
  saya,
  bolehUbah,
  bolehBalas,
  bolehHapus,
  bolehLampir,
  arsip,
}: {
  k: DetailKendala;
  orang: OrangMention[];
  saya: string;
  bolehUbah: boolean;
  bolehBalas: boolean;
  bolehHapus: boolean;
  bolehLampir: boolean;
  arsip: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<StatusKendala>(k.status);
  const [prioritas, setPrioritas] = React.useState<Prioritas>(k.prioritas);
  const [assignee, setAssignee] = React.useState(k.assignee_id ?? '');
  const [catatan, setCatatan] = React.useState('');
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);
  const [yakinHapus, setYakinHapus] = React.useState(false);
  const berkasRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    setStatus(k.status);
    setPrioritas(k.prioritas);
    setAssignee(k.assignee_id ?? '');
  }, [k.status, k.prioritas, k.assignee_id]);

  const berubah = status !== k.status || prioritas !== k.prioritas || assignee !== (k.assignee_id ?? '');
  const menyelesaikan = status === 'SELESAI' && k.status !== 'SELESAI';

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      ...(status !== k.status ? { status } : {}),
      ...(prioritas !== k.prioritas ? { prioritas } : {}),
      ...(assignee !== (k.assignee_id ?? '') ? { assignee_id: assignee || null } : {}),
      ...(menyelesaikan ? { catatan_penyelesaian: catatan } : {}),
    };
    const p = SkemaUbahKendala.safeParse(body);
    if (!p.success) return setGalat(p.error.issues[0]?.message ?? 'Isian tidak valid.');
    setProses(true);
    setGalat(null);
    const g = await kirim(`/api/kendala/${k.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p.data) });
    setProses(false);
    if (g) return setGalat(g);
    setCatatan('');
    router.refresh();
  }

  async function unggah(f: File) {
    setProses(true);
    setGalat(null);
    const form = new FormData();
    form.set('berkas', f);
    const g = await kirim(`/api/kendala/${k.id}/lampiran`, { method: 'POST', body: form });
    setProses(false);
    if (berkasRef.current) berkasRef.current.value = '';
    if (g) return setGalat(g);
    router.refresh();
  }

  async function hapusLampiran(lid: string) {
    setProses(true);
    const g = await kirim(`/api/kendala/lampiran/${lid}`, { method: 'DELETE' });
    setProses(false);
    if (g) return setGalat(g);
    router.refresh();
  }

  async function hapus() {
    setProses(true);
    const g = await kirim(`/api/kendala/${k.id}`, { method: 'DELETE' });
    setProses(false);
    if (g) return setGalat(g);
    router.push(k.kode_departemen ? `/departemen/${encodeURIComponent(k.kode_departemen)}/kendala` : '/departemen/kendala');
    router.refresh();
  }

  return (
    <div data-testid="kendala-detail" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-6">
        <header className="grid gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={tonePrioritas(k.prioritas)} data-testid="kendala-badge-prioritas">
              {LABEL_PRIORITAS[k.prioritas]}
            </Badge>
            <Badge tone={toneStatus(k.status)} data-testid="kendala-badge-status">
              {LABEL_STATUS_KENDALA[k.status]}
            </Badge>
            {arsip ? <Badge tone="neutral">Arsip periode lain</Badge> : null}
          </div>
          <h1 className="text-xl font-semibold break-words text-primary">{k.judul}</h1>
          <p className="text-xs text-secondary">
            {k.nama_departemen ?? 'Lintas organisasi'} · dilaporkan {k.nama_pembuat} · {formatTanggalWaktu(k.created_at)}
            {k.nama_proker ? ` · proker ${k.nama_proker}` : ''}
          </p>
        </header>

        <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-primary">{k.deskripsi}</p>

        {k.catatan_penyelesaian ? (
          <section className="rounded-sm border border-[var(--success)] bg-[var(--success-subtle)] p-3" data-testid="kendala-catatan-tampil">
            <h2 className="text-xs font-semibold text-primary">
              Catatan penyelesaian{k.resolved_at ? ` · ${formatTanggalWaktu(k.resolved_at)}` : ''}
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-[13px] text-primary">{k.catatan_penyelesaian}</p>
          </section>
        ) : null}

        <ReplyThread kendalaId={k.id} balasan={k.balasan} orang={orang} saya={saya} bolehBalas={bolehBalas} />
      </div>

      <aside className="grid content-start gap-4">
        <form onSubmit={simpan} className="grid gap-3 rounded-sm border border-default bg-panel p-4" noValidate>
          <h2 className="text-sm font-semibold text-primary">Penanganan</h2>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-status`}>Status</Label>
            <Select id={`${id}-status`} placeholder={null} value={status} disabled={!bolehUbah || proses} onChange={(e) => setStatus(e.target.value as StatusKendala)} data-testid="kendala-status">
              {STATUS_KENDALA.map((s) => (
                <option key={s} value={s}>
                  {LABEL_STATUS_KENDALA[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-prioritas`}>Prioritas</Label>
            <Select id={`${id}-prioritas`} placeholder={null} value={prioritas} disabled={!bolehUbah || proses} onChange={(e) => setPrioritas(e.target.value as Prioritas)} data-testid="kendala-prioritas">
              {PRIORITAS.map((p) => (
                <option key={p} value={p}>
                  {LABEL_PRIORITAS[p]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-assignee`}>Penanggung jawab</Label>
            <Select id={`${id}-assignee`} placeholder={null} value={assignee} disabled={!bolehUbah || proses} onChange={(e) => setAssignee(e.target.value)} data-testid="kendala-assignee">
              <option value="">— Belum ditugaskan —</option>
              {orang.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nama}
                </option>
              ))}
              {k.assignee_id && !orang.some((o) => o.id === k.assignee_id) ? <option value={k.assignee_id}>{k.nama_assignee}</option> : null}
            </Select>
          </div>
          {menyelesaikan ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-catatan`}>Catatan penyelesaian (wajib)</Label>
              <Textarea
                id={`${id}-catatan`}
                rows={4}
                value={catatan}
                maxLength={5000}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Bagaimana kendala ini diselesaikan? Catatan ini dibaca pengurus periode berikutnya."
                data-testid="kendala-catatan"
              />
              <p className="text-xs text-tertiary">Minimal {MIN_CATATAN} karakter.</p>
            </div>
          ) : null}
          {galat ? (
            <p role="alert" data-testid="kendala-galat" className="text-[13px] text-danger">
              {galat}
            </p>
          ) : null}
          {bolehUbah ? (
            <Button type="submit" loading={proses} disabled={!berubah} data-testid="kendala-simpan">
              Simpan perubahan
            </Button>
          ) : (
            <p className="text-xs text-tertiary" data-testid="kendala-baca-saja">
              {arsip ? 'Kendala periode lain hanya dapat dibaca.' : 'Anda hanya dapat membaca kendala ini.'}
            </p>
          )}
        </form>

        <section className="grid gap-2 rounded-sm border border-default bg-panel p-4" aria-labelledby={`${id}-lampiran`}>
          <h2 id={`${id}-lampiran`} className="text-sm font-semibold text-primary">
            Lampiran ({k.lampiran.length})
          </h2>
          {k.lampiran.length ? (
            <ul className="grid gap-1.5">
              {k.lampiran.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-[13px]" data-testid={`lampiran-${l.id}`}>
                  <Paperclip className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                  <a href={`/api/kendala/lampiran/${l.id}`} className="min-w-0 flex-1 truncate text-[var(--primary)] hover:underline">
                    {l.nama_berkas}
                  </a>
                  <span className="shrink-0 text-xs text-tertiary">{ukuran(l.ukuran)}</span>
                  {!arsip && (l.diunggah_oleh === saya || bolehHapus) ? (
                    <button
                      type="button"
                      aria-label={`Hapus lampiran ${l.nama_berkas}`}
                      className="shrink-0 text-tertiary hover:text-danger"
                      disabled={proses}
                      onClick={() => void hapusLampiran(l.id)}
                      data-testid={`lampiran-hapus-${l.id}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-secondary">Belum ada lampiran.</p>
          )}
          {bolehLampir ? (
            <label className="mt-1 grid gap-1 text-xs text-secondary">
              Tambah lampiran (PNG, JPG, WEBP, PDF, DOCX, XLSX; maks. 5 MB)
              <input
                ref={berkasRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx"
                disabled={proses}
                className="text-xs"
                data-testid="lampiran-unggah"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void unggah(f);
                }}
              />
            </label>
          ) : null}
        </section>

        {bolehHapus && !arsip ? (
          yakinHapus ? (
            <Button variant="danger" loading={proses} onClick={() => void hapus()} data-testid="kendala-hapus">
              Ya, hapus kendala ini
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setYakinHapus(true)}>
              Hapus kendala
            </Button>
          )
        ) : null}
      </aside>
    </div>
  );
}
