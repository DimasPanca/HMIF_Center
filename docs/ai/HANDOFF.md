# HANDOFF.md — Apa yang perlu diketahui sesi berikutnya

**Baca ini di awal setiap sesi.** Berkas ini menyimpan hal-hal yang **tidak
dapat ditemukan di tempat lain**: keadaan riil project sekarang, keputusan yang
lahir di percakapan, jebakan lingkungan, dan langkah berikutnya yang sudah
disepakati.

Yang **tidak** ditulis di sini karena punya rumah lain:

| Pertanyaan | Jawabannya di |
|---|---|
| Aturan proses & konvensi kode | `docs/ai/AGENT_RULES.md` |
| Di mana kode apa | `docs/ai/ARCHITECTURE.md` |
| Kontrak sebuah task | `docs/ai/tasks/P{fase}-*.md` |
| Kontrak fitur (auth, notulensi, dsb.) | `docs/ai/*_CONTRACT.md` |
| Aturan bisnis / produk | `docs/PRD.md`, `docs/SYSTEM_DESIGN.md` |
| Alasan kode begitu | komentar di file + ADR terkait di `docs/adr/` |
| Riwayat pekerjaan | `git log --oneline` — badan commit berisi alasannya |

**Perbarui berkas ini setiap kali ada keputusan yang tidak punya rumah lain.**
Berkas kedaluwarsa lebih berbahaya daripada tidak ada — ia dipercaya.

---

## 1. Keadaan per 2026-09-27

Project berjalan **mode single-agent** (sebelumnya dua-lane data+ui). Konsolidasi
selesai hari ini: infrastruktur lane (`scripts/lane.ts`, `docs/ai/lanes/`,
`PARALLEL_PROTOCOL.md`, `HANDOFF-DATA.md`) dihapus. Semua file boleh disentuh
satu agent.

**~70 dari 116 task selesai.** Angka pasti: hitung sendiri dari `git log
--oneline | grep -c "^[0-9a-f]* T-"` — badan commit memuat status yang lebih
akurat daripada `tasks.json` (yang dibekukan selama fase paralel).

Aplikasi **sudah bisa login**, sudah punya kerangka navigasi
(`app/(dashboard)/layout.tsx`), dan sudah menjalankan alur inti: proker, kanban,
Gantt, dashboard, notulensi (lengkap sejak T-106 UI).

**Koreksi 2026-09-27:** versi sebelumnya berkas ini menyebut "surat" sudah
berjalan — **salah**. Seluruh rantai surat T-054…T-062 belum dikerjakan
(`lib/surat/`, `lib/documents/` masih kerangka T-011). Pemilik produk memutuskan
rantai ini dikerjakan **belakangan** (ADR-025). T-077 juga sudah punya commit
`1c3f8c8` (dengan destination-gate badge surat), bukan lagi blocked.

### Gate hijau saat konsolidasi

```
npm run verify           579 lulus  (typecheck + lint + secret-scan + unit)
npm run db:test          27/27 file lulus (SQL + RLS)
npm run test:e2e         beberapa gate skip-until-UI (dokumentasi eksplisit)
```

### Commit terakhir sebelum konsolidasi

```
afbb6ca Merge pull request #54 from DimasPanca/lane/data
b30f61d T-106 (fondasi data): notulensi rapat — service, sanitasi, DOCX, RLS, gate
0c9a20f Merge pull request #53 from DimasPanca/lane/ui
6283d6e T-106: catat blocker fondasi notulensi
9e06040 T-081: tutup checklist setelah gate integrasi
```

---

## 2. Yang paling baru selesai

### T-057 · uji konkurensi penomoran (2026-10-14)

`scripts/stress-nomor-surat.ts`: 50 klien terpisah lewat transaction pooler
(DATABASE_URL — jalur produksi), barrier sesudah koneksi hidup, tumpang tindih
transaksi diukur. Hasil: 50/50 tumpang tindih → 50 nomor unik berurutan
(1,8 dtk); batch 30 berurutan mengikuti urutan larik; draft dibatalkan tidak
menaikkan counter; 10 retry serentak pada surat sama → satu nomor. 21/21.
Data uji `T057` di periode PERSIAPAN, dibersihkan, counter periode AKTIF
diverifikasi tak tersentuh. **Jangan pernah memanggil `aktifkan_periode` dari
skrip yang meng-commit data** — ia mengarsipkan periode aktif.

Bukan 50 sesi backend: `max_connections = 60`, ±15 dipakai layanan Supabase;
barrier yang menunggu 50 transaksi terbuka di session pooler akan macet.

`supabase/tests/020_nomor_konkuren.sql`: advisory lock dipasang (kunci surat
seed 0 ≠ kunci proker seed 1), counter antar-periode terpisah, nomor terbit
lalu dibatalkan tidak didaur ulang, batch semua-atau-tidak, index unik menolak
nomor kembar, counter tak bisa negatif. Dibuktikan lewat mutasi (lock dihapus
→ test gagal). INV-15 di DB_TEST_MATRIX kini **TERBUKTI**.

### T-056 · service nomor surat (2026-10-14)

`lib/surat/nomor.ts` (aman untuk klien — tx disuntikkan pemanggil):
`previewNomor()` → `05/???/UN43.3.7/HMIF/X/2026` (bulan/tahun dibaca dari
string tanggal, bukan `Date`, supaya tidak bergeser zona waktu);
`alokasiNomor(tx, konteks, suratId)` dan `alokasiNomorBatch(...)` (maks 50)
hanya memanggil `alokasi_nomor_surat` / `alokasi_nomor_batch` (INV-15).
Approver = `konteks.sesi.userId`, surat periode lain = TIDAK_DITEMUKAN,
sudah bernomor = nomor yang sama (retry). `components/surat/NomorSuratBadge.tsx`
+ `salinNomor()`: badge sementara (ikon jam, teks tertulis, tidak dapat
disalin) vs final (mono, ikon centang, tombol salin). Badge final butuh
`ToastProvider`. Test 24 baru.

Signature berbeda dari kontrak (`alokasiNomor(suratId, approverId)`): tx dan
konteks wajib karena alokasi harus satu transaksi dengan transisi status di
route T-060 (K-09), dan approver tidak boleh datang dari parameter (INV-02).

Ditemukan: `lpad` di `alokasi_nomor_surat` memotong nomor urut ≥ 1000 —
dicatat di BACKLOG, belum mendesak.

### T-055 · registrasi template surat (2026-10-14)

`scripts/upload-templates.ts` (+ `--kering`) mengunggah 11 `.docx` ke
`template/{slug}_v{n}.docx` di bucket privat dan mengisi 7 baris
`surat_template` (`storage_key` + `field_schema`). Sudah dijalankan dua kali
terhadap DB dev: jalan 1 = 7 ADOPSI + 4 UNGGAH, jalan 2 = 11 TETAP.
`lib/surat/template-registry.ts`: perencanaan murni (`rencanakanSurat`,
`rencanakanDokumen`) + pembaca runtime `templateAktif(jenis)` /
`templateById(id)`. Test 16 baru.

Keputusan (ADR-027): 4 template dokumen acara (TOR, Proposal, LPJ, Notulensi)
diunggah tetapi **tidak** masuk `surat_template` — versinya konstanta di
`TEMPLATE_DOKUMEN`. Seed 018 tidak disunting (runner migrasi menolak berkas
yang berubah setelah diterapkan). `serialisasiFieldSchema` kini tanpa argumen
`konfig`, karena `field_schema` tidak boleh bergantung pada konfigurasi.

### T-054 · skema field per jenis surat (2026-10-14)

Rantai surat dimulai atas permintaan pemilik produk — penundaan ADR-025
berakhir. `lib/surat/field-schemas.ts` (pabrik `buatSkemaSurat(konfig)`,
diskriminator `jenis` untuk 11 jenis: 7 varian bertemplate + 4 kode generik),
`lib/surat/preset-tujuan.ts` (6 preset, `terapkanPreset`), dan
`lib/surat/konfig.ts` (server-only: `bacaKonfigSurat()` dari `app_config` +
`PDF_ENABLED`, `bacaPresetTujuan()` dari tabel). Test 44/44.

Keputusan penting (ADR-026):
- Nama field `data_dinamis` = nama placeholder template, bukan nama PRD F-4.2.
  Test mencocokkannya **dua arah** dengan tag tiap `.docx` — mengganti nama
  placeholder di `build-templates.ts` kini wajib diikuti skema.
- Skema berbentuk pabrik karena default (`kode_kegiatan`, `kota`) dan opsi PDF
  datang dari server. Halaman T-058 memanggil `bacaKonfigSurat()` lalu
  meneruskan hasilnya sebagai props; route T-058 memanggil pabrik yang sama.
- `serialisasiFieldSchema(konfig, jenis)` adalah isi `field_schema` untuk
  T-055; membawa kunci baru `tetap` (mis. `label_kanan`).
- Penandatangan tambahan paling banyak satu (kolom KIRI, ADR-021).
- Belum dikonfirmasi: redaksi 6 preset tujuan ke Sekum (SEED_DATA §4).

### T-048 · import massal pengguna (2026-09-27)

Kontrak batch ADR-054 dibangun: `lib/auth/import-pengguna.ts` (pratinjau hanya
SELECT; simpan per baris dengan laporan berhasil/gagal/dilewati), route
`api/users/bulk-import` (multipart, mode pratinjau|simpan), komponen generik
`components/shared/ImportPreview.tsx` (pemetaan kolom, ringkasan, lewati per
baris, unduh laporan) — **siap dipakai ulang T-092 dan T-107** — dan
`DialogImportPengguna` di halaman Admin. Keputusan penting: **parsial per
baris, bukan atomik** (akun Supabase Auth tak bisa di-rollback transaksi
Postgres); konfirmasi mengirim ulang berkas, bukan data baris.

### T-047 UI · undangan & manajemen pengguna (2026-09-27)

Halaman `admin/pengguna` (tabel + saring, dialog undang dengan tautan
sekali-tampil, dialog ubah, nonaktif/aktifkan kembali), halaman publik
`undangan/[token]`, route `api/users/{,invite,[id]}` dan `api/auth/activate`.
Gate `undangan` 26/26. Blocker ADR-053 ternyata sudah terselesaikan oleh
`99a361e`; catatan penerapan ditambahkan di ADR itu.

Perubahan di lapisan data:
- Skema dipindah ke `lib/auth/skema-pengguna.ts` (aman untuk klien, K-04).
- `SkemaUbahPengguna` kini memeriksa aturan peran yang sama dengan undangan —
  sebelumnya KADEPT tanpa departemen lolos skema lalu jatuh 500 di CHECK DB.
- `ubahPengguna` menolak menonaktifkan akun sendiri.
- `daftarPenggunaTerlingkup` menegakkan `user: R*` untuk KADEPT/ANGGOTA.

Celah yang dicatat di BACKLOG: **undang ulang** untuk undangan kedaluwarsa belum
ada — pengguna seperti itu buntu.

### T-106 UI · notulensi rapat (2026-09-27)

Routes `app/api/notulensi/**` (daftar/buat, detail/ubah, pengurus, action item
tambah/hapus/konversi, generate DOCX), halaman `app/(dashboard)/sekretariat/
notulensi/{page,baru,[id]}`, komponen `components/notulensi/*` (editor TipTap,
daftar hadir, keputusan, action item, form). Gate `notulensi` 14/14.

Keputusan yang lahir di sini (ADR-025):
- T-106 dikerjakan mendahului T-061 atas persetujuan pemilik produk; pengecualian
  **tidak** berlaku untuk task surat/dokumen lain.
- Lingkup baca notulensi (`R*`/`CRU*`) kini ditegakkan di service.
- Skema Zod notulensi pindah ke `lib/notulensi/skema.ts` (aman untuk klien).

Sisa di luar kontrak (hapus notulensi, lampiran, pengetatan RLS SELECT) →
`docs/ai/BACKLOG.md`.

### T-106 · fondasi data notulensi

Commit `b30f61d`. 11 file dibuat/diubah, 1646 baris ditambah.

- `supabase/migrations/027_notulensi.sql` — kolom `konten_teks` + `cari_tsv`
  (tsvector STORED) untuk pencarian isi; tabel `notulensi_lampiran`; kolom
  `action_item.departemen_id`; helper `notulensi_boleh_tulis`; RLS attendance/
  action_item/lampiran/notulensi berlingkup periode+departemen dari notulensi
  induk.
- `lib/notulensi/service.ts` — daftar/detail/pencarian isi, buat & perbarui
  transaksional, daftar hadir, keputusan terpisah, action item, konversi ke
  Kanban (lock `FOR UPDATE`, anti-duplikasi), generate DOCX. Lingkup dipaksakan
  di service.
- `lib/notulensi/sanitasi.ts` — allowlist TipTap JSON (node/mark aman, href
  aman) + ekstraksi teks pencarian.
- `lib/notulensi/docx.ts` — generate DOCX dari `templates/notulensi.docx`
  (docxtemplater + pizzip).
- `docs/ai/NOTULENSI_CONTRACT.md` — bentuk data, kode→HTTP, izin per role,
  data-testid wajib.
- `e2e/notulensi.spec.ts` — gate data-owned 8 skenario, skip-until-UI.
- `supabase/tests/027_notulensi.sql` — RLS negatif: lintas-departemen, BPH,
  periode bertentangan, multi-role sah, himpunan hanya pimpinan/Sekum.
- `lib/notulensi/__tests__/notulensi.test.ts` — unit sanitasi/ekstraksi/skema/
  lingkup (12 test).
- `package.json` — tambah `@tiptap/extension-{table,-row,-cell,-header,
  task-list,task-item}@3.31.0` (pin exact karena peer-dep ke `@tiptap/core`).

---

## 3. Blocker aktif

1. **[DIBUKA 2026-10-14] Rantai surat sedang dikerjakan.** T-054…T-057
   selesai; berikutnya T-058 (form), lalu T-059, T-060 → T-061.
   Yang menunggu rantai ini: T-063, T-064, T-095 (TOR), T-096 (Proposal),
   T-105 (LPJ), T-108 (Peminjaman ruangan), dan T-113…T-116.
2. **Daftar hadir notulensi kosong sampai T-107.** Tabel `pengurus` berisi 0
   baris; T-107 (Data pengurus) yang mengisinya. T-048 kini selesai, jadi
   T-107 siap dikerjakan — kecuali bagian "generate massal Surat Aktif
   Organisasi" (ADR-052) yang butuh T-064 dari rantai surat yang ditunda.
   Putuskan: T-107 dikerjakan tanpa bagian itu (tulis ADR), atau menunggu.
3. **[DIPERBAIKI 2026-09-27 — migrasi 028 + `withAuditContext(req, pelaku, fn)`; `db:reset` dari kosong BELUM dijalankan]** `audit_log.user_id` selalu NULL untuk mutasi aplikasi (INV-07).
   Ditemukan 2026-09-27: `fn_audit` membaca pelaku dari `auth.uid()`, tetapi
   `withAuditContext` hanya menyetel `app.ip`/`user_agent`/`periode_id`. Semua
   baris audit trigger (proker, app_user, user_role, periode) tanpa pelaku.
   Butuh migrasi `konteks_user_id()` + `set_config('app.user_id')` di
   `withAuditContext` + ubah semua pemanggil. Sudah diajukan sebagai task
   terpisah.
4. **Pola blocker lama "menunggu lane lain".** Banyak task (T-078, T-082, T-107…)
   ditandai blocked di era dua-lane karena satu sisi menunggu sisi lain. Di mode
   single-agent periksa ulang: sering kali blocker-nya sudah hilang (seperti
   ADR-053).

---

## 4. Jebakan lingkungan yang sudah ditemukan

Delapan hal yang tidak obvious dari kode:

0. **Node 22 wajib (`.nvmrc`, `engines.node >=22`).** Di Node 20, 6 test
   storage gagal palsu ("native WebSocket not found", `markAsUncloneable is not
   a function`) — bukan bug kode. Ditemukan 2026-10-14 di mesin yang PATH-nya
   mendahulukan Node 20.

1. **Koneksi app bypass RLS.** `withAuditContext()` set audit config
   (`app.ip`/`user_agent`/`periode_id`) tapi **tidak** set
   `request.jwt.claims`, jadi service **harus** memaksakan lingkup di JS. RLS
   menjaga akses langsung/authenticated saja (diuji `db:test` dengan
   `SET LOCAL ROLE authenticated`).
2. **RLS scope correlation.** Role+departemen harus di baris `user_role` yang
   **sama** — bukan pakai `my_departemen()` set yang mencampur role
   (BPH-with-dept bocor).
3. **`db:reset` menghapus akun e2e dan mengosongkan `field_schema`.** Setelah
   tiap `db:reset`, wajib `npm run seed:e2e-auth` dan
   `npx tsx scripts/upload-templates.ts` sebelum menjalankan test e2e atau
   form surat (ADR-027).
4. **TipTap extension peer-dep exact.** Semua `@tiptap/*` harus sama versi
   `@tiptap/core` (saat ini 3.31.0). `^3.6.2` gagal `ERESOLVE`.
5. **Realtime butuh JWT.** `klien.realtime.setAuth(access_token)` +
   `onAuthStateChange` diperlukan supaya RLS aktif di realtime channel
   (`lib/realtime/use-master-gantt-realtime.ts`).
6. **Gate e2e gagal di jalan pertama pada dev server dingin.** Halaman berat
   (mis. editor TipTap) dikompilasi saat diminta pertama kali dan bisa melewati
   batas 30 dtk/test. Jalankan ulang sekali sebelum menganggapnya bug; kalau
   gagal lagi, itu nyata.
7. **Tombol toolbar editor wajib `onMouseDown={e => e.preventDefault()}`.**
   Tanpa itu tombol mencuri fokus dan TipTap memulihkannya lewat
   `requestAnimationFrame`, yang tak berjalan di tab tak terlihat — teks jatuh di
   luar node yang baru dibuat.

---

## 5. Langkah berikutnya (rekomendasi)

1. **Jalankan `npm run db:reset && npm run seed:e2e-auth`** untuk verifikasi migrasi 028 dari kosong (menghapus isi DB dev). Perbaikan `audit_log.user_id` — pelanggaran invariant yang
   diam-diam, makin banyak baris audit tanpa pelaku setiap hari.
2. **T-107 Data pengurus** — pakai ulang `ImportPreview` dan pola
   `import-pengguna.ts`. Ini yang membuat daftar hadir notulensi berisi. Bagian
   surat massal menunggu T-064 (lihat blocker #2).
3. **Task di luar rantai surat** (21 task, mis. T-083 peringatan deadline,
   T-084…T-094 acara/RAB, T-097…T-104 nota, T-110…T-112 backup) — pilih yang
   `depends_on`-nya DONE.
4. **Rantai surat — sedang berjalan.** T-058 (form, pakai `bacaKonfigSurat` +
   `templateAktif` + `previewNomor`) → T-059 → T-060 (pakai `alokasiNomor`) →
   T-061 → T-062, lalu turunannya. Jalankan ulang `stress-nomor-surat.ts`
   setiap kali `alokasi_nomor_surat` disunting.

`tasks.json` tidak bisa dipercaya untuk status task lama (dibekukan selama fase
paralel): cek `git log --oneline | grep " T-0XX"` sebelum menganggap sebuah
dependency DONE. Baca kontrak di `docs/ai/tasks/P{fase}-*.md`.
