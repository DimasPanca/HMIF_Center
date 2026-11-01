/**
 * respons — pengisian form, ringkasan, ekspor, dan integrasi. SERVER-ONLY.
 *
 *   formUntukIsi      bentuk publik form (tanpa data internal) + alasan tertutup
 *   kirimRespons      validasi ulang penuh → berkas → transaksi berkunci
 *                     (status, batas waktu, kuota, satu respons) → integrasi
 *   ringkasRespons    angka per pertanyaan (distribusi pilihan, rerata skala)
 *   daftarRespons     baris per respons untuk tabel & ekspor
 *   eksporXlsx        satu sheet, satu kolom per pertanyaan (arsip ditandai)
 *   ubahSeleksi       status seleksi Open Recruitment
 *   terapkanPengurus  Pendataan Pengurus → tabel `pengurus` (Sekum/Admin)
 *
 * Sumber: ADR-038 #5–#10 · docs/ai/FORM_CONTRACT.md §3
 */

import { createHash, randomUUID } from 'node:crypto';

import ExcelJS from 'exceljs';
import { fileTypeFromBuffer } from 'file-type';
import { Prisma } from '@prisma/client';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import { storage } from '@/lib/storage';
import { keys } from '@/lib/storage/keys';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

import { bolehKelola } from './akses';
import { validasiJawaban, type BarisJawaban, type MasukanJawaban } from './jawaban';
import { strukturDariBaris, type Hasil } from './service';
import { INFO_TIPE, type Kategori, type Pertanyaan, type Struktur } from './skema';

if (typeof window !== 'undefined') {
  throw new Error('lib/form/respons.ts adalah modul server-only.');
}

export const MAKS_BERKAS_PER_RESPONS = 5;
/** Batas per berkas; total badan permintaan dijaga route (≤ 4,4 MB, batas Vercel 4,5 MB). */
const MAKS_BYTE_BERKAS = 4 * 1024 * 1024;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const gagal = (kode: 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'KONFLIK' | 'STATUS_TIDAK_SESUAI', pesan: string, details?: unknown) =>
  ({ ok: false as const, kode, pesan, details });

// ---------------------------------------------------------------------------
// Bentuk isi (publik)
// ---------------------------------------------------------------------------

export interface FormIsi {
  token: string;
  judul: string;
  deskripsi: string;
  akses: 'PUBLIK' | 'INTERNAL';
  anonim: boolean;
  acara: string | null;
  struktur: Struktur;
  pesan_selesai: string;
  /** null = boleh diisi; selain itu alasan yang ditampilkan ke pengisi. */
  tertutup: string | null;
  /** INTERNAL tanpa sesi: halaman meminta login. */
  perlu_login: boolean;
  sudah_mengisi: boolean;
}

export function kunciResponden(formId: string, userId: string): string {
  return createHash('sha256').update(`${formId}:${userId}`).digest('hex');
}

async function alasanTertutup(f: { id: string; status: string; ditutup_pada: Date | null; kuota: number | null }, klien: TxKlien | typeof db = db): Promise<string | null> {
  if (f.status === 'DRAF') return 'Form ini belum dibuka oleh panitia.';
  if (f.status === 'DITUTUP') return 'Form ini sudah ditutup dan tidak menerima jawaban lagi.';
  if (f.ditutup_pada && f.ditutup_pada.getTime() <= Date.now()) return `Batas pengisian sudah lewat (${formatTanggalWaktu(f.ditutup_pada)}).`;
  if (f.kuota) {
    const n = await klien.form_respons.count({ where: { form_id: f.id } });
    if (n >= f.kuota) return 'Kuota pengisian sudah penuh.';
  }
  return null;
}

export async function formUntukIsi(token: string, konteks: Konteks | null): Promise<FormIsi | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const f = await db.form.findUnique({ where: { token }, include: { bagian: true, pertanyaan: true } });
  if (!f) return null;
  const acara = f.kepanitiaan_id ? await db.kepanitiaan.findUnique({ where: { id: f.kepanitiaan_id }, select: { nama_acara: true } }) : null;
  const perluLogin = f.akses === 'INTERNAL' && !konteks;
  const sudah = !!(konteks && f.satu_respons && (await db.form_respons.count({ where: { form_id: f.id, responden_kunci: kunciResponden(f.id, konteks.sesi.userId) } })));
  return {
    token,
    judul: f.judul,
    deskripsi: f.deskripsi,
    akses: f.akses as FormIsi['akses'],
    anonim: f.anonim,
    acara: acara?.nama_acara ?? null,
    struktur: strukturDariBaris(f.bagian, f.pertanyaan),
    pesan_selesai: f.pesan_selesai,
    tertutup: await alasanTertutup(f),
    perlu_login: perluLogin,
    sudah_mengisi: sudah,
  };
}

// ---------------------------------------------------------------------------
// Kirim
// ---------------------------------------------------------------------------

export interface BerkasMasuk {
  pertanyaanId: string;
  nama: string;
  isi: Buffer;
}

const JENIS_BERKAS: Record<string, { ext: 'jpg' | 'png' | 'webp' | 'pdf'; kelompok: 'gambar' | 'pdf' }> = {
  'image/jpeg': { ext: 'jpg', kelompok: 'gambar' },
  'image/png': { ext: 'png', kelompok: 'gambar' },
  'image/webp': { ext: 'webp', kelompok: 'gambar' },
  'application/pdf': { ext: 'pdf', kelompok: 'pdf' },
};

/** Nama tampilan berkas: tanpa path, tanpa karakter kendali, maks 150. */
export function namaBersih(nama: string): string {
  const dasar = (nama.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"<>]/g, '').trim().replace(/^\.+/, '');
  return dasar.slice(0, 150) || 'berkas';
}

export async function kirimRespons(input: {
  token: string;
  konteks: Konteks | null;
  masukan: MasukanJawaban;
  berkas: BerkasMasuk[];
}): Promise<Hasil<{ pesan_selesai: string }>> {
  const f = await db.form.findUnique({ where: { token: input.token }, include: { bagian: true, pertanyaan: true } });
  if (!f) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  if (f.akses === 'INTERNAL' && !input.konteks) return gagal('TIDAK_BERWENANG', 'Form ini hanya untuk pengguna HMIF Center. Silakan masuk dulu.');
  const struktur = strukturDariBaris(f.bagian, f.pertanyaan);
  const pertanyaan = new Map(struktur.bagian.flatMap((b) => b.pertanyaan.map((p) => [p.id, p] as const)));

  // 1. Berkas: jumlah, ukuran, jenis dari magic bytes, cocok dengan pertanyaannya.
  if (input.berkas.length > MAKS_BERKAS_PER_RESPONS) return gagal('VALIDASI_GAGAL', `Maksimal ${MAKS_BERKAS_PER_RESPONS} berkas per pengisian.`);
  const siap: { pertanyaanId: string; nama: string; isi: Buffer; mime: string; ext: 'jpg' | 'png' | 'webp' | 'pdf' }[] = [];
  const galatBerkas: Record<string, string> = {};
  for (const b of input.berkas) {
    const p = pertanyaan.get(b.pertanyaanId);
    if (!p || p.tipe !== 'UNGGAH_BERKAS') return gagal('VALIDASI_GAGAL', 'Berkas dikirim untuk pertanyaan yang tidak menerima unggahan.');
    if (siap.some((s) => s.pertanyaanId === b.pertanyaanId)) return gagal('VALIDASI_GAGAL', 'Satu pertanyaan hanya menerima satu berkas.');
    const maks = Math.min(p.opsi.maks_mb ?? 4, 4) * 1024 * 1024;
    if (b.isi.length === 0) galatBerkas[p.id] = 'Berkas kosong.';
    else if (b.isi.length > Math.min(maks, MAKS_BYTE_BERKAS)) galatBerkas[p.id] = `Ukuran berkas maksimal ${Math.min(p.opsi.maks_mb ?? 4, 4)} MB.`;
    else {
      const jenis = await fileTypeFromBuffer(b.isi);
      const info = jenis ? JENIS_BERKAS[jenis.mime] : undefined;
      const diizinkan = p.opsi.jenis ?? ['gambar', 'pdf'];
      if (!info || !diizinkan.includes(info.kelompok)) {
        galatBerkas[p.id] = `Jenis berkas tidak diterima. Gunakan ${diizinkan.map((j) => (j === 'gambar' ? 'JPG/PNG/WebP' : 'PDF')).join(' atau ')}.`;
      } else siap.push({ pertanyaanId: p.id, nama: namaBersih(b.nama), isi: b.isi, mime: jenis!.mime, ext: info.ext });
    }
  }

  // 2. Jawaban: validasi ulang penuh terhadap struktur (klien tidak dipercaya).
  const v = validasiJawaban(struktur, input.masukan, new Set(siap.map((s) => s.pertanyaanId)));
  const galat = { ...v.galat, ...galatBerkas };
  if (Object.keys(galat).length) return gagal('VALIDASI_GAGAL', 'Masih ada jawaban yang perlu diperbaiki.', galat);
  const dilalui = new Set(v.jalur.flatMap((id) => struktur.bagian.find((b) => b.id === id)!.pertanyaan.map((p) => p.id)));
  const berkasDipakai = siap.filter((s) => dilalui.has(s.pertanyaanId));

  // 3. Unggah berkas lebih dulu; dibersihkan bila transaksi gagal.
  const responsId = randomUUID();
  const terunggah: string[] = [];
  const barisBerkas = new Map<string, NonNullable<BarisJawaban['berkas']>>();
  try {
    for (const s of berkasDipakai) {
      const key = keys.formBerkas(f.id, responsId, randomUUID(), s.ext);
      await storage.put(key, s.isi, s.mime);
      terunggah.push(key);
      barisBerkas.set(s.pertanyaanId, { key, nama: s.nama, mime: s.mime, ukuran: s.isi.length });
    }

    // 4. Transaksi berkunci: dua pengirim terakhir tidak dapat sama-sama melewati kuota.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`form:${f.id}`}))`;
      const kini = await tx.form.findUniqueOrThrow({ where: { id: f.id }, select: { id: true, status: true, ditutup_pada: true, kuota: true } });
      const tertutup = await alasanTertutup(kini, tx);
      if (tertutup) throw new GalatKirim('STATUS_TIDAK_SESUAI', tertutup);
      const kunci = input.konteks && f.satu_respons ? kunciResponden(f.id, input.konteks.sesi.userId) : null;
      if (kunci && (await tx.form_respons.count({ where: { form_id: f.id, responden_kunci: kunci } }))) {
        throw new GalatKirim('KONFLIK', 'Anda sudah mengisi form ini.');
      }
      await tx.form_respons.create({
        data: {
          id: responsId,
          form_id: f.id,
          user_id: f.anonim ? null : (input.konteks?.sesi.userId ?? null),
          responden_kunci: kunci,
        },
      });
      for (const b of v.baris) {
        await tx.form_jawaban.create({
          data: {
            respons_id: responsId,
            pertanyaan_id: b.pertanyaan_id,
            nilai_teks: b.nilai_teks ?? null,
            nilai_angka: b.nilai_angka ?? null,
            nilai_tanggal: b.nilai_tanggal ? new Date(`${b.nilai_tanggal}T00:00:00Z`) : null,
            nilai_waktu: b.nilai_waktu ? new Date(`1970-01-01T${b.nilai_waktu}:00Z`) : null,
            nilai_json: b.nilai_json === undefined ? Prisma.DbNull : (b.nilai_json as Prisma.InputJsonValue),
            berkas: barisBerkas.has(b.pertanyaan_id) ? (barisBerkas.get(b.pertanyaan_id) as Prisma.InputJsonValue) : Prisma.DbNull,
          },
        });
      }
      // 5. Integrasi Pendaftaran → peserta acara (pemasukan RAB).
      if (f.kategori === 'PENDAFTARAN' && f.kepanitiaan_id) {
        const nilai = (peran: string) => {
          const p = struktur.bagian.flatMap((x) => x.pertanyaan).find((q) => q.peran === peran);
          return p ? v.baris.find((b) => b.pertanyaan_id === p.id)?.nilai_teks : undefined;
        };
        const nama = nilai('nama_lengkap');
        if (nama) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`peserta:${f.kepanitiaan_id}`}))`;
          const [baris] = await tx.$queryRaw<{ urut: number }[]>`
            SELECT COALESCE(max(no_urut), 0)::int + 1 AS urut FROM peserta WHERE kepanitiaan_id = ${f.kepanitiaan_id}::uuid`;
          const p = await tx.peserta.create({
            data: { kepanitiaan_id: f.kepanitiaan_id, no_urut: baris!.urut, nama_lengkap: nama.slice(0, 200), nim: nilai('nim')?.slice(0, 30) ?? null },
            select: { id: true },
          });
          await tx.form_respons.update({ where: { id: responsId }, data: { integrasi: { peserta_id: p.id } } });
        }
      }
    });
  } catch (e) {
    await Promise.all(terunggah.map((k) => storage.delete(k).catch(() => undefined)));
    if (e instanceof GalatKirim) return gagal(e.kode, e.message);
    throw e;
  }
  return { ok: true, nilai: { pesan_selesai: f.pesan_selesai } };
}

class GalatKirim extends Error {
  constructor(
    readonly kode: 'STATUS_TIDAK_SESUAI' | 'KONFLIK',
    pesan: string,
  ) {
    super(pesan);
  }
}

// ---------------------------------------------------------------------------
// Membaca respons (pengelola)
// ---------------------------------------------------------------------------

interface FormPengelola {
  id: string;
  kategori: Kategori;
  judul: string;
  anonim: boolean;
  dibuat_oleh: string;
  kepanitiaan_id: string | null;
  periode_id: string;
  pertanyaan: (Pertanyaan & { bagian: string; diarsipkan: boolean })[];
}

async function formPengelola(konteks: Konteks, id: string): Promise<FormPengelola | null> {
  if (!POLA_UUID.test(id)) return null;
  const f = await db.form.findUnique({ where: { id }, include: { bagian: true, pertanyaan: true } });
  if (!f || f.periode_id !== konteks.periodeId || !(await bolehKelola(konteks, f))) return null;
  const urutBagian = new Map(f.bagian.map((b) => [b.id, b.urutan]));
  const pertanyaan = [...f.pertanyaan]
    .sort((a, b) => Number(!!a.diarsipkan_at) - Number(!!b.diarsipkan_at) || (urutBagian.get(a.bagian_id) ?? 0) - (urutBagian.get(b.bagian_id) ?? 0) || a.urutan - b.urutan)
    .map((p) => ({
      id: p.id,
      tipe: p.tipe as Pertanyaan['tipe'],
      judul: p.judul,
      deskripsi: p.deskripsi,
      wajib: p.wajib,
      opsi: (p.opsi ?? {}) as Pertanyaan['opsi'],
      peran: p.peran as Pertanyaan['peran'],
      bagian: p.bagian_id,
      diarsipkan: !!p.diarsipkan_at,
    }));
  return { id: f.id, kategori: f.kategori as Kategori, judul: f.judul, anonim: f.anonim, dibuat_oleh: f.dibuat_oleh, kepanitiaan_id: f.kepanitiaan_id, periode_id: f.periode_id, pertanyaan };
}

type BarisJawabanDb = {
  respons_id: string;
  pertanyaan_id: string;
  id: string;
  nilai_teks: string | null;
  nilai_angka: Prisma.Decimal | null;
  nilai_tanggal: Date | null;
  nilai_waktu: Date | null;
  nilai_json: Prisma.JsonValue | null;
  berkas: Prisma.JsonValue | null;
};

/** Teks tampilan satu jawaban (label pilihan, bukan id). */
export function teksJawaban(p: Pertanyaan, j: Omit<BarisJawabanDb, 'respons_id' | 'pertanyaan_id' | 'id'> | undefined): string {
  if (!j) return '';
  const label = (id: string) => p.opsi.pilihan?.find((x) => x.id === id)?.label ?? '(pilihan dihapus)';
  const labelKolom = (id: string) => p.opsi.kolom?.find((x) => x.id === id)?.label ?? '?';
  switch (p.tipe) {
    case 'PILIHAN_GANDA':
    case 'DROPDOWN':
      if (j.nilai_json && typeof j.nilai_json === 'object' && 'lainnya' in (j.nilai_json as object)) return `Lainnya: ${(j.nilai_json as { lainnya: string }).lainnya}`;
      return j.nilai_teks ? label(j.nilai_teks) : '';
    case 'KOTAK_CENTANG':
      return Array.isArray(j.nilai_json) ? (j.nilai_json as string[]).map(label).join(', ') : '';
    case 'KISI_PILIHAN':
    case 'KISI_CENTANG': {
      const peta = (j.nilai_json ?? {}) as Record<string, string | string[]>;
      return (p.opsi.baris ?? [])
        .filter((b) => peta[b.id])
        .map((b) => `${b.label}: ${([] as string[]).concat(peta[b.id]!).map(labelKolom).join(', ')}`)
        .join('; ');
    }
    case 'SKALA':
    case 'ANGKA':
      return j.nilai_angka !== null ? String(Number(j.nilai_angka)) : '';
    case 'TANGGAL':
      return j.nilai_tanggal ? j.nilai_tanggal.toISOString().slice(0, 10) : '';
    case 'WAKTU':
      return j.nilai_waktu ? j.nilai_waktu.toISOString().slice(11, 16) : '';
    case 'UNGGAH_BERKAS':
      return j.berkas ? (j.berkas as { nama: string }).nama : '';
    default:
      return j.nilai_teks ?? '';
  }
}

export interface RingkasPertanyaan {
  id: string;
  judul: string;
  tipe: Pertanyaan['tipe'];
  label_tipe: string;
  diarsipkan: boolean;
  dijawab: number;
  /** Pilihan/skala/kisi: [label, jumlah]. */
  distribusi?: { label: string; jumlah: number }[];
  rerata?: number;
  /** Kisi: per baris distribusi kolom. */
  kisi?: { baris: string; kolom: { label: string; jumlah: number }[] }[];
  /** Teks/berkas: beberapa jawaban terbaru. */
  contoh?: string[];
}

export interface DataRespons {
  form: { id: string; judul: string; kategori: Kategori; anonim: boolean };
  pertanyaan: { id: string; judul: string; tipe: string; diarsipkan: boolean }[];
  ringkasan: RingkasPertanyaan[];
  respons: {
    id: string;
    dikirim_at: string;
    responden: string | null;
    status_seleksi: 'BARU' | 'LOLOS' | 'TIDAK_LOLOS';
    integrasi: Record<string, unknown>;
    jawaban: Record<string, { teks: string; berkas_id?: string }>;
  }[];
}

export async function muatRespons(konteks: Konteks, formId: string): Promise<DataRespons | null> {
  const f = await formPengelola(konteks, formId);
  if (!f) return null;
  const respons = await db.$queryRaw<{ id: string; dikirim_at: Date; status_seleksi: string; integrasi: Prisma.JsonValue; responden: string | null }[]>`
    SELECT r.id::text, r.dikirim_at, r.status_seleksi, r.integrasi, u.nama_lengkap AS responden
    FROM form_respons r LEFT JOIN app_user u ON u.id = r.user_id
    WHERE r.form_id = ${formId}::uuid ORDER BY r.dikirim_at DESC`;
  const jawaban = await db.$queryRaw<BarisJawabanDb[]>`
    SELECT j.id::text, j.respons_id::text, j.pertanyaan_id::text, j.nilai_teks, j.nilai_angka, j.nilai_tanggal, j.nilai_waktu, j.nilai_json, j.berkas
    FROM form_jawaban j JOIN form_respons r ON r.id = j.respons_id WHERE r.form_id = ${formId}::uuid`;
  const perRespons = new Map<string, Map<string, BarisJawabanDb>>();
  for (const j of jawaban) {
    if (!perRespons.has(j.respons_id)) perRespons.set(j.respons_id, new Map());
    perRespons.get(j.respons_id)!.set(j.pertanyaan_id, j);
  }

  const ringkasan: RingkasPertanyaan[] = f.pertanyaan.map((p) => {
    const semua = jawaban.filter((j) => j.pertanyaan_id === p.id);
    const r: RingkasPertanyaan = { id: p.id, judul: p.judul, tipe: p.tipe, label_tipe: INFO_TIPE[p.tipe].label, diarsipkan: p.diarsipkan, dijawab: semua.length };
    const hitung = (ids: string[], label: (id: string) => string) => {
      const peta = new Map<string, number>(ids.map((i) => [i, 0]));
      return { tambah: (id: string) => peta.set(id, (peta.get(id) ?? 0) + 1), hasil: () => [...peta].map(([id, jumlah]) => ({ label: label(id), jumlah })) };
    };
    if (p.tipe === 'PILIHAN_GANDA' || p.tipe === 'DROPDOWN' || p.tipe === 'KOTAK_CENTANG') {
      const h = hitung((p.opsi.pilihan ?? []).map((x) => x.id), (id) => p.opsi.pilihan?.find((x) => x.id === id)?.label ?? 'Lainnya');
      for (const j of semua) {
        if (Array.isArray(j.nilai_json)) (j.nilai_json as string[]).forEach(h.tambah);
        else if (j.nilai_teks) h.tambah(j.nilai_teks);
        else h.tambah('__lainnya');
      }
      r.distribusi = h.hasil();
    } else if (p.tipe === 'SKALA') {
      const min = p.opsi.skala_min ?? 1;
      const maks = p.opsi.skala_maks ?? 5;
      const h = hitung(Array.from({ length: maks - min + 1 }, (_, i) => String(min + i)), (id) => id);
      const nilai = semua.map((j) => Number(j.nilai_angka)).filter(Number.isFinite);
      nilai.forEach((n) => h.tambah(String(n)));
      r.distribusi = h.hasil();
      r.rerata = nilai.length ? Math.round((nilai.reduce((a, b) => a + b, 0) / nilai.length) * 100) / 100 : undefined;
    } else if (p.tipe === 'KISI_PILIHAN' || p.tipe === 'KISI_CENTANG') {
      r.kisi = (p.opsi.baris ?? []).map((b) => {
        const h = hitung((p.opsi.kolom ?? []).map((k) => k.id), (id) => p.opsi.kolom?.find((k) => k.id === id)?.label ?? '?');
        for (const j of semua) ([] as string[]).concat(((j.nilai_json ?? {}) as Record<string, string | string[]>)[b.id] ?? []).forEach(h.tambah);
        return { baris: b.label, kolom: h.hasil() };
      });
    } else {
      r.contoh = semua.slice(0, 50).map((j) => teksJawaban(p, j)).filter(Boolean);
    }
    return r;
  });

  return {
    form: { id: f.id, judul: f.judul, kategori: f.kategori, anonim: f.anonim },
    pertanyaan: f.pertanyaan.map((p) => ({ id: p.id, judul: p.judul, tipe: p.tipe, diarsipkan: p.diarsipkan })),
    ringkasan,
    respons: respons.map((r) => ({
      id: r.id,
      dikirim_at: r.dikirim_at.toISOString(),
      responden: f.anonim ? null : r.responden,
      status_seleksi: r.status_seleksi as 'BARU' | 'LOLOS' | 'TIDAK_LOLOS',
      integrasi: (r.integrasi ?? {}) as Record<string, unknown>,
      jawaban: Object.fromEntries(
        f.pertanyaan.map((p) => {
          const j = perRespons.get(r.id)?.get(p.id);
          return [p.id, { teks: teksJawaban(p, j), ...(j?.berkas ? { berkas_id: j.id } : {}) }];
        }),
      ),
    })),
  };
}

const LABEL_SELEKSI = { BARU: 'Baru', LOLOS: 'Lolos', TIDAK_LOLOS: 'Tidak lolos' } as const;

export async function eksporXlsx(konteks: Konteks, formId: string): Promise<{ nama: string; isi: Buffer } | null> {
  const d = await muatRespons(konteks, formId);
  if (!d) return null;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HMIF Center';
  const ws = wb.addWorksheet('Respons');
  const kolom = [
    { header: 'Waktu kirim', width: 20 },
    ...(d.form.anonim ? [] : [{ header: 'Akun pengisi', width: 24 }]),
    ...(d.form.kategori === 'OPEN_RECRUITMENT' ? [{ header: 'Status seleksi', width: 14 }] : []),
    ...d.pertanyaan.map((p) => ({ header: p.diarsipkan ? `${p.judul} (diarsipkan)` : p.judul, width: Math.min(60, Math.max(16, p.judul.length)) })),
  ];
  ws.columns = kolom;
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of [...d.respons].reverse()) {
    ws.addRow([
      formatTanggalWaktu(r.dikirim_at),
      ...(d.form.anonim ? [] : [r.responden ?? '(publik)']),
      ...(d.form.kategori === 'OPEN_RECRUITMENT' ? [LABEL_SELEKSI[r.status_seleksi]] : []),
      ...d.pertanyaan.map((p) => r.jawaban[p.id]?.teks ?? ''),
    ]);
  }
  const aman = d.form.judul.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'Form';
  return { nama: `Respons-${aman}.xlsx`, isi: Buffer.from(await wb.xlsx.writeBuffer()) };
}

// ---------------------------------------------------------------------------
// Tindakan
// ---------------------------------------------------------------------------

export async function ubahSeleksi(tx: TxKlien, konteks: Konteks, formId: string, responsId: string, status: unknown): Promise<Hasil<{ status: string }>> {
  if (status !== 'BARU' && status !== 'LOLOS' && status !== 'TIDAK_LOLOS') return gagal('VALIDASI_GAGAL', 'Status seleksi tidak dikenal.');
  if (!POLA_UUID.test(responsId)) return gagal('TIDAK_DITEMUKAN', 'Respons tidak ditemukan.');
  const f = await formPengelola(konteks, formId);
  if (!f) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  if (f.kategori !== 'OPEN_RECRUITMENT') return gagal('STATUS_TIDAK_SESUAI', 'Status seleksi hanya untuk form Open Recruitment.');
  const n = await tx.form_respons.updateMany({ where: { id: responsId, form_id: formId }, data: { status_seleksi: status } });
  if (n.count !== 1) return gagal('TIDAK_DITEMUKAN', 'Respons tidak ditemukan.');
  return { ok: true, nilai: { status } };
}

/** Pendataan Pengurus → `pengurus` (periode form). Hanya Sekum/Admin. */
export async function terapkanPengurus(tx: TxKlien, konteks: Konteks, formId: string, responsId: string): Promise<Hasil<{ pengurus_id: string; aksi: 'BARU' | 'DIPERBARUI' }>> {
  if (!konteks.roles.some((r) => r === 'SEKUM' || r === 'ADMIN')) return gagal('TIDAK_BERWENANG', 'Hanya Sekum atau Admin yang menerapkan data ke Data Pengurus.');
  const f = await formPengelola(konteks, formId);
  if (!f) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  if (f.kategori !== 'PENDATAAN_PENGURUS') return gagal('STATUS_TIDAK_SESUAI', 'Hanya respons Pendataan Pengurus yang dapat diterapkan.');
  if (!POLA_UUID.test(responsId)) return gagal('TIDAK_DITEMUKAN', 'Respons tidak ditemukan.');
  const r = await tx.form_respons.findFirst({ where: { id: responsId, form_id: formId }, include: { jawaban: true } });
  if (!r) return gagal('TIDAK_DITEMUKAN', 'Respons tidak ditemukan.');
  const ambil = (peran: string) => {
    const p = f.pertanyaan.find((q) => q.peran === peran);
    const j = p ? r.jawaban.find((x) => x.pertanyaan_id === p.id) : undefined;
    return p && j ? teksJawaban(p, j as unknown as BarisJawabanDb).trim() : '';
  };
  const nama = ambil('nama_lengkap');
  const nim = ambil('nim').replace(/\s+/g, '');
  if (!nama || !nim) return gagal('VALIDASI_GAGAL', 'Respons ini tidak memuat Nama lengkap dan NIM.');
  const angkatanTeks = ambil('angkatan');
  const angkatan = /^\d{4}$/.test(angkatanTeks) ? Number(angkatanTeks) : null;
  const jabatan = ambil('jabatan');
  const ada = await tx.pengurus.findFirst({ where: { periode_id: f.periode_id, nim }, select: { id: true } });
  let id: string;
  let aksi: 'BARU' | 'DIPERBARUI';
  if (ada) {
    await tx.pengurus.update({ where: { id: ada.id }, data: { nama_lengkap: nama, ...(angkatan ? { angkatan } : {}), ...(jabatan ? { jabatan } : {}) } });
    id = ada.id;
    aksi = 'DIPERBARUI';
  } else {
    if (!jabatan) return gagal('VALIDASI_GAGAL', `NIM ${nim} belum ada di Data Pengurus dan respons tidak memuat Jabatan. Tambahkan pertanyaan bertanda "Jabatan" atau isi data pengurus secara manual.`);
    const p = await tx.pengurus.create({ data: { periode_id: f.periode_id, nama_lengkap: nama, nim, jabatan, angkatan }, select: { id: true } });
    id = p.id;
    aksi = 'BARU';
  }
  await tx.form_respons.update({
    where: { id: responsId },
    data: { integrasi: { ...((r.integrasi ?? {}) as object), pengurus_id: id, diterapkan_at: new Date().toISOString() } },
  });
  return { ok: true, nilai: { pengurus_id: id, aksi } };
}

/** Isi berkas jawaban untuk pengelola. */
export async function ambilBerkas(konteks: Konteks, formId: string, jawabanId: string): Promise<{ isi: Buffer; nama: string; mime: string } | null> {
  if (!POLA_UUID.test(jawabanId)) return null;
  const f = await formPengelola(konteks, formId);
  if (!f) return null;
  const j = await db.form_jawaban.findUnique({ where: { id: jawabanId }, include: { respons: { select: { form_id: true } } } });
  if (!j || j.respons.form_id !== formId || !j.berkas) return null;
  const b = j.berkas as { key: string; nama: string; mime: string };
  if (!b.key.startsWith(`form/${formId}/`)) return null;
  return { isi: await storage.get(b.key), nama: b.nama, mime: b.mime };
}
