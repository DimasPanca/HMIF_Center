# ADR-026 — Field form surat: PRD F-4.2 dipetakan ke placeholder template

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-10-14 |
| **Task terkait** | T-054 (dibuat di sini), T-055, T-058, T-061 |
| **Ditemukan oleh** | agent tunggal saat mengerjakan T-054; rantai surat dimulai atas permintaan pemilik produk (mengakhiri penundaan ADR-025) |

## Konteks

Kontrak T-054 meminta tujuh skema khusus "persis PRD F-4.2". Tetapi daftar
field PRD F-4.2 ditulis sebelum template dibedah, sedangkan
`TEMPLATE_MAPPING.md` §3 dan §6 (hasil T-006) mencatat placeholder yang
**benar-benar** tertulis di ketujuh `.docx`. Keduanya tidak sama. Contoh:

| Jenis | PRD F-4.2 | Placeholder template |
|---|---|---|
| 08 Kerja Sama | Nama Instansi, **Bentuk Kerja Sama** | `{tujuan_nama}`, **`{jenis_mitra}`** — tidak ada tempat untuk "bentuk kerja sama" |
| 04 Pemateri | Nama Pemateri, Jabatan/Instansi | `{tujuan_nama}`, `{tujuan_jabatan}` |
| 05 Ruangan | Pukul, Nama Instansi Tujuan | `{waktu}`, `{tujuan_jabatan}` |
| semua bertemplate | — | `{tema_kegiatan}`, `{label_atas}` (tidak disebut PRD) |
| semua | Isi Surat (Rich Text) **wajib** | `{isi_paragraf}` hanya ada di Aspirasi; enam lainnya punya kalimat resmi tetap |
| semua | Penandatangan tambahan **repeatable** | blok TTD hanya dua kolom (ADR-021) |
| 02 Keterangan | field umum (perihal, tujuan) berlaku | template tidak berperihal dan tidak beralamat (TEMPLATE_MAPPING §5.1) |

Bila nama field mengikuti PRD, generator T-061 butuh tabel penerjemah — dan
salah ketik di tabel itu tidak menimbulkan galat, melainkan kata `undefined`
di surat tercetak (TEMPLATE_MAPPING §2.2).

## Keputusan

1. **Nama field `data_dinamis` = nama placeholder template.** Setiap informasi
   yang diminta PRD tetap ada, hanya diletakkan di field yang dicetak template:
   - "Nama Pemateri" dan "Nama Instansi" (Kerja Sama) → field umum `tujuan_nama`.
   - "Jabatan/Instansi" pemateri dan "Nama Instansi Tujuan" (Ruangan) → `tujuan_jabatan`.
   - "Pukul" → `waktu` (label form tetap "Pukul").
   - "Bentuk Kerja Sama" → tidak menjadi field sendiri. Template menyatakannya
     lewat `perihal` ("Permohonan Kerjasama Rumah Sakit") dan `jenis_mitra`.
     Field yang tidak pernah tercetak hanya menyesatkan pengisi form.
   - "Lampiran TOR" (Pemateri) → boolean `lampirkan_tor`; generator yang
     menambahkan TOR sebagai lampiran, bukan placeholder.
   Test `field-schemas.test.ts` mencocokkan nama field dengan tag tiap `.docx`
   **dua arah**, sehingga penyimpangan baru langsung gagal.
2. **Isi surat wajib hanya bila templatenya mencetak `{isi_paragraf}`** —
   Aspirasi dan keempat form generik (01, 06, 07, 09). Pada lima surat lain
   kalimat isi adalah redaksi resmi yang tetap (TEMPLATE_MAPPING §5.3); field-nya
   tetap ada di skema tetapi opsional dan tidak dirender.
3. **Penandatangan tambahan paling banyak satu** (kolom KIRI). Wajib pada lima
   surat kepanitiaan, dilarang pada Keterangan Aktif dan Aspirasi, opsional
   pada form generik. Kolom KANAN selalu Ketua Himpunan, otomatis (ADR-004).
4. **Field umum yang tidak dicetak diberi nilai tetap, bukan dihapus.** Kolom
   `surat.perihal`, `tujuan_nama`, `tujuan_alamat` bersifat NOT NULL. Untuk
   Keterangan Aktif: `perihal` = nama jenis surat (berguna di arsip),
   `tujuan_*` = `-`. Form tidak merendernya (`FIELD_UMUM_TERPAKAI`).
5. **Default dari konfigurasi, bukan kode.** Skema berbentuk pabrik
   `buatSkemaSurat(konfig)`; `konfig` dibaca server dari `app_config` dan
   `PDF_ENABLED`, lalu diteruskan ke klien. Satu pabrik untuk keduanya (K-04).

## Konsekuensi

- T-055 menyimpan `serialisasiFieldSchema()` sebagai `field_schema`, ditambah
  kunci `tetap` (mis. `label_kanan: "Mengetahui,"`) yang belum ada di
  TEMPLATE_MAPPING §6 — nilai yang tidak dirender tetapi wajib sampai ke generator.
- T-058 merender field umum menurut `FIELD_UMUM_TERPAKAI[jenis]`, bukan
  merender semuanya.
- Redaksi enam preset tujuan masih perlu dikonfirmasi ke Sekretaris Umum
  (SEED_DATA §4). Contoh: preset "Kepala Bagian Sekretariat FT" beralamat
  `di Tempat`, sedangkan arsip surat peminjaman ruangan menulis `di Cilegon`.
  Tidak memblokir — redaksinya dapat disunting Sekum di tabel tanpa deployment.
