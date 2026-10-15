'use client';

import * as React from 'react';

import { CameraCapture, type HasilTangkapan } from '@/components/nota/CameraCapture';

interface Ringkas {
  sumber: HasilTangkapan['sumber'];
  terpindai: boolean;
  tipe: string;
  ukuran: number;
  lebar: number;
  tinggi: number;
}

/** Menampilkan keluaran CameraCapture apa adanya supaya gate dapat memeriksanya. */
export function HarnessKamera() {
  const [hasil, setHasil] = React.useState<Ringkas | null>(null);

  async function gunakan(h: HasilTangkapan) {
    const bmp = await createImageBitmap(h.berkas);
    setHasil({ sumber: h.sumber, terpindai: h.terpindai, tipe: h.berkas.type, ukuran: h.berkas.size, lebar: bmp.width, tinggi: bmp.height });
    bmp.close();
  }

  return hasil ? (
    <dl data-testid="harness-hasil" className="mx-auto grid max-w-md grid-cols-2 gap-1 text-[13px]">
      {Object.entries(hasil).map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-secondary">{k}</dt>
          <dd data-testid={`harness-hasil-${k}`}>{String(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  ) : (
    <CameraCapture onGunakan={(h) => void gunakan(h)} />
  );
}
