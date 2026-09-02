const NAMA_BERKAS_WINDOWS_DILARANG = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

export function slug(input: string): string {
  const hasil = input
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!hasil) return 'berkas';

  return NAMA_BERKAS_WINDOWS_DILARANG.test(hasil) ? `berkas-${hasil}` : hasil;
}
