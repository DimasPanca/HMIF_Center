/**
 * Rantai penyedia AI Dhana (ADR-063): Gemini → Groq → OpenRouter. Bila satu penyedia gagal (kuota
 * habis/429, galat 5xx, waktu habis, atau jawaban kosong), Dhana otomatis mencoba penyedia
 * berikutnya. Penyedia tanpa kunci dilewati. Semua lewat REST `fetch` (tanpa SDK); kunci hanya di
 * server.
 */

export interface PesanAi {
  peran: 'pengguna' | 'dhana';
  teks: string;
}

export interface HasilAi {
  jawaban: string;
  penyedia: string;
}

export interface GagalAi {
  penyedia: string;
  status: number;
  pesan: string;
}

interface Penyedia {
  nama: string;
  tersedia: () => boolean;
  tanya: (sistem: string, pesan: PesanAi[], sinyal: AbortSignal) => Promise<{ status: number; jawaban: string | null; galat?: string }>;
}

const MAKS_TOKEN = 900;
const BATAS_WAKTU_MS = 25_000;

const gemini: Penyedia = {
  nama: 'gemini',
  tersedia: () => !!process.env.GEMINI_API_KEY,
  async tanya(sistem, pesan, sinyal) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistem }] },
        contents: pesan.map((p) => ({ role: p.peran === 'pengguna' ? 'user' : 'model', parts: [{ text: p.teks }] })),
        generationConfig: { temperature: 0.3, maxOutputTokens: MAKS_TOKEN, thinkingConfig: { thinkingBudget: 0 } },
      }),
      cache: 'no-store',
      signal: sinyal,
    });
    const d = (await r.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      error?: { message?: string };
    };
    const jawaban = d.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('').trim() || null;
    return { status: r.status, jawaban: r.ok ? jawaban : null, galat: d.error?.message ?? d.candidates?.[0]?.finishReason };
  },
};

/** Penyedia berformat OpenAI chat completions (Groq, OpenRouter). */
function kompatibelOpenAi(nama: string, url: string, envKunci: string, envModel: string, modelBawaan: string, header: () => Record<string, string> = () => ({})): Penyedia {
  return {
    nama,
    tersedia: () => !!process.env[envKunci],
    async tanya(sistem, pesan, sinyal) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env[envKunci]}`, ...header() },
        body: JSON.stringify({
          model: process.env[envModel] || modelBawaan,
          messages: [
            { role: 'system', content: sistem },
            ...pesan.map((p) => ({ role: p.peran === 'pengguna' ? 'user' : 'assistant', content: p.teks })),
          ],
          temperature: 0.3,
          max_tokens: MAKS_TOKEN,
        }),
        cache: 'no-store',
        signal: sinyal,
      });
      const d = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
      const jawaban = d.choices?.[0]?.message?.content?.trim() || null;
      return { status: r.status, jawaban: r.ok ? jawaban : null, galat: d.error?.message };
    },
  };
}

const groq = kompatibelOpenAi('groq', 'https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY', 'GROQ_MODEL', 'openai/gpt-oss-120b');

const openRouter = kompatibelOpenAi(
  'openrouter',
  'https://openrouter.ai/api/v1/chat/completions',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'openai/gpt-4o-mini',
  () => ({ 'X-Title': 'HMIF Center', ...(process.env.NEXT_PUBLIC_APP_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL } : {}) }),
);

export const RANTAI_PENYEDIA: readonly Penyedia[] = [gemini, groq, openRouter];

/**
 * Coba penyedia satu per satu. Hasil pertama yang berhasil dipakai; galat tiap penyedia dicatat
 * (tanpa isi kunci) untuk log. `null` = semua penyedia gagal atau tidak ada yang dikonfigurasi.
 */
export async function tanyaAi(
  sistem: string,
  pesan: PesanAi[],
  rantai: readonly Penyedia[] = RANTAI_PENYEDIA,
): Promise<{ hasil: HasilAi | null; gagal: GagalAi[] }> {
  const gagal: GagalAi[] = [];
  for (const p of rantai) {
    if (!p.tersedia()) continue;
    try {
      const r = await p.tanya(sistem, pesan, AbortSignal.timeout(BATAS_WAKTU_MS));
      if (r.jawaban) return { hasil: { jawaban: r.jawaban, penyedia: p.nama }, gagal };
      gagal.push({ penyedia: p.nama, status: r.status, pesan: (r.galat ?? 'tanpa jawaban').slice(0, 200) });
    } catch (e) {
      gagal.push({ penyedia: p.nama, status: 0, pesan: e instanceof Error ? e.message.slice(0, 200) : 'galat jaringan' });
    }
  }
  return { hasil: null, gagal };
}

/** Ada minimal satu penyedia yang dikonfigurasi. */
export const adaPenyedia = () => RANTAI_PENYEDIA.some((p) => p.tersedia());
