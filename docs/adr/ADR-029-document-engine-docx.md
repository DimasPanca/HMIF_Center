# ADR-029 — Document Engine DOCX: modul gambar sendiri, TTD+stempel satu gambar, template umum, versi ditetapkan saat disetujui

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-10-15 |
| **Task terkait** | T-061 (dibuat di sini), T-062, T-063, T-064, T-094…T-096, T-104 |
| **Ditemukan oleh** | agent tunggal saat mengerjakan T-061 |

## Konteks

Membangun generator DOCX (T-061) memunculkan tujuh hal yang tidak dijawab
kontrak, dan dua cacat yang sudah ada sebelumnya:

1. **Template surat memuat tanda tangan orang sungguhan.** Ketujuh berkas
   `templates/surat-*.docx` hasil T-006 masih menyimpan tanda tangan basah
   pejabat lama dan cap stempel dari berkas contoh sebagai gambar melayang di
   blok TTD (2–3 gambar per berkas). Setiap surat yang dihasilkan akan memuat
   tanda tangan orang lain di atas nama penandatangan yang sama sekali lain.
2. **Modul gambar yang disebut SYSTEM_DESIGN §2** (`docxtemplater-image-module-free`
   1.1.1, rilis terakhir) menarik `xmldom@0.1.31` — ditandai rentan
   (CVE-2021-21366) dan ditinggalkan pembuatnya.
3. **Stempel harus menimpa tanda tangan Ketua** (ADR-004), sementara tag
   `{%ttd}{%stempel}` adalah dua gambar terpisah.
4. **Isi surat HTML (TipTap) → DOCX**: format apa yang dibawa.
5. **Empat kode generik (01/06/07/09) tidak punya template** (ADR-028
   menundanya ke sini).
6. **Versi template surat dicatat saat draft dibuat** (T-058), padahal T-061
   justru mengganti seluruh versi lama — draft yang dibuat sebelum hari ini
   menunjuk versi yang memuat tanda tangan contoh.
7. **Surat resmi tanpa tanda tangan Ketua.** PRD F-4.3: "TTD wajib pada semua
   surat mengatasnamakan himpunan".
8. **Cacat adapter storage (sejak T-044).** Bucket publik bernama `public`, dan
   `download()` supabase-js meminta `/storage/v1/object/public/{key}` — rute
   objek-publik Storage, yang membaca segmen pertama key sebagai nama bucket.
   Setiap `storage.get()` ke bucket publik gagal "Bucket not found".
9. **Keterangan Aktif dua halaman.** Paragraf `{%ttd}{%stempel}` yang disisipkan
   resep T-006 mendorong halaman kedua kosong (diukur di Word).

## Keputusan

1. **Seluruh gambar badan template surat dibuang saat build** — operasi baru
   `hapusGambar` di `scripts/docx-surgery.ts`, beserta relasi dan berkas
   `word/media/*` yang tak lagi dirujuk (kalau tidak, tanda tangan lama tetap
   dapat diekstrak dari zip). Kop di `header*.xml` tidak tersentuh. Ketujuh
   template surat naik versi (02–05 → v2, 08 → v3); versi lama nonaktif dan
   tidak pernah dipakai generate — belum ada satu pun dokumen yang dihasilkan
   sebelum T-061 (0 baris `dokumen`). Test memastikan tak ada `<w:drawing>`
   maupun relasi gambar di badan template surat.
2. **Modul gambar ditulis sendiri** (`lib/documents/image-module.ts`, ±100
   baris) di atas API modul resmi docxtemplater: tag `{%nama}` → satu PNG,
   inline atau melayang di dalam sel. Tanpa dependency baru. Render menutup
   `<w:t>`/`<w:r>` yang terbuka dan membuka run baru sesudahnya — maka **tag
   gambar wajib di akhir teks run-nya** (`{nama}{%ttd}`, bukan `{%ttd}{nama}`):
   run baru tidak membawa format, dan test memeriksa setiap template.
3. **TTD Ketua + stempel digabung menjadi SATU PNG dengan `sharp`** (kanvas 3×,
   tampil 200×100 px ≈ 5,3×2,6 cm; stempel di kiri menimpa tanda tangan di
   kanan), disisipkan di `{%ttd}`; `{%stempel}` dikosongkan. Gambar melayang
   (`wp:anchor`, `layoutInCell`, `wrapNone`), ditengahkan di kolom dan
   dinaikkan setinggi gambarnya dari paragraf tambatannya — menempati ruang
   tanda tangan seperti berkas contoh, bukan menambah tinggi baris. Penanda-
   tangan kolom kiri (Ketua Pelaksana dsb.) tidak punya gambar: ruangnya untuk
   tanda tangan basah.
4. **HTML → paragraf, tanpa tebal/miring.** Satu `<p>`/`<li>` → satu paragraf
   dokumen yang mewarisi perataan & indentasi paragraf template; butir daftar
   diberi awalan "• " / "1. "; `<br>` → pindah baris. Penekanan dibuang: font
   badan surat ditentukan template, dan surat resmi HMIF tidak memakai
   penekanan di tengah kalimat. Template umum memakai loop
   `{#paragraf_isi}{teks}{/paragraf_isi}`; Aspirasi tetap `{isi_paragraf}`
   (paragraf digabung dengan pindah baris).
5. **Template umum `templates/surat-umum.docx`** untuk 01/06/07/09, diturunkan
   dari Peminjaman Ruangan (kop, kepala surat, blok TTD dua kolom); badannya
   diganti isi bebas, baris instansi tujuan opsional (`{#ada_tujuan_jabatan}`),
   tanpa nama panitia. Tak punya baris `surat_template` (surat generik
   `template_id` NULL) — versinya konstanta `TEMPLATE_UMUM` di
   `template-registry.ts`, diperlakukan seperti `TEMPLATE_DOKUMEN`: isinya tak
   pernah ditimpa, revisi wajib menaikkan versi. Konsekuensi: surat generik
   yang di-generate ulang memakai versi umum saat itu, bukan versi saat
   pertama terbit — diterima karena generate ulang surat TERBIT belum punya
   jalur di aplikasi; bila kelak ada, versi umum perlu dicatat per surat.
6. **Versi template surat ditetapkan saat DISETUJUI**, bukan saat draft
   dibuat: `setujuiSurat` memindah `template_id` ke versi aktif untuk kode &
   varian yang sama, hanya bila surat belum punya dokumen. Sesudah terbit,
   versinya tak pernah berubah dan generate ulang memakai template aslinya
   (ADR-027 tetap berlaku untuk surat yang sudah terbit).
7. **Ketua tanpa tanda tangan → generate gagal**, bukan surat tanpa TTD.
   Surat berhenti di DISETUJUI dengan pesan "… belum mengunggah tanda tangan",
   nomor tetap sah (T-060 butir 5); setelah diunggah, "Terbitkan ulang".
8. **Adapter: objek bucket publik dibaca lewat URL publiknya**, bukan
   `download()`. Diperbaiki di `supabase-adapter.ts`.
9. **Stempel dan template dibaca dari storage**, tidak dari `public/` atau
   `templates/` di filesystem — fungsi serverless Vercel tidak menjamin berkas
   itu ikut terbundel. `upload-templates.ts` kini juga mengunggah template
   umum dan `aset/stempel-hmif.png` (SYSTEM_DESIGN §12.2). Cache memori per
   key aman tanpa invalidasi karena key ber-versi tak pernah ditimpa.

## Konsekuensi

- Unduhan `GET /api/surat/[id]/download`: `surat.read`; lingkup DEPARTEMEN
  hanya surat departemennya atau buatannya; status TERBIT/DIBATALKAN; nama
  berkas = nomor dengan "/" → "-". Berkas dialirkan dari server, tanpa signed
  URL.
- `terbitkanSurat(request, konteks, id)`: unggah dulu, lalu status TERBIT +
  baris `dokumen` dalam satu transaksi beraudit; transaksi gagal → berkas
  dihapus (bila tak dirujuk baris mana pun).
- Template dokumen (TOR, Proposal, LPJ, Notulensi) BELUM diperiksa untuk
  tanda tangan contoh — LPJ punya 6 gambar badan. Wajib diperiksa di
  T-094…T-096 / T-104 sebelum generatornya dibuat (BACKLOG).
- "Word membuka tanpa korup" diperiksa lewat Word 16 (COM) pada mesin
  pengembang: tiga sampel (umum, Peminjaman Ruangan, Keterangan Aktif) terbuka,
  satu halaman, font nama Times New Roman. Pemeriksaan ini menemukan satu
  korupsi sungguhan — `Default Extension="png"` ganda di `[Content_Types].xml`
  — yang kini dikunci test.
