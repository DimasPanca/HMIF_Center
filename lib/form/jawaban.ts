/**
 * jawaban — jalur bagian (logika lompat) + validasi & normalisasi jawaban.
 * MURNI & aman untuk klien: halaman isi memakainya untuk umpan balik
 * langsung, server memakainya lagi sebagai penentu (jawaban klien tidak
 * pernah dipercaya).
 *
 * Masukan jawaban: `{ [pertanyaanId]: nilai }`. Hanya pertanyaan di bagian
 * yang DILALUI jalur yang divalidasi & disimpan — jawaban di bagian yang
 * dilompati dibuang, supaya data tidak berisi jawaban "hantu".
 *
 * Sumber: docs/ai/FORM_CONTRACT.md §2–3
 */

import { TUJUAN_SELESAI, type Bagian, type Pertanyaan, type Struktur } from './skema';

export type NilaiMasukan =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string | string[]>
  | { berkas: true }
  | null
  | undefined;
export type MasukanJawaban = Record<string, NilaiMasukan>;

/** Satu baris `form_jawaban` (tanpa respons_id). */
export interface BarisJawaban {
  pertanyaan_id: string;
  nilai_teks?: string;
  nilai_angka?: number;
  nilai_tanggal?: string;
  nilai_waktu?: string;
  nilai_json?: unknown;
  /** Diisi server setelah berkas tersimpan. */
  berkas?: { key: string; nama: string; mime: string; ukuran: number };
}

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const POLA_WAKTU = /^([01]\d|2[0-3]):[0-5]\d$/;

function kosong(v: NilaiMasukan): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && !('berkas' in v)) return Object.keys(v).length === 0;
  return false;
}

/** Urutan bagian yang dilalui responden berdasarkan jawabannya. */
export function jalurBagian(struktur: Pick<Struktur, 'bagian'>, jawaban: MasukanJawaban): Bagian[] {
  const indeks = new Map(struktur.bagian.map((b, i) => [b.id, i]));
  const jalur: Bagian[] = [];
  const dilihat = new Set<string>();
  let i = 0;
  while (i >= 0 && i < struktur.bagian.length) {
    const b = struktur.bagian[i]!;
    if (dilihat.has(b.id)) break; // logika melingkar: berhenti, jangan berputar selamanya
    dilihat.add(b.id);
    jalur.push(b);
    let tujuan: string | null | undefined = b.lanjut_ke;
    for (const p of b.pertanyaan) {
      const terpilih = typeof jawaban[p.id] === 'string' ? (p.opsi.pilihan ?? []).find((x) => x.id === jawaban[p.id]) : undefined;
      if (terpilih?.lompat_ke) {
        tujuan = terpilih.lompat_ke;
        break;
      }
    }
    if (tujuan === TUJUAN_SELESAI) break;
    i = tujuan ? (indeks.get(tujuan) ?? -1) : i + 1;
  }
  return jalur;
}

/** Bagian berikutnya dari bagian `id` (untuk tombol "Berikutnya"); null = halaman terakhir. */
export function bagianBerikutnya(struktur: Pick<Struktur, 'bagian'>, id: string, jawaban: MasukanJawaban): string | null {
  const jalur = jalurBagian(struktur, jawaban);
  const i = jalur.findIndex((b) => b.id === id);
  return i >= 0 && i + 1 < jalur.length ? jalur[i + 1]!.id : null;
}

/**
 * Validasi satu jawaban. Mengembalikan pesan galat (bahasa pengisi) atau
 * baris ternormalisasi. `adaBerkas` = server sudah menerima berkas untuk
 * pertanyaan unggah ini.
 */
export function periksaJawaban(p: Pertanyaan, v: NilaiMasukan, adaBerkas = false): { galat: string } | { baris: BarisJawaban | null } {
  const o = p.opsi;
  if (p.tipe === 'UNGGAH_BERKAS') {
    if (!adaBerkas && !(v && typeof v === 'object' && 'berkas' in v)) return p.wajib ? { galat: 'Unggah berkas terlebih dahulu.' } : { baris: null };
    return { baris: { pertanyaan_id: p.id } };
  }
  if (kosong(v)) return p.wajib ? { galat: 'Pertanyaan ini wajib diisi.' } : { baris: null };
  const dasar = { pertanyaan_id: p.id };

  switch (p.tipe) {
    case 'TEKS_SINGKAT':
    case 'PARAGRAF': {
      if (typeof v !== 'string') return { galat: 'Jawaban harus berupa teks.' };
      const maks = o.maks ?? (p.tipe === 'TEKS_SINGKAT' ? 500 : 5000);
      const t = v.trim();
      if (p.tipe === 'TEKS_SINGKAT' && /[\r\n]/.test(t)) return { galat: 'Jawaban singkat cukup satu baris.' };
      if (t.length > maks) return { galat: `Maksimal ${maks} karakter (sekarang ${t.length}).` };
      return { baris: { ...dasar, nilai_teks: t } };
    }
    case 'EMAIL': {
      const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
      if (!POLA_EMAIL.test(t) || t.length > 254) return { galat: 'Masukkan alamat email yang valid, mis. nama@gmail.com.' };
      return { baris: { ...dasar, nilai_teks: t } };
    }
    case 'ANGKA': {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
      if (!Number.isFinite(n)) return { galat: 'Masukkan angka.' };
      if (o.min !== undefined && n < o.min) return { galat: `Minimal ${o.min}.` };
      if (o.maks !== undefined && n > o.maks) return { galat: `Maksimal ${o.maks}.` };
      return { baris: { ...dasar, nilai_angka: n } };
    }
    case 'PILIHAN_GANDA':
    case 'DROPDOWN': {
      const ids = new Set((o.pilihan ?? []).map((x) => x.id));
      if (typeof v === 'string' && ids.has(v)) return { baris: { ...dasar, nilai_teks: v } };
      // "Lainnya" (pilihan ganda): { lainnya: "teks" }
      if (p.tipe === 'PILIHAN_GANDA' && o.lainnya && v && typeof v === 'object' && !Array.isArray(v) && 'lainnya' in v) {
        const t = String((v as Record<string, unknown>).lainnya ?? '').trim();
        if (!t) return { galat: 'Isi jawaban "Lainnya".' };
        if (t.length > 500) return { galat: 'Maksimal 500 karakter.' };
        return { baris: { ...dasar, nilai_json: { lainnya: t } } };
      }
      return { galat: 'Pilih salah satu jawaban yang tersedia.' };
    }
    case 'KOTAK_CENTANG': {
      if (!Array.isArray(v)) return { galat: 'Pilih minimal satu jawaban.' };
      const ids = new Set((o.pilihan ?? []).map((x) => x.id));
      const pilih = [...new Set(v)];
      if (pilih.some((x) => !ids.has(x))) return { galat: 'Ada pilihan yang tidak tersedia.' };
      if (o.min_pilih !== undefined && pilih.length < o.min_pilih) return { galat: `Pilih minimal ${o.min_pilih}.` };
      if (o.maks_pilih !== undefined && pilih.length > o.maks_pilih) return { galat: `Pilih maksimal ${o.maks_pilih}.` };
      return { baris: { ...dasar, nilai_json: pilih } };
    }
    case 'SKALA': {
      const n = typeof v === 'number' ? v : Number(v);
      const min = o.skala_min ?? 1;
      const maks = o.skala_maks ?? 5;
      if (!Number.isInteger(n) || n < min || n > maks) return { galat: `Pilih nilai ${min} sampai ${maks}.` };
      return { baris: { ...dasar, nilai_angka: n } };
    }
    case 'KISI_PILIHAN':
    case 'KISI_CENTANG': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { galat: 'Isi tabel jawaban.' };
      const baris = o.baris ?? [];
      const kolom = new Set((o.kolom ?? []).map((k) => k.id));
      const peta = v as Record<string, string | string[]>;
      const hasil: Record<string, string | string[]> = {};
      for (const b of baris) {
        const isi = peta[b.id];
        const nilai = p.tipe === 'KISI_PILIHAN' ? (typeof isi === 'string' ? [isi] : []) : Array.isArray(isi) ? [...new Set(isi)] : [];
        if (nilai.some((k) => !kolom.has(k))) return { galat: `Pilihan pada baris "${b.label}" tidak tersedia.` };
        if (nilai.length === 0) {
          if (p.wajib) return { galat: `Lengkapi baris "${b.label}".` };
          continue;
        }
        hasil[b.id] = p.tipe === 'KISI_PILIHAN' ? nilai[0]! : nilai;
      }
      if (Object.keys(peta).some((k) => !baris.some((b) => b.id === k))) return { galat: 'Ada baris yang tidak dikenal.' };
      return Object.keys(hasil).length ? { baris: { ...dasar, nilai_json: hasil } } : p.wajib ? { galat: 'Isi tabel jawaban.' } : { baris: null };
    }
    case 'TANGGAL': {
      const t = typeof v === 'string' ? v : '';
      const d = new Date(`${t}T00:00:00Z`);
      if (!POLA_TANGGAL.test(t) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) return { galat: 'Pilih tanggal yang valid.' };
      return { baris: { ...dasar, nilai_tanggal: t } };
    }
    case 'WAKTU': {
      const t = typeof v === 'string' ? v.slice(0, 5) : '';
      if (!POLA_WAKTU.test(t)) return { galat: 'Isi jam dengan format JJ:MM.' };
      return { baris: { ...dasar, nilai_waktu: t } };
    }
  }
}

export interface HasilValidasi {
  ok: boolean;
  /** pertanyaanId → pesan galat. */
  galat: Record<string, string>;
  baris: BarisJawaban[];
  /** id bagian yang dilalui. */
  jalur: string[];
}

/**
 * Validasi seluruh jawaban terhadap struktur. `berkasDiterima` = id
 * pertanyaan unggah yang berkasnya sudah diterima server.
 */
export function validasiJawaban(struktur: Pick<Struktur, 'bagian'>, masukan: MasukanJawaban, berkasDiterima: ReadonlySet<string> = new Set()): HasilValidasi {
  const jalur = jalurBagian(struktur, masukan);
  const galat: Record<string, string> = {};
  const baris: BarisJawaban[] = [];
  for (const b of jalur) {
    for (const p of b.pertanyaan) {
      const h = periksaJawaban(p, masukan[p.id], berkasDiterima.has(p.id));
      if ('galat' in h) galat[p.id] = h.galat;
      else if (h.baris) baris.push(h.baris);
    }
  }
  return { ok: Object.keys(galat).length === 0, galat, baris, jalur: jalur.map((b) => b.id) };
}
