# ADR-034 — Restore bertahap, restore penuh dari dump data, dan teks konfirmasi

|                    |                              |
| ------------------ | ---------------------------- |
| **Status**         | Diterima                     |
| **Tanggal**        | 2026-10-17                   |
| **Task terkait**   | T-110, T-112                 |
| **Ditemukan oleh** | agent saat mengerjakan T-112 |

## Konteks

1. **Teks konfirmasi restore penuh bertentangan.** USER_FLOW §10.2 meminta
   pengguna mengetik `RESTORE PENUH`; kontrak T-112 (kontrak 4) meminta
   "konfirmasi tingkat kritis: ketik nama sistem".
2. **Batas waktu fungsi.** SYSTEM_DESIGN §15.3 menulis restore sebagai satu
   fungsi: backup pra-restore → verifikasi → terapkan. Backup nyata di dev
   (±80 MB) memakan ±4 menit dari laptop; Vercel membatasi satu fungsi 300
   detik. Pra-restore + restore dalam satu pemanggilan mudah melewatinya.
3. **Lapis 1 tanpa `pg_dump`.** Di Vercel binary `pg_dump` tidak ada, sehingga
   `full-dump.sql.gz` berisi DATA per tabel tanpa DDL (T-110). Kolomnya
   terkunci pada skema saat backup.
4. **audit_log append-only (INV-06)** tidak boleh dihapus/ditimpa oleh restore,
   padahal restore penuh "mengganti seluruh data".

## Keputusan

1. Teks konfirmasi = **nama sistem `HMIF Center`** (`NAMA_SISTEM`,
   `lib/backup/restore.ts`), mengikuti kontrak task yang lebih baru dan lebih
   spesifik. Diperiksa di klien DAN server.
2. Restore dicatat di tabel **`restore_job`** (migrasi 048) dengan tahap
   `PRA_RESTORE → VERIFIKASI → TERAPKAN → SELESAI`. Job berjalan di `after()`;
   bila terputus (tanpa kabar > 6 menit, dan backup pra-restore-nya tidak lagi
   BERJALAN), Admin dapat **melanjutkan** dari tahap tersimpan. Pra-restore
   yang sudah SUKSES tidak diulang; modul yang sudah terpakai dilewati;
   transaksi database restore penuh atomik sehingga aman diulang.
3. **Restore penuh** hanya dari dump `sql_per_tabel` dan hanya bila
   `migrasiTerakhir` bundel = migrasi database sekarang. Selain itu ditolak
   dengan pesan yang menyebut keduanya; restore per modul tetap tersedia
   (kolom = irisan kolom sekarang dan kunci JSON, kolom baru memakai nilai
   bawaan). Dump `pg_dump` (berisi DDL) dipulihkan manual dengan `psql`.
   Tidak ada migrasi otomatis.
4. Restore penuh **tidak menghapus audit_log**; dump menyisipkan barisnya
   dengan `ON CONFLICT DO NOTHING`. Modul `audit-log` hanya boleh strategi
   TAMBAH. Tabel `backup`, `restore_job`, `_migrasi` tidak pernah dipulihkan.
5. Urutan restore penuh: berkas storage (upsert, tidak pernah menghapus) lalu
   database dalam SATU transaksi. Gagal di database = database utuh seperti
   sebelum restore; berkas storage yang sudah tertulis adalah versi backup
   dari key yang sama dan dilaporkan di `laporan.berkasStorage`.

## Akibat

- USER_FLOW §10.2 ("ketik RESTORE PENUH") tidak diikuti untuk teks
  konfirmasinya; alurnya (pilih → verifikasi → mode → safety net → progres →
  laporan → audit) diikuti.
- Bundel lama yang dibuat sebelum `ON CONFLICT DO NOTHING` ditambahkan ke dump
  (T-112) gagal pada restore penuh karena bentrok PK audit_log — transaksi
  di-rollback utuh. Hanya backup uji dev yang terdampak.
- Restore penuh dari bundel yang lebih tua dari migrasi terakhir menuntut
  database terpisah yang dimigrasi sampai titik itu.
