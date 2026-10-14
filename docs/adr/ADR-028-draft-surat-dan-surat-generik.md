# ADR-028 — Draft surat: surat generik tanpa template, auto-save longgar, Ajukan menunggu T-060

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-10-14 |
| **Task terkait** | T-058 (dibuat di sini), T-059, T-060, T-061, T-063 |
| **Ditemukan oleh** | agent tunggal saat mengerjakan T-058 |

## Konteks

Membangun form surat T-058 memunculkan lima hal yang tidak dijawab kontrak:

1. **Empat kode generik tidak dapat disimpan.** `surat.template_id` NOT NULL
   sejak migrasi 009, padahal kode 01/06/07/09 tidak punya baris
   `surat_template` (seed 018, SEED_DATA §3). PRD F-4.2 menuntut kesembilan
   kode dapat dibuat.
2. **Auto-save harus menyimpan isian setengah jadi**, sedangkan K-04 melarang
   dua skema untuk satu entitas.
3. **"Ajukan" tidak punya tujuan.** Route `submit` dan state machine adalah
   kontrak T-060.
4. **Kontrak hanya menyebut `app/api/surat/route.ts`**, padahal auto-save
   tiap 10 detik butuh pembaruan per id.
5. **Rasio layout.** Kontrak T-058 butir 1 menulis form 60% / pratinjau 40%;
   DESIGN_SYSTEM §9.5 menggambar 42% / 58%.

## Keputusan

1. **Migrasi 029:** `template_id` boleh NULL, tetapi CHECK
   `surat_template_wajib_kecuali_generik` membatasinya pada kode 01/06/07/09.
   Tujuh varian bertemplate tetap wajib merujuk template (ADR-027).
2. **Draft disimpan lewat `SkemaDraftSurat`** yang hanya memeriksa tipe dan
   ukuran. Ini bukan skema kedua untuk surat: kelengkapan tetap diputuskan
   `buatSkemaSurat()` lewat `periksaKelengkapan()` di klien dan server, dan
   pengajuan T-060 wajib menolak apa pun yang belum lolos skema penuh. Server
   tidak memercayai body untuk kode surat, template, pembuat, periode,
   departemen, dan kunci `data_dinamis` di luar skema jenisnya.
3. **Ajukan di T-058** aktif hanya bila skema penuh lolos, lalu menyimpan
   draft dan memberi tahu bahwa pengajuan belum tersedia. T-060 menggantinya
   dengan `POST /api/surat/[id]/submit`.
4. **`app/api/surat/[id]/route.ts`** ditambahkan: `GET` (lanjutkan draft) dan
   `PATCH` (auto-save), keduanya hanya untuk pembuat draft dan hanya selama
   `DRAFT`. Milik orang lain dan periode lain dijawab 404, tidak dibedakan.
   `GET /api/surat` (arsip) tetap milik T-063.
5. **Layout mengikuti kontrak T-058: 60/40.** Form surat HMIF panjang dan
   field-nya padat; pratinjau T-059 diskala. Bila T-059 membuktikan pratinjau
   tidak terbaca pada 40%, ubah di sana dengan ADR baru.

Isi surat dibersihkan dengan allowlist tujuh tag tanpa atribut
(`lib/surat/isi-html.ts`), karena editor sengaja hanya menghasilkan paragraf,
tebal, miring, dan daftar. "Isi surat wajib" dinilai dari teksnya: editor
kosong menghasilkan `<p></p>`.

## Konsekuensi

- **Generator untuk empat kode generik belum ada.** Tidak ada template
  `.docx` untuk Pengajuan, Peringatan, Keputusan, dan Piagam di `Template/`.
  T-061 harus memutuskan: satu template generik ber-kop HMIF dengan
  `{isi_paragraf}`, atau meminta pemilik produk mengirim contoh suratnya.
  Dicatat di BACKLOG.
- Kolom KANAN (Ketua Himpunan) tidak disimpan di draft. Siapa Ketua-nya
  ditetapkan saat surat disetujui (T-060/T-061), supaya surat yang disusun
  sebelum pergantian pengurus ditandatangani Ketua yang menyetujuinya.
- `departemen_id` diisi otomatis untuk pembuat berlingkup DEPARTEMEN (KADEPT,
  PRD §5.1 `C*`), supaya arsip T-063 dapat menerapkan `R*`.
