/**
 * kontras — rasio kontras WCAG 2.x dari token warna `app/globals.css`
 * (T-115 kontrak 1). Murni: dipakai test `a11y-kontras` untuk mengaudit
 * KEDUA tema setiap kali token berubah.
 *
 * Sumber: PRD §8.6 · DESIGN_SYSTEM §13 · WCAG 2.2 SC 1.4.3 (teks 4.5:1),
 *         SC 1.4.11 (komponen non-teks 3:1)
 */

export type Tema = 'terang' | 'gelap';

/** Token `--nama: #RRGGBB;` per tema: blok `:root` pertama = terang, `[data-theme="dark"]` pertama = gelap. */
export function bacaToken(css: string): Record<Tema, Record<string, string>> {
  const blok = (pola: RegExp) => {
    const m = pola.exec(css);
    const isi = m ? css.slice(m.index, css.indexOf('}', m.index)) : '';
    return Object.fromEntries(
      [...isi.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((x) => [
        x[1]!,
        x[2]!.toUpperCase(),
      ]),
    );
  };
  return { terang: blok(/:root\s*\{/), gelap: blok(/\[data-theme="dark"\]\s*\{/) };
}

function luminansi(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function rasio(a: string, b: string): number {
  const [l1, l2] = [luminansi(a), luminansi(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

export interface Pasangan {
  depan: string;
  latar: string;
  /** 4.5 untuk teks, 3 untuk ikon/batas fokus (komponen non-teks). */
  min: 4.5 | 3;
}

const LATAR_UMUM = ['bg-base', 'bg-subtle', 'bg-muted', 'bg-panel', 'bg-elevated'];

/** Pasangan yang benar-benar dipakai antarmuka (utilitas Tailwind → token). */
export const PASANGAN: Pasangan[] = [
  // Teks di atas seluruh latar permukaan.
  ...[
    'text-primary',
    'text-secondary',
    'text-tertiary',
    'text-link',
    'primary',
    'danger',
    'warning',
    'success',
  ].flatMap((depan) => LATAR_UMUM.map((latar) => ({ depan, latar, min: 4.5 as const }))),
  // Badge/StatusPill & pesan: teks utama di atas latar subtle status.
  ...[
    'primary-subtle',
    'success-subtle',
    'warning-subtle',
    'danger-subtle',
    'info-subtle',
    'neutral-subtle',
  ].map((latar) => ({
    depan: 'text-primary',
    latar,
    min: 4.5 as const,
  })),
  // Tombol: teks di atas warna isi.
  { depan: 'primary-text', latar: 'primary', min: 4.5 },
  { depan: 'primary-text', latar: 'primary-hover', min: 4.5 },
  { depan: 'primary-text', latar: 'primary-active', min: 4.5 },
  { depan: 'primary-text', latar: 'danger', min: 4.5 },
  // Ikon status di badge & cincin fokus (non-teks).
  ...(['success', 'warning', 'danger', 'info', 'primary', 'neutral'] as const).map((s) => ({
    depan: s,
    latar: `${s}-subtle`,
    min: 3 as const,
  })),
  ...['bg-base', 'bg-panel', 'bg-subtle'].map((latar) => ({
    depan: 'border-focus',
    latar,
    min: 3 as const,
  })),
];

export interface HasilKontras extends Pasangan {
  tema: Tema;
  nilai: number;
  lulus: boolean;
}

export function auditKontras(css: string): HasilKontras[] {
  const token = bacaToken(css);
  return (['terang', 'gelap'] as const).flatMap((tema) =>
    PASANGAN.map((p) => {
      const d = token[tema][p.depan];
      const l = token[tema][p.latar];
      if (!d || !l) throw new Error(`Token ${!d ? p.depan : p.latar} tidak ada di tema ${tema}`);
      const nilai = Math.round(rasio(d, l) * 100) / 100;
      return { ...p, tema, nilai, lulus: nilai >= p.min };
    }),
  );
}
