/**
 * Test pembaca tabel import.
 *
 * Berkas ini adalah verifikasi kontrak T-048: `npm run test -- import`.
 *
 * Sebagian besar kasus di sini bukan karangan melainkan bentuk berkas yang
 * benar-benar keluar dari Excel dan Google Form — pemisah titik koma, BOM,
 * baris kosong berekor, sel berformula, dan koma di dalam nama. Semuanya gagal
 * DIAM bila tidak ditangani: tidak ada error, hanya baris yang hilang atau
 * kolom yang tiba-tiba "tidak dikenali".
 *
 * Sumber: docs/ai/tasks/P1-fondasi.md T-048 · USER_FLOW §9.1
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  bacaCsv,
  bacaTabel,
  bacaXlsx,
  barisUntukDisimpan,
  deteksiKolom,
  laporanCsv,
  parseTabel,
  type DefinisiKolom,
} from '../parse-tabel';

// ---------------------------------------------------------------------------
// Definisi uji — meniru bentuk yang dipakai T-048
// ---------------------------------------------------------------------------

const KOLOM: DefinisiKolom[] = [
  { kunci: 'nama_lengkap', label: 'Nama Lengkap', alias: ['Nama'], wajib: true },
  { kunci: 'nim', label: 'NIM', wajib: true },
  { kunci: 'email', label: 'Email', alias: ['Alamat Email'], wajib: true },
  { kunci: 'angkatan', label: 'Angkatan' },
];

const SKEMA = z.object({
  nama_lengkap: z.string().trim().min(3, 'Nama minimal 3 karakter.'),
  nim: z
    .string()
    .trim()
    .regex(/^\d{8,12}$/, 'NIM harus 8-12 digit angka.'),
  email: z.email('Format email tidak valid.'),
  angkatan: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : Number(v)))
    .pipe(z.number().int().min(2000).max(2100).optional()),
});

type Baris = z.infer<typeof SKEMA>;

const csvBersih = [
  'Nama Lengkap,NIM,Email,Angkatan',
  'Nadia Putri,3337220001,nadia@untirta.ac.id,2022',
  'Raka Pratama,3337220002,raka@untirta.ac.id,2022',
].join('\n');

// ---------------------------------------------------------------------------
// bacaCsv
// ---------------------------------------------------------------------------

describe('bacaCsv — bentuk berkas yang benar-benar keluar dari Excel', () => {
  it('membaca CSV berpemisah koma', () => {
    const m = bacaCsv(csvBersih);
    expect(m).toHaveLength(3);
    expect(m[0]).toEqual(['Nama Lengkap', 'NIM', 'Email', 'Angkatan']);
  });

  // Excel berbahasa Indonesia menyimpan CSV dengan ';' karena koma dipakai
  // sebagai pemisah desimal. Dibaca dengan koma, seluruh baris menjadi SATU
  // kolom — dan gejalanya bukan error melainkan "semua kolom tidak dikenali".
  it('mendeteksi pemisah titik koma', () => {
    const m = bacaCsv('Nama;NIM;Email\nNadia;3337220001;n@u.test');
    expect(m[0]).toEqual(['Nama', 'NIM', 'Email']);
    expect(m[1]![1]).toBe('3337220001');
  });

  it('mendeteksi pemisah tab', () => {
    const m = bacaCsv('Nama\tNIM\nNadia\t3337220001');
    expect(m[0]).toEqual(['Nama', 'NIM']);
  });

  it('membuang BOM UTF-8', () => {
    const m = bacaCsv('﻿Nama,NIM\nNadia,3337220001');
    // Tanpa ini, kolom pertama bernama "﻿Nama" dan tidak pernah cocok
    // dengan definisi mana pun.
    expect(m[0]![0]).toBe('Nama');
  });

  it('menangani CRLF', () => {
    const m = bacaCsv('Nama,NIM\r\nNadia,3337220001\r\n');
    expect(m).toHaveLength(2);
    expect(m[1]![1]).toBe('3337220001');
  });

  it('koma di dalam medan berkutip tidak memecah kolom', () => {
    const m = bacaCsv('Nama,Kota\n"Putri, Nadia",Serang');
    expect(m[1]).toEqual(['Putri, Nadia', 'Serang']);
  });

  it('tanda kutip ganda di dalam medan berkutip', () => {
    const m = bacaCsv('Nama\n"Nadia ""Nad"" Putri"');
    expect(m[1]![0]).toBe('Nadia "Nad" Putri');
  });

  // Pemisahan per-baris yang naif akan memotong medan ini menjadi dua baris,
  // dan sisa berkasnya bergeser satu kolom tanpa satu pun error.
  it('baris baru di dalam medan berkutip tidak memecah baris', () => {
    const m = bacaCsv('Nama,Alamat\n"Nadia","Jl. Merdeka\nNo. 10"');
    expect(m).toHaveLength(2);
    expect(m[1]![1]).toBe('Jl. Merdeka\nNo. 10');
  });

  // Excel gemar menyisakan puluhan baris kosong di bawah data. Tanpa ini,
  // pratinjau melaporkan "37 baris error" untuk berkas yang sebenarnya bersih.
  it('membuang baris yang seluruh selnya kosong', () => {
    const m = bacaCsv('Nama,NIM\nNadia,3337220001\n,\n,\n');
    expect(m).toHaveLength(2);
  });

  it('berkas kosong menghasilkan matriks kosong', () => {
    expect(bacaCsv('')).toEqual([]);
    expect(bacaCsv('   \n  \n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deteksiKolom
// ---------------------------------------------------------------------------

describe('deteksiKolom', () => {
  it('mencocokkan judul apa adanya', () => {
    const h = deteksiKolom(['Nama Lengkap', 'NIM', 'Email'], KOLOM);
    expect(h.peta.nama_lengkap).toBe(0);
    expect(h.peta.nim).toBe(1);
    expect(h.peta.email).toBe(2);
  });

  // Tanpa normalisasi, tiap variasi ejaan harus ditulis sebagai alias — dan
  // yang terlupa muncul sebagai kolom tak dikenal yang membingungkan.
  it('mencocokkan walau beda huruf besar, garis bawah, dan spasi ganda', () => {
    const h = deteksiKolom(['nama_lengkap', 'n i m'.replace(/ /g, ''), 'EMAIL'], KOLOM);
    expect(h.peta.nama_lengkap).toBe(0);
    expect(h.peta.email).toBe(2);
  });

  it('mengenali alias', () => {
    const h = deteksiKolom(['Nama', 'NIM', 'Alamat Email'], KOLOM);
    expect(h.peta.nama_lengkap).toBe(0);
    expect(h.peta.email).toBe(2);
  });

  it('kolom yang tidak dikenali dilaporkan, bukan dibuang diam-diam', () => {
    const h = deteksiKolom(['Nama', 'NIM', 'Email', 'Catatan Panitia'], KOLOM);
    expect(h.takDikenal).toEqual(['Catatan Panitia']);
  });

  it('kolom wajib yang hilang dilaporkan', () => {
    const h = deteksiKolom(['Nama', 'Angkatan'], KOLOM);
    expect(h.hilang.sort()).toEqual(['email', 'nim']);
  });

  it('satu kolom berkas tidak dipakai dua definisi', () => {
    // "Nama" cocok untuk alias nama_lengkap; ia tidak boleh ikut dipakai lagi.
    const h = deteksiKolom(['Nama', 'Nama Lengkap', 'NIM', 'Email'], KOLOM);
    expect(h.peta.nama_lengkap).toBe(0);
    expect(h.takDikenal).toContain('Nama Lengkap');
  });
});

// ---------------------------------------------------------------------------
// parseTabel
// ---------------------------------------------------------------------------

describe('parseTabel — tiga kelas baris (USER_FLOW 9.1)', () => {
  it('baris lengkap berstatus VALID', () => {
    const h = parseTabel<Baris>(bacaCsv(csvBersih), KOLOM, SKEMA);
    expect(h.ringkas).toEqual({ total: 2, valid: 2, peringatan: 0, error: 0 });
    expect(h.baris[0]!.data!.nim).toBe('3337220001');
  });

  // USER_FLOW §9.1 menyebut "NIM kosong" sebagai ERROR.
  it('NIM kosong berstatus ERROR dan datanya null', () => {
    const csv = 'Nama Lengkap,NIM,Email\nNadia Putri,,nadia@untirta.ac.id';
    const h = parseTabel<Baris>(bacaCsv(csv), KOLOM, SKEMA);

    expect(h.ringkas.error).toBe(1);
    expect(h.baris[0]!.data).toBeNull();
    expect(h.baris[0]!.masalah[0]!.kolom).toBe('nim');
  });

  it('nomor baris menunjuk berkas asli, bukan indeks array', () => {
    const csv = `Nama Lengkap,NIM,Email\nA B,3337220001,a@u.test\nC D,salah,c@u.test`;
    const h = parseTabel<Baris>(bacaCsv(csv), KOLOM, SKEMA);
    // Baris data kedua berada di baris KETIGA berkas. Angka yang meleset
    // membuat pengguna memperbaiki baris yang salah.
    expect(h.baris[1]!.nomor).toBe(3);
  });

  // USER_FLOW §9.1 menyebut "NIM duplikat" sebagai PERINGATAN, bukan ERROR:
  // sistem tidak dapat membedakan ekspor ganda dari salah ketik, jadi ia tidak
  // boleh memutuskan.
  it('duplikat di dalam berkas berstatus PERINGATAN, bukan ERROR', () => {
    const csv = [
      'Nama Lengkap,NIM,Email',
      'Nadia Putri,3337220001,nadia@untirta.ac.id',
      'Nadia P,3337220001,nadia2@untirta.ac.id',
    ].join('\n');

    const h = parseTabel<Baris>(bacaCsv(csv), KOLOM, SKEMA, { kunciUnik: 'nim' });
    expect(h.ringkas).toEqual({ total: 2, valid: 0, peringatan: 2, error: 0 });
  });

  it('kedua kemunculan ditandai, bukan hanya yang kedua', () => {
    const csv = [
      'Nama Lengkap,NIM,Email',
      'Nadia Putri,3337220001,nadia@untirta.ac.id',
      'Nadia P,3337220001,nadia2@untirta.ac.id',
    ].join('\n');

    const h = parseTabel<Baris>(bacaCsv(csv), KOLOM, SKEMA, { kunciUnik: 'nim' });
    // Menandai hanya yang kedua membuat pengguna mengira baris pertamanya
    // bersih, lalu bingung kenapa "duplikat" hanya satu.
    expect(h.baris[0]!.status).toBe('PERINGATAN');
    expect(h.baris[1]!.status).toBe('PERINGATAN');
  });

  it('duplikat terhadap sistem ditandai lewat predikat yang disuntik', () => {
    const h = parseTabel<Baris>(bacaCsv(csvBersih), KOLOM, SKEMA, {
      kunciUnik: 'nim',
      sudahAda: (nilai) => nilai === '3337220001',
    });

    expect(h.baris[0]!.status).toBe('PERINGATAN');
    expect(h.baris[0]!.masalah[0]!.pesan).toContain('sudah terdaftar');
    expect(h.baris[1]!.status).toBe('VALID');
  });

  it('kolom wajib yang hilang menggagalkan seluruh baris dengan sebab yang sama', () => {
    const csv = 'Nama Lengkap,Angkatan\nNadia Putri,2022';
    const h = parseTabel<Baris>(bacaCsv(csv), KOLOM, SKEMA);

    expect(h.hilang.sort()).toEqual(['email', 'nim']);
    expect(h.baris[0]!.status).toBe('ERROR');
    expect(h.baris[0]!.masalah[0]!.pesan).toContain('Kolom wajib belum dipetakan');
  });

  it('pemetaan manual menimpa deteksi otomatis', () => {
    // Berkas dengan judul yang tidak dikenali sama sekali; pengguna memetakannya
    // sendiri di layar pemetaan.
    const csv = 'A,B,C\nNadia Putri,3337220001,nadia@untirta.ac.id';
    const h = parseTabel<Baris>(bacaCsv(csv), KOLOM, SKEMA, {
      petaManual: { nama_lengkap: 0, nim: 1, email: 2 },
    });

    expect(h.ringkas.valid).toBe(1);
    expect(h.baris[0]!.data!.email).toBe('nadia@untirta.ac.id');
  });

  it('aturan tambahan dari pemanggil ikut dinilai', () => {
    const h = parseTabel<Baris>(bacaCsv(csvBersih), KOLOM, SKEMA, {
      periksaTambahan: (d) =>
        d.email.endsWith('@untirta.ac.id')
          ? []
          : [{ tingkat: 'PERINGATAN', kolom: 'email', pesan: 'Bukan email kampus.' }],
    });
    expect(h.ringkas.valid).toBe(2);
  });

  it('batas baris melindungi dari berkas yang tidak masuk akal', () => {
    const banyak = ['Nama Lengkap,NIM,Email'];
    for (let i = 0; i < 50; i++) {
      banyak.push(`Orang ${i},33372200${String(i).padStart(2, '0')},o${i}@untirta.ac.id`);
    }
    const h = parseTabel<Baris>(bacaCsv(banyak.join('\n')), KOLOM, SKEMA, { batasBaris: 10 });
    expect(h.ringkas.total).toBe(10);
  });

  it('matriks kosong tidak melempar', () => {
    const h = parseTabel<Baris>([], KOLOM, SKEMA);
    expect(h.ringkas.total).toBe(0);
    expect(h.hilang.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Selesai bila — 100 baris, duplikat dapat dilewati
// ---------------------------------------------------------------------------

describe('Selesai bila T-048', () => {
  /** 100 baris: 92 bersih, 4 pasang NIM kembar, 2 NIM kosong, 2 email salah. */
  function berkas100(): string {
    const baris = ['Nama Lengkap,NIM,Email,Angkatan'];
    for (let i = 0; i < 92; i++) {
      baris.push(`Orang ${i},3337${String(220000 + i)},o${i}@untirta.ac.id,2022`);
    }
    baris.push('Kembar A,3337220001,kembar.a@untirta.ac.id,2022');
    baris.push('Kembar B,3337220002,kembar.b@untirta.ac.id,2022');
    baris.push('Kembar C,3337220003,kembar.c@untirta.ac.id,2022');
    baris.push('Kembar D,3337220004,kembar.d@untirta.ac.id,2022');
    baris.push('Tanpa NIM Satu,,tn1@untirta.ac.id,2022');
    baris.push('Tanpa NIM Dua,,tn2@untirta.ac.id,2022');
    baris.push('Email Salah Satu,3337220501,bukan-email,2022');
    baris.push('Email Salah Dua,3337220502,juga-bukan,2022');
    return baris.join('\n');
  }

  const hasil = () =>
    parseTabel<Baris>(bacaCsv(berkas100()), KOLOM, SKEMA, { kunciUnik: 'nim' });

  it('100 baris terbaca dan terklasifikasi tanpa menyentuh apa pun', () => {
    const h = hasil();
    expect(h.ringkas.total).toBe(100);
    expect(h.ringkas.error).toBe(4); // 2 NIM kosong + 2 email salah
    expect(h.ringkas.peringatan).toBe(8); // 4 pasang NIM kembar
    expect(h.ringkas.valid).toBe(88);
  });

  it('NIM duplikat ditandai dan dapat dilewati satuan', () => {
    const h = hasil();
    const kembar = h.baris.filter((b) => b.masalah.some((m) => m.pesan.includes('2 kali')));
    expect(kembar).toHaveLength(8);

    // Kontrak butir 3: baris bermasalah dilewati satuan, sisanya tetap diimpor.
    const lewati = kembar.filter((_, i) => i % 2 === 1).map((b) => b.nomor);
    const disimpan = barisUntukDisimpan(hasil(), lewati);
    expect(disimpan).toHaveLength(92); // 88 valid + 8 peringatan - 4 dilewati
  });

  // Klausa "Jangan" T-048: jangan menyimpan apa pun sebelum konfirmasi.
  // Modul ini tidak punya akses database sama sekali, jadi bentuknya sendiri
  // yang menjamin — bukan disiplin pemanggil.
  it('baris ERROR tidak pernah ikut disimpan, dicentang atau tidak', () => {
    const h = hasil();
    const nomorError = h.baris.filter((b) => b.status === 'ERROR').map((b) => b.nomor);

    expect(barisUntukDisimpan(h)).toHaveLength(96);
    expect(barisUntukDisimpan(h, nomorError)).toHaveLength(96);
  });
});

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------

describe('laporanCsv', () => {
  it('memuat baris ERROR dan PERINGATAN sekaligus', () => {
    const csv = [
      'Nama Lengkap,NIM,Email',
      'Nadia Putri,3337220001,nadia@untirta.ac.id',
      'Nadia P,3337220001,nadia2@untirta.ac.id',
      'Tanpa NIM,,x@untirta.ac.id',
    ].join('\n');

    const laporan = laporanCsv(parseTabel<Baris>(bacaCsv(csv), KOLOM, SKEMA, { kunciUnik: 'nim' }));

    // Memisahkannya menjadi dua berkas membuat orang memperbaiki separuh lalu
    // mengunggah ulang.
    expect(laporan).toContain('PERINGATAN');
    expect(laporan).toContain('ERROR');
  });

  it('baris VALID tidak ikut', () => {
    const laporan = laporanCsv(parseTabel<Baris>(bacaCsv(csvBersih), KOLOM, SKEMA));
    expect(laporan.trim().split('\r\n')).toHaveLength(1); // hanya header
  });

  it('diawali BOM supaya Excel tidak merusak huruf beraksen', () => {
    expect(laporanCsv(parseTabel<Baris>(bacaCsv(csvBersih), KOLOM, SKEMA))[0]).toBe('﻿');
  });

  it('pesan berkoma tidak memecah kolom laporan', () => {
    // Barisnya sengaja SAH. `periksaTambahan` hanya dipanggil untuk baris yang
    // lolos skema — baris yang sudah ERROR tidak perlu diperiksa lebih jauh,
    // dan memakai baris rusak di sini membuat test hijau tanpa pernah menguji
    // pengutipannya.
    const laporan = laporanCsv(
      parseTabel<Baris>(bacaCsv(csvBersih), KOLOM, SKEMA, {
        periksaTambahan: () => [{ tingkat: 'PERINGATAN', pesan: 'satu, dua, tiga' }],
      }),
    );
    expect(laporan).toContain('"satu, dua, tiga"');
  });
});

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/**
 * Membuat XLSX di memori dengan exceljs, lalu membacanya kembali.
 *
 * Ditulis dengan pustaka yang sama yang membacanya, dan itu memang batasnya:
 * yang diuji bukan kompatibilitas dengan Excel sungguhan melainkan bahwa
 * `selKeTeks` menangani BENTUK nilai yang dikembalikan exceljs — angka, tanggal,
 * rich text, dan sel berformula. Keempatnya bukan string, dan keempatnya masuk
 * ke `parseTabel` sebagai teks kalau tidak diurus.
 */
async function buatXlsx(baris: unknown[][]): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  baris.forEach((b) => ws.addRow(b));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('bacaXlsx', () => {
  // `exceljs` dimuat dinamis oleh bacaXlsx. Pemuatan dinginnya pernah melewati
  // batas 15 dtk test pertama di blok ini saat CPU sibuk (verify berjalan
  // bersama dev server) — yang gagal adalah waktu muat modul, bukan logikanya.
  // Dimuat sekali di sini, dengan batas waktu sendiri.
  beforeAll(async () => {
    await import('exceljs');
  }, 60_000);

  it('membaca sheet pertama menjadi matriks teks', async () => {
    const buf = await buatXlsx([
      ['Nama Lengkap', 'NIM', 'Email'],
      ['Nadia Putri', '3337220001', 'nadia@untirta.ac.id'],
    ]);
    const m = await bacaXlsx(buf);

    expect(m).toHaveLength(2);
    expect(m[0]).toEqual(['Nama Lengkap', 'NIM', 'Email']);
  });

  // NIM yang diketik tanpa tanda kutip menjadi ANGKA di Excel. Dibaca apa
  // adanya ia bertipe number, dan skema yang menuntut string menolak seluruh
  // berkas dengan pesan yang menuduh formatnya.
  it('sel angka menjadi teks', async () => {
    const buf = await buatXlsx([
      ['Nama Lengkap', 'NIM', 'Email'],
      ['Nadia Putri', 3337220001, 'nadia@untirta.ac.id'],
    ]);
    const m = await bacaXlsx(buf);
    expect(m[1]![1]).toBe('3337220001');
  });

  it('sel rich text disatukan', async () => {
    const buf = await buatXlsx([
      ['Nama Lengkap'],
      [{ richText: [{ text: 'Nadia ' }, { text: 'Putri' }] }],
    ]);
    const m = await bacaXlsx(buf);
    expect(m[1]![0]).toBe('Nadia Putri');
  });

  it('sel berformula memakai hasilnya, bukan rumusnya', async () => {
    const buf = await buatXlsx([['Total'], [{ formula: 'A1&"x"', result: 'Totalx' }]]);
    const m = await bacaXlsx(buf);
    expect(m[1]![0]).toBe('Totalx');
  });

  it('baris kosong dibuang', async () => {
    const buf = await buatXlsx([['Nama'], ['Nadia'], [null], ['']]);
    const m = await bacaXlsx(buf);
    expect(m).toHaveLength(2);
  });

  it('menyatu dengan parseTabel', async () => {
    const buf = await buatXlsx([
      ['Nama Lengkap', 'NIM', 'Email', 'Angkatan'],
      ['Nadia Putri', 3337220001, 'nadia@untirta.ac.id', 2022],
      ['NIM Kosong', '', 'x@untirta.ac.id', 2022],
    ]);
    const h = parseTabel<Baris>(await bacaXlsx(buf), KOLOM, SKEMA, { kunciUnik: 'nim' });

    expect(h.ringkas).toEqual({ total: 2, valid: 1, peringatan: 0, error: 1 });
    expect(h.baris[0]!.data!.angkatan).toBe(2022);
  });
});

describe('bacaTabel', () => {
  it('memilih pembaca dari ekstensi', async () => {
    const csv = Buffer.from('Nama,NIM\nNadia,3337220001', 'utf8');
    expect(await bacaTabel('data.csv', csv)).toHaveLength(2);

    const xlsx = await buatXlsx([['Nama'], ['Nadia']]);
    expect(await bacaTabel('data.xlsx', xlsx)).toHaveLength(2);
  });

  it('format tak didukung ditolak dengan pesan yang menyebut formatnya', async () => {
    await expect(bacaTabel('data.pdf', Buffer.from(''))).rejects.toThrow('.pdf');
  });
});
