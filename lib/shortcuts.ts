export const JEDA_URUTAN_PINTASAN_MS = 1_000;

export type AksiPintasan =
  | 'BUKA_PALET'
  | 'BUKA_DAFTAR'
  | 'BUAT_BARU'
  | 'KE_BERANDA'
  | 'KE_PROKER'
  | 'KE_SURAT'
  | 'TUTUP'
  | 'TUNGGU_G';

export interface HasilPintasan {
  aksi: AksiPintasan | null;
  menungguG: boolean;
}

export interface DefinisiPintasan {
  id: Exclude<AksiPintasan, 'TUNGGU_G'>;
  label: string;
  tombol: readonly string[];
}

export const DAFTAR_PINTASAN: readonly DefinisiPintasan[] = [
  { id: 'BUKA_PALET', label: 'Buka pencarian', tombol: ['Ctrl/⌘', 'K'] },
  { id: 'KE_BERANDA', label: 'Ke Beranda', tombol: ['G', 'H'] },
  { id: 'KE_PROKER', label: 'Ke Program Kerja', tombol: ['G', 'P'] },
  { id: 'KE_SURAT', label: 'Ke Persuratan', tombol: ['G', 'S'] },
  { id: 'BUAT_BARU', label: 'Buat baru sesuai halaman', tombol: ['N'] },
  { id: 'TUTUP', label: 'Tutup palette', tombol: ['Esc'] },
  { id: 'BUKA_DAFTAR', label: 'Lihat daftar pintasan', tombol: ['?'] },
] as const;

/** Menjaga pintasan global agar tidak mengambil alih pengetikan pengguna. */
export function sedangMengetik(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]',
    ),
  );
}

/**
 * Menerjemahkan satu keydown menjadi aksi. Urutan G lalu H/P/S disimpan oleh
 * pemanggil agar modul ini tetap murni dan mudah diuji tanpa timer global.
 */
export function bacaPintasan(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey' | 'target'>,
  menungguG: boolean,
): HasilPintasan {
  if (sedangMengetik(event.target)) return { aksi: null, menungguG: false };

  const key = event.key.toLowerCase();
  const pengubahUtama = event.ctrlKey || event.metaKey;

  if (pengubahUtama && !event.altKey && key === 'k') {
    return { aksi: 'BUKA_PALET', menungguG: false };
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return { aksi: null, menungguG: false };
  }

  if (event.key === 'Escape') return { aksi: 'TUTUP', menungguG: false };
  if (event.key === '?') return { aksi: 'BUKA_DAFTAR', menungguG: false };
  if (key === 'n') return { aksi: 'BUAT_BARU', menungguG: false };

  if (menungguG) {
    if (key === 'h') return { aksi: 'KE_BERANDA', menungguG: false };
    if (key === 'p') return { aksi: 'KE_PROKER', menungguG: false };
    if (key === 's') return { aksi: 'KE_SURAT', menungguG: false };
    return { aksi: null, menungguG: key === 'g' };
  }

  if (key === 'g' && !event.shiftKey) return { aksi: 'TUNGGU_G', menungguG: true };
  return { aksi: null, menungguG: false };
}
