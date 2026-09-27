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
