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
