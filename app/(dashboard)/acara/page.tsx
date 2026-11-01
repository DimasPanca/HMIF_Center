import { ChevronDown, Target } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BelumTersedia } from '@/components/acara/BelumTersedia';
import { BilahProgres } from '@/components/acara/DivisiCard';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { STATUS_VALUES, StatusPill, type DomainStatus } from '@/components/ui/status-pill';
import { hitungMundur } from '@/lib/acara/jalur';
import { daftarAcara, type BarisAcara } from '@/lib/acara/service';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatRentangTanggal, formatTanggalPendek, tanggalHariIniJakarta } from '@/lib/utils/format-tanggal';

export const dynamic = 'force-dynamic';

const statusSah = (s: string) =>
  (STATUS_VALUES as readonly string[]).includes(s) ? (s as DomainStatus) : null;

function hariH(mulai: string | null, selesai: string | null): string {
  if (!mulai) return 'Tanggal belum ditetapkan';
  return selesai && selesai > mulai
    ? formatRentangTanggal(mulai, selesai)
    : formatTanggalPendek(mulai);
}

const STATUS_LEWAT = new Set(['SELESAI', 'DIBATALKAN', 'DITOLAK']);

/** Acara yang sudah selesai, batal, atau hari-H-nya terlewat (ADR-039: dilipat ke "Sudah lewat"). */
function sudahLewat(a: BarisAcara, hariIni: string): boolean {
  if (STATUS_LEWAT.has(a.status)) return true;
  const akhir = a.hari_h_selesai ?? a.hari_h_mulai;
  return !!akhir && akhir < hariIni;
}

function KartuAcara({ a, href, hariIni }: { a: BarisAcara; href: string; hariIni: string }) {
  const status = statusSah(a.status);
  const mundur = STATUS_LEWAT.has(a.status) ? null : hitungMundur(hariIni, a.hari_h_mulai, a.hari_h_selesai);
  return (
    <li>
      {/* Seluruh kartu dapat diklik (tautan judul diregangkan) — target sentuh besar di HP. */}
      <Card className="relative flex h-full flex-col gap-3 p-4 hover:bg-subtle" data-testid="acara-item">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={href}
              className="text-[16px] font-semibold outline-none after:absolute after:inset-0 after:rounded-[inherit] hover:underline focus-visible:after:ring-2 focus-visible:after:ring-[var(--border-focus)]"
              data-testid="acara-item-buka"
            >
              {a.nama_acara}
            </Link>
            <p className="mt-0.5 text-[13px] text-secondary">
              {hariH(a.hari_h_mulai, a.hari_h_selesai)}
              {mundur && !mundur.startsWith('H+') ? <span className="font-medium text-primary"> · {mundur === 'Hari-H' ? 'hari ini' : mundur}</span> : null}
            </p>
          </div>
          {status ? <StatusPill status={status} className="shrink-0" /> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="primary">PIC {a.departemen.nama}</Badge>
          {a.saya_panitia ? <Badge tone="info">Anda panitia</Badge> : null}
        </div>
        <dl className="grid gap-1 text-[13px]">
          <div className="flex justify-between gap-2">
            <dt className="text-secondary">Ketua Pelaksana</dt>
            <dd className="truncate">{a.ketua_pelaksana ?? 'Belum ditetapkan'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-secondary">Total RAB</dt>
            <dd className="tabular-nums" data-testid="acara-item-rab">
              {a.total_rab === null ? 'Terbatas' : formatRupiah(a.total_rab)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-secondary">Divisi</dt>
            <dd className="tabular-nums">{a.jumlah_divisi}</dd>
          </div>
        </dl>
        <div className="mt-auto">
          <BilahProgres progres={a.progres} label="Progres" />
        </div>
      </Card>
    </li>
  );
}

/**
 * `?buka=` — daftar ini dipakai sebagai PEMILIH acara oleh menu sidebar yang
 * fiturnya milik satu acara (ruang divisi, TOR, proposal, RAB, LPJ). Tanpa
 * pemilih, menu itu menautkan ke halaman indeks yang memang tidak ada (404).
 */
const TUJUAN = {
  divisi: { label: 'ruang kerja divisi', ke: (id: string) => `/acara/${id}?tab=divisi` },
  tor: { label: 'TOR', ke: (id: string) => `/acara/${id}?tab=tor` },
  proposal: { label: 'proposal', ke: (id: string) => `/acara/${id}?tab=proposal` },
  rab: { label: 'RAB', ke: (id: string) => `/acara/${id}?tab=rab` },
  lpj: { label: 'LPJ', ke: (id: string) => `/acara/${id}/lpj` },
} as const;
type Tujuan = keyof typeof TUJUAN;

interface PageProps {
  searchParams: Promise<{ buka?: string | string[] }>;
}

/**
 * Daftar acara besar periode aktif (T-084 kontrak 1): status, tanggal, PIC
 * departemen, total RAB, progres. Sumber: tabel `kepanitiaan` — terbentuk
 * otomatis saat proker TERJADWAL disetujui (PRD F-8.1).
 */
export default async function DaftarAcaraPage({ searchParams }: PageProps) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive || !konteks.periodeId) redirect('/login');
  if (!can(konteks.roles, 'kepanitiaan.read')) notFound();

  const sp = await searchParams;
  const kunci = Array.isArray(sp.buka) ? sp.buka[0] : sp.buka;
  const tujuan = kunci && kunci in TUJUAN ? TUJUAN[kunci as Tujuan] : null;

  const acara = await daftarAcara(konteks);
  // Satu-satunya acara: tidak ada yang perlu dipilih.
  if (tujuan && acara.length === 1) redirect(tujuan.ke(acara[0]!.id));

  // Acara tempat pengguna menjadi panitia didahulukan, lalu yang hari-H-nya paling dekat.
  const hariIni = tanggalHariIniJakarta();
  const aktif = acara.filter((a) => !sudahLewat(a, hariIni)).sort((x, y) => Number(y.saya_panitia) - Number(x.saya_panitia));
  const lewat = acara.filter((a) => sudahLewat(a, hariIni)).reverse();

  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[var(--primary-subtle)] text-[var(--primary)]"
            aria-hidden="true"
          >
            <Target className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-tertiary uppercase">
              Acara Besar
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold" data-testid="acara-judul">
              {tujuan ? `Pilih acara untuk membuka ${tujuan.label}` : 'Daftar acara'}
            </h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-secondary">
              {tujuan
                ? `Setiap acara punya ${tujuan.label} sendiri. Pilih acaranya untuk langsung membukanya.`
                : 'Acara besar periode ini. Kepanitiaan terbentuk otomatis saat proker terjadwal disetujui; panitianya boleh lintas departemen.'}
            </p>
          </div>
        </header>

        {acara.length === 0 ? (
          <Card>
            <BelumTersedia
              testid="acara-kosong"
              ikon="folder"
              judul="Belum ada acara besar"
              penjelasan="Acara besar muncul di sini setelah proker terjadwal disetujui dan kepanitiaannya terbentuk."
              aksi={{ label: 'Lihat daftar proker', href: '/proker' }}
            />
          </Card>
        ) : (
          <>
            {aktif.length ? (
              <section aria-labelledby="acara-aktif" className="space-y-3">
                <h2 id="acara-aktif" className="text-[15px] font-semibold">
                  Berjalan dan mendatang <span className="font-normal text-secondary">({aktif.length})</span>
                </h2>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {aktif.map((a) => (
                    <KartuAcara key={a.id} a={a} href={tujuan ? tujuan.ke(a.id) : `/acara/${a.id}`} hariIni={hariIni} />
                  ))}
                </ul>
              </section>
            ) : (
              <p className="text-[14px] text-secondary">Tidak ada acara yang sedang berjalan atau akan datang.</p>
            )}
            {lewat.length ? (
              <details className="group space-y-3" data-testid="acara-lewat" open={!aktif.length}>
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm py-1 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] [&::-webkit-details-marker]:hidden">
                  <ChevronDown aria-hidden="true" className="size-4 -rotate-90 transition-transform group-open:rotate-0" />
                  Sudah lewat <span className="font-normal text-secondary">({lewat.length})</span>
                </summary>
                <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {lewat.map((a) => (
                    <KartuAcara key={a.id} a={a} href={tujuan ? tujuan.ke(a.id) : `/acara/${a.id}`} hariIni={hariIni} />
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
