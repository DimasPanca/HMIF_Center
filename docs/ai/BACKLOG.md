# Backlog pasca-MVP

## M17 — Haluan Kerja Departemen

**Status:** Ditunda sampai setelah MVP (ADR-017). Tidak ditampilkan di sidebar,
command palette, atau rute aplikasi MVP.

**Bahan yang sudah tersedia:**

- `Template/Template Haluan Kerja Dasar Departemen.docx`
- `Template/Template LPJ_Departemen.docx`

Kedua berkas sumber tetap disimpan di repositori untuk pengembangan M17.

**Perkiraan cakupan:** ruang kerja per departemen dan periode untuk menyusun
Haluan Kerja dari template, menyimpan revisi, meninjau dokumen, serta mengarsipkan
hasil dan LPJ Departemen. Kebutuhan hak akses, alur persetujuan, data yang
disimpan, dan kriteria penerimaan harus dirumuskan bersama pemilik produk sebelum
implementasi. Ini perkiraan lingkup, bukan spesifikasi fitur yang sudah disetujui.

**Alasan penundaan:** PRD MVP hanya mendefinisikan modul M1–M16; Haluan Kerja
belum memiliki spesifikasi fungsional, kriteria penerimaan, atau skema data.
Menampilkan tautannya sekarang akan mengarahkan pengguna ke halaman yang belum
dibangun. Keputusan penundaan mengikuti ADR-017 meskipun USER_FLOW §1.1 masih
memperlihatkannya sebagai rancangan navigasi awal.

## Notulensi — sisa di luar kontrak T-106 (dicatat 2026-09-27)

- **Hapus notulensi** (`DELETE /api/notulensi/[id]`): PRD §5.1 memberi D ke
  ADMIN/SEKUM dan KADEPT departemennya, RLS `notulensi_delete` sudah ada, tetapi
  service `hapusNotulensi` dan tombolnya belum dibuat — tidak ada di kontrak T-106.
- **Lampiran file** (PRD M13): tabel `notulensi_lampiran` + RLS sudah ada dan
  `detailNotulensi` sudah mengembalikan `lampiran`, tetapi unggah/unduh belum ada.
- **Pengetatan RLS `notulensi_select`** (015b, `USING (true)`) agar sama dengan
  lingkup baca service (ADR-025): ANGGOTA/KADEPT berlingkup hanya departemennya.
- **`kota: 'Cilegon'`** di `generateDocxNotulensi` sebaiknya dibaca dari
  `app_config` (larangan keras #5 berlaku untuk komponen, tetapi sumbernya sama).
- **Migrasi generator DOCX notulensi ke Document Engine** setelah T-061 (ADR-025).

## Pengguna — undang ulang (dicatat 2026-09-27, T-047)

PRD F-1.2 AC 2 menampilkan "Undangan kedaluwarsa, hubungi Admin", dan kontrak
undangan §5 menyebut tindakan Admin untuk `UNDANGAN_KEDALUWARSA` adalah "undang
ulang". Tetapi `undang()` menolak email/NIM yang sudah ada (`EMAIL_TERDAFTAR`),
dan tidak ada service yang menerbitkan token baru untuk `app_user` yang belum
pernah aktif. Akibatnya pengguna dengan undangan kedaluwarsa **buntu**: tidak
bisa diaktifkan, tidak bisa diundang ulang. Usulan: `undangUlang(tx, konteks,
userId, asalUrl)` — tandai undangan lama terpakai/batal, buat baris
`invitation` baru, tanpa membuat akun auth baru — plus tombol di baris
`UNDANGAN_KEDALUWARSA`/`MENUNGGU_AKTIVASI` halaman Admin.

## Persuratan — nomor urut di atas 999 terpotong (dicatat 2026-10-14, T-056)

`alokasi_nomor_surat` (migrasi 014b) merakit nomor dengan
`lpad(v_next::TEXT, 3, '0')`. `lpad` Postgres **memotong** teks yang lebih
panjang dari panjang targetnya: nomor urut 1000 tercetak `100`, 1234 tercetak
`123`. Kolom `nomor_urut` tetap unik (index 009), jadi database tidak rusak,
tetapi `nomor_lengkap` — yang dicetak di surat — bisa kembar dengan surat ke-100.

PRD §8.2 memperkirakan 300–600 surat per periode dan counter reset tiap
periode (INV-17), jadi belum terjangkau. Perbaikan: migrasi baru yang mengganti
ekspresinya menjadi
`CASE WHEN v_next < 1000 THEN lpad(v_next::TEXT, 3, '0') ELSE v_next::TEXT END`,
plus test di `supabase/tests/` dengan counter diset 999. Jangan menyunting 014b
(runner menolak migrasi yang berubah, ADR-027).

## Persuratan — sisa di luar kontrak T-058 (dicatat 2026-10-14)

- ~~**Template untuk empat kode generik**~~ — **SELESAI T-061**: pemilik
  memilih satu template umum ber-kop (`templates/surat-umum.docx`, ADR-029).
  Bila kelak ada contoh surat asli per jenis, tambahkan template bervarian.
- **Sidebar menyorot dua menu** di `/surat/baru`: "Buat Surat" dan "Arsip
  Surat" (`/surat`) sama-sama aktif, karena pencocokan rute memakai awalan.
  Perilaku lama sidebar, bukan bagian T-058.
- ~~**Isi surat lebih dari satu paragraf**~~ — **SELESAI T-061**
  (`paragrafDariIsiHtml`, ADR-029). Tebal/miring sengaja tidak dibawa.

## Persuratan — temuan T-059 (dicatat 2026-10-15)

- ~~**Kalimat baku Surat Aspirasi menyebut DPM.**~~ **SELESAI 2026-10-15** —
  pemilik memilih "ikuti tujuan surat": kalimat memakai `{tujuan_nama}`,
  template Aspirasi v4. Paragraf 8 template
  (`surat-03-aspirasi.docx`) berbunyi "...kami menyampaikan aspirasi kepada
  Dewan Perwakilan Mahasiswa (DPM) FT-UNTIRTA...", padahal tujuan surat dapat
  dipilih BEM atau Kepala Bagian Sekretariat. TEMPLATE_MAPPING §5.2 sengaja
  menjadikannya teks tetap. Perlu keputusan pemilik produk: ganti dengan
  `{tujuan_nama}`, atau batasi Aspirasi hanya untuk DPM. Bila diganti, ubah
  resep `scripts/build-templates.ts`, kalimat di `lib/surat/render-preview.ts`,
  lalu jalankan `scripts/upload-templates.ts` (naik versi otomatis).

## Persuratan — temuan T-061 (dicatat 2026-10-15)

- **Template dokumen belum diperiksa untuk tanda tangan contoh.** Ketujuh
  template surat ternyata memuat tanda tangan & stempel asli dari berkas
  contoh (dibuang di T-061, ADR-029). `tor.docx`/`proposal.docx`/
  `notulensi.docx` punya 1 gambar badan, `lpj.docx` 6 (plus 22 berkas media).
  Sebelum generator TOR/Proposal (T-094…T-096) dan LPJ (T-104) dibuat, lihat
  gambar itu satu per satu; yang berupa tanda tangan/stempel dibuang lewat
  `{ hapusGambar: n }` di resepnya dan versi `TEMPLATE_DOKUMEN` dinaikkan.
- **Generate ulang surat generik memakai versi umum saat itu**, bukan versi
  saat pertama terbit (`TEMPLATE_UMUM` konstanta, tak tercatat per surat).
  Belum ada jalur generate ulang surat TERBIT; bila dibuat, catat versinya.
- **Migrasi generator DOCX notulensi ke Document Engine** (ADR-025) kini
  dapat dikerjakan: `renderDocx` + `muatBerkas(kunciTemplateDokumen('NOTULENSI'))`.
- **`TEMPLATE_MAPPING.md` §5.1** masih menggambarkan paragraf sisipan
  `{%ttd}{%stempel}` Keterangan Aktif; kini tag itu di akhir paragraf nama
  (`{nama}{%ttd}{%stempel}`) karena paragraf sisipan menghasilkan halaman
  kosong kedua.

## Menu tanpa kontrak task — disembunyikan dari sidebar (dicatat 2026-10-17)

Sidebar (T-051) memuat dua menu yang tidak pernah punya kontrak task maupun
halaman, sehingga selalu 404. Keduanya dikeluarkan dari `components/layout/Sidebar.tsx`
(gate `e2e/sidebar-tautan.spec.ts` kini menolak tautan sidebar yang 404):

- **Kesekretariatan → Arsip Dokumen** (`/sekretariat/arsip`) — arsip dokumen
  umum himpunan. Dokumen acara (TOR/proposal/LPJ) sudah tersimpan per acara
  (`dokumen`, T-095); surat punya Arsip Surat (`/surat`). Perlu keputusan
  produk: apa yang diarsip di luar keduanya, siapa yang boleh mengunggah.
- **Administrasi → Konfigurasi Sistem** (`/admin/konfigurasi`) — penyunting
  `app_config` (ambang deadline, dsb.). Nilainya kini diubah lewat migrasi/SQL.
