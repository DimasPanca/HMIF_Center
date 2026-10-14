import { describe, expect, it } from 'vitest';
import { namaBerkasSurat } from '@/lib/surat/unduh';

describe('namaBerkasSurat', () => {
  it('nomor surat dengan "/" menjadi "-" (kontrak T-061)', () => {
    expect(namaBerkasSurat('05/001/UN43.3.7/HMIF/X/2025')).toBe('05-001-UN43.3.7-HMIF-X-2025.docx');
    expect(namaBerkasSurat('02/274/UN43.3.7/KT2HMIF/VII/2025', 'pdf')).toBe('02-274-UN43.3.7-KT2HMIF-VII-2025.pdf');
  });

  it('karakter yang dapat merusak header Content-Disposition dibuang', () => {
    expect(namaBerkasSurat('05/001/"x";\r\nSet-Cookie: a=b')).toBe('05-001-xSet-Cookieab.docx');
    expect(namaBerkasSurat('..\\..\\rahasia')).toBe('rahasia.docx');
  });

  it('nomor kosong tetap menghasilkan nama yang sah', () => {
    expect(namaBerkasSurat('')).toBe('surat.docx');
    expect(namaBerkasSurat('///')).toBe('surat.docx');
  });
});
