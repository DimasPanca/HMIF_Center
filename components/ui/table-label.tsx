'use client';

import { useEffect, useRef } from 'react';

/**
 * Menyalin judul kolom ke `data-label` setiap sel, supaya CSS tabel-kartu
 * (globals.css, `[data-kartu-hp]`) dapat menampilkan "Label: nilai" ketika
 * baris tabel berubah menjadi kartu di layar HP (ADR-037).
 *
 * Dipasang di dalam elemen ber-`data-kartu-hp`: komponen Table memasangnya
 * sendiri; tabel HTML lain cukup menambah atribut itu dan komponen ini.
 * Berjalan di klien karena Table juga dipakai komponen server; isi tabel yang
 * berubah (filter, paginasi) ditangani MutationObserver.
 */
export function LabelKolomOtomatis() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const table = ref.current?.closest('[data-kartu-hp]')?.querySelector('table');
    if (!table) return;
    const terapkan = () => {
      // Kolom "Aksi" tidak diberi label: tombolnya cukup tampil di kanan kartu.
      const judul = [...table.querySelectorAll('thead th')].map((th) => {
        const teks = (th.textContent ?? '').replace(/[↑↓↕]/g, '').trim();
        return /^aksi$/i.test(teks) ? '' : teks;
      });
      for (const tr of table.querySelectorAll('tbody tr')) {
        let kolom = 0;
        for (const td of Array.from(tr.children)) {
          const rentang = Number(td.getAttribute('colspan') ?? '1') || 1;
          const label = rentang > 1 ? '' : (judul[kolom] ?? '');
          if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
          kolom += rentang;
        }
      }
    };
    terapkan();
    const pengamat = new MutationObserver(terapkan);
    pengamat.observe(table, { childList: true, subtree: true });
    return () => pengamat.disconnect();
  }, []);

  return <span ref={ref} hidden />;
}
