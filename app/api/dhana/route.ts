/**
 * Dhana (ADR-060): POST {pesan:[{peran,teks}]} → {jawaban, sumber}. Hanya pengguna yang masuk;
 * batas pertanyaan per jam per pengguna. Gemini dipanggil lewat REST dengan kunci yang hanya ada
 * di server. Percakapan tidak disimpan.
 */

import { konteksSaatIni } from '@/lib/auth/guard';
import { muatPengetahuan } from '@/lib/dhana/pengetahuan';
import { instruksiSistem, pilihKonteks, SkemaChatDhana, tanpaEmDash } from '@/lib/dhana/prompt';
import { muatIndeks } from '@/lib/guide/sumber';
import { gagal, sukses } from '@/lib/http/respond';
import { cekBatas, respons429 } from '@/lib/security/rate-limit';

const BATAS = { batas: 30, jendelaDetik: 60 * 60 };
const TANPA_CACHE = { 'Cache-Control': 'no-store' };

interface JawabanGemini {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  error?: { message?: string };
}

export async function POST(request: Request) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) return gagal('TIDAK_TERAUTENTIKASI', 'Silakan masuk terlebih dahulu.', { status: 401 });

  const kunci = process.env.GEMINI_API_KEY;
  if (!kunci) return gagal('LAYANAN_TIDAK_TERSEDIA', 'Dhana belum dikonfigurasi. Hubungi Admin.', { status: 503 });

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
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': kunci },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruksiSistem(pilihan, konteks.sesi.namaLengkap) }] },
        contents: parse.data.pesan.map((p) => ({ role: p.peran === 'pengguna' ? 'user' : 'model', parts: [{ text: p.teks }] })),
        generationConfig: { temperature: 0.3, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return gagal('LAYANAN_TIDAK_TERSEDIA', 'Dhana sedang tidak dapat dihubungi. Coba lagi sebentar lagi.', { status: 503, headers: TANPA_CACHE });
  }

  const data = (await r.json().catch(() => ({}))) as JawabanGemini;
  const jawaban = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  const sumber = pilihan
    .slice(0, 4)
    .map((b) => ({ dokId: b.dokId, id: b.id, judul: tanpaEmDash(b.judul), dokJudul: tanpaEmDash(b.dokJudul) }));

  if (!r.ok || !jawaban) {
    console.warn(`[dhana] Gemini ${r.status}: ${data.error?.message?.slice(0, 200) ?? data.candidates?.[0]?.finishReason ?? 'tanpa jawaban'}`);
    // Layanan AI gagal (mis. kuota habis): tetap bantu dengan rujukan yang paling relevan.
    if (sumber.length)
      return sukses(
        {
          jawaban:
            r.status === 429
              ? 'Kuota layanan AI Dhana sedang habis, jadi aku belum bisa menyusun jawaban. Bagian berikut kemungkinan menjawab pertanyaanmu:'
              : 'Dhana belum bisa menyusun jawaban saat ini. Bagian berikut kemungkinan menjawab pertanyaanmu:',
          sumber,
          cadangan: true,
        },
        { headers: TANPA_CACHE },
      );
    return gagal(
      'LAYANAN_TIDAK_TERSEDIA',
      r.status === 429 ? 'Kuota layanan AI Dhana sedang habis. Coba lagi beberapa saat lagi, atau cari di Guide.' : 'Dhana belum bisa menjawab saat ini. Coba ulangi pertanyaannya.',
      { status: 503, headers: TANPA_CACHE },
    );
  }

  return sukses(
    {
      // Jaga-jaga: model kadang tetap memakai em dash walau sudah dilarang.
      jawaban: tanpaEmDash(jawaban),
      // Rujukan: bagian Guide (bisa dibuka) dan pasal aturan organisasi yang dipakai sebagai konteks.
      sumber,
    },
    { headers: TANPA_CACHE },
  );
}
