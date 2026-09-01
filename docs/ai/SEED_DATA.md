# SEED_DATA — Data Referensi

Seluruh data referensi yang dibutuhkan seed, dikumpulkan di satu tempat agar **T-042 tinggal menyalin, bukan menafsir**.

| | |
|---|---|
| **Dibuat oleh** | T-008 |
| **Dipakai oleh** | T-042 (`018_seed.sql`, `prisma/seed.ts`), T-012 (token warna), T-054/T-055 (skema & template surat), T-069 (wizard kepanitiaan) |

> **Tidak ada data personal di sini.** Nama, NIM, dan email pengurus masuk lewat fitur import (T-107) atau undangan Admin (T-047), bukan lewat seed. Seed hanya berisi data organisasi yang stabil lintas periode.

---

## 1. Departemen (6 baris)

Tabel `departemen`. Warna wajib **sama persis** dengan token CSS pada `app/globals.css` (T-012) — Master Gantt dan badge departemen mengambil warna dari kolom ini.

| kode | nama | warna | warna_fill | urutan | Nama warna |
|---|---|---|---|:---:|---|
| `KAD` | Kaderisasi | `#1E90FF` | `#0F7AE0` | 1 | Tech Blue |
| `MIKAT` | Minat dan Bakat | `#00B4D8` | `#0092B0` | 2 | Teal |
| `INT` | Internal | `#F59E0B` | `#D97706` | 3 | Amber |
| `EKS` | Eksternal | `#F87171` | `#EF4444` | 4 | Coral |
| `KOMINFO` | Komunikasi dan Informasi | `#A3E635` | `#84CC16` | 5 | Lime |
| `RND` | Riset and Development | `#A78BFA` | `#8B5CF6` | 6 | Violet |

**Sumber:** PRD §4.2 (kode & nama) · DESIGN_SYSTEM §2.4 (warna & varian fill)

`warna` dipakai untuk badan bar Gantt (opacity 0.85); `warna_fill` untuk isian progres (opacity 1).

---

## 2. Role (8 nilai enum)

Enum `role_code`. Bukan tabel — nilai ini melekat di tipe database.

| Kode enum | Label Indonesia | Approve proker | Approve surat | Butuh departemen |
|---|---|:---:|:---:|:---:|
| `ADMIN` | Admin Sistem | — | — | tidak |
| `KETUA` | Ketua Himpunan | **ya** | **ya** | tidak |
| `WAKIL` | Wakil Ketua Himpunan | **ya** | **ya** | tidak |
| `SEKUM` | Sekretaris Umum | — | **ya** | tidak |
| `BENDUM` | Bendahara Umum | — | — | tidak |
| `KADEPT` | Kepala Departemen | — | — | **wajib** |
| `ANGGOTA` | Anggota Departemen | — | — | **wajib** |
| `BPH` | Badan Pengawas Himpunan | — | — | tidak |

**Sumber:** PRD §4.1, §4.3, §5.2 · SYSTEM_DESIGN §4.1, §4.2

**Aturan yang melekat pada tabel ini:**
- Approver proker = `KETUA` **atau** `WAKIL`, satu cukup (INV-05).
- Approver surat = `KETUA` **atau** `WAKIL` **atau** `SEKUM`, satu cukup (INV-05).
- `BPH` **tidak pernah** muncul sebagai approver dan tidak pernah memperoleh hak tulis (INV-03, INV-04).
- `KADEPT` dan `ANGGOTA` wajib punya `departemen_id` — ditegakkan CHECK `role_dept_wajib` (T-022).

---

## 3. Kode surat (9 baris)

Komponen pertama nomor surat. Contoh nomor lengkap: `05/379/UN43.3.7/KT2HMIF/VIII/2025`.

| kode | Jenis surat | Varian template | Berkas template |
|:---:|---|---|---|
| `01` | Surat Pengajuan | — | form generik |
| `02` | Surat Keterangan | `KETERANGAN_AKTIF` | `surat-02-keterangan-aktif.docx` |
| `03` | Surat Pemberitahuan | `ASPIRASI` | `surat-03-aspirasi.docx` |
| `04` | Surat Undangan | `UNDANGAN_PEMATERI` | `surat-04-undangan-pemateri.docx` |
| `04` | Surat Undangan | `UNDANGAN_SAMBUTAN` | `surat-04-undangan-sambutan.docx` |
| `05` | Surat Peminjaman | `PEMINJAMAN_BARANG` | `surat-05-peminjaman-barang.docx` |
| `05` | Surat Peminjaman | `PEMINJAMAN_RUANGAN` | `surat-05-peminjaman-ruangan.docx` |
| `06` | Surat Peringatan | — | form generik |
| `07` | Surat Keputusan | — | form generik |
| `08` | Surat Kerja Sama | `KERJA_SAMA` | `surat-08-kerja-sama.docx` |
| `09` | Piagam Penghargaan | — | form generik |

**Sumber:** PRD F-4.1 (daftar kode) · [ADR-002](../adr/ADR-002-kode-surat-aspirasi.md) (Aspirasi = kode `03` varian `ASPIRASI`)

Satu kode surat boleh memiliki **lebih dari satu varian** template — berlaku untuk `04` dan `05`. Tujuh varian bertemplate didaftarkan di `surat_template` oleh T-055; empat kode sisanya memakai form generik.

---

## 4. Preset tujuan surat (6 pilihan)

Dropdown "Tujuan — Preset" pada form surat. Memilih preset mengisi nama/jabatan dan alamat otomatis, **dan tetap dapat diedit** (PRD F-4.2).

| Label preset | Tujuan — Nama/Jabatan | Tujuan — Alamat |
|---|---|---|
| BEM FT UNTIRTA | Ketua BEM FT UNTIRTA | di Tempat |
| DPM FT UNTIRTA | Ketua DPM FT UNTIRTA | di Tempat |
| Kepala Bagian Sekretariat FT | Kepala Bagian Sekretariat Fakultas Teknik UNTIRTA | di Tempat |
| Ketua Jurusan | Ketua Jurusan Teknik Informatika FT UNTIRTA | di Tempat |
| Wakil Dekan III | Wakil Dekan III Fakultas Teknik UNTIRTA | di Tempat |
| Lainnya (isi manual) | *(kosong — diisi user)* | *(kosong — diisi user)* |

**Sumber:** PRD F-4.2 (daftar preset)

> Kata "di Tempat" dipakai untuk tujuan di lingkungan kampus; tujuan luar kampus memakai bentuk "di Cilegon". Karena PRD hanya menetapkan **daftar presetnya**, bukan teks jabatan lengkapnya, **konfirmasi redaksi persis ke Sekretaris Umum saat T-054** sebelum dianggap final. Nilai di atas adalah bentuk baku yang dipakai pada arsip surat HMIF.

---

## 5. Divisi preset kepanitiaan (9 baris)

Ditawarkan saat pembentukan kepanitiaan (Langkah 4 wizard proker). **Dapat ditambah atau dikurangi per acara** — [ADR-013](../adr/ADR-013-divisi-acara.md).

| urutan | nama divisi | Tanggung jawab utama |
|:---:|---|---|
| 1 | Acara | Rundown, teknis pelaksanaan, koordinasi sesi |
| 2 | Konsumsi | Konsumsi panitia dan peserta |
| 3 | Humas | Relasi eksternal, pemateri, tamu undangan |
| 4 | Peralatan | Perlengkapan, venue, transportasi |
| 5 | PDD | Publikasi, dekorasi, dokumentasi |
| 6 | P3K | Kesehatan dan keselamatan peserta |
| 7 | Sekretaris | Administrasi acara, persuratan, notulensi |
| 8 | Bendahara | Keuangan acara, RAB, verifikasi awal nota |
| 9 | Komdis | Ketertiban dan kedisiplinan peserta |

**Sumber:** PRD F-5.3 Langkah 4 dan F-8.1 (daftar divisi) · ADR-013 (sifat preset)

Divisi disimpan per kepanitiaan di tabel `divisi`, **bukan** sebagai role global. Koordinator dan anggota adalah data kontekstual di `divisi` dan `divisi_member` yang berakhir saat acara ditutup (PRD §4.3 P9).

---

## 6. app_config (5 key)

Tabel `app_config`, kolom `value` bertipe JSONB.

| key | value | Jenis | Dipakai untuk |
|---|---|---|---|
| `kode_administrasi` | `"UN43.3.7"` | string | Komponen ketiga nomor surat |
| `kode_kegiatan_default` | `"HMIF"` | string | Komponen keempat nomor surat, saat bukan surat kepanitiaan |
| `kota_default` | `"Cilegon"` | string | Field Kota pada form surat |
| `deadline_warning_hari` | `7` | angka | Ambang indikator deadline **Peringatan** |
| `deadline_critical_hari` | `3` | angka | Ambang indikator deadline **Kritis** |

**Sumber:** SYSTEM_DESIGN §4.11 · [ADR-001](../adr/ADR-001-kode-administrasi-surat.md) · [ADR-008](../adr/ADR-008-durasi-persiapan-proker.md) · PRD F-7.4

> **Tepat lima key — tidak lebih.**
> `durasi_persiapan_min` dan `durasi_persiapan_max` **sengaja tidak dibuat**, walaupun disebut SYSTEM_DESIGN §4.11.
> Rentang 15–45 hari adalah aturan keras organisasi yang ditegakkan `CHECK` constraint pada tabel `proker` ([ADR-008](../adr/ADR-008-durasi-persiapan-proker.md)).
> Menyimpannya juga di `app_config` menciptakan kondisi di mana Admin mengubah nilai, aplikasi menerimanya, lalu database tetap menolak.

---

## 7. Bulan Romawi (12 nilai)

Komponen kelima nomor surat, diturunkan otomatis dari `tanggal_surat`. Bukan tabel database — array konstan di fungsi `alokasi_nomor_surat` (T-034) dan `lib/utils/romawi.ts` (T-015).

| Bulan | Romawi | | Bulan | Romawi |
|:---:|:---:|---|:---:|:---:|
| 1 Januari | `I` | | 7 Juli | `VII` |
| 2 Februari | `II` | | 8 Agustus | `VIII` |
| 3 Maret | `III` | | 9 September | `IX` |
| 4 April | `IV` | | 10 Oktober | **`X`** |
| 5 Mei | `V` | | 11 November | `XI` |
| 6 Juni | `VI` | | 12 Desember | `XII` |

**Sumber:** PRD F-4.1 · SYSTEM_DESIGN §7.2

Acceptance criteria PRD F-4.1 menyebut bulan Oktober secara khusus: harus menghasilkan `X`, **bukan** `10`.

---

## 8. Yang TIDAK diseed

Ditulis eksplisit agar T-042 tidak berinisiatif menambahkannya.

| Data | Alasan | Masuk lewat |
|---|---|---|
| User, nama, NIM, email | Data personal | Undangan Admin (T-047) atau import (T-048) |
| Periode kepengurusan | Ditentukan pengurus, bukan sistem | `/admin/periode` (T-050) |
| Proker, surat, acara | Data operasional | Modul masing-masing |
| Ruangan | Dikelola sendiri oleh Sekretaris karena bergantung Dekanat (PRD F-14.2) | `/sekretariat/ruangan` (T-108) |
| `durasi_persiapan_min` / `max` | Aturan keras, bukan konfigurasi | — ([ADR-008](../adr/ADR-008-durasi-persiapan-proker.md)) |

Seed pengembangan opsional (`prisma/seed.ts --dev`) boleh membuat 1 periode aktif, 8 user contoh, dan 3 proker tidak bentrok — **hanya** saat flag `--dev` diberikan, dan tidak pernah pada database produksi.

---

## Daftar periksa untuk T-042

- [ ] Seed **idempoten** — dijalankan dua kali, `SELECT count(*) FROM departemen` tetap 6
- [ ] Enam warna departemen cocok karakter per karakter dengan `app/globals.css`
- [ ] `app_config` berisi **tepat 5** baris
- [ ] Tidak ada satu pun data personal
- [ ] Tujuh varian template surat terdaftar di `surat_template`
