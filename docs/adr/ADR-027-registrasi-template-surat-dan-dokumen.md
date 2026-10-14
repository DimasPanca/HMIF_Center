# ADR-027 — Registrasi template: 7 baris surat, 4 berkas dokumen, seed tidak disunting

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-10-14 |
| **Task terkait** | T-055 (dibuat di sini), T-061, T-095, T-096, T-105, T-106 |
| **Ditemukan oleh** | agent tunggal saat mengerjakan T-055 |

## Konteks

Kontrak T-055 menuntut tiga hal yang bertentangan dengan skema yang sudah ada:

1. **"11 template terdaftar di `surat_template`."** Empat dari sebelas berkas
   (`tor`, `proposal`, `lpj`, `notulensi`) bukan surat. Tabel mewajibkan
   `kode_surat ~ '^0[1-9]$'` dan `varian NOT NULL`; mendaftarkan TOR berarti
   mengarang kode surat yang tidak ada di PRD F-4.1. Seed 018 sudah menolak
   hal serupa dengan alasan yang sama (komentar butir 1 di berkas itu).
2. **"Ubah `018_seed.sql`."** Migrasi itu sudah diterapkan. `scripts/db.ts`
   menyimpan checksum tiap migrasi dan **menolak** menjalankan
   `db:migrate` bila isi berkas yang sudah diterapkan berubah. Menyunting 018
   memecahkan `db:migrate` di setiap database yang sudah ada, termasuk produksi.
3. **Key `template/{template_id}_v{n}.docx`.** Bila `template_id` = UUID baris,
   setiap versi adalah baris baru dengan UUID baru, sehingga `_v{n}` tidak
   membedakan apa pun. Akhiran versi hanya bermakna bila identitasnya tetap
   lintas versi.

## Keputusan

1. **Kesebelas berkas diunggah; tujuh yang didaftarkan di `surat_template`.**
   Empat template dokumen acara dicatat di `TEMPLATE_DOKUMEN`
   (`lib/surat/template-registry.ts`) dengan versi sebagai konstanta. Skrip
   unggah **menolak** menimpa versi dokumen yang sudah ada dengan isi berbeda
   dan meminta versinya dinaikkan — versioning yang sama ketatnya, tanpa
   mengarang kode surat.
2. **Seed 018 tidak disunting.** `scripts/upload-templates.ts` yang mengisi
   `storage_key` dan `field_schema`. Baris seed (key bentuk lama,
   `field_schema '{}'`, berkas belum pernah ada) diperlakukan sebagai
   **ADOPSI**: diisi di tempat pada versi 1, karena belum mungkin ada surat
   yang memakainya. Perubahan sesudahnya selalu menjadi baris baru.
3. **`template_id` = slug nama berkas** (`surat-05-peminjaman-barang`), tetap
   lintas versi: `template/surat-05-peminjaman-barang_v2.docx`. Versi baru
   = versi tertinggi yang pernah ada + 1 (termasuk baris nonaktif), sehingga
   key tidak pernah dipakai ulang.
4. **Template = berkas + `field_schema`.** Berubahnya salah satu menghasilkan
   versi baru. Perbandingan `field_schema` memakai JSON berkunci terurut,
   karena JSONB menyimpan ulang urutan kunci.

## Konsekuensi

- Setelah `db:reset`, `field_schema` ketujuh baris kembali `'{}'` sampai
  `npx tsx scripts/upload-templates.ts` dijalankan. Langkah itu wajib ikut
  setiap provisioning database baru, setara dengan `seed:e2e-auth`.
- Generator surat (T-061) memuat template dari `surat.template_id` lewat
  `templateById()`, bukan dari template aktif — supaya surat lama ter-generate
  ulang dengan versinya sendiri.
- `lib/notulensi/docx.ts` masih membaca `templates/notulensi.docx` dari disk.
  Memindahkannya ke storage (`kunciTemplateDokumen('NOTULENSI')`) adalah
  pekerjaan T-061, bukan T-055.
- Mengubah resep `scripts/build-templates.ts` lalu menjalankan ulang skrip
  unggah menghasilkan versi baru otomatis untuk surat; untuk keempat dokumen,
  naikkan `versi` di `TEMPLATE_DOKUMEN` lebih dulu.
