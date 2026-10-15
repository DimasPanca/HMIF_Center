/**
 * Validasi berkas lampiran kendala (T-082) — murni, aman untuk klien & unit test.
 * Isi dicocokkan dengan tanda tangan berkas (magic bytes): ekstensi dan
 * `Content-Type` dari klien saja mudah dipalsukan.
 */

export const MAKS_UKURAN_LAMPIRAN = 5 * 1024 * 1024;
export const MAKS_LAMPIRAN_PER_KENDALA = 10;

export interface JenisBerkas {
  mime: string;
  ext: string;
  cocok: (b: Buffer) => boolean;
}

const awal = (b: Buffer, ...byte: number[]) => byte.every((x, i) => b[i] === x);

/** Jenis yang diterima. ZIP-based (docx/xlsx) dikenali dari tanda tangan PK. */
const JENIS: JenisBerkas[] = [
  { mime: 'image/png', ext: 'png', cocok: (b) => awal(b, 0x89, 0x50, 0x4e, 0x47) },
  { mime: 'image/jpeg', ext: 'jpg', cocok: (b) => awal(b, 0xff, 0xd8, 0xff) },
  { mime: 'image/webp', ext: 'webp', cocok: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', cocok: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
    cocok: (b) => awal(b, 0x50, 0x4b, 0x03, 0x04),
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
    cocok: (b) => awal(b, 0x50, 0x4b, 0x03, 0x04),
  },
];

export const MIME_DITERIMA = JENIS.map((j) => j.mime);

/** Jenis berkas dari ekstensi nama + isi; `null` bila ditolak. Murni — diuji unit. */
export function kenaliBerkas(nama: string, isi: Buffer): JenisBerkas | null {
  const ext = nama.toLowerCase().split('.').pop() ?? '';
  const kandidat = JENIS.find((j) => j.ext === ext || (j.ext === 'jpg' && ext === 'jpeg'));
  return kandidat && kandidat.cocok(isi) ? kandidat : null;
}

/** Nama berkas aman untuk header & tampilan: tanpa path, tanpa karakter kendali. */
export function namaAman(nama: string): string {
  const dasar = nama.split(/[\\/]/).pop() ?? 'lampiran';
  return dasar.replace(/[\u0000-\u001f"\\]/g, '').slice(0, 150) || 'lampiran';
}
