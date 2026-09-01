# FASE 0 — Prasyarat (T-001 … T-008)

**Deliverable fase:** repo siap, seluruh keputusan terkunci jadi ADR, aset & template siap dipakai generator.
**Sifat:** sebagian besar bukan koding. Mulai hari pertama, **paralel** dengan P1.
**Gerbang keluar:** lihat AI_EXECUTION_PLAN §6 (P0 → P1).

---

### T-001 · Inisialisasi repositori
**Fase** 0 · **Butuh** — · **Baca** —

**Buat:** `.gitignore` · `README.md` · `docs/adr/README.md`
**Ubah:** —

**Kontrak:**
1. `git init`, branch default `main`, buat branch kerja `dev`.
2. `.gitignore` minimal berisi: `node_modules/`, `.next/`, `.env`, `.env.*`, `!.env.example`, `*.log`, `.vercel/`, `coverage/`, `playwright-report/`, `.DS_Store`, `Thumbs.db`, `/tmp/`, `*.sql.gz`, `/backups/`.
3. Folder `docs/`, `Design/`, `Template/` yang sudah ada **masuk** version control apa adanya (jangan diubah isinya).
4. `README.md` berisi: nama sistem, satu paragraf ringkasan dari PRD §1, tautan ke 5 dokumen di `docs/`, dan perintah menjalankan project (diisi placeholder, dilengkapi di T-010).
5. `docs/adr/README.md` menjelaskan format ADR: `ADR-NNN-judul-kebab.md` dengan bagian Konteks / Keputusan / Konsekuensi / Status.
6. Commit awal: `T-001: inisialisasi repositori`.

**Verifikasi:**
```bash
git log --oneline && git check-ignore -v .env
```

**Selesai bila:**
- [ ] `git log` menampilkan commit awal
- [ ] `git check-ignore .env` mengembalikan match (artinya terabaikan)
- [ ] `git status` bersih setelah commit

**Jangan:** jangan menambah folder aplikasi apa pun di task ini — scaffold adalah T-009.

---

### T-002 · Tulis 17 ADR keputusan terkunci
**Fase** 0 · **Butuh** T-001 · **Baca** AI_EXECUTION_PLAN §2

**Buat:** `docs/adr/ADR-001-kode-administrasi.md` … `docs/adr/ADR-017-haluan-kerja-pasca-mvp.md` (17 berkas)
**Ubah:** `docs/adr/README.md` (daftar indeks)

**Kontrak:**
1. Satu berkas per ADR, isinya menyalin baris tabel AI_EXECUTION_PLAN §2.1 dan §2.2 menjadi bagian: **Konteks** (kenapa ambigu, dari dokumen mana), **Keputusan**, **Konsekuensi implementasi**, **Status: Diterima**, **Tanggal**.
2. ADR yang menyangkut skema database (**ADR-005**, **ADR-006**, **ADR-008**) wajib menuliskan potongan SQL final yang akan dipakai, bukan deskripsi.
3. ADR-010 wajib menyebut nama env var `PDF_ENABLED` dan perilaku UI saat `false`.
4. `README.md` berisi tabel indeks: ID · Judul · Status · Task terkait.

**Verifikasi:**
```bash
ls docs/adr/*.md | wc -l && grep -L "Status: Diterima" docs/adr/ADR-*.md
```

**Selesai bila:**
- [ ] 17 berkas ADR ada (plus README)
- [ ] Perintah `grep -L` tidak mengembalikan berkas apa pun (semua berstatus Diterima)
- [ ] ADR-005/006/008 memuat SQL konkret

**Jangan:** jangan membuat keputusan baru di luar §2. Bila menemukan ambiguitas lain, tulis ADR berstatus **Usulan** dan laporkan ke manusia.

---

### T-003 · Kerangka environment variable
**Fase** 0 · **Butuh** T-001 · **Baca** SYSTEM_DESIGN §20.1

**Buat:** `.env.example` · `scripts/check-env.ts` · `docs/ai/ENV_SETUP.md`
**Ubah:** —

**Kontrak:**
1. `.env.example` memuat **seluruh** variabel SYSTEM_DESIGN §20.1 dengan nilai contoh kosong dan komentar satu baris per variabel.
2. Tambahkan variabel yang belum ada di dokumen tetapi dibutuhkan keputusan terkunci: `PDF_ENABLED=false` (ADR-010), `MAX_UPLOAD_BYTES=15728640` (ADR-014).
3. `scripts/check-env.ts` memvalidasi dengan Zod: variabel wajib ada dan tidak kosong; variabel yang harus URL divalidasi sebagai URL; keluar dengan exit code 1 dan mencetak **daftar** variabel yang kurang (bukan berhenti di variabel pertama).
4. Variabel server-only (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `GDRIVE_SERVICE_ACCOUNT_JSON`) ditandai di komentar sebagai **JANGAN pernah diimpor di client component**.
5. `ENV_SETUP.md` berisi langkah manusia mendapatkan tiap nilai (dari dashboard mana, menu mana).

**Verifikasi:**
```bash
npx tsx scripts/check-env.ts
```

**Selesai bila:**
- [ ] Menjalankan tanpa `.env.local` mencetak seluruh variabel yang kurang lalu exit 1
- [ ] `.env.example` tidak memuat satu pun nilai rahasia asli

**Jangan:** jangan menuliskan kunci Supabase asli ke berkas mana pun yang di-commit.

---

### T-004 🧑 · Provisioning layanan eksternal
**Fase** 0 · **Butuh** T-003 · **Baca** SYSTEM_DESIGN §20.2, BUILD_PLAN §S0.4

**Buat:** `docs/ai/PROVISIONING_CHECKLIST.md`
**Ubah:** `docs/ai/tasks.json` (status `BLOCKED` + `blocked_reason`)

**Kontrak (bagian AI):**
1. Tulis checklist berurutan untuk manusia: (a) buat Supabase project `dev` dan `staging`, (b) catat 5 nilai env, (c) aktifkan extension `btree_gist` dan `pg_trgm` di SQL editor, (d) buat bucket `private` (tidak publik) dan `public`, (e) hubungkan repo ke Vercel, (f) deploy Gotenberg di Railway/Fly.io lalu isi `GOTENBERG_URL`.
2. Setiap langkah menyertakan cara **memverifikasi** langkah itu berhasil (mis. query `SELECT extname FROM pg_extension`).
3. Tandai langkah (f) sebagai **opsional untuk MVP** — bila dilewati, `PDF_ENABLED=false` (ADR-010).
4. Set status task `BLOCKED` dengan `blocked_reason: "menunggu kredensial Supabase & Vercel dari pemilik produk"`.

**Verifikasi (setelah manusia selesai):**
```bash
npm run check:env && npx tsx scripts/db-ping.ts
```

**Selesai bila:**
- [ ] `check-env` lulus tanpa error
- [ ] Koneksi ke Postgres berhasil dan `btree_gist` terpasang
- [ ] Dua bucket storage ada, `private` **tidak** dapat diakses tanpa signed URL

**Jangan:** jangan membuat akun atau memasukkan kredensial atas nama pengguna. Ini pekerjaan manusia.

---

### T-005 · Normalisasi aset brand
**Fase** 0 · **Butuh** T-001 · **Baca** PRD §13.1, BUILD_PLAN §S0.5

**Buat:** `public/logo-hmif.png` · `public/stempel-hmif.png` · `scripts/prepare-assets.ts`
**Ubah:** —

**Kontrak:**
1. `scripts/prepare-assets.ts` (memakai `sharp`) menyalin `Design/LOGO HMIF - SHADOW@3x.png` menjadi `public/logo-hmif.png`, lebar maksimum 512 px, transparansi dipertahankan.
2. Script mengubah `Template/Stempel Digital HMIF.jpeg` menjadi PNG **berlatar transparan**: ambang putih (mis. luminance > 240) dijadikan alpha 0, sisa piksel dipertahankan.
3. Ukuran stempel keluaran maksimum 600 px pada sisi terpanjang, aspect ratio dipertahankan.
4. Script bersifat idempoten: dijalankan dua kali menghasilkan berkas identik.
5. Berkas sumber di `Design/` dan `Template/` **tidak** diubah.

**Verifikasi:**
```bash
npx tsx scripts/prepare-assets.ts && npx tsx scripts/verify-assets.ts
```
(`verify-assets.ts` mengecek: kedua berkas ada, punya kanal alpha, dan piksel sudut stempel `alpha === 0`.)

**Selesai bila:**
- [ ] Stempel di-overlay di atas teks contoh dan **teks tetap terbaca** (latar putih hilang)
- [ ] Logo tidak pecah pada ukuran tampil 32 px maupun 512 px
- [ ] Berkas sumber tidak berubah (`git status` bersih pada `Design/` dan `Template/`)

**Jangan:** jangan meng-crop stempel menjadi persegi. Jangan menurunkan resolusi di bawah 600 px.

---

### T-006 🧑 · Bedah 11 template DOCX menjadi ber-placeholder
**Fase** 0 · **Butuh** T-002 · **Baca** SYSTEM_DESIGN §8.2, §8.3 · PRD F-4.2

**Buat:** `templates/*.docx` (11 berkas) · `scripts/template-dryrun.ts` · `docs/ai/TEMPLATE_MAPPING.md`
**Ubah:** —

**Kontrak (bagian AI):**
1. `TEMPLATE_MAPPING.md` memuat, **per template**, tabel: teks asli yang harus diganti → placeholder → sumber data (kolom tabel / key `data_dinamis`). Wajib memakai kamus placeholder SYSTEM_DESIGN §8.3.
2. Nama berkas keluaran persis seperti daftar SYSTEM_DESIGN §17 (`surat-02-keterangan-aktif.docx`, `surat-03-aspirasi.docx`, `surat-04-undangan-pemateri.docx`, `surat-04-undangan-sambutan.docx`, `surat-05-peminjaman-barang.docx`, `surat-05-peminjaman-ruangan.docx`, `surat-08-kerja-sama.docx`, `tor.docx`, `proposal.docx`, `lpj.docx`, `notulensi.docx`).
3. `scripts/template-dryrun.ts` memuat setiap berkas di `templates/`, menjalankan docxtemplater dengan data dummy lengkap, dan **gagal** bila ada placeholder tak terisi atau tag tidak seimbang. Cetak laporan per berkas.
4. Tabel dinamis diubah menjadi loop: `{#items}…{/items}` (kebutuhan barang), `{#signers}…{/signers}` (blok TTD), `{#rundown}…{/rundown}` (susunan acara), `{#poin}…{/poin}` (aspirasi).
5. Penanda gambar: `{%ttd_ketua}`, `{%ttd_sekum}`, `{%stempel}`.
6. **Kop surat tidak boleh disentuh.**
7. Set status `BLOCKED` bila pengeditan DOCX butuh Microsoft Word; sertakan instruksi per berkas di `TEMPLATE_MAPPING.md`.

**Verifikasi:**
```bash
npx tsx scripts/template-dryrun.ts
```

**Selesai bila:**
- [ ] 11 berkas ada di `templates/`
- [ ] Dry run lulus untuk semua berkas, nol placeholder tak terisi
- [ ] Berkas hasil dibuka di Word 2016+ tanpa peringatan korupsi
- [ ] Kop surat pada hasil generate identik dengan template asli

**Jangan:** jangan mengubah margin, font, atau tata letak template asli. Placeholder hanya menggantikan **nilai**, bukan struktur.

---

### T-007 · Peta koordinat sel RAB_Template.xlsx
**Fase** 0 · **Butuh** T-001 · **Baca** SYSTEM_DESIGN §11.3, §11.4 · PRD F-9.2

**Buat:** `scripts/inspect-rab-template.ts` · `docs/ai/RAB_CELL_MAP.md`
**Ubah:** —

**Kontrak:**
1. Script memakai ExcelJS membaca `Template/RAB_Template.xlsx` dan mencetak, untuk **keempat sheet** (RAB, PEMASUKAN, PENGELUARAN, RAB AKTUAL): nama sheet, lebar kolom, daftar merge range, baris header, sel berformula beserta formulanya, dan format angka tiap kolom.
2. `RAB_CELL_MAP.md` mencatat hasilnya sebagai **konstanta yang akan dipakai** oleh exporter: kolom awal item, baris awal, kolom ringkasan divisi, kolom RAB Aktual.
3. Bandingkan hasil dengan asumsi SYSTEM_DESIGN §11.3 (item mulai kolom B, ringkasan divisi H:J, RAB Aktual C:G + J:L). **Setiap selisih dicatat sebagai temuan** di akhir dokumen dan diusulkan sebagai ADR baru berstatus Usulan.
4. Nilai di `RAB_CELL_MAP.md` menjadi satu-satunya sumber konstanta untuk T-090; dilarang menebak koordinat di kode exporter.

**Verifikasi:**
```bash
npx tsx scripts/inspect-rab-template.ts > docs/ai/rab-template-dump.txt && head -60 docs/ai/rab-template-dump.txt
```

**Selesai bila:**
- [ ] Keempat sheet terpetakan lengkap
- [ ] Seluruh merge range tercatat
- [ ] Selisih terhadap SYSTEM_DESIGN §11.3 tercatat eksplisit (atau dinyatakan "tidak ada selisih")

**Jangan:** jangan mengubah `Template/RAB_Template.xlsx`. Buka read-only.

---

### T-008 · Kompilasi data seed referensi
**Fase** 0 · **Butuh** T-002 · **Baca** PRD §4.2 · DESIGN_SYSTEM §2.4 · PRD F-4.1 · PRD F-4.2 · PRD F-8.1

**Buat:** `docs/ai/SEED_DATA.md`
**Ubah:** —

**Kontrak:**
Kumpulkan seluruh data referensi menjadi satu berkas agar T-042 tinggal menyalin, tidak menafsir:
1. **6 departemen**: kode, nama, warna hex (DESIGN_SYSTEM §2.4), warna fill, urutan.
2. **8 role**: kode enum + label Indonesia + apakah boleh approve proker / approve surat.
3. **9 kode surat**: kode, nama jenis, varian template, apakah punya template DOCX.
4. **6 preset tujuan surat**: label, nama/jabatan lengkap, alamat default.
5. **9 divisi preset kepanitiaan** (ADR-013): nama + urutan + warna.
6. **app_config awal** — 5 key (`kode_administrasi`, `kode_kegiatan_default`, `kota_default`, `deadline_warning_hari`, `deadline_critical_hari`). Catat eksplisit bahwa `durasi_persiapan_min/max` **sengaja tidak ada** (ADR-008).
7. **12 bulan romawi** sebagai tabel referensi.
8. Setiap tabel menyertakan kolom "sumber" berisi rujukan dokumen agar bisa ditelusuri.

**Verifikasi:**
```bash
grep -c "^|" docs/ai/SEED_DATA.md
```

**Selesai bila:**
- [ ] 8 tabel lengkap, tidak ada sel bertanda TBD
- [ ] Warna 6 departemen persis sama dengan DESIGN_SYSTEM §2.4
- [ ] `durasi_persiapan_min/max` dinyatakan tidak dipakai, dengan rujukan ADR-008

**Jangan:** jangan mengarang nama pengurus, NIM, atau email. Data personal diisi manusia lewat fitur import (T-107).
