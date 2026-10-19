# DEMO_DATA — mengisi aplikasi dengan data contoh lengkap

Satu perintah mengisi HMIF Center dengan data yang membuat **setiap menu berisi**:
30 akun berperan, 15 program kerja di seluruh status, empat acara besar lengkap,
surat bernomor beserta DOCX-nya, TOR, proposal, LPJ final, notulensi, Kanban,
kendala, peminjaman ruangan, hingga backup. Cocok untuk demo, UAT, dan memeriksa
tampilan nyata tiap peran.

> **Hanya untuk DB pengembangan.** Seeder menolak `NODE_ENV=production`, tetapi tetap
> membuat akun berkata sandi yang diketahui umum. Jangan jalankan terhadap DB produksi.

## Menjalankan

Prasyarat (sekali saja, lihat `ENV_SETUP.md`): `.env.local` lengkap, migrasi terbaru
(`npm run db:reset`), periode AKTIF (`npm run seed:e2e-auth`), dan template dokumen
(`npx tsx scripts/upload-templates.ts`).

```bash
npm run dev                 # terminal 1 — server HARUS berjalan
npm run seed:demo           # terminal 2 — ± 2–3 menit
```

Buka `http://localhost:3000/login` lalu masuk dengan salah satu akun di bawah.

```bash
npm run seed:demo:hapus     # hapus seluruh data demo (akun dinonaktifkan)
npx tsx scripts/seed-demo.ts --url http://localhost:3000   # server di alamat lain
npx tsx scripts/seed-demo.ts --hanya surat,dokumen         # jalankan ulang fase tertentu
npm run tur:demo            # tangkapan layar 32 halaman kunci (untuk memeriksa)
```

Fase untuk `--hanya`: `acara`, `nota`, `surat`, `dokumen`, `notulensi`, `kanban`,
`kendala`, `ruangan`, `sistem`. Fase lain menganggap proker demo sudah ada; jalankan
fase yang sama dua kali akan menggandakan datanya — bersihkan dulu bila perlu.

## Akun

Kata sandi **semua akun**: `DemoHMIF2026`. Email `<kunci>@demo.hmif.test`.

| Email | Nama | Peran |
|---|---|---|
| `admin@…` | Admin Sistem HMIF | Admin |
| `ketua@…` | Muhammad Rizky Pratama | Ketua Himpunan |
| `wakil@…` | Aulia Rahmawati | Wakil Ketua |
| `sekum@…` | Nabila Putri Salsabila | Sekretaris Umum |
| `bendum@…` | Farhan Maulana Yusuf | Bendahara Umum |
| `bph@…` | Siti Nurhaliza Rahmadani | BPH |
| `kadept.kad@…` `kadept.mikat@…` `kadept.int@…` `kadept.eks@…` `kadept.kominfo@…` `kadept.rnd@…` | Enam Kepala Departemen | Kadept |
| `kad1@…` … `rnd3@…` (3 per departemen: `kad`, `mikat`, `int`, `eks`, `kominfo`, `rnd`) | 18 staf | Anggota |

Ketua Pelaksana: Dies Natalis `int1`, SYNCHRONIZE `eks1`, LKMM-PD `kad2`, Kunjungan Industri `eks2`.
Bendahara seluruh acara: `int2`.

## Isi data

| Area | Yang tersedia |
|---|---|
| Program kerja | 15 proker: Draf, Menunggu approval, Menunggu approval revisi, Disetujui, Berjalan, Selesai, Perlu revisi, Ditolak; berjadwal, berkala, responsif |
| Kalender / Gantt | Kalender ketersediaan terisi; Master Gantt; Gantt departemen (Kaderisasi, Eksternal, Kominfo) |
| Acara | Dies Natalis (selesai), SYNCHRONIZE (berjalan), LKMM-PD (disetujui), Kunjungan Industri (revisi) — masing-masing dengan kepanitiaan, divisi, job desk, Gantt divisi |
| RAB | Dies **Selesai**, SYNCHRONIZE **Realisasi**, LKMM-PD **Diajukan**, Kunjungan **Draf**; pemasukan, 45 peserta berbayar, ekspor Excel |
| Nota | 21 nota bergambar: 15 terverifikasi, 4 menunggu, 1 ditolak, 1 perlu perbaikan; pengeluaran di luar RAB dan item melebihi anggaran |
| Surat | 24 surat: 9 terbit bernomor (+ DOCX), 3 menunggu approval, 2 draf, 1 ditolak, 1 dibatalkan, batch 8 Surat Keterangan Aktif |
| TOR / Proposal | SYNCHRONIZE dan Dies: TOR + proposal terbit; LKMM-PD: proposal terisi; Kunjungan: TOR setengah jadi |
| LPJ | Dies Natalis **FINAL** (Bendum → Ketua) dengan foto dokumentasi |
| Sekretariat | 6 notulensi (Himpunan & departemen) dengan daftar hadir dan action item yang dijadikan kartu Kanban; 41 Data Pengurus; 5 ruangan dan 10 peminjaman (1 bentrok) |
| Kanban | 26 kartu departemen + 29 kartu divisi, checklist, template |
| Kendala | 8 kendala (terbuka / ditangani / selesai), 13 balasan berulir dengan @mention |
| Sistem | Backup manual berhasil, cron harian dijalankan, audit log terisi |

Seluruh tanggal **relatif terhadap hari ini**, sehingga selalu terasa "sedang berjalan":
Dies Natalis sudah lewat, SYNCHRONIZE dua pekan lagi, LKMM-PD enam pekan lagi.

## Cara kerja

- **Data biasa** (Data Pengurus, divisi kerja, Kanban divisi, RAB, pemasukan, peserta,
  ruangan) ditulis lewat SQL dengan atribusi audit (`app.user_id`, INV-07).
- **Alur bermesin status dan pembuat berkas** dijalankan lewat **API sungguhan** sebagai
  pengguna demo, memakai kode yang sama dengan UI: wizard + approval proker, status RAB,
  verifikasi nota, penomoran + DOCX surat, TOR, proposal, LPJ, notulensi, backup.
  Karena itu data juga sekaligus menguji alur-alur tersebut ujung ke ujung.
- Penanda data demo: pembuatnya adalah akun `*@demo.hmif.test`; ruangan ditandai karakter
  U+2063 di akhir `catatan`; Data Pengurus tanpa akun memakai NIM `3337230100`–`3337230111`.

## Pembersihan

`--hapus` menghapus baris buatan akun demo (turunannya ikut lewat FK `CASCADE`) dan berkas
storage-nya. Akun demo hanya **dinonaktifkan**, bukan dihapus: `audit_log` append-only
(INV-06) merujuk pelakunya. Menjalankan seeder lagi mengaktifkannya kembali.

## Pemecahan masalah

| Gejala | Penyebab | Tindakan |
|---|---|---|
| `Server tidak menjawab` | `npm run dev` belum jalan | Jalankan server, ulangi |
| `Tidak ada periode AKTIF` | Belum ada periode | `npm run seed:e2e-auth` |
| `Data demo sudah ada` | Sudah pernah disemai | `npm run seed:demo:hapus`, lalu ulangi |
| Surat gagal dibuat DOCX | Template belum diunggah | `npx tsx scripts/upload-templates.ts` |
| `429` saat masuk | Rate limit login | Tunggu semenit; seeder memakai IP sintetis per sesi |
| Backup `BATAS_HARIAN` | Sudah ada backup manual hari ini | Abaikan — fase lain tidak terpengaruh |
