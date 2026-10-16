# ADR-033 — Nama loop `tor.docx` mengikuti TEMPLATE_MAPPING, nama kontrak T-095 dikirim sebagai alias

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-10-16 |
| **Task terkait** | T-095 |
| **Ditemukan oleh** | agent saat mengerjakan T-095 |

## Konteks

Kontrak T-095 (`docs/ai/tasks/P6-tor-proposal.md`, beku) mewajibkan loop
`{#tujuan}`, `{#waktu_tempat}`, `{#kondisi}`, `{#parameter}`, `{#rangkaian}`,
`{#rundown}`, `{#anggaran_divisi}` bekerja. `templates/tor.docx` — dibangun
`scripts/build-templates.ts` mengikuti `docs/ai/TEMPLATE_MAPPING.md` §5.9 dan
sudah diunggah sebagai `template/tor_v1.docx` — memakai `{#sesi}` untuk Waktu &
Tempat, `{#rab_divisi}` untuk anggaran, dan `{#sesi_rundown}{#rundown}` untuk
rundown. TEMPLATE_MAPPING §5.10 sengaja menyamakan nama `{#sesi}` dengan
`proposal.docx` agar prefill Proposal dari TOR (T-096) tanpa tabel penerjemah.

## Keputusan

Template **tidak** diubah (mengubahnya menuntut `tor_v2` dan memecah kesamaan
nama dengan `proposal.docx`). `petakanTor` (lib/tor/generate.ts) mengisi nama
template DAN mengirim nama kontrak sebagai alias berisi larik yang sama:
`waktu_tempat` = `sesi`, `anggaran_divisi` = `rab_divisi`, `rundown` (tingkat
atas, rata) = gabungan `sesi_rundown[].rundown`. Ketujuh loop kontrak dengan
demikian tersedia, dan template mana pun yang memakai salah satu nama itu terisi.

## Akibat

- Template versi berikut boleh memakai nama kontrak tanpa mengubah generator.
- Uji `lib/tor/__tests__/tor-generate.test.ts` merender template asli dan
  memeriksa isi tiap loop.
