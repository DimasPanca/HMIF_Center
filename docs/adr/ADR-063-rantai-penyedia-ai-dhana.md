# ADR-063 — Rantai penyedia AI untuk Dhana (Gemini → Groq → OpenRouter)

|                     |                                    |
| ------------------- | ---------------------------------- |
| **Status**          | Diterima                           |
| **Tanggal**         | 2026-11-02                         |
| **Diputuskan oleh** | Pemilik produk                     |
| **Melengkapi**      | ADR-060 §4, ADR-062                |

## Konteks

Kuota Gemini (paket gratis) habis saat pengujian (HTTP 429), sehingga Dhana tidak bisa menjawab. Pemilik
meminta cadangan otomatis: bila satu layanan habis, pindah ke layanan berikutnya, dan seterusnya.
Pemilik menyediakan kunci Groq (`gsk_…`, bukan Grok/xAI) dan OpenRouter.

## Keputusan

- `lib/dhana/penyedia.ts` mencoba penyedia berurutan: **Gemini** (`gemini-2.5-flash`) → **Groq**
  (`openai/gpt-oss-120b`) → **OpenRouter** (`openai/gpt-4o-mini`). Model dapat diganti lewat
  `GEMINI_MODEL`, `GROQ_MODEL`, `OPENROUTER_MODEL`.
- Pindah ke penyedia berikutnya bila: status bukan 2xx (termasuk 429 kuota), waktu habis 25 detik,
  galat jaringan, atau jawaban kosong. Penyedia tanpa kunci dilewati.
- Groq dan OpenRouter memakai format OpenAI chat completions lewat REST `fetch` — tanpa SDK baru
  (SYSTEM_DESIGN §2). Instruksi sistem, konteks hemat-token (ADR-062), dan pembersihan em dash sama
  untuk semua penyedia.
- Semua penyedia gagal → balasan cadangan berisi rujukan Guide/pasal (ADR-062 §6).
- Galat tiap penyedia dicatat di log server tanpa isi kunci. Respons API menyertakan `penyedia`
  (tidak ditampilkan di UI) untuk pemantauan.
- Kunci hanya di server (`.env.local` / Vercel); pemindai `check:secrets` mencakup ketiganya.

## Konsekuensi

- Jawaban dari model cadangan bisa sedikit berbeda gaya/akurasinya; konteks Guide yang lengkap
  adalah penjaga utama akurasi (mis. Panduan Umum §8 kini menegaskan pengaju tidak melihat siapa
  yang memeriksa).
- OpenRouter `gpt-4o-mini` memakai saldo berbayar; Groq memakai kuota gratisnya.
