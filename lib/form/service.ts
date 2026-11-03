/**
 * service — siklus hidup form: buat, muat, simpan struktur, buka/tutup, hapus.
 * SERVER-ONLY. Setiap mutasi berjalan di `withAuditContext` (K-09); tabel
 * `form` diaudit trigger (migrasi 052).
 *
 * Penyimpanan struktur = sinkronisasi penuh dari editor (PUT seluruh form),
 * dengan dua pengaman (ADR-038 #10):
 *   - tipe pertanyaan yang SUDAH dijawab tidak dapat diubah;
 *   - pertanyaan yang sudah dijawab tidak dihapus, melainkan diarsipkan
 *     (`diarsipkan_at`) dan dipindah ke bagian pertama, supaya penghapusan
 *     bagiannya tidak ikut menghapus jawaban lewat kaskade.
 *
 * Sumber: ADR-038 · docs/ai/FORM_CONTRACT.md
 */

import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';

import { acaraPanitia, bolehBaca, bolehBuat, bolehKelola, pimpinanPenulis } from './akses';
import {
  INFO_KATEGORI,
  SkemaBuatForm,
  SkemaSimpanForm,
  SkemaStruktur,
  strukturKosong,
  syaratBuka,
  TUJUAN_SELESAI,
  type Kategori,
  type Opsi,
  type Struktur,
} from './skema';

if (typeof window !== 'undefined') {
  throw new Error('lib/form/service.ts adalah modul server-only.');
}

export type KodeGagalForm = 'VALIDASI_GAGAL' | 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'KONFLIK' | 'STATUS_TIDAK_SESUAI';
export type Hasil<T> = { ok: true; nilai: T } | { ok: false; kode: KodeGagalForm; pesan: string; details?: unknown };

export const STATUS_HTTP_FORM: Record<KodeGagalForm, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  TIDAK_BERWENANG: 403,
  KONFLIK: 409,
  STATUS_TIDAK_SESUAI: 409,
};

const gagal = (kode: KodeGagalForm, pesan: string, details?: unknown): Hasil<never> => ({ ok: false, kode, pesan, details });
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Struktur ↔ database
// ---------------------------------------------------------------------------

type BarisBagian = { id: string; urutan: number; judul: string; deskripsi: string; lanjut_ke: string | null };
type BarisPertanyaan = {
  id: string;
  bagian_id: string;
  urutan: number;
  tipe: string;
  judul: string;
  deskripsi: string;
  wajib: boolean;
  opsi: Prisma.JsonValue;
  peran: string | null;
  diarsipkan_at: Date | null;
};

/** Struktur aktif (tanpa pertanyaan arsip) dari baris database. */
export function strukturDariBaris(bagian: BarisBagian[], pertanyaan: BarisPertanyaan[]): Struktur {
  return {
    bagian: [...bagian]
      .sort((a, b) => a.urutan - b.urutan)
      .map((b) => ({
        id: b.id,
        judul: b.judul,
        deskripsi: b.deskripsi,
        lanjut_ke: b.lanjut_ke,
        pertanyaan: pertanyaan
          .filter((p) => p.bagian_id === b.id && !p.diarsipkan_at)
          .sort((x, y) => x.urutan - y.urutan)
          .map((p) => ({
            id: p.id,
            tipe: p.tipe as Struktur['bagian'][number]['pertanyaan'][number]['tipe'],
            judul: p.judul,
            deskripsi: p.deskripsi,
            wajib: p.wajib,
            opsi: (p.opsi ?? {}) as Opsi,
            peran: p.peran as Struktur['bagian'][number]['pertanyaan'][number]['peran'],
          })),
      })),
  };
}

/** Salinan struktur dengan SEMUA id baru (uuid), termasuk rujukan lompat/lanjut. */
export function salinStruktur(s: Struktur, buatId: () => string = randomUUID): Struktur {
  const peta = new Map<string, string>();
  const baru = (lama: string) => {
    if (!peta.has(lama)) peta.set(lama, buatId());
    return peta.get(lama)!;
  };
  for (const b of s.bagian) baru(b.id);
  const tujuan = (t: string | null | undefined) => (t == null ? null : t === TUJUAN_SELESAI ? t : (peta.get(t) ?? null));
  return {
    bagian: s.bagian.map((b) => ({
      ...b,
      id: baru(b.id),
      lanjut_ke: tujuan(b.lanjut_ke),
      pertanyaan: b.pertanyaan.map((p) => ({
        ...p,
        id: buatId(),
        opsi: {
          ...p.opsi,
          ...(p.opsi.pilihan ? { pilihan: p.opsi.pilihan.map((x) => ({ ...x, id: buatId(), lompat_ke: tujuan(x.lompat_ke) })) } : {}),
          ...(p.opsi.baris ? { baris: p.opsi.baris.map((x) => ({ ...x, id: buatId() })) } : {}),
          ...(p.opsi.kolom ? { kolom: p.opsi.kolom.map((x) => ({ ...x, id: buatId() })) } : {}),
        },
      })),
    })),
  };
}

async function tulisStrukturBaru(tx: TxKlien, formId: string, s: Struktur): Promise<void> {
  for (const [bi, b] of s.bagian.entries()) {
    await tx.form_bagian.create({ data: { id: b.id, form_id: formId, urutan: bi, judul: b.judul, deskripsi: b.deskripsi, lanjut_ke: b.lanjut_ke } });
    for (const [pi, p] of b.pertanyaan.entries()) {
      await tx.form_pertanyaan.create({
        data: {
          id: p.id,
          form_id: formId,
          bagian_id: b.id,
          urutan: pi,
          tipe: p.tipe,
          judul: p.judul,
          deskripsi: p.deskripsi,
          wajib: p.wajib,
          opsi: p.opsi as Prisma.InputJsonValue,
          peran: p.peran,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Daftar & muat
// ---------------------------------------------------------------------------

export interface RingkasForm {
  id: string;
  judul: string;
  kategori: Kategori;
  status: 'DRAF' | 'DIBUKA' | 'DITUTUP';
  akses: 'PUBLIK' | 'INTERNAL';
  acara: { id: string; nama: string } | null;
  jumlah_respons: number;
  kuota: number | null;
  ditutup_pada: string | null;
  dibuat_oleh: string;
  pembuat: string;
  updated_at: string;
  token: string;
  boleh_kelola: boolean;
}

/** Form periode aktif yang terlihat pengguna; `kepanitiaanId` = hanya form acara itu. */
export async function daftarForm(konteks: Konteks, opsi: { kepanitiaanId?: string } = {}): Promise<RingkasForm[]> {
  const baris = await db.$queryRaw<
    (Omit<RingkasForm, 'acara' | 'boleh_kelola' | 'updated_at' | 'ditutup_pada'> & {
      kepanitiaan_id: string | null;
      nama_acara: string | null;
      updated_at: Date;
      ditutup_pada: Date | null;
    })[]
  >`
    SELECT f.id::text, f.judul, f.kategori, f.status, f.akses, f.kuota, f.ditutup_pada, f.token,
           f.dibuat_oleh::text, u.nama_lengkap AS pembuat, f.updated_at,
           f.kepanitiaan_id::text, k.nama_acara,
           (SELECT count(*)::int FROM form_respons r WHERE r.form_id = f.id) AS jumlah_respons
    FROM form f
    JOIN app_user u ON u.id = f.dibuat_oleh
    LEFT JOIN kepanitiaan k ON k.id = f.kepanitiaan_id
    WHERE f.periode_id = ${konteks.periodeId}::uuid
      AND (${opsi.kepanitiaanId ?? null}::uuid IS NULL OR f.kepanitiaan_id = ${opsi.kepanitiaanId ?? null}::uuid)
    ORDER BY (f.status = 'DIBUKA') DESC, f.updated_at DESC`;
  const panitia = await acaraPanitia(konteks.sesi.userId);
  const hasil: RingkasForm[] = [];
  for (const b of baris) {
    if (!(await bolehBaca(konteks, b, panitia))) continue;
    hasil.push({
      ...b,
      acara: b.kepanitiaan_id ? { id: b.kepanitiaan_id, nama: b.nama_acara ?? '' } : null,
      updated_at: b.updated_at.toISOString(),
      ditutup_pada: b.ditutup_pada?.toISOString() ?? null,
      boleh_kelola: await bolehKelola(konteks, b, panitia),
    });
  }
  return hasil;
}

export interface DetailForm {
  id: string;
  kategori: Kategori;
  judul: string;
  deskripsi: string;
  status: 'DRAF' | 'DIBUKA' | 'DITUTUP';
  akses: 'PUBLIK' | 'INTERNAL';
  anonim: boolean;
  satu_respons: boolean;
  ditutup_pada: string | null;
  kuota: number | null;
  pesan_selesai: string;
  token: string;
  acara: { id: string; nama: string } | null;
  struktur: Struktur;
  jumlah_respons: number;
  /** id pertanyaan yang sudah punya jawaban — tipenya terkunci di editor. */
  terjawab: string[];
  boleh_kelola: boolean;
  updated_at: string;
}

export async function muatForm(konteks: Konteks, id: string): Promise<DetailForm | null> {
  if (!POLA_UUID.test(id)) return null;
  const f = await db.form.findUnique({ where: { id }, include: { bagian: true, pertanyaan: true } });
  if (!f || f.periode_id !== konteks.periodeId) return null;
  if (!(await bolehBaca(konteks, f))) return null;
  const [acara, jumlah, terjawab] = await Promise.all([
    f.kepanitiaan_id ? db.kepanitiaan.findUnique({ where: { id: f.kepanitiaan_id }, select: { id: true, nama_acara: true } }) : null,
    db.form_respons.count({ where: { form_id: id } }),
    db.$queryRaw<{ id: string }[]>`SELECT DISTINCT j.pertanyaan_id::text AS id FROM form_jawaban j JOIN form_pertanyaan p ON p.id = j.pertanyaan_id WHERE p.form_id = ${id}::uuid`,
  ]);
  return {
    id: f.id,
    kategori: f.kategori as Kategori,
    judul: f.judul,
    deskripsi: f.deskripsi,
    status: f.status as DetailForm['status'],
    akses: f.akses as DetailForm['akses'],
    anonim: f.anonim,
    satu_respons: f.satu_respons,
    ditutup_pada: f.ditutup_pada?.toISOString() ?? null,
    kuota: f.kuota,
    pesan_selesai: f.pesan_selesai,
    token: f.token,
    acara: acara ? { id: acara.id, nama: acara.nama_acara } : null,
    struktur: strukturDariBaris(f.bagian, f.pertanyaan),
    jumlah_respons: jumlah,
    terjawab: terjawab.map((t) => t.id),
    boleh_kelola: await bolehKelola(konteks, f),
    updated_at: f.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Buat
// ---------------------------------------------------------------------------

export async function buatForm(tx: TxKlien, konteks: Konteks, masukan: unknown): Promise<Hasil<{ id: string }>> {
  const v = SkemaBuatForm.safeParse(masukan);
  if (!v.success) return gagal('VALIDASI_GAGAL', v.error.issues[0]?.message ?? 'Isian tidak valid.', v.error.issues);
  const d = v.data;
  const info = INFO_KATEGORI[d.kategori];
  if (info.acara === 'wajib' && !d.kepanitiaan_id) return gagal('VALIDASI_GAGAL', `Form ${info.label} harus dibuat untuk satu acara. Pilih acaranya.`);
  if (info.acara === 'tidak' && d.kepanitiaan_id) return gagal('VALIDASI_GAGAL', `Form ${info.label} adalah form organisasi, tidak terikat acara.`);
  if (!konteks.periodeId) return gagal('TIDAK_BERWENANG', 'Tidak ada periode aktif.');

  if (d.kepanitiaan_id) {
    const k = await tx.kepanitiaan.findUnique({ where: { id: d.kepanitiaan_id }, select: { proker: { select: { periode_id: true } } } });
    if (!k || k.proker.periode_id !== konteks.periodeId) return gagal('TIDAK_DITEMUKAN', 'Acara tidak ditemukan pada periode aktif.');
  }
  if (!(await bolehBuat(konteks, d.kepanitiaan_id))) {
    return gagal(
      'TIDAK_BERWENANG',
      d.kepanitiaan_id ? 'Hanya panitia acara ini, Sekum, atau pimpinan yang dapat membuat form untuknya.' : 'Form organisasi dibuat oleh Sekum atau pimpinan.',
    );
  }

  let struktur: Struktur = strukturKosong(randomUUID);
  if (d.template_id) {
    const t = await tx.form_template.findUnique({ where: { id: d.template_id } });
    if (!t || !t.aktif) return gagal('TIDAK_DITEMUKAN', 'Template tidak ditemukan atau sudah dinonaktifkan.');
    const isi = SkemaStruktur.safeParse(t.isi);
    if (!isi.success) return gagal('VALIDASI_GAGAL', 'Isi template rusak; hubungi Sekum.');
    struktur = salinStruktur(isi.data);
  }

  const f = await tx.form.create({
    data: {
      periode_id: konteks.periodeId,
      kepanitiaan_id: d.kepanitiaan_id,
      kategori: d.kategori,
      judul: d.judul,
      deskripsi: d.deskripsi,
      template_id: d.template_id,
      dibuat_oleh: konteks.sesi.userId,
      // Evaluasi lazimnya anonim; pendataan pengurus wajib login, satu kali.
      anonim: d.kategori === 'EVALUASI',
      akses: d.kategori === 'PENDATAAN_PENGURUS' ? 'INTERNAL' : 'PUBLIK',
      satu_respons: d.kategori === 'PENDATAAN_PENGURUS',
    },
    select: { id: true },
  });
  await tulisStrukturBaru(tx, f.id, struktur);
  return { ok: true, nilai: { id: f.id } };
}

// ---------------------------------------------------------------------------
// Simpan (editor)
// ---------------------------------------------------------------------------

export async function simpanForm(tx: TxKlien, konteks: Konteks, id: string, masukan: unknown): Promise<Hasil<{ updated_at: string }>> {
  if (!POLA_UUID.test(id)) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  const v = SkemaSimpanForm.safeParse(masukan);
  if (!v.success) return gagal('VALIDASI_GAGAL', v.error.issues[0]?.message ?? 'Isian tidak valid.', v.error.issues);
  const d = v.data;
  const semuaId = [...d.struktur.bagian.map((b) => b.id), ...d.struktur.bagian.flatMap((b) => b.pertanyaan.map((p) => p.id))];
  if (semuaId.some((x) => !POLA_UUID.test(x))) return gagal('VALIDASI_GAGAL', 'Id bagian/pertanyaan harus UUID.');

  const [kunci] = await tx.$queryRaw<{ id: string; dibuat_oleh: string; kepanitiaan_id: string | null; status: string; kategori: string; periode_id: string }[]>`
    SELECT id::text, dibuat_oleh::text, kepanitiaan_id::text, status, kategori, periode_id::text FROM form WHERE id = ${id}::uuid FOR UPDATE`;
  if (!kunci || kunci.periode_id !== konteks.periodeId) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  if (!(await bolehKelola(konteks, kunci))) return gagal('TIDAK_BERWENANG', 'Anda tidak dapat mengubah form ini.');
  if (kunci.status === 'DIBUKA') {
    const masalah = syaratBuka(kunci.kategori as Kategori, d.struktur);
    if (masalah.length) return gagal('VALIDASI_GAGAL', `Form sedang dibuka: ${masalah[0]}`, masalah);
  }

  const lama = await tx.form_pertanyaan.findMany({ where: { form_id: id }, select: { id: true, tipe: true, bagian_id: true, diarsipkan_at: true } });
  const terjawab = new Set(
    (await tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT j.pertanyaan_id::text AS id FROM form_jawaban j JOIN form_pertanyaan p ON p.id = j.pertanyaan_id WHERE p.form_id = ${id}::uuid`).map((r) => r.id),
  );
  const baru = new Map(d.struktur.bagian.flatMap((b) => b.pertanyaan.map((p) => [p.id, p] as const)));
  for (const p of lama) {
    const n = baru.get(p.id);
    if (n && terjawab.has(p.id) && n.tipe !== p.tipe) {
      return gagal('KONFLIK', `Tipe pertanyaan yang sudah dijawab tidak dapat diubah ("${n.judul}"). Buat pertanyaan baru bila perlu.`);
    }
  }

  // Bagian: upsert yang dikirim; arsipkan dulu pertanyaan terjawab yang dihapus
  // ke bagian pertama SEBELUM bagian lama dihapus (kaskade).
  const bagianPertama = d.struktur.bagian[0]!.id;
  for (const [bi, b] of d.struktur.bagian.entries()) {
    await tx.form_bagian.upsert({
      where: { id: b.id },
      create: { id: b.id, form_id: id, urutan: bi, judul: b.judul, deskripsi: b.deskripsi, lanjut_ke: b.lanjut_ke },
      update: { urutan: bi, judul: b.judul, deskripsi: b.deskripsi, lanjut_ke: b.lanjut_ke },
    });
  }
  for (const p of lama) {
    if (baru.has(p.id)) continue;
    if (terjawab.has(p.id)) {
      await tx.form_pertanyaan.update({ where: { id: p.id }, data: { diarsipkan_at: p.diarsipkan_at ?? new Date(), bagian_id: bagianPertama, urutan: 10_000 } });
    } else {
      await tx.form_pertanyaan.delete({ where: { id: p.id } });
    }
  }
  await tx.form_bagian.deleteMany({ where: { form_id: id, id: { notIn: d.struktur.bagian.map((b) => b.id) } } });
  const idLama = new Set(lama.map((p) => p.id));
  for (const b of d.struktur.bagian) {
    for (const [pi, p] of b.pertanyaan.entries()) {
      const data = { bagian_id: b.id, urutan: pi, tipe: p.tipe, judul: p.judul, deskripsi: p.deskripsi, wajib: p.wajib, opsi: p.opsi as Prisma.InputJsonValue, peran: p.peran, diarsipkan_at: null };
      if (idLama.has(p.id)) await tx.form_pertanyaan.update({ where: { id: p.id }, data });
      else await tx.form_pertanyaan.create({ data: { id: p.id, form_id: id, ...data } });
    }
  }

  const f = await tx.form.update({
    where: { id },
    data: {
      judul: d.judul,
      deskripsi: d.deskripsi,
      akses: d.akses,
      anonim: d.anonim,
      satu_respons: d.satu_respons,
      ditutup_pada: d.ditutup_pada ? new Date(d.ditutup_pada) : null,
      kuota: d.kuota,
      pesan_selesai: d.pesan_selesai,
    },
    select: { updated_at: true },
  });
  return { ok: true, nilai: { updated_at: f.updated_at.toISOString() } };
}

// ---------------------------------------------------------------------------
// Status & hapus
// ---------------------------------------------------------------------------

export async function ubahStatusForm(tx: TxKlien, konteks: Konteks, id: string, aksi: unknown): Promise<Hasil<{ status: string }>> {
  if (aksi !== 'buka' && aksi !== 'tutup') return gagal('VALIDASI_GAGAL', 'Aksi harus "buka" atau "tutup".');
  if (!POLA_UUID.test(id)) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  const f = await tx.form.findUnique({ where: { id }, include: { bagian: true, pertanyaan: true } });
  if (!f || f.periode_id !== konteks.periodeId) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  if (!(await bolehKelola(konteks, f))) return gagal('TIDAK_BERWENANG', 'Anda tidak dapat mengubah form ini.');
  if (aksi === 'tutup') {
    if (f.status !== 'DIBUKA') return gagal('STATUS_TIDAK_SESUAI', 'Form tidak sedang dibuka.');
    await tx.form.update({ where: { id }, data: { status: 'DITUTUP' } });
    return { ok: true, nilai: { status: 'DITUTUP' } };
  }
  if (f.status === 'DIBUKA') return gagal('STATUS_TIDAK_SESUAI', 'Form sudah dibuka.');
  const masalah = syaratBuka(f.kategori as Kategori, strukturDariBaris(f.bagian, f.pertanyaan));
  if (f.ditutup_pada && f.ditutup_pada.getTime() <= Date.now()) masalah.push('Batas waktu pengisian sudah lewat. Ubah atau kosongkan batas waktunya dulu.');
  if (masalah.length) return gagal('VALIDASI_GAGAL', masalah[0]!, masalah);
  await tx.form.update({ where: { id }, data: { status: 'DIBUKA', dibuka_at: f.dibuka_at ?? new Date() } });
  return { ok: true, nilai: { status: 'DIBUKA' } };
}

export async function hapusForm(tx: TxKlien, konteks: Konteks, id: string): Promise<Hasil<{ id: string }>> {
  if (!POLA_UUID.test(id)) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  const f = await tx.form.findUnique({ where: { id }, select: { id: true, dibuat_oleh: true, kepanitiaan_id: true, periode_id: true, _count: { select: { respons: true } } } });
  if (!f || f.periode_id !== konteks.periodeId) return gagal('TIDAK_DITEMUKAN', 'Form tidak ditemukan.');
  if (!(await bolehKelola(konteks, f))) return gagal('TIDAK_BERWENANG', 'Anda tidak dapat menghapus form ini.');
  if (f._count.respons > 0 && !pimpinanPenulis(konteks.roles)) {
    return gagal('KONFLIK', `Form sudah punya ${f._count.respons} respons. Tutup saja form ini; hanya Sekum atau pimpinan yang dapat menghapus form beserta responsnya.`);
  }
  await tx.form.delete({ where: { id } });
  return { ok: true, nilai: { id } };
}

// ---------------------------------------------------------------------------
// Pilihan acara di wizard "Form baru"
// ---------------------------------------------------------------------------

/** Acara periode aktif yang boleh diberi form oleh pengguna (pimpinan: semua; panitia: acaranya). */
export async function acaraUntukBuat(konteks: Konteks): Promise<{ id: string; nama: string }[]> {
  if (!konteks.periodeId) return [];
  const semua = await db.$queryRaw<{ id: string; nama: string }[]>`
    SELECT k.id::text, k.nama_acara AS nama FROM kepanitiaan k JOIN proker p ON p.id = k.proker_id
    WHERE p.periode_id = ${konteks.periodeId}::uuid ORDER BY k.nama_acara`;
  if (pimpinanPenulis(konteks.roles)) return semua;
  if (!konteks.roles.some((r) => r === 'BENDUM' || r === 'KADEPT' || r === 'ANGGOTA')) return [];
  const panitia = await acaraPanitia(konteks.sesi.userId);
  return semua.filter((a) => panitia.has(a.id));
}
