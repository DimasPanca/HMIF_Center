import { describe, expect, it } from 'vitest';

import { slug } from '@/lib/utils/slug';

describe('slug', () => {
  it('mengubah teks menjadi nama berkas aman', () => {
    expect(slug('Laporan Kegiatan HMIF 2025.pdf')).toBe('laporan-kegiatan-hmif-2025-pdf');
  });

  it('menghapus diakritik dan merapikan pemisah', () => {
    expect(slug('  Café / R&D: Résumé  ')).toBe('cafe-r-d-resume');
  });

  it('menghapus karakter jalur dan kontrol', () => {
    expect(slug('../Surat\\Rahasia\u0000')).toBe('surat-rahasia');
  });

  it('memberi fallback untuk nama kosong dan nama perangkat Windows', () => {
    expect(slug('...')).toBe('berkas');
    expect(slug('CON')).toBe('berkas-con');
  });
});
