/**
 * Dhana (ADR-060, ADR-062, ADR-063): POST {pesan:[{peran,teks}]} → {jawaban, sumber}. Hanya pengguna
 * yang masuk; batas pertanyaan per jam per pengguna. Jawaban disusun oleh rantai penyedia AI
 * (Gemini → Groq → OpenRouter, `lib/dhana/penyedia.ts`) dengan kunci yang hanya ada di server.
 * Percakapan tidak disimpan.
 */

import { konteksSaatIni } from '@/lib/auth/guard';
import { muatPengetahuan } from '@/lib/dhana/pengetahuan';
import { adaPenyedia, tanyaAi } from '@/lib/dhana/penyedia';
import { instruksiSistem, pilihKonteks, SkemaChatDhana, tanpaEmDash } from '@/lib/dhana/prompt';
import { muatIndeks } from '@/lib/guide/sumber';
import { gagal, sukses } from '@/lib/http/respond';
import { cekBatas, respons429 } from '@/lib/security/rate-limit';

const BATAS = { batas: 30, jendelaDetik: 60 * 60 };
const TANPA_CACHE = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) return gagal('TIDAK_TERAUTENTIKASI', 'Silakan masuk terlebih dahulu.', { status: 401 });
  if (!adaPenyedia()) return gagal('LAYANAN_TIDAK_TERSEDIA', 'Dhana belum dikonfigurasi. Hubungi Admin.', { status: 503 });

  let masukan: unknown;
  try {
    masukan = await request.json();
  } catch {
    return gagal('VALIDASI_GAGAL', 'Pesan tidak dapat dibaca.', { status: 422 });
  }
  const parse = SkemaChatDhana.safeParse(masukan);
  if (!parse.success) return gagal('VALIDASI_GAGAL', parse.error.issues[0]?.message ?? 'Pesan tidak valid.', { status: 422 });

  const batas = await cekBatas(`dhana:${konteks.sesi.userId}`, BATAS.batas, BATAS.jendelaDetik);
  if (!batas.ok) return respons429(batas, 'Kamu sudah bertanya cukup banyak dalam satu jam. Coba lagi sebentar lagi, ya.');

  const [indeks, aturan] = await Promise.all([muatIndeks(), muatPengetahuan()]);
  const pilihan = pilihKonteks(indeks, parse.data.pesan, aturan);
  // Rujukan: bagian Guide (bisa dibuka) dan pasal aturan organisasi yang dipakai sebagai konteks.
  const sumber = pilihan
    .slice(0, 4)
    .map((b) => ({ dokId: b.dokId, id: b.id, judul: tanpaEmDash(b.judul), dokJudul: tanpaEmDash(b.dokJudul) }));

  const { hasil, gagal: daftarGagal } = await tanyaAi(instruksiSistem(pilihan, konteks.sesi.namaLengkap), parse.data.pesan);
  for (const g of daftarGagal) console.warn(`[dhana] ${g.penyedia} ${g.status}: ${g.pesan}`);

  if (!hasil) {
    // Semua penyedia gagal (mis. kuota habis di semuanya): tetap bantu dengan rujukan paling relevan.
    if (sumber.length)
      return sukses(
        {
          jawaban: 'Layanan AI Dhana sedang tidak tersedia, jadi aku belum bisa menyusun jawaban. Bagian berikut kemungkinan menjawab pertanyaanmu:',
          sumber,
          cadangan: true,
        },
        { headers: TANPA_CACHE },
      );
    return gagal('LAYANAN_TIDAK_TERSEDIA', 'Layanan AI Dhana sedang tidak tersedia. Coba lagi beberapa saat lagi, atau cari di Guide.', {
      status: 503,
      headers: TANPA_CACHE,
    });
  }

  return sukses(
    {
      // Jaga-jaga: model kadang tetap memakai em dash walau sudah dilarang.
      jawaban: tanpaEmDash(hasil.jawaban),
      sumber,
      penyedia: hasil.penyedia,
    },
    { headers: TANPA_CACHE },
  );
}
