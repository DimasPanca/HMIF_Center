# ADR-062 — Pengetahuan Dhana: alur birokrasi dan aturan organisasi

|                     |                                                 |
| ------------------- | ----------------------------------------------- |
| **Status**          | Diterima                                        |
| **Tanggal**         | 2026-11-02                                      |
| **Diputuskan oleh** | Pemilik produk                                  |
| **Melengkapi**      | ADR-060 §4                                      |

## Konteks

Dhana menjawab keliru bahwa Surat Keterangan Aktif "langsung bisa diunduh tanpa persetujuan",
padahal di sistem SK Aktif masuk Antrian Approval (Ketua/Wakil/Sekum). Penyebabnya Panduan Umum §8
tidak menyebut tahap persetujuan, dan Dhana tidak punya ringkasan siapa-menyetujui-apa. Pemilik juga
meminta Dhana tidak memakai em dash dan memahami AD/ART HMIF, BEM FT, serta Peraturan Fakultas, tetap
hemat token.

## Keputusan

1. **Panduan diperbaiki**: Panduan Umum §8 (SK Aktif) menjelaskan tahap Menunggu persetujuan → Terbit;
   §8a baru berisi tabel **alur persetujuan** (proker, surat, SK Aktif, RAB, nota, LPJ, peminjaman
   ruangan) sesuai kode (`v_antrian_approval`, panduan Bendum/Ketua/Sekum). Panduan Anggota ikut
   dibetulkan.
2. **Aturan organisasi** disalin ke `docs/pengetahuan/ormawa/` (13 berkas markdown dari
   `docs/knowledge_base_ormawa_FT_Untirta`): AD/ART/GBHO/GBHK HMIF dan BEM FT, Perfak DPM FT 1/2024,
   2/2024, 3/2024, 1/2020, plus indeks. Dipotong **per pasal**; metadata YAML tidak dikirim.
3. **Retrieval hemat token** (`lib/dhana/prompt.ts`): hanya potongan relevan yang dikirim —
   tabel §8a bila pertanyaan menyangkut pengajuan/persetujuan; Guide ≤ 4–5,5 ribu karakter; pasal
   aturan ≤ 5–6,5 ribu karakter, dicari hanya bila pertanyaan menyangkut aturan/organisasi. Pasal
   diurutkan menurut jumlah kata kunci yang cocok; indeks ringkas hanya dipakai bila tidak ada pasal
   yang cocok. Identitas Dhana cukup di instruksi sistem. Rata-rata ±1–3,5 ribu token konteks.
4. **Instruksi**: ikuti tabel alur persetujuan; jangan menyimpulkan "tanpa persetujuan"; percayai status
   yang dilaporkan pengguna; bedakan dokumen HMIF/BEM/DPM dan sebut dokumen + pasal; jelaskan isi
   pasal; jangan awali dengan sapaan.
5. **Tanpa em dash**: em dash dibuang dari konteks, instruksi, judul rujukan, dan jawaban
   (`tanpaEmDash`).
6. **Kuota AI habis / galat**: Dhana tetap membalas dengan rujukan Guide/pasal yang paling relevan
   (`cadangan: true`) alih-alih galat polos.

## Konsekuensi

- Dokumen aturan organisasi kini ikut di repositori aplikasi; bila AD/ART atau Perfak berubah,
  perbarui berkas di `docs/pengetahuan/ormawa/`.
- Kuota Gemini paket gratis cepat habis bila banyak pertanyaan beruntun (terukur saat uji
  2026-11-02: HTTP 429). Untuk dipakai banyak pengurus, aktifkan billing/kuota di Google AI Studio.
