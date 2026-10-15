/**
 * Geometri pemindai dokumen (T-100) — murni, tanpa OpenCV, dapat diuji di Node.
 *
 * jscanify mengembalikan empat sudut "terjauh dari pusat" per kuadran. Pada foto
 * tanpa dokumen jelas, hasilnya tetap empat titik — sering sudut-sudut kecil di
 * sekitar noda atau tepi meja. Memotong perspektif dengan sudut seperti itu
 * menghasilkan gambar rusak yang tampak "berhasil". Karena itu sudut divalidasi
 * di sini lebih dulu; yang tidak lolos = deteksi gagal → foto dipakai apa
 * adanya (kontrak 4: jangan memblokir pengguna).
 *
 * Sumber: docs/ai/tasks/P7-nota-lpj.md T-100 · PRD F-11.3 · ADR-032
 */

export interface Titik {
  x: number;
  y: number;
}

export interface Sudut {
  topLeftCorner: Titik;
  topRightCorner: Titik;
  bottomRightCorner: Titik;
  bottomLeftCorner: Titik;
}

/** Dokumen harus menutupi sedikitnya sekian bagian bingkai supaya dipercaya. */
export const LUAS_MINIMUM = 0.2;
/** Sisi terpendek hasil potong — lebih kecil dari ini hampir pasti salah deteksi. */
export const SISI_MINIMUM_PX = 120;
/** Hasil potong dibatasi supaya kanvas ponsel tidak kehabisan memori; pipeline memangkas lagi ke 3000. */
export const SISI_MAKSIMUM_PX = 3000;

const jarak = (a: Titik, b: Titik) => Math.hypot(a.x - b.x, a.y - b.y);

const urutan = (s: Sudut): Titik[] => [s.topLeftCorner, s.topRightCorner, s.bottomRightCorner, s.bottomLeftCorner];

/** Luas poligon TL→TR→BR→BL (rumus shoelace). */
export function luasSudut(s: Sudut): number {
  const p = urutan(s);
  let jumlah = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    jumlah += a.x * b.y - b.x * a.y;
  }
  return Math.abs(jumlah) / 2;
}

/** Cembung = tanda hasil kali silang keempat sudutnya sama. */
function cembung(s: Sudut): boolean {
  const p = urutan(s);
  let tanda = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % 4]!;
    const c = p[(i + 2) % 4]!;
    const silang = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (silang === 0) return false;
    const t = Math.sign(silang);
    if (tanda === 0) tanda = t;
    else if (t !== tanda) return false;
  }
  return true;
}

const titikSah = (t: unknown): t is Titik =>
  typeof t === 'object' && t !== null && Number.isFinite((t as Titik).x) && Number.isFinite((t as Titik).y);

/**
 * Apakah keluaran `getCornerPoints` layak dipakai untuk koreksi perspektif.
 * Gagal bila ada sudut kosong (kuadran tanpa titik), poligon tidak cembung,
 * atau luasnya terlalu kecil dibanding bingkai.
 */
export function sudutSah(s: Partial<Sudut> | null | undefined, lebar: number, tinggi: number): s is Sudut {
  if (!s || !titikSah(s.topLeftCorner) || !titikSah(s.topRightCorner) || !titikSah(s.bottomRightCorner) || !titikSah(s.bottomLeftCorner)) {
    return false;
  }
  const lengkap = s as Sudut;
  if (!cembung(lengkap)) return false;
  return luasSudut(lengkap) >= LUAS_MINIMUM * lebar * tinggi;
}

/** Ukuran hasil potong: sisi terpanjang tiap pasangan, dibatasi `SISI_MAKSIMUM_PX`, tanpa upscale. */
export function ukuranHasil(s: Sudut): { lebar: number; tinggi: number } | null {
  const lebar = Math.max(jarak(s.topLeftCorner, s.topRightCorner), jarak(s.bottomLeftCorner, s.bottomRightCorner));
  const tinggi = Math.max(jarak(s.topLeftCorner, s.bottomLeftCorner), jarak(s.topRightCorner, s.bottomRightCorner));
  if (Math.min(lebar, tinggi) < SISI_MINIMUM_PX) return null;
  const skala = Math.min(1, SISI_MAKSIMUM_PX / Math.max(lebar, tinggi));
  return { lebar: Math.round(lebar * skala), tinggi: Math.round(tinggi * skala) };
}

/** Sudut hasil deteksi pada bingkai kecil → koordinat bingkai asli. */
export function skalakanSudut(s: Sudut, faktor: number): Sudut {
  const k = (t: Titik): Titik => ({ x: t.x * faktor, y: t.y * faktor });
  return {
    topLeftCorner: k(s.topLeftCorner),
    topRightCorner: k(s.topRightCorner),
    bottomRightCorner: k(s.bottomRightCorner),
    bottomLeftCorner: k(s.bottomLeftCorner),
  };
}
