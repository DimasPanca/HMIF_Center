/**
 * Prefill Proposal (T-096 kontrak 2 & 7) — MURNI, tanpa DB.
 *
 * Sumber, berurutan menurut kedekatan maknanya:
 *   TOR            nama, tujuan, sasaran, bentuk acara, waktu & tempat,
 *                  gambaran umum, rangkaian, penutup (placeholder template sama
 *                  persis — TEMPLATE_MAPPING §5.10)
 *   PROKER         latar belakang (deskripsi proker); tujuan/sasaran bila TOR kosong
 *   PANITIA        sekretaris = koordinator divisi kesekretariatan acara
 *   PROPOSAL_LAIN  landasan, asas, Ketua BEM, WD III, Kaprodi — sama untuk
 *                  semua kegiatan satu periode; diambil dari proposal terbaru
 *
 * `terapkanPrefill` hanya menyentuh field yang KOSONG atau masih bertanda
 * `asal` (belum disunting) — suntingan pengguna (`manual`) tidak pernah
 * ditimpa, termasuk field yang sengaja dikosongkan.
 */

import type { NodeProseMirror } from '@/lib/notulensi/sanitasi';
import { DOK_KOSONG, adaTeks, type DataTor } from '@/lib/tor/schema';
import {
  FIELD_PROPOSAL,
  fieldTerisi,
  proposalKosong,
  type Asal,
  type DataProposal,
  type IdFieldProposal,
  type Orang,
} from '@/lib/proposal/schema';

export interface SumberPrefill {
  nama_acara: string;
  /** null bila TOR belum pernah disimpan. */
  tor: DataTor | null;
  proker: { deskripsi: string | null; tujuan: string | null; sasaran: string | null };
  sekretaris: Orang | null;
  /** Proposal terbaru lain di periode yang sama (sudah dinormalisasi). */
  proposalLain: DataProposal | null;
}

const ada = (s: string | null | undefined): s is string => !!s && s.trim().length > 0;

/** Teks polos (baris = paragraf) → dokumen ProseMirror. */
export function dokDariTeks(t: string): NodeProseMirror {
  const par = t
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  return par.length
    ? {
        type: 'doc',
        content: par.map((x) => ({ type: 'paragraph', content: [{ type: 'text', text: x }] })),
      }
    : DOK_KOSONG;
}

function gabungDok(...dok: NodeProseMirror[]): NodeProseMirror {
  const isi = dok.filter(adaTeks).flatMap((d) => d.content ?? []);
  return isi.length ? { type: 'doc', content: isi } : DOK_KOSONG;
}

type Usulan = Partial<{ [K in IdFieldProposal]: { nilai: DataProposal[K]; asal: Asal } }>;

/** Nilai usulan per field beserta asalnya; field tanpa sumber tidak muncul. */
export function usulanPrefill(s: SumberPrefill): Usulan {
  const u: Usulan = {};
  const pasang = <K extends IdFieldProposal>(k: K, nilai: DataProposal[K], asal: Asal) => {
    const uji = { ...proposalKosong(), [k]: nilai } as DataProposal;
    if (fieldTerisi(uji, k)) (u as Record<string, unknown>)[k] = { nilai, asal };
  };
  const t = s.tor;
  if (t) {
    pasang('nama_kegiatan', t.nama_kegiatan, 'TOR');
    pasang('tujuan', t.tujuan.filter(ada), 'TOR');
    const estimasi =
      t.sasaran.estimasi_jumlah !== null
        ? dokDariTeks(
            `Estimasi jumlah peserta ${t.sasaran.estimasi_jumlah.toLocaleString('id-ID')} orang${
              t.sasaran.jumlah_kelompok !== null
                ? `, terbagi dalam ${t.sasaran.jumlah_kelompok.toLocaleString('id-ID')} kelompok`
                : ''
            }.`,
          )
        : DOK_KOSONG;
    pasang('sasaran', gabungDok(t.sasaran.uraian, estimasi), 'TOR');
    const sub = t.bentuk_acara.sub
      .filter((x) => ada(x.judul) || ada(x.uraian))
      .map((x) => dokDariTeks([x.judul, x.uraian].filter(ada).join(': ')));
    pasang('bentuk_acara', gabungDok(t.bentuk_acara.uraian, ...sub), 'TOR');
    pasang(
      'sesi',
      t.waktu_tempat.filter((w) => ada(w.sesi) || ada(w.tempat)),
      'TOR',
    );
    pasang('gambaran_umum', t.gambaran_umum, 'TOR');
    pasang(
      'rangkaian',
      t.rangkaian.filter((r) => ada(r.nama)),
      'TOR',
    );
    pasang('penutup', t.penutup, 'TOR');
  }
  if (!u.nama_kegiatan) pasang('nama_kegiatan', s.nama_acara, 'PROKER');
  if (ada(s.proker.deskripsi)) pasang('latar_belakang', dokDariTeks(s.proker.deskripsi), 'PROKER');
  if (!u.tujuan && ada(s.proker.tujuan))
    pasang(
      'tujuan',
      s.proker.tujuan
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean),
      'PROKER',
    );
  if (!u.sasaran && ada(s.proker.sasaran))
    pasang('sasaran', dokDariTeks(s.proker.sasaran), 'PROKER');
  if (s.sekretaris) pasang('sekretaris', s.sekretaris, 'PANITIA');
  const p = s.proposalLain;
  if (p) {
    pasang('landasan_kegiatan', p.landasan_kegiatan, 'PROPOSAL_LAIN');
    pasang('asas', p.asas, 'PROPOSAL_LAIN');
    pasang('ketua_bem', p.ketua_bem, 'PROPOSAL_LAIN');
    pasang('wd3', p.wd3, 'PROPOSAL_LAIN');
    pasang('kaprodi', p.kaprodi, 'PROPOSAL_LAIN');
  }
  return u;
}

/**
 * Menerapkan usulan ke proposal yang ada (atau kosong). Field yang sudah
 * disunting pengguna (terisi, tanpa `asal`) tidak disentuh.
 */
export function terapkanPrefill(lama: DataProposal | null, s: SumberPrefill): DataProposal {
  const hasil: DataProposal = structuredClone(lama ?? proposalKosong());
  const usulan = usulanPrefill(s);
  for (const f of FIELD_PROPOSAL) {
    const uFld = usulan[f.id];
    // Disunting pengguna (tercatat di `manual`, atau terisi tanpa tanda asal): tidak disentuh.
    if (hasil.manual.includes(f.id) || (fieldTerisi(hasil, f.id) && !hasil.asal[f.id])) continue;
    // Sumber yang kini kosong: nilai otomatis terakhir dipertahankan, tetap bertanda.
    if (!uFld) continue;
    (hasil as Record<string, unknown>)[f.id] = uFld.nilai;
    hasil.asal[f.id] = uFld.asal;
  }
  return hasil;
}
