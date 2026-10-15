/**
 * Gambar nota untuk DITAMPILKAN (T-099 #4).
 *
 * Hanya dua varian: `'thumb'` (daftar, 400px) dan `'preview'` (detail,
 * 1280px). TIDAK ADA varian ketiga untuk berkas asli, dan itu disengaja
 * (INV-24): berkas asli resolusi penuh tinggal di bucket privat dan hanya
 * keluar lewat tombol unduh (`/api/images/[id]/download`) yang memeriksa hak
 * dan mengirimnya apa adanya. Menampilkannya di <img> berarti memasang
 * tautan bertanda tangan di halaman — tautan yang dapat disalin dan
 * dibagikan tanpa pemeriksaan hak — sekaligus memuat 3–5 MB per nota di
 * ponsel panitia.
 *
 * Komponen murni (server maupun klien); URL dibuat di server oleh
 * `lib/images/url-gambar.ts`.
 *
 * Sumber: T-099 · SYSTEM_DESIGN §9.5 · INV-19, INV-24
 */

import { Download } from 'lucide-react';

import type { UrlGambarNota } from '@/lib/images/url-gambar';
import { cn } from '@/lib/utils';

export type VarianNotaImage = 'thumb' | 'preview';

const UKURAN: Record<VarianNotaImage, { w: number; h: number; kelas: string }> = {
  thumb: { w: 400, h: 400, kelas: 'size-20 object-cover' },
  preview: { w: 1280, h: 1280, kelas: 'h-auto max-h-[70vh] w-full object-contain' },
};

export function NotaImage({
  gambar,
  varian,
  tombolUnduh = varian === 'preview',
  className,
}: {
  gambar: UrlGambarNota;
  varian: VarianNotaImage;
  /** Tautan unduh berkas asli lewat endpoint berhak (bukan URL langsung). */
  tombolUnduh?: boolean;
  className?: string;
}) {
  const u = UKURAN[varian];
  return (
    <figure className={cn('grid gap-2', className)} data-testid={`nota-image-${varian}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- berkas sudah dioptimalkan pipeline T-097 */}
      <img
        src={varian === 'thumb' ? gambar.thumbUrl : gambar.previewUrl}
        alt={gambar.alt}
        width={u.w}
        height={u.h}
        loading={varian === 'thumb' ? 'lazy' : 'eager'}
        decoding="async"
        className={cn('rounded-sm border border-default bg-subtle', u.kelas)}
      />
      {tombolUnduh ? (
        <a
          href={`/api/images/${gambar.id}/download`}
          className="inline-flex items-center gap-1.5 justify-self-start text-[13px] font-medium text-[var(--primary)] hover:underline"
          data-testid="nota-image-unduh"
        >
          <Download className="size-4" aria-hidden="true" />
          Unduh resolusi penuh (untuk dicetak)
        </a>
      ) : null}
    </figure>
  );
}
