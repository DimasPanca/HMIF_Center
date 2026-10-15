'use client';

/**
 * Overlay tepi dokumen real-time di atas video kamera (T-100 kontrak 2).
 *
 * SVG ber-viewBox ukuran bingkai video dengan `preserveAspectRatio` yang sama
 * dengan `object-fit: contain` pada `<video>`, sehingga koordinat sudut dari
 * jscanify jatuh tepat di atas gambarnya tanpa hitung ulang letterbox.
 *
 * Test id: scan-overlay (data-terdeteksi="1|0").
 */

import type { Sudut } from '@/lib/images/pemindai';

export function ScanOverlay({ sudut, lebar, tinggi }: { sudut: Sudut | null; lebar: number; tinggi: number }) {
  if (!lebar || !tinggi) return null;
  const titik = sudut
    ? [sudut.topLeftCorner, sudut.topRightCorner, sudut.bottomRightCorner, sudut.bottomLeftCorner].map((t) => `${t.x},${t.y}`).join(' ')
    : null;

  return (
    <svg
      aria-hidden="true"
      data-testid="scan-overlay"
      data-terdeteksi={titik ? '1' : '0'}
      viewBox={`0 0 ${lebar} ${tinggi}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {titik ? (
        <polygon
          points={titik}
          fill="var(--primary)"
          fillOpacity={0.18}
          stroke="var(--primary)"
          strokeWidth={Math.max(3, Math.round(Math.max(lebar, tinggi) / 240))}
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
