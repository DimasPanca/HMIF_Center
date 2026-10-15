/**
 * draft — menyimpan dan membaca draft surat (T-058). Server-only.
 *
 * Auto-save menyimpan isian apa adanya, termasuk yang belum lengkap, karena
 * itulah gunanya draft. Yang TIDAK dipercaya dari klien:
 *
 *   - kode surat dan template: diturunkan dari `jenis` di server, template dari
 *     versi aktif (`templateAktif`), bukan dari body;
 *   - isi surat: dibersihkan allowlist sebelum disimpan (S8);
 *   - `data_dinamis`: hanya kunci yang dikenal jenisnya — kunci asing dibuang;
 *   - format PDF: ditolak diam-diam ke DOCX bila PDF_ENABLED mati (ADR-010);
 *   - pembuat, periode, departemen: dari sesi, tidak pernah dari body (INV-02).
 *
 * Draft hanya dapat diubah pembuatnya, selama berstatus DRAFT. Approver dan
 * arsip punya jalurnya sendiri (T-060, T-063).
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-058 · PRD F-4.2 · ADR-026, ADR-028
 */

import type { Prisma } from '@prisma/client';

import { lingkupKonteks, type Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import type { TxKlien } from '@/lib/db/with-audit-context';
import {
  FIELD_UMUM_TERPAKAI,
  JENIS_SURAT,
  SkemaDraftSurat,
  infoJenis,
  kunciKhusus,
  nilaiAwalSurat,
  opsiFormatOutput,
  periksaKelengkapan,
  type JenisSurat,
  type KonfigSurat,
  type MasalahField,
  type SuratFormInput,
} from '@/lib/surat/field-schemas';
import { sanitasiIsiHtml } from '@/lib/surat/isi-html';
import { bacaKonfigSurat, bacaPresetTujuan } from '@/lib/surat/konfig';
import { LABEL_PRESET_LAINNYA, type PresetTujuan } from '@/lib/surat/preset-tujuan';
import { templateAktif } from '@/lib/surat/template-registry';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/draft.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

export type KodeGagalSurat =
  | 'VALIDASI_GAGAL'
  | 'TIDAK_DITEMUKAN'
  | 'STATUS_TIDAK_SESUAI'
  | 'TEMPLATE_BELUM_TERDAFTAR';

export const STATUS_GAGAL_SURAT: Record<KodeGagalSurat, number> = {
  VALIDASI_GAGAL: 422,
  TIDAK_DITEMUKAN: 404,
  STATUS_TIDAK_SESUAI: 409,
  TEMPLATE_BELUM_TERDAFTAR: 409,
};

export type HasilSurat<T> = { ok: true; nilai: T } | { ok: false; kode: KodeGagalSurat; pesan: string; details?: unknown };

export interface DraftTersimpan {
  id: string;
  status: string;
  diperbarui_at: string;
  /** Field yang masih kurang menurut skema lengkap. Kosong = siap diajukan. */
  masalah: MasalahField[];
}

export interface DetailDraft extends DraftTersimpan {
  nilai: SuratFormInput;
}

/** Status yang masih boleh disunting pembuatnya lewat auto-save. */
export const STATUS_DAPAT_DISUNTING: readonly string[] = ['DRAFT', 'DITOLAK'];

const RE_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function hariIniWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

/** `surat.tanggal_surat` NOT NULL bertipe DATE: tanggal setengah jadi diganti hari ini. */
function tanggalUntukDb(v: string | undefined): string {
  if (v && RE_TANGGAL.test(v)) {
    const d = new Date(`${v}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v) return v;
  }
  return hariIniWib();
}

function ambilKhusus(jenis: JenisSurat, masukan: Record<string, unknown> | undefined): Record<string, unknown> {
  const hasil: Record<string, unknown> = {};
  if (!masukan) return hasil;
  for (const k of kunciKhusus(jenis)) if (k in masukan) hasil[k] = masukan[k];
  return hasil;
}

/** KADEPT membuat surat atas nama departemennya (PRD §5.1 `C*`), pimpinan atas nama himpunan. */
function departemenSurat(konteks: Konteks): string | null {
  return lingkupKonteks(konteks, 'surat.create') === 'DEPARTEMEN' ? (konteks.departemenIds[0] ?? null) : null;
}

async function idTemplate(jenis: JenisSurat): Promise<HasilSurat<string | null>> {
  if (!infoJenis(jenis).varian) return { ok: true, nilai: null }; // generik, ADR-028
  const t = await templateAktif(jenis);
  if (!t) {
    return {
      ok: false,
      kode: 'TEMPLATE_BELUM_TERDAFTAR',
      pesan: 'Template jenis surat ini belum terdaftar. Hubungi Admin untuk menjalankan scripts/upload-templates.ts.',
    };
  }
  return { ok: true, nilai: t.id };
}

/**
 * Membuat draft baru (`id` null) atau memperbarui draft milik pengguna.
 * Dipanggil di dalam `withAuditContext` (K-09).
 */
export async function simpanDraft(
  tx: TxKlien,
  konteks: Konteks,
  body: unknown,
  id: string | null,
): Promise<HasilSurat<DraftTersimpan>> {
  const p = SkemaDraftSurat.safeParse(body);
  if (!p.success) {
    return {
      ok: false,
      kode: 'VALIDASI_GAGAL',
      pesan: p.error.issues[0]?.message ?? 'Isian tidak valid.',
      details: p.error.issues.map((i) => ({ path: i.path.join('.'), pesan: i.message })),
    };
  }
  const d = p.data;
  const konfig = await bacaKonfigSurat();

  if (id) {
    const ada = await tx.surat.findUnique({
      where: { id },
      select: { periode_id: true, dibuat_oleh: true, status: true },
    });
    // Milik orang lain atau periode lain: diperlakukan tidak ada (INV-08).
    if (!ada || ada.periode_id !== konteks.periodeId || ada.dibuat_oleh !== konteks.sesi.userId) {
      return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Draft surat tidak ditemukan.' };
    }
    // DITOLAK → DRAFT adalah transisi "Perbaiki" (USER_FLOW §11.2): menyunting
    // surat yang ditolak mengembalikannya menjadi draft. Alasan penolakan
    // dibiarkan tersimpan supaya pembuat tetap dapat membacanya.
    if (!STATUS_DAPAT_DISUNTING.includes(ada.status)) {
      return { ok: false, kode: 'STATUS_TIDAK_SESUAI', pesan: `Surat berstatus ${ada.status} tidak dapat disunting sebagai draft.` };
    }
  }

  const template = await idTemplate(d.jenis);
  if (!template.ok) return template;

  const formatSah = opsiFormatOutput(konfig.pdfAktif).map((o) => o.nilai) as string[];
  const kolom = {
    template_id: template.nilai,
    kode_surat: infoJenis(d.jenis).kode,
    kode_kegiatan: (d.kode_kegiatan ?? '').trim().toUpperCase() || konfig.kodeKegiatanDefault,
    tanggal_surat: new Date(`${tanggalUntukDb(d.tanggal_surat)}T00:00:00Z`),
    kota: d.kota ?? konfig.kotaDefault,
    lampiran: d.lampiran ?? '-',
    perihal: d.perihal ?? '',
    tujuan_nama: d.tujuan_nama ?? '',
    tujuan_alamat: d.tujuan_alamat ?? '',
    isi_html: sanitasiIsiHtml(d.isi_surat),
    data_dinamis: ambilKhusus(d.jenis, d.data_dinamis) as Prisma.InputJsonValue,
    format_output: d.format_output && formatSah.includes(d.format_output) ? d.format_output : 'DOCX',
    updated_at: new Date(),
  };

  const surat = id
    ? await tx.surat.update({ where: { id }, data: { ...kolom, status: 'DRAFT' }, select: { id: true, status: true, updated_at: true } })
    : await tx.surat.create({
        data: {
          ...kolom,
          periode_id: konteks.periodeId,
          dibuat_oleh: konteks.sesi.userId,
          departemen_id: departemenSurat(konteks),
          status: 'DRAFT',
        },
        select: { id: true, status: true, updated_at: true },
      });

  // Kolom KIRI ditulis ulang tiap simpan. Kolom KANAN (Ketua Himpunan) tidak
  // disimpan di draft: siapa Ketua-nya ditentukan saat surat disetujui (ADR-004).
  await tx.surat_signer.deleteMany({ where: { surat_id: surat.id } });
  const kiri = d.penandatangan_tambahan?.[0];
  if (kiri && (kiri.jabatan || kiri.nama || kiri.nim)) {
    await tx.surat_signer.create({
      data: {
        surat_id: surat.id,
        urutan: 1,
        posisi: 'KIRI',
        jabatan: kiri.jabatan ?? '',
        nama: kiri.nama ?? '',
        nim: kiri.nim ?? null,
        user_id: kiri.user_id ?? null,
      },
    });
  }

  return {
    ok: true,
    nilai: {
      id: surat.id,
      status: surat.status,
      diperbarui_at: surat.updated_at.toISOString(),
      masalah: periksaKelengkapan(konfig, { ...d, data_dinamis: kolom.data_dinamis }),
    },
  };
}

function presetDari(nama: string, alamat: string, preset: readonly PresetTujuan[]): string {
  if (!nama && !alamat) return '';
  return preset.find((p) => p.nama === nama && p.alamat === alamat)?.label ?? LABEL_PRESET_LAINNYA;
}

/** Jenis surat dari kode + varian template (NULL = generik). */
export function jenisDari(kode: string, varian: string | null): JenisSurat | null {
  return JENIS_SURAT.find((j) => j.kode === kode && j.varian === varian)?.jenis ?? null;
}

export interface DetailSurat extends DetailDraft {
  kode_surat: string;
  /** Baris versi template yang dipakai; NULL untuk surat generik (ADR-028). */
  template_id: string | null;
  nomor_lengkap: string | null;
  alasan_penolakan: string | null;
  alasan_pembatalan: string | null;
  diajukan_at: string | null;
  dibuat_oleh: string;
  nama_pembuat: string;
  nama_departemen: string | null;
}

/**
 * Baris surat dalam bentuk nilai form, TANPA pemeriksaan hak akses — pemanggil
 * yang menegakkannya. `null` bila surat tidak ada atau milik periode lain.
 */
export async function muatSurat(konteks: Konteks, id: string, konfig?: KonfigSurat): Promise<DetailSurat | null> {
  const s = await db.surat.findUnique({
    where: { id },
    include: {
      surat_template: { select: { varian: true } },
      surat_signer: { orderBy: { urutan: 'asc' } },
      app_user_surat_dibuat_olehToapp_user: { select: { nama_lengkap: true } },
      departemen: { select: { nama: true } },
    },
  });
  if (!s || s.periode_id !== konteks.periodeId) return null;

  const jenis = jenisDari(s.kode_surat, s.surat_template?.varian ?? null);
  if (!jenis) return null;

  const k = konfig ?? (await bacaKonfigSurat());
  const awal = nilaiAwalSurat(k, jenis) as Record<string, unknown> & { data_dinamis: Record<string, unknown> };
  const kiri = s.surat_signer.find((x) => x.posisi === 'KIRI');
  const nilai = {
    ...awal,
    jenis,
    kode_kegiatan: s.kode_kegiatan,
    tanggal_surat: s.tanggal_surat.toISOString().slice(0, 10),
    kota: s.kota,
    lampiran: s.lampiran ?? '-',
    perihal: s.perihal,
    tujuan_preset: presetDari(s.tujuan_nama, s.tujuan_alamat, await bacaPresetTujuan()),
    tujuan_nama: s.tujuan_nama,
    tujuan_alamat: s.tujuan_alamat,
    isi_surat: s.isi_html ?? '',
    penandatangan_tambahan: kiri ? [{ jabatan: kiri.jabatan, nama: kiri.nama, nim: kiri.nim ?? '', user_id: kiri.user_id }] : [],
    format_output: s.format_output,
    data_dinamis: { ...awal.data_dinamis, ...(s.data_dinamis as Record<string, unknown>) },
  } as Record<string, unknown>;

  // Field umum yang tidak dicetak jenis ini (mis. tujuan pada Keterangan Aktif)
  // bernilai tetap di skema. Nilainya diambil dari default, BUKAN diturunkan dari
  // kolom database: "-" sebagai nama dan alamat tujuan akan terbaca sebagai
  // preset "Lainnya" dan membuat surat yang lengkap tak pernah dapat diajukan.
  const terpakai = new Set<string>(FIELD_UMUM_TERPAKAI[jenis]);
  for (const k of ['perihal', 'tujuan_preset', 'tujuan_nama', 'tujuan_alamat', 'isi_surat'] as const) {
    if (!terpakai.has(k)) nilai[k] = awal[k];
  }

  return {
    id: s.id,
    status: s.status,
    diperbarui_at: s.updated_at.toISOString(),
    nilai: nilai as SuratFormInput,
    masalah: periksaKelengkapan(k, nilai),
    kode_surat: s.kode_surat,
    template_id: s.template_id,
    nomor_lengkap: s.nomor_lengkap,
    alasan_penolakan: s.alasan_penolakan,
    alasan_pembatalan: s.alasan_pembatalan,
    diajukan_at: s.diajukan_at?.toISOString() ?? null,
    dibuat_oleh: s.dibuat_oleh,
    nama_pembuat: s.app_user_surat_dibuat_olehToapp_user.nama_lengkap,
    nama_departemen: s.departemen?.nama ?? null,
  };
}

/**
 * Draft milik pengguna dalam bentuk nilai form. `null` bila tidak ada, milik
 * orang lain, atau periode lain — pemanggil menjawab 404 tanpa membedakannya.
 */
export async function detailDraft(konteks: Konteks, id: string, konfig?: KonfigSurat): Promise<DetailSurat | null> {
  const s = await muatSurat(konteks, id, konfig);
  return s && s.dibuat_oleh === konteks.sesi.userId ? s : null;
}
