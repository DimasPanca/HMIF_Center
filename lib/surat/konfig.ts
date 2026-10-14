/**
 * konfig — pembaca konfigurasi persuratan dari server. Server-only.
 *
 * Hasilnya diteruskan ke `buatSkemaSurat()` di sisi server **dan** dikirim
 * sebagai props ke form klien, sehingga keduanya membangun skema dari nilai
 * yang sama (K-04) tanpa satu pun default yang ditulis di kode (AGENT_RULES §4.5).
 *
 * Sumber: ADR-001 (kode administrasi dari app_config) · ADR-010 (PDF_ENABLED) ·
 *         migrasi 018 (app_config, tujuan_surat_preset)
 */

import { db } from '@/lib/db/client';
import type { KonfigSurat } from '@/lib/surat/field-schemas';
import { PRESET_TUJUAN_BAWAAN, type PresetTujuan } from '@/lib/surat/preset-tujuan';

if (typeof window !== 'undefined') {
  throw new Error('lib/surat/konfig.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

const KUNCI = ['kode_kegiatan_default', 'kota_default', 'kode_administrasi'] as const;

/**
 * Kunci yang hilang adalah kesalahan seed, bukan keadaan normal — migrasi 018
 * menuntut app_config berisi tepat lima kunci. Menolak terang-terangan lebih
 * baik daripada diam-diam memakai nilai karangan di surat resmi.
 */
export async function bacaKonfigSurat(): Promise<KonfigSurat> {
  const baris = await db.app_config.findMany({ where: { key: { in: [...KUNCI] } } });
  const nilai = new Map(baris.map((b) => [b.key, b.value]));

  const ambil = (k: (typeof KUNCI)[number]): string => {
    const v = nilai.get(k);
    if (typeof v !== 'string' || v.trim() === '') {
      throw new Error(`app_config.${k} kosong atau bukan teks. Periksa seed migrasi 018.`);
    }
    return v;
  };

  return {
    kodeKegiatanDefault: ambil('kode_kegiatan_default'),
    kotaDefault: ambil('kota_default'),
    kodeAdministrasi: ambil('kode_administrasi'),
    // Dibaca saat dipanggil, bukan saat modul dimuat (scripts/check-lazy-env.ts).
    pdfAktif: process.env.PDF_ENABLED === 'true',
  };
}

/** Preset aktif dari tabel yang dapat disunting Sekum; cermin seed bila tabel kosong. */
export async function bacaPresetTujuan(): Promise<PresetTujuan[]> {
  const baris = await db.tujuan_surat_preset.findMany({
    where: { is_active: true },
    orderBy: { urutan: 'asc' },
    select: { label: true, nama: true, alamat: true },
  });
  return baris.length > 0 ? baris : [...PRESET_TUJUAN_BAWAAN];
}

/**
 * Ketua Himpunan periode aktif — kolom kanan blok TTD di pratinjau (T-059).
 *
 * Hanya untuk ditampilkan. Siapa yang benar-benar menandatangani ditetapkan saat
 * surat disetujui (ADR-028). Bila periode punya lebih dari satu KETUA (data uji),
 * yang dipakai yang paling awal didaftarkan supaya pratinjau tidak berganti-ganti.
 */
export async function bacaKetuaHimpunan(periodeId: string): Promise<{ nama: string; nim: string } | null> {
  const r = await db.user_role.findFirst({
    where: { periode_id: periodeId, role: 'KETUA', app_user: { is_active: true } },
    orderBy: { created_at: 'asc' },
    select: { app_user: { select: { nama_lengkap: true, nim: true } } },
  });
  return r ? { nama: r.app_user.nama_lengkap, nim: r.app_user.nim } : null;
}
