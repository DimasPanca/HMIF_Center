/**
 * SVG mandiri untuk export Gantt (T-078 #4). Murni — dipakai klien (lalu
 * dirasterisasi ke kanvas 2x) maupun route export server (sharp).
 *
 * Kenapa tidak menyalin <svg> yang sedang tampil: chart di layar memakai
 * variabel CSS tema (`var(--gantt-bar-opacity)`, warna departemen), kolom
 * labelnya HTML di luar <svg>, dan barisnya tervirtualisasi — salinannya
 * kehilangan warna, label, dan baris di luar layar. Gambar untuk Word
 * harus lengkap dan berwarna tetap, jadi digambar ulang dari view model
 * dengan warna terang heksadesimal dan font sistem.
 *
 * Sumber: T-078 · PRD F-6.3 · ADR-030
 */

import { GANTT_DIMENSIONS, barRect, dateToX, toUtcDay } from '@/lib/gantt/geometry';
import type { GanttViewModel } from '@/lib/gantt/types';

export interface OpsiEkspor {
  judul?: string;
  /** Lebar kolom label (px CSS). */
  lebarLabel?: number;
  /** Lebar timeline minimal — samakan dengan chart di layar. */
  lebarTimelineMin?: number;
  /** Mengubah warna non-heks (mis. `var(--dept-x)`) menjadi heks. */
  warna?: (c: string) => string;
}

const FONT = 'Arial, Helvetica, sans-serif';
const TINGGI_JUDUL = 34;
const TINGGI_HEADER = 40;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const POLA_HEKS = /^#[0-9a-f]{6}$/i;

function potong(teks: string, lebar: number, px = 6.4): string {
  const maks = Math.max(4, Math.floor(lebar / px));
  return teks.length > maks ? `${teks.slice(0, maks - 1)}…` : teks;
}

export function svgEkspor(model: GanttViewModel, opsi: OpsiEkspor = {}): { svg: string; lebar: number; tinggi: number } {
  const lebarLabel = opsi.lebarLabel ?? 240;
  const warna = (c: string) => {
    const r = opsi.warna ? opsi.warna(c) : c;
    return POLA_HEKS.test(r) ? r : '#64748B';
  };
  const kolomTerakhir = model.timeline.columns.at(-1);
  const lebarTimeline = Math.max(kolomTerakhir ? kolomTerakhir.x + kolomTerakhir.width : 0, opsi.lebarTimelineMin ?? 0, 200);
  const atas = (opsi.judul ? TINGGI_JUDUL : 0) + TINGGI_HEADER;
  const ctx = { start: model.timeline.start, pxPerDay: model.timeline.pxPerDay };

  const badan: string[] = [];
  const label: string[] = [];
  const pusat = new Map<string, { x: number; akhir: number; y: number }>();
  let y = GANTT_DIMENSIONS.groupGap;

  for (const g of model.groups) {
    const cg = warna(g.color);
    const ringkas = g.bars[0];
    label.push(
      `<text x="12" y="${atas + y + 20}" font-size="13" font-weight="700" fill="#0F172A">${esc(potong(g.label, lebarLabel - 24, 7.2))}</text>`,
    );
    if (ringkas) {
      const r = barRect({ start: ringkas.start, end: ringkas.end, y, kind: 'group' }, ctx);
      badan.push(
        `<rect x="${r.x}" y="${atas + r.y}" width="${r.width}" height="${r.height}" rx="${r.height / 2}" fill="${cg}" opacity="0.35"/>`,
        `<rect x="${r.x}" y="${atas + r.y}" width="${(r.width * ringkas.progress) / 100}" height="${r.height}" rx="${r.height / 2}" fill="${cg}"/>`,
      );
    }
    y += GANTT_DIMENSIONS.groupRowHeight;
    for (const t of g.tasks) {
      const r = barRect({ start: t.start, end: t.end, y, kind: 'task' }, ctx);
      const ct = warna(t.color);
      label.push(`<text x="28" y="${atas + y + 17}" font-size="12" fill="#334155">${esc(potong(t.label, lebarLabel - 36))}</text>`);
      badan.push(
        `<line x1="0" y1="${atas + y + GANTT_DIMENSIONS.taskRowHeight}" x2="${lebarTimeline}" y2="${atas + y + GANTT_DIMENSIONS.taskRowHeight}" stroke="#F1F5F9"/>`,
      );
      if (t.isMilestone) {
        const cx = r.x + r.width / 2;
        const cy = atas + r.y + r.height / 2;
        badan.push(`<path d="M ${cx} ${cy - 7} L ${cx + 7} ${cy} L ${cx} ${cy + 7} L ${cx - 7} ${cy} Z" fill="${ct}"/>`);
      } else {
        badan.push(
          `<rect x="${r.x}" y="${atas + r.y}" width="${r.width}" height="${r.height}" rx="${r.height / 2}" fill="${ct}" opacity="0.35"/>`,
          `<rect x="${r.x}" y="${atas + r.y}" width="${(r.width * t.progress) / 100}" height="${r.height}" rx="${r.height / 2}" fill="${ct}"/>`,
        );
      }
      pusat.set(t.id, { x: r.x, akhir: r.x + r.width, y: atas + r.y + r.height / 2 });
      y += GANTT_DIMENSIONS.taskRowHeight;
    }
    y += GANTT_DIMENSIONS.groupGap;
  }

  // Konektor Finish-to-Start.
  for (const g of model.groups) {
    for (const t of g.tasks) {
      const ke = pusat.get(t.id);
      for (const d of t.dependsOn ?? []) {
        const dari = pusat.get(d);
        if (!dari || !ke) continue;
        const siku = Math.max(dari.akhir + 6, Math.min(ke.x - 6, dari.akhir + 12));
        badan.push(
          `<path d="M ${dari.akhir} ${dari.y} H ${siku} V ${ke.y} H ${ke.x - 4}" fill="none" stroke="#475569" stroke-width="1.2"/>`,
          `<path d="M ${ke.x - 4} ${ke.y - 3.5} L ${ke.x} ${ke.y} L ${ke.x - 4} ${ke.y + 3.5} Z" fill="#475569"/>`,
        );
      }
    }
  }

  const tinggi = atas + Math.max(y, 60);
  const lebar = lebarLabel + lebarTimeline;

  // Label atas (bulan/kuartal) hanya di kolom pertama rentetan label yang sama,
  // dengan lebar seluruh rentetan — skala minggu tidak lagi mengulang
  // "Okto…" di tiap kolom. Kolom sempit (minggu parsial di akhir bulan) tanpa teks.
  const kolom = model.timeline.columns;
  const header = kolom
    .map((c, i) => {
      const awalRentetan = i === 0 || kolom[i - 1]!.label !== c.label || kolom[i - 1]!.sublabel === c.sublabel;
      let lebarRentetan = c.width;
      for (let j = i + 1; j < kolom.length && kolom[j]!.label === c.label && kolom[j]!.sublabel !== c.sublabel; j++) lebarRentetan += kolom[j]!.width;
      const atasLabel = awalRentetan && lebarRentetan >= 24
        ? `<text x="${c.x + 6}" y="${atas - TINGGI_HEADER + 17}" font-size="11" font-weight="700" fill="#334155">${esc(potong(c.label, lebarRentetan - 8, 6.4))}</text>`
        : '';
      const bawahLabel = c.sublabel && c.width >= 20
        ? `<text x="${c.x + 6}" y="${atas - TINGGI_HEADER + 32}" font-size="10" fill="#64748B">${esc(potong(c.sublabel, c.width - 8, 5.6))}</text>`
        : '';
      return `<line x1="${c.x}" y1="${atas - TINGGI_HEADER}" x2="${c.x}" y2="${tinggi}" stroke="#E2E8F0"/>${atasLabel}${bawahLabel}`;
    })
    .join('');

  const hariIni = toUtcDay(model.today);
  const garisHariIni =
    hariIni >= toUtcDay(model.timeline.start) && hariIni <= toUtcDay(model.timeline.end)
      ? `<line x1="${dateToX(hariIni, ctx)}" y1="${atas - TINGGI_HEADER}" x2="${dateToX(hariIni, ctx)}" y2="${tinggi}" stroke="#DC2626" stroke-width="1.5"/>`
      : '';

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lebar}" height="${tinggi}" viewBox="0 0 ${lebar} ${tinggi}" font-family="${FONT}">`,
    `<rect width="${lebar}" height="${tinggi}" fill="#FFFFFF"/>`,
    opsi.judul ? `<text x="12" y="22" font-size="15" font-weight="700" fill="#0F172A">${esc(opsi.judul)}</text>` : '',
    `<rect x="0" y="${atas - TINGGI_HEADER}" width="${lebar}" height="${TINGGI_HEADER}" fill="#F8FAFC"/>`,
    `<g>${label.join('')}</g>`,
    `<line x1="${lebarLabel}" y1="${atas - TINGGI_HEADER}" x2="${lebarLabel}" y2="${tinggi}" stroke="#CBD5E1"/>`,
    `<g transform="translate(${lebarLabel} 0)">${header}${badan.join('')}${garisHariIni}</g>`,
    `<line x1="0" y1="${atas}" x2="${lebar}" y2="${atas}" stroke="#CBD5E1"/>`,
    `</svg>`,
  ].join('');
  return { svg, lebar, tinggi };
}
