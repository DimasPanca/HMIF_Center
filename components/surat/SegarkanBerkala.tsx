'use client';

/**
 * SegarkanBerkala — memuat ulang data server halaman ini secara berkala dan
 * saat tab kembali dilihat, tanpa reload penuh.
 *
 * Antrian approval surat dipakai bersamaan oleh Ketua, Wakil, dan Sekum. Begitu
 * satu menyetujui, surat itu harus hilang dari layar dua lainnya (kontrak T-060
 * butir 3). Server tetap menolak approval ganda dengan pesan "sudah disetujui
 * oleh …", jadi kebenarannya tidak bergantung pada interval ini — interval
 * hanya menjaga layar tidak menampilkan pekerjaan yang sudah selesai.
 */

import { useRouter } from 'next/navigation';
import * as React from 'react';

export function SegarkanBerkala({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();

  React.useEffect(() => {
    const segarkan = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const t = setInterval(segarkan, intervalMs);
    document.addEventListener('visibilitychange', segarkan);
    window.addEventListener('focus', segarkan);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', segarkan);
      window.removeEventListener('focus', segarkan);
    };
  }, [router, intervalMs]);

  return null;
}
