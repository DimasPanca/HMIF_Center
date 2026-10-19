/**
 * Nota belanja demo: foto struk dibuat (sharp), diunggah lewat /api/images/upload
 * sebagai panitia, dikirim lewat /api/nota dengan alokasi ke item RAB, lalu
 * Bendahara memverifikasi / menolak / meminta perbaikan. Verifikasi menurunkan
 * PENGELUARAN dan RAB AKTUAL serta memajukan status RAB ke REALISASI.
 */

import sharp from 'sharp';

import type { InfoAkun } from './akun';
import { GagalApi, type Sesi } from './klien';
import { dari, ok, type Sql } from './konfig';
import type { HasilProker } from './proker';

type Rencana = 'VERIFIKASI' | 'MENUNGGU' | 'TOLAK' | 'PERBAIKI';

interface SpesifikasiNota {
  acara: 'dies' | 'sync';
  divisi: string;
  uploader: string;
  hari: number;
  toko: string;
  alamat: string;
  /** [fragmen nama item RAB | null = luar RAB, nominal, jumlahAktual?, hargaAktual?, uraianLuarRab?] */
  alokasi: Array<[item: string | null, nominal: number, jumlah?: number, harga?: number, uraian?: string]>;
  rencana: Rencana;
  keterangan?: string;
  catatan?: string;
}

const NOTA: SpesifikasiNota[] = [
  // ---- SYNCHRONIZE 2026 (berjalan) -------------------------------------------------
  { acara: 'sync', divisi: 'Perlengkapan', uploader: 'rnd1', hari: -6, toko: 'Percetakan Maju Jaya', alamat: 'Jl. Raya Serang KM 4, Cilegon', alokasi: [['Banner dan backdrop', 850_000, 1, 850_000]], rencana: 'VERIFIKASI', keterangan: 'Cetak banner utama dan backdrop' },
  { acara: 'sync', divisi: 'Perlengkapan', uploader: 'rnd1', hari: -5, toko: 'Percetakan Maju Jaya', alamat: 'Jl. Raya Serang KM 4, Cilegon', alokasi: [['ID card dan lanyard', 1_420_000, 240, 5_917]], rencana: 'VERIFIKASI', keterangan: 'ID card dan lanyard 240 set' },
  { acara: 'sync', divisi: 'Perlengkapan', uploader: 'rnd1', hari: -8, toko: 'Konveksi Cilegon Sablon', alamat: 'Jl. Sultan Ageng Tirtayasa 21', alokasi: [['Kaos panitia', 2_760_000, 40, 69_000]], rencana: 'VERIFIKASI', keterangan: 'Kaos panitia 40 pcs, nego harga' },
  { acara: 'sync', divisi: 'Humas', uploader: 'eks3', hari: -12, toko: 'Percetakan Maju Jaya', alamat: 'Jl. Raya Serang KM 4, Cilegon', alokasi: [['Cetak poster A3', 300_000], ['Cetak flyer', 240_000], ['Cetak proposal sponsorship', 150_000]], rencana: 'VERIFIKASI', keterangan: 'Poster, flyer, dan proposal sponsorship' },
  { acara: 'sync', divisi: 'Humas', uploader: 'eks3', hari: -4, toko: 'Meta Ads — struk pembayaran', alamat: 'Pembayaran daring', alokasi: [['Iklan media sosial', 450_000, 1, 450_000]], rencana: 'VERIFIKASI', keterangan: 'Iklan Instagram 7 hari' },
  { acara: 'sync', divisi: 'Konsumsi', uploader: 'int1', hari: -3, toko: 'Parkir & BBM survei vendor', alamat: 'Kuitansi tulis tangan', alokasi: [[null, 85_000, undefined, undefined, 'Parkir dan bensin survei katering']], rencana: 'VERIFIKASI', keterangan: 'Survei katering, di luar RAB' },
  { acara: 'sync', divisi: 'Acara', uploader: 'eks2', hari: -3, toko: 'Toko Piala Mandiri', alamat: 'Jl. Jenderal Sudirman 10, Cilegon', alokasi: [['Plakat penghargaan', 450_000, 3, 150_000]], rencana: 'MENUNGGU', keterangan: 'Plakat untuk tiga pembicara' },
  { acara: 'sync', divisi: 'Acara', uploader: 'eks2', hari: -2, toko: 'Percetakan Maju Jaya', alamat: 'Jl. Raya Serang KM 4, Cilegon', alokasi: [['Sertifikat peserta', 600_000, 200, 3_000]], rencana: 'MENUNGGU', keterangan: 'Cetak sertifikat peserta' },
  { acara: 'sync', divisi: 'Acara', uploader: 'eks2', hari: -1, toko: 'Toko Hadiah Ceria', alamat: 'Jl. Jenderal Sudirman 33, Cilegon', alokasi: [['Hadiah doorprize', 500_000, 10, 50_000]], rencana: 'MENUNGGU', keterangan: 'Hadiah doorprize' },
  { acara: 'sync', divisi: 'Konsumsi', uploader: 'int1', hari: -1, toko: 'Agen Air Sejuk', alamat: 'Jl. Merak Raya 5', alokasi: [['Air mineral', 540_000, 12, 45_000]], rencana: 'MENUNGGU', keterangan: 'Air mineral kemasan 12 dus' },
  { acara: 'sync', divisi: 'PDD', uploader: 'kominfo2', hari: -2, toko: 'Studio Foto (struk buram)', alamat: '—', alokasi: [['Jasa fotografer', 300_000, 1, 300_000]], rencana: 'TOLAK', keterangan: 'DP fotografer', catatan: 'Foto nota buram dan total tidak terbaca. Unggah ulang foto yang lebih jelas.' },
  { acara: 'sync', divisi: 'Perlengkapan', uploader: 'rnd1', hari: -2, toko: 'Rental Sound Cilegon', alamat: 'Jl. Kapten Dharmo 18', alokasi: [['Sewa sound system', 1_800_000, 1, 1_800_000]], rencana: 'PERBAIKI', keterangan: 'DP sewa sound system', catatan: 'Nominal 1.800.000 melebihi RAB (1.500.000). Periksa apakah ini pelunasan atau DP, lalu perbaiki alokasi.' },
  // ---- Dies Natalis (selesai) — seluruh nota terverifikasi ------------------------------
  { acara: 'dies', divisi: 'Acara', uploader: 'int3', hari: -25, toko: 'Toko Piala Mandiri', alamat: 'Jl. Jenderal Sudirman 10, Cilegon', alokasi: [['Piala pengurus', 1_020_000, 6, 170_000]], rencana: 'VERIFIKASI', keterangan: 'Piala pengurus berprestasi' },
  { acara: 'dies', divisi: 'Acara', uploader: 'int3', hari: -22, toko: 'Percetakan Maju Jaya', alamat: 'Jl. Raya Serang KM 4, Cilegon', alokasi: [['Sertifikat penghargaan', 120_000, 30, 4_000]], rencana: 'VERIFIKASI', keterangan: 'Cetak sertifikat' },
  { acara: 'dies', divisi: 'Acara', uploader: 'int3', hari: -17, toko: 'Kuitansi pengisi acara', alamat: 'Tanda terima bermaterai', alokasi: [['Honor pengisi acara', 1_500_000, 1, 1_500_000]], rencana: 'VERIFIKASI', keterangan: 'Honor grup musik' },
  { acara: 'dies', divisi: 'Konsumsi', uploader: 'kad3', hari: -17, toko: 'Katering Bu Haji Rohmah', alamat: 'Jl. Cilegon Lama 7', alokasi: [['Prasmanan tamu', 5_310_000, 118, 45_000]], rencana: 'VERIFIKASI', keterangan: 'Prasmanan 118 porsi' },
  { acara: 'dies', divisi: 'Konsumsi', uploader: 'kad3', hari: -18, toko: 'Toko Kue Manis', alamat: 'Ruko Cilegon Center B2', alokasi: [['Snack dan kue', 720_000, 1, 720_000]], rencana: 'VERIFIKASI', keterangan: 'Kue ulang tahun dan snack' },
  { acara: 'dies', divisi: 'Konsumsi', uploader: 'kad3', hari: -18, toko: 'Agen Air Sejuk', alamat: 'Jl. Merak Raya 5', alokasi: [['Air mineral', 360_000, 8, 45_000]], rencana: 'VERIFIKASI', keterangan: 'Air mineral 8 dus' },
  { acara: 'dies', divisi: 'Dokumentasi', uploader: 'kominfo2', hari: -17, toko: 'Studio Lensa Kita', alamat: 'Jl. Kapten Dharmo 3', alokasi: [['Jasa fotografer dan videografer', 1_400_000, 1, 1_400_000]], rencana: 'VERIFIKASI', keterangan: 'Foto dan video malam puncak' },
  { acara: 'dies', divisi: 'Dokumentasi', uploader: 'kominfo2', hari: -19, toko: 'Dekor Prima Event', alamat: 'Jl. Raya Merak 12', alokasi: [['Dekorasi panggung', 2_000_000, 1, 2_000_000]], rencana: 'VERIFIKASI', keterangan: 'Dekorasi panggung' },
  { acara: 'dies', divisi: 'Dokumentasi', uploader: 'kominfo2', hari: -20, toko: 'Percetakan Maju Jaya', alamat: 'Jl. Raya Serang KM 4, Cilegon', alokasi: [['Cetak backdrop', 650_000, 1, 650_000], [null, 45_000, undefined, undefined, 'Ongkos kirim backdrop']], rencana: 'VERIFIKASI', keterangan: 'Backdrop + ongkir (di luar RAB)' },
];

const rupiahTeks = (n: number): string => `Rp ${n.toLocaleString('id-ID')}`;
const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Foto struk: kertas krem, teks monospace, dengan sedikit variasi per toko. */
async function fotoStruk(s: SpesifikasiNota, total: number, no: number): Promise<{ master: Buffer; preview: Buffer; thumb: Buffer; lebar: number; tinggi: number }> {
  const lebar = 1000;
  const tinggi = 1400;
  const baris = s.alokasi
    .map(([item, nominal, jumlah, , uraian], i) => {
      const nama = esc((item ?? uraian ?? 'Pengeluaran').slice(0, 26));
      const qty = jumlah ? `${jumlah} x` : '';
      return `<text x="80" y="${470 + i * 70}" font-size="34" font-family="monospace" fill="#222">${nama}</text>
              <text x="80" y="${505 + i * 70}" font-size="30" font-family="monospace" fill="#555">${qty}</text>
              <text x="${lebar - 80}" y="${505 + i * 70}" font-size="34" font-family="monospace" fill="#222" text-anchor="end">${rupiahTeks(nominal)}</text>`;
    })
    .join('\n');
  const tgl = dari(s.hari);
  const svg = `<svg width="${lebar}" height="${tinggi}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${lebar}" height="${tinggi}" fill="#f2efe6"/>
    <rect x="30" y="30" width="${lebar - 60}" height="${tinggi - 60}" fill="none" stroke="#d9d4c3" stroke-width="3"/>
    <text x="${lebar / 2}" y="140" font-size="52" font-weight="bold" text-anchor="middle" font-family="monospace" fill="#1d1d1d">${esc(s.toko.toUpperCase().slice(0, 28))}</text>
    <text x="${lebar / 2}" y="195" font-size="30" text-anchor="middle" font-family="monospace" fill="#444">${esc(s.alamat.slice(0, 42))}</text>
    <line x1="80" y1="240" x2="${lebar - 80}" y2="240" stroke="#999" stroke-dasharray="14 8" stroke-width="4"/>
    <text x="80" y="300" font-size="32" font-family="monospace" fill="#333">No : ${String(2600 + no).padStart(5, '0')}</text>
    <text x="80" y="345" font-size="32" font-family="monospace" fill="#333">Tgl: ${tgl}</text>
    <text x="80" y="390" font-size="32" font-family="monospace" fill="#333">Kasir: 01</text>
    <line x1="80" y1="420" x2="${lebar - 80}" y2="420" stroke="#999" stroke-dasharray="14 8" stroke-width="4"/>
    ${baris}
    <line x1="80" y1="${1180}" x2="${lebar - 80}" y2="${1180}" stroke="#999" stroke-dasharray="14 8" stroke-width="4"/>
    <text x="80" y="1250" font-size="44" font-weight="bold" font-family="monospace" fill="#111">TOTAL</text>
    <text x="${lebar - 80}" y="1250" font-size="44" font-weight="bold" font-family="monospace" fill="#111" text-anchor="end">${rupiahTeks(total)}</text>
    <text x="${lebar / 2}" y="1330" font-size="28" text-anchor="middle" font-family="monospace" fill="#666">Terima kasih atas kunjungan Anda</text>
  </svg>`;
  const master = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  const [preview, thumb] = await Promise.all([
    sharp(master).resize(800, 1120).webp({ quality: 78 }).toBuffer(),
    sharp(master).resize(250, 350).webp({ quality: 70 }).toBuffer(),
  ]);
  return { master, preview, thumb, lebar, tinggi };
}

export async function isiNota(
  sql: Sql,
  sesi: Map<string, Sesi>,
  akun: Map<string, InfoAkun>,
  proker: Map<string, HasilProker>,
): Promise<void> {
  void akun;
  const bendum = sesi.get('bendum')!;
  let no = 0;
  const hitung = { VERIFIKASI: 0, MENUNGGU: 0, TOLAK: 0, PERBAIKI: 0 };

  for (const s of NOTA) {
    const kid = proker.get(s.acara)?.kepanitiaanId;
    if (!kid) continue;
    const uploader = sesi.get(s.uploader)!;
    const [div] = await sql<{ id: string }[]>`SELECT id::text FROM divisi WHERE kepanitiaan_id = ${kid}::uuid AND nama = ${s.divisi}`;
    if (!div) throw new Error(`Divisi "${s.divisi}" tidak ada di acara ${s.acara}`);

    const total = s.alokasi.reduce((a, x) => a + x[1], 0);
    const alokasi = [];
    for (const [item, nominal, jumlah, harga, uraian] of s.alokasi) {
      if (item === null) {
        alokasi.push({ rab_item_id: null, uraian_luar_rab: uraian ?? 'Pengeluaran di luar RAB', jumlah_aktual: null, harga_aktual: null, nominal });
        continue;
      }
      const [it] = await sql<{ id: string }[]>`
        SELECT i.id::text FROM rab_item i JOIN rab_section sc ON sc.id = i.section_id
        WHERE sc.divisi_id = ${div.id}::uuid AND i.jenis_barang ILIKE ${item + '%'} LIMIT 1`;
      if (!it) throw new Error(`Item RAB "${item}" tidak ditemukan di divisi ${s.divisi} (${s.acara})`);
      alokasi.push({ rab_item_id: it.id, uraian_luar_rab: null, jumlah_aktual: jumlah ?? null, harga_aktual: harga ?? null, nominal });
    }

    const foto = await fotoStruk(s, total, ++no);
    const up = await uploader.unggah('/api/images/upload', {
      master: { name: 'nota.jpg', mimeType: 'image/jpeg', buffer: foto.master },
      preview: { name: 'preview.webp', mimeType: 'image/webp', buffer: foto.preview },
      thumb: { name: 'thumb.webp', mimeType: 'image/webp', buffer: foto.thumb },
      original_width: String(foto.lebar),
      original_height: String(foto.tinggi),
      original_mime_type: 'image/jpeg',
      kind: 'DOKUMEN',
      is_scanned: 'true',
      original_filename: `nota-${s.toko.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${no}.jpg`,
    });
    if (!up.ok) throw new GagalApi(`unggah foto nota ${s.toko}`, up);

    const kirim = await uploader.wajib(
      'POST',
      '/api/nota',
      { divisi_id: div.id, image_id: up.data.id, tanggal_belanja: dari(s.hari), total_nota: total, keterangan: s.keterangan ?? null, alokasi },
      `kirim nota ${s.toko}`,
    );
    const notaId: string = kirim.data?.id ?? kirim.data?.nota?.id;

    if (s.rencana === 'VERIFIKASI') await bendum.wajib('POST', `/api/nota/${notaId}/verify`, {}, `verifikasi ${s.toko}`);
    else if (s.rencana === 'TOLAK') await bendum.wajib('POST', `/api/nota/${notaId}/reject`, { alasan: s.catatan }, `tolak ${s.toko}`);
    else if (s.rencana === 'PERBAIKI') await bendum.wajib('POST', `/api/nota/${notaId}/minta-perbaikan`, { alasan: s.catatan }, `perbaikan ${s.toko}`);
    hitung[s.rencana]++;
  }
  ok(`${NOTA.length} nota bergambar: ${hitung.VERIFIKASI} terverifikasi · ${hitung.MENUNGGU} menunggu · ${hitung.TOLAK} ditolak · ${hitung.PERBAIKI} perlu perbaikan`);
}
