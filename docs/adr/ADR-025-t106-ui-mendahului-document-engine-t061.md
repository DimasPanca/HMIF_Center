# ADR-025 — T-106 UI dikerjakan sebelum rantai surat (T-061), plus penyesuaian lingkup baca notulensi

| | |
|---|---|
| **Status** | Diterima (disetujui pemilik produk di percakapan, 2026-09-27) |
| **Tanggal** | 2026-09-27 |
| **Task terkait** | T-106 (bergantung T-061), T-054…T-062 |
| **Ditemukan oleh** | agent tunggal saat mengambil task berikutnya setelah konsolidasi |

## Konteks

`tasks.json` menetapkan T-106 (Notulensi rapat) bergantung pada T-051, T-080, dan
**T-061 (Document Engine DOCX)**. Per 2026-09-27, T-051 dan T-080 selesai, tetapi
seluruh rantai surat T-054…T-062 belum dikerjakan (`lib/surat/` dan
`lib/documents/` masih berupa kerangka T-011). AGENT_RULES P-01 melarang
mengerjakan task yang `depends_on`-nya belum DONE.

Fondasi data T-106 (commit `b30f61d`) sudah dibangun tanpa T-061: generator DOCX
notulensi berdiri sendiri di `lib/notulensi/docx.ts` (docxtemplater + pizzip,
membaca `templates/notulensi.docx` langsung dari berkas). Notulensi tidak memakai
TTD, stempel, penomoran, `TemplateLoader` berversi, maupun baris `dokumen` — hal-hal
yang menjadi inti T-061.

Pemilik produk memutuskan rantai surat dikerjakan belakangan, bukan dilewati.

Saat merakit UI juga ditemukan: PRD §5.1 memberi ANGGOTA `R*` dan KADEPT `CRU*`
(`*` = terbatas pada departemen sendiri), tetapi `daftarNotulensi` /
`detailNotulensi` tidak menyaring lingkup baca, dan policy RLS `notulensi_select`
(015b) `USING (true)`. Karena koneksi aplikasi melewati RLS, ANGGOTA dapat membaca
notulensi semua departemen.

## Keputusan

1. **Dependency T-106 → T-061 dianggap terpenuhi untuk T-106 saja.** T-106 UI
   dikerjakan sekarang memakai generator DOCX notulensi yang sudah ada.
2. **Pengecualian ini tidak berlaku untuk T-063, T-064, T-095, T-096, T-105,
   T-108.** Task-task itu membutuhkan `ImageModule` (TTD/stempel), penomoran,
   atau `form surat` dari rantai T-058/T-061 dan tetap menunggu.
3. **Lingkup baca notulensi ditegakkan di service** lewat
   `departemenBacaNotulensi(konteks)`: bila `lingkupUntuk(roles,'notulensi.read')`
   bernilai `DEPARTEMEN`, daftar hanya memuat notulensi departemen pengguna, dan
   detail di luar lingkup dijawab 404 (keberadaan tidak dibocorkan). Notulensi
   himpunan (`departemen_id = null`) tidak terlihat oleh pembaca berlingkup.
4. **Skema Zod notulensi dipindah ke `lib/notulensi/skema.ts`** (modul murni)
   agar form klien memakai skema yang sama tanpa ikut membundel klien DB (K-04);
   `service.ts` mengekspor ulang skema yang sama.

## Konsekuensi

- Gate `notulensi` aktif dan lulus 14/14 (7 skenario × desktop/mobile).
- Utang kecil: setelah T-061 ada, `generateDocxNotulensi` sebaiknya dipindah ke
  Document Engine (template dari storage berversi, baris `dokumen`). Satu file.
- Rantai surat (9 task) + 6 task turunannya menumpuk di akhir; 21 task lain di
  luar rantai tetap bisa dikerjakan lebih dulu.
- RLS `notulensi_select` masih lebih longgar daripada matriks. Lapis kedua ini
  hanya relevan untuk akses langsung/authenticated; pengetatan (migrasi baru yang
  meniru aturan butir 3) dicatat di `docs/ai/BACKLOG.md`.
- **Daftar hadir kosong sampai T-107.** Sumber daftar hadir adalah tabel
  `pengurus` (kontrak §2), yang per 2026-09-27 berisi 0 baris dan baru diisi oleh
  T-107 (Data pengurus). UI menampilkan pesan kosong yang jelas; T-107 disarankan
  sebagai task berikutnya.
