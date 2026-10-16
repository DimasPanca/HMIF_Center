/**
 * Generator dokumen TOR (T-095). Server-only.
 *
 *   muatTor ─▶ periksa kelengkapan ─▶ petakanTor ─▶ renderDocx(template/tor_v1)
 *           ─▶ storage dokumen/tor/{id}.docx ─▶ baris `dokumen` (jenis TOR)
 *
 * - Anggaran SELALU ditarik ulang dari RAB saat generate (`muatTor` →
 *   `anggaranTor`); tidak ada angka yang disalin ke tor.data.
 * - Bagian wajib yang kosong → generate ditolak beserta daftarnya, bukan
 *   dokumen bolong (kelengkapanTor — penghitung yang sama dengan editor).
 * - Penandatangan: Ketua Pelaksana (kiri pada urutan blok) + Ketua Himpunan.
 *   TTD Ketua Himpunan WAJIB dan digabung stempel (sama dengan surat, ADR-004);
 *   TTD Ketua Pelaksana dipakai bila sudah diunggah, selain itu ruang kosong
 *   untuk tanda tangan basah.
 * - Nama loop mengikuti template (TEMPLATE_MAPPING §5.9): `sesi`, `rab_divisi`,
 *   `sesi_rundown`/`rundown`. Nama di kontrak T-095 (`waktu_tempat`,
 *   `anggaran_divisi`) ikut dikirim sebagai alias — ADR-033.
 *
 * Sumber: docs/ai/tasks/P6-tor-proposal.md T-095 · TEMPLATE_MAPPING §5.9 · SYSTEM_DESIGN §8
 */

import { GalatTemplate, renderDocx } from '@/lib/documents/docx-engine';
import { gabungTtdStempel, ttdMelayang, type GambarDocx } from '@/lib/documents/image-module';
import { muatBerkas, muatStempel } from '@/lib/documents/template-loader';
import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { ekstrakTeks, type NodeProseMirror } from '@/lib/notulensi/sanitasi';
import { keys, storage } from '@/lib/storage';
import { bacaKonfigSurat, bacaPenandatanganKetua } from '@/lib/surat/konfig';
import { kunciTemplateDokumen } from '@/lib/surat/template-registry';
import { kelengkapanTor, totalBobot, type BarisRundown, type DataTor } from '@/lib/tor/schema';
import { bisaTulisTor, faktaLuar, muatTor, type AnggaranTor } from '@/lib/tor/service';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import {
  formatTanggalPanjang,
  formatTanggalSurat,
  tanggalHariIniJakarta,
} from '@/lib/utils/format-tanggal';

if (typeof window !== 'undefined') {
  throw new Error('lib/tor/generate.ts adalah modul server-only.');
}

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------------------------------------------------------------------------
// Pemetaan — murni (diuji tanpa DB: `npm run test -- tor-generate`)
// ---------------------------------------------------------------------------

export interface PenandatanganTor {
  jabatan: string;
  nama: string;
  nim: string;
  ttd: GambarDocx | null;
}

export interface MasukanTor {
  data: DataTor;
  rundown: BarisRundown[];
  anggaran: AnggaranTor;
  tahun: string;
  kota: string;
  /** YYYY-MM-DD — tanggal tanda tangan. */
  tanggal: string;
  penandatangan: PenandatanganTor[];
}

/** Teks kaya → paragraf; butir daftar menjadi baris sendiri dengan penanda. */
export function paragrafTeksKaya(doc: NodeProseMirror): string[] {
  const hasil: string[] = [];
  for (const blok of doc.content ?? []) {
    if (blok.type === 'bulletList' || blok.type === 'orderedList' || blok.type === 'taskList') {
      const mulai = typeof blok.attrs?.start === 'number' ? blok.attrs.start : 1;
      (blok.content ?? []).forEach((butir, i) => {
        const t = ekstrakTeks(butir).trim();
        if (!t) return;
        const tanda =
          blok.type === 'orderedList'
            ? `${mulai + i}.`
            : blok.type === 'taskList'
              ? butir.attrs?.checked
                ? '☑'
                : '☐'
              : '•';
        hasil.push(`${tanda} ${t}`);
      });
      continue;
    }
    const t = ekstrakTeks(blok).trim();
    if (t) hasil.push(t);
  }
  return hasil;
}

const teksKaya = (d: NodeProseMirror) => paragrafTeksKaya(d).join('\n');
const isi = (s: string) => s.trim().length > 0;

function menit(jam: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(jam);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const formatMenit = (n: number) => `${n} Menit`;

function formatPersen(n: number | null): string {
  return n === null ? '-' : `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
}

/** KKM tunggal bila seragam ("60"); bila berbeda per kriteria, dirinci. */
function kkm(p: DataTor['parameter']): string {
  const ada = p.filter((x) => isi(x.kriteria) && x.kkm !== null);
  if (!ada.length) return '-';
  const unik = [...new Set(ada.map((x) => x.kkm))];
  return unik.length === 1
    ? String(unik[0])
    : ada.map((x) => `${x.kriteria.trim()} ${x.kkm}`).join('; ');
}

/** Rundown dikelompokkan per tanggal; nama kelompok = nama sesi Waktu & Tempat di tanggal itu. */
export function kelompokRundown(rundown: BarisRundown[], sesi: DataTor['waktu_tempat']) {
  const urut = [...rundown].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const grup = new Map<string, BarisRundown[]>();
  for (const r of urut) grup.set(r.tanggal, [...(grup.get(r.tanggal) ?? []), r]);
  return [...grup.entries()].map(([tanggal, baris]) => {
    const hari = formatTanggalPanjang(tanggal);
    const namaSesi = sesi
      .filter((s) => s.tanggal === tanggal && isi(s.sesi))
      .map((s) => s.sesi.trim());
    const durasi = baris.map((b) => {
      const a = menit(b.waktu_mulai);
      const z = menit(b.waktu_selesai);
      return a !== null && z !== null ? z - a : null;
    });
    const mulai = baris.map((b) => b.waktu_mulai).filter(Boolean);
    const selesai = baris.map((b) => b.waktu_selesai).filter(Boolean);
    const total = durasi.reduce<number>((s, d) => s + (d ?? 0), 0);
    return {
      nama_sesi: namaSesi.length ? namaSesi.join(' & ') : hari,
      rundown: baris.map((b, i) => ({
        // Seperti berkas asli: hari/tanggal hanya di baris pertama kelompok.
        hari_tanggal: i === 0 ? hari : '',
        mulai: b.waktu_mulai || '-',
        selesai: b.waktu_selesai || '-',
        durasi: durasi[i] !== null ? formatMenit(durasi[i]!) : '-',
        acara: b.acara,
        pj: b.keterangan,
        waktu: b.waktu_mulai
          ? `${b.waktu_mulai}${b.waktu_selesai ? ` - ${b.waktu_selesai}` : ''}`
          : '',
        keterangan: b.keterangan,
      })),
      total_durasi: formatMenit(total),
      rentang_waktu:
        mulai.length && selesai.length
          ? `${mulai.sort()[0]} - ${selesai.sort().at(-1)} Selesai`
          : '-',
    };
  });
}

/**
 * Data docxtemplater untuk templates/tor.docx. Setiap placeholder template
 * terisi (renderDocx menolak placeholder tanpa data); string kosong = sengaja.
 */
export function petakanTor(m: MasukanTor): Record<string, unknown> {
  const d = m.data;
  const sesi = d.waktu_tempat
    .filter((w) => isi(w.sesi) || w.tanggal || isi(w.tempat))
    .map((w) => ({
      nama_sesi: w.sesi.trim(),
      hari_tanggal: w.tanggal ? formatTanggalPanjang(w.tanggal) : '-',
      waktu: w.waktu.trim() || '-',
      tempat: w.tempat.trim() || '-',
    }));
  const rabDivisi = [
    ...m.anggaran.divisi.map((x) => ({ divisi: x.nama, besaran: formatRupiah(x.total) })),
    ...(m.anggaran.dana_tak_terduga
      ? [{ divisi: 'Dana Tak Terduga', besaran: formatRupiah(m.anggaran.dana_tak_terduga) }]
      : []),
  ].map((x, i) => ({ no: String(i + 1), ...x }));
  const sasaran = [
    ...paragrafTeksKaya(d.sasaran.uraian),
    ...(d.sasaran.estimasi_jumlah !== null
      ? [
          `Estimasi jumlah peserta: ${d.sasaran.estimasi_jumlah.toLocaleString('id-ID')} orang${
            d.sasaran.jumlah_kelompok !== null
              ? `, dibagi ke dalam ${d.sasaran.jumlah_kelompok.toLocaleString('id-ID')} kelompok`
              : ''
          }.`,
        ]
      : []),
  ].join('\n');
  const sesiRundown = kelompokRundown(m.rundown, d.waktu_tempat);

  return {
    nama_kegiatan: d.nama_kegiatan.trim(),
    tahun: m.tahun,
    tema_kegiatan: d.tema.trim(),
    gambaran_umum: teksKaya(d.gambaran_umum),
    tujuan: d.tujuan.filter(isi).map((t) => ({ teks: t.trim() })),
    bentuk_acara: teksKaya(d.bentuk_acara.uraian),
    bentuk: d.bentuk_acara.sub
      .filter((s) => isi(s.judul) || isi(s.uraian))
      .map((s) => ({ judul: s.judul.trim(), uraian: s.uraian.trim() })),
    sesi,
    waktu_tempat: sesi,
    sasaran_peserta: sasaran,
    kondisi: d.kondisi
      .filter((k) => isi(k.ketentuan))
      .map((k) => ({ nama_sesi: k.sesi.trim() || 'Umum', ketentuan: k.ketentuan.trim() })),
    parameter: d.parameter
      .filter((p) => isi(p.kriteria))
      .map((p) => ({
        kriteria: p.kriteria.trim(),
        bobot: formatPersen(p.bobot),
        kkm: p.kkm === null ? '-' : String(p.kkm),
      })),
    kkm: kkm(d.parameter),
    total_bobot: formatPersen(totalBobot(d.parameter)),
    rangkaian: d.rangkaian
      .filter((r) => isi(r.nama))
      .map((r) => ({ nama: r.nama.trim(), uraian: r.uraian.trim() })),
    penutup: teksKaya(d.penutup),
    kota: m.kota,
    tanggal_format: formatTanggalSurat(m.tanggal),
    kanan: m.penandatangan.map((p) => ({
      jabatan: p.jabatan,
      nama: p.nama,
      nim: p.nim,
      ttd: p.ttd ? ttdMelayang(p.ttd, 'BARIS_ATAS_NAMA') : null,
      // Stempel sudah tergabung dalam gambar TTD Ketua (gabungTtdStempel).
      stempel: null,
    })),
    rab_divisi: rabDivisi,
    anggaran_divisi: rabDivisi,
    rab_total: formatRupiah(m.anggaran.total),
    sesi_rundown: sesiRundown,
    rundown: sesiRundown.flatMap((g) => g.rundown),
  };
}

// ---------------------------------------------------------------------------
// Generate — dengan DB & storage
// ---------------------------------------------------------------------------

export type HasilGenerateTor =
  | { ok: true; dokumen_id: string; ukuran: number }
  | {
      ok: false;
      kode: 'TIDAK_DITEMUKAN' | 'TIDAK_BERWENANG' | 'BELUM_LENGKAP' | 'GAGAL';
      pesan: string;
      kurang?: string[];
    };

async function gambarTtd(userId: string, denganStempel: boolean): Promise<GambarDocx | null> {
  const s = await db.signature.findUnique({
    where: { user_id: userId },
    select: { storage_key: true },
  });
  if (!s) return null;
  const [gambar, stempel] = await Promise.all([
    storage.get(s.storage_key),
    denganStempel ? muatStempel() : Promise.resolve(null),
  ]);
  // gabungTtdStempel merapikan latar & margin TTD sendiri (rapikanTtd).
  return gabungTtdStempel(gambar, stempel);
}

export async function generateTor(
  konteks: Konteks,
  kepanitiaanId: string,
): Promise<HasilGenerateTor> {
  const tor = await muatTor(konteks, kepanitiaanId);
  if (!tor) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Acara tidak ditemukan.' };
  if (!(await bisaTulisTor(konteks, kepanitiaanId))) {
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'TOR dibuat panitia acara ini, Kadept penanggung jawab, atau pimpinan.',
    };
  }
  if (tor.anggaran === 'TERBATAS')
    return {
      ok: false,
      kode: 'TIDAK_BERWENANG',
      pesan: 'Anggaran acara ini tidak dapat Anda baca.',
    };

  const k = kelengkapanTor(tor.data, faktaLuar(tor));
  if (k.kurang.length) {
    return {
      ok: false,
      kode: 'BELUM_LENGKAP',
      pesan: `TOR belum lengkap: ${k.kurang.join(', ')}.`,
      kurang: k.kurang,
    };
  }

  const kp = await db.kepanitiaan.findUnique({
    where: { id: kepanitiaanId },
    select: {
      app_user_kepanitiaan_ketua_pelaksanaToapp_user: {
        select: { id: true, nama_lengkap: true, nim: true },
      },
      proker: { select: { tanggal_hari_h_mulai: true } },
    },
  });
  const ketuplak = kp?.app_user_kepanitiaan_ketua_pelaksanaToapp_user;
  const ketua = konteks.periodeId ? await bacaPenandatanganKetua(konteks.periodeId) : null;
  if (!ketuplak || !ketua)
    return {
      ok: false,
      kode: 'BELUM_LENGKAP',
      pesan: 'TOR belum lengkap: 14. Penandatangan.',
      kurang: ['14. Penandatangan'],
    };

  let isiDocx: Buffer;
  try {
    const [ttdKetua, ttdKetuplak, template, konfig] = await Promise.all([
      gambarTtd(ketua.userId, true),
      gambarTtd(ketuplak.id, false),
      muatBerkas(kunciTemplateDokumen('TOR')),
      bacaKonfigSurat(),
    ]);
    if (!ttdKetua)
      return {
        ok: false,
        kode: 'BELUM_LENGKAP',
        pesan: `${ketua.nama} (Ketua Himpunan) belum mengunggah tanda tangan.`,
        kurang: ['14. Penandatangan'],
      };
    const hariH = kp?.proker.tanggal_hari_h_mulai;
    isiDocx = renderDocx(
      template,
      petakanTor({
        data: tor.data,
        rundown: tor.rundown,
        anggaran: tor.anggaran,
        tahun: String(hariH ? hariH.getUTCFullYear() : Number(tanggalHariIniJakarta().slice(0, 4))),
        kota: konfig.kotaDefault,
        tanggal: tanggalHariIniJakarta(),
        penandatangan: [
          {
            jabatan: 'Ketua Pelaksana',
            nama: ketuplak.nama_lengkap,
            nim: ketuplak.nim,
            ttd: ttdKetuplak,
          },
          {
            jabatan: 'Ketua Himpunan Mahasiswa Informatika',
            nama: ketua.nama,
            nim: ketua.nim,
            ttd: ttdKetua,
          },
        ],
      }),
    );
  } catch (e) {
    console.error(`[tor] ${kepanitiaanId}: generate gagal`, e);
    return {
      ok: false,
      kode: 'GAGAL',
      pesan:
        e instanceof GalatTemplate
          ? `Template TOR tidak dapat diisi: ${e.message}`
          : 'Template, stempel, atau tanda tangan tidak dapat dimuat.',
    };
  }

  const key = keys.torDocx(kepanitiaanId);
  try {
    await storage.put(key, isiDocx, MIME_DOCX, { upsert: true });
  } catch (e) {
    console.error(`[tor] ${kepanitiaanId}: unggah gagal`, e);
    return { ok: false, kode: 'GAGAL', pesan: 'Dokumen TOR gagal disimpan ke penyimpanan.' };
  }
  const d = await db.dokumen.create({
    data: {
      kepanitiaan_id: kepanitiaanId,
      jenis: 'TOR',
      format: 'DOCX',
      storage_key: key,
      file_size: BigInt(isiDocx.length),
      generated_by: konteks.sesi.userId,
    },
    select: { id: true },
  });
  return { ok: true, dokumen_id: d.id, ukuran: isiDocx.length };
}

/** Dokumen TOR terakhir yang dapat diunduh ulang; null bila belum pernah dibuat / tak terlihat. */
export async function dokumenTorTerakhir(konteks: Konteks, kepanitiaanId: string) {
  const tor = await muatTor(konteks, kepanitiaanId);
  if (!tor) return null;
  const d = await db.dokumen.findFirst({
    where: { kepanitiaan_id: kepanitiaanId, jenis: 'TOR', format: 'DOCX' },
    orderBy: { created_at: 'desc' },
    select: { id: true, storage_key: true, created_at: true, file_size: true },
  });
  return d ? { ...d, nama_acara: tor.nama_acara } : null;
}
