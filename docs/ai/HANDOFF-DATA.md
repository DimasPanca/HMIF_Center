# HANDOFF-DATA.md — apa yang perlu diketahui sesi berikutnya

Berkas ini untuk agent lane `data` yang memulai sesi baru — **termasuk Codex,
yang mengambil alih lane ini saat Claude kena limit.** Isinya **hanya** hal-hal
yang tidak dapat ditemukan di tempat lain: keputusan yang lahir di percakapan,
jebakan lingkungan yang sudah terlanjur ditemukan, dan arah yang diminta pemilik
produk.

Yang **tidak** ditulis di sini karena sudah ada tempatnya:

| Pertanyaan | Jawabannya di |
|---|---|
| Aturan main lane, batas berkas | `CLAUDE.md`, `AGENTS.md`, `docs/ai/PARALLEL_PROTOCOL.md` |
| Task berikutnya apa | `npx tsx scripts/lane.ts status data` |
| **Rencana & urutan gelombang ini** | **`docs/ai/RENCANA-GELOMBANG-3.md`** |
| Kontrak sebuah task | `docs/ai/tasks/P{fase}-*.md` |
| Tanda tangan yang dipanggil lane ui | `docs/ai/AUTH_CONTRACT.md`, `docs/ai/PROKER_CONTRACT.md` |
| Kenapa sebuah kode begitu | komentar di berkasnya, dan ADR terkait |
| Apa yang sudah dikerjakan | `git log --oneline` — badan commit memuat alasannya |

**Perbarui berkas ini** setiap kali ada keputusan yang tidak punya rumah lain.
Berkas yang kedaluwarsa lebih berbahaya daripada tidak ada berkas sama sekali:
ia dipercaya.

---

## 1. Keadaan per 2026-09-04

**53 dari 116 task selesai — 45,7%.** Lane data 35/44, lane ui 10/37.

Aplikasi **sudah dapat di-login**, tetapi **belum punya kerangka navigasi**.
Yang ada hanya `/login` dan halaman harness `/qa/gantt`. T-051 (Layout, sidebar,
header) belum dikerjakan, dan ia menahan tujuh task lain — lihat jalur kritis di
`RENCANA-GELOMBANG-3.md` §3.

Gate yang hijau dan stabil saat ini:

```
npm run verify                     336 lulus
npm run db:test                     23 lulus
npx tsx scripts/stress-anti-bentrok.ts   22 lulus, 5 jalan berturut-turut
npm run test:e2e -- login           31 lulus, 1 sengaja dilewati
npx tsx scripts/bench-gantt.ts       3 kasus di bawah target
```

Dua gate menunggu pekerjaan lane ui dan **dilewati dengan pesan yang menyebut
persis apa yang kurang** — itu disengaja, bukan kerusakan:

```
npm run test:e2e -- gantt-perf      10 dilewati tanpa harness berdataset
npm run test:e2e -- gantt-editor    13 dilewati, harness /qa/gantt-editor belum ada
```

---

## 2. Untuk Codex yang mengambil alih lane ini

Pemilik produk memberikan `.env.local` **penuh** ke worktree Codex supaya lane
`data` tidak berhenti saat Claude kena limit. Lima hal yang berbeda dari lane
`ui` dan mudah terlewat:

1. **Hanya lane ini yang boleh menyentuh database.** Migrasi ganda dari dua
   agent merusak state migrasi secara permanen.
2. **Setiap migrasi wajib jalan dari database kosong.** Jalankan
   `npm run db:reset` setelah setiap task migrasi, lalu **`npm run seed:e2e-auth`**
   — reset menghapus fixture E2E dan gate login akan gagal seluruhnya tanpa itu.
3. **Nomor migrasi berikutnya adalah 020.** Kontrak T-076 menyebut `019_realtime.sql`;
   nomor itu sudah dipakai `019_setujui_proker_serial.sql`. Selalu cek
   `ls supabase/migrations/` sebelum menamai.
4. **Rentang ADR lane ini 020–039.** Terpakai: 020, 021, 022, 023.
5. **`npx tsx scripts/lane.ts guard data` wajib sebelum commit.** Ia membaca
   `git status` dan menolak bila kamu menyentuh berkas lane `ui`. Itu satu-satunya
   hal yang mencegah dua agent saling merusak.

**Jaring pengaman yang hilang karena keputusan kredensial ini.** Sampai hari ini,
worktree lane ui yang miskin kredensial adalah detektor: ia menangkap pola bug
"baca env saat modul dimuat" tiga kali. Penggantinya `npm run check:lazy-env`,
sudah masuk `npm run verify`. Jangan dilepas dari sana — pada jalan pertamanya ia
langsung menemukan kejadian keempat di `lib/db/connection.ts`.

---

## 3. Arah yang diminta pemilik produk

**Fitur ringan lebih dulu; surat, RAB, TOR, nota, dan LPJ menyusul.** Targetnya
aplikasi dapat dibuka dari HP lewat Vercel, dengan Gantt dan daftar proker yang
benar-benar bisa dipakai.

Seluruh rinciannya — cakupan, jalur kritis, pembelahan 26 task, dependensi yang
dilonggarkan — ada di **`docs/ai/RENCANA-GELOMBANG-3.md`**. Baca berkas itu
sebelum mengklaim task pertama.

Yang paling perlu diingat dari sana: **pembelahan task campuran sudah diputuskan
seluruhnya di muka** dan tercatat di `PEMBAGIAN` serta `TURUNAN` di
`scripts/lane.ts`. Tidak perlu lagi memutuskannya sendiri saat mengklaim — cara
lama sudah dua kali menghentikan pekerjaan di tengah.

---

## 4. Jebakan lingkungan yang sudah ditemukan

Enam hal ini sudah pernah memakan waktu. Jangan mengulanginya.

### 4.1 Ada DUA pembatas percobaan login

Satu milik aplikasi (`lib/auth/rate-limit.ts`, 5 percobaan / 15 menit per
email+IP), satu lagi milik Supabase sendiri di depan endpoint sign-in-nya.

Gate login melakukan puluhan sign-in tiap jalan. Menjalankannya berulang dalam
waktu singkat akan menabrak pembatas Supabase, dan **login dengan password yang
benar pun ditolak**. Gejalanya menyesatkan: test yang gagal berpindah-pindah,
dan yang tertuduh biasanya halaman login.

Bila pesannya menyebut *"dari jaringan ini"*, itu pembatas Supabase — tunggu
beberapa menit sebelum menyalahkan kode.

### 4.2 `db:test` dan fixture E2E saling meniadakan

`seed:e2e-auth` meninggalkan satu periode berstatus `AKTIF` karena login memang
membutuhkannya. `periode_hanya_satu_aktif` mengizinkan paling banyak satu.

Sudah diperbaiki di `scripts/db-test.ts`: runner mengarsipkan periode aktif di
dalam transaksi yang tetap di-ROLLBACK, jadi fixture utuh dan test melihat
keadaan awal yang sama. **Jangan** mengembalikannya menjadi asumsi "database
kosong" — 18 dari 22 berkas pernah gagal karenanya, tanpa satu pun menyebut
sebab sebenarnya.

Pelajaran yang sama berlaku umum: **assertion yang menghitung seluruh isi sebuah
tabel bersama akan pecah begitu ada lalu lintas sungguhan.** `900_integrasi.sql`
kena persis itu dan kini dibatasi pada periode miliknya sendiri.

### 4.3 E2E dijalankan dua worker, bukan setengah jumlah core

Yang diperebutkan bukan CPU melainkan tiga hal yang memang tunggal: satu dev
server yang mengkompilasi rute saat pertama diminta, satu proyek Supabase, satu
database. Pada enam worker, `waitForSelector` menunggu 30 detik untuk form yang
muncul dalam sedetik.

Alasannya tertulis di `playwright.config.ts`. Jangan dinaikkan tanpa mengukur.

### 4.4 Pola bug yang berulang: membaca env saat modul dimuat

Sudah **empat** kali: `lib/storage/index.ts`, `lib/storage/supabase-adapter.ts`,
`lib/db/client.ts`, dan `lib/db/connection.ts`. Gejalanya sama tiap kali —
worktree yang tidak memegang kredensial penuh gagal bahkan untuk hal yang tidak
menyentuh kredensial itu, dan build Vercel ikut gagal dengan pesan yang menunjuk
ke dalam node_modules.

**Baca env di dalam fungsi, bukan di tingkat modul.** Pola yang dipakai keempatnya
sama: Proxy yang membuat klien saat method pertama dipanggil, dan tetap gagal
keras menyebut nama variabelnya. Dijaga `npm run check:lazy-env`.

### 4.5 Beban BESAR justru bukan yang menyingkap race condition

T-066 menjalankan dua skenario: dua approval bersamaan, dan sepuluh approval
bersamaan. Yang **sepuluh selalu lulus**; yang **dua gagal pada dua dari tiga
jalan** dengan deadlock (40P01).

Sebabnya masuk akal setelah dilihat: pada sepuluh pesaing, satu menyisipkan
lebih dulu dan sembilan sisanya mengantre di belakang SATU baris — tidak ada
siklus. Pada dua pesaing, keduanya menyisipkan hampir bersamaan dan saling
menunggu.

Pelajarannya berlaku umum: **menaikkan jumlah pesaing tidak membuat uji
konkurensi lebih tajam.** Kasus dua — yang paling mungkin terjadi di organisasi
berisi enam departemen — justru yang paling mudah terlewat.

Sudah diperbaiki lewat migrasi `019_setujui_proker_serial.sql` (ADR-022).
`supabase/tests/021_konflik_konkuren.sql` menguji keberadaan advisory lock-nya
langsung lewat `pg_locks`, bukan hanya akibatnya — tanpa itu, menghapus kunci
tersebut tidak membuat satu pun test merah.

### 4.6 `db:reset` menghapus fixture E2E

`db:reset` menjalankan seluruh migrasi dari nol, dan periode "Periode Uji E2E"
beserta **empat** akunnya ikut hilang. Gate login akan gagal seluruhnya
sesudahnya, dengan pesan yang menunjuk halaman login.

Jalankan `npm run seed:e2e-auth` setiap kali sesudah `db:reset`.

Akun keempat, `e2e-bph@uji.test`, ditambahkan untuk T-078: ia dapat masuk tetapi
**tidak berhak menulis apa pun**. Tanpa akun seperti itu, separuh kontrak T-078
("API menolak pengguna tanpa izin") tidak dapat diuji siapa pun — tiga akun
lainnya entah tidak dapat masuk sama sekali, entah masuk sebagai KETUA yang
justru berhak penuh.

### 4.7 Angka performa mode dev hampir seluruhnya bundle, bukan aplikasi

Diukur: harness Gantt berisi **tiga baris** memakan 400–530 ms dari anggaran
500 ms PRD. Angka absolut di mode dev karena itu tidak dapat dipakai menilai
apa pun, dan gate yang menegakkannya melempar koin — terbukti, dua jalan
berturut-turut atas kode yang sama memberi 2 gagal lalu 10 lulus.

Harness sengaja tidak dapat dicapai di produksi (dua lapis, keduanya
disengaja), jadi tidak ada lingkungan lain untuk mengukurnya. Yang ditegakkan
sekarang biaya **marginal** terhadap baseline, virtualisasi, dan 60 fps. Lihat
ADR-023 — dan **jangan membaca kelulusan gate itu sebagai "100 task render di
bawah 500 ms di produksi".** Itu belum pernah diukur siapa pun.

---

## 5. Yang masih menunggu manusia

| # | Hal | Catatan |
|---|---|---|
| 1 | **Rotasi publishable key Supabase** | Nilainya pernah masuk commit di GitHub. **Wajib sebelum deploy publik** — begitu URL-nya hidup, kuncinya terpapar. |
| 2 | Status DONE **T-074** ditinjau | Ditutup atas 10/10 lulus di mesin lane ui; tidak reproduksi di mesin lain (3/10 gagal). Lihat ADR-023. |
| 3 | **ADR-023** berstatus *Usulan* | Gate performa menegakkan biaya marginal, bukan angka absolut. Kriteria absolut PRD F-6.3 belum pernah terverifikasi. |
| 4 | **ADR-022** berstatus *Usulan* | Advisory lock approval proker, sudah diimplementasikan migrasi 019. |
| 5 | **ADR-021** berstatus *Usulan* | Sebelas template sudah memakainya. Menunggu sejak gelombang kedua. |
| 6 | Temuan 10 `TEMPLATE_MAPPING.md` | LPJ tidak punya tabel keuangan sama sekali padahal PRD F-12.1 menuntut empat bagiannya. Pekerjaan T-093, fase yang ditunda. |
| 7 | Buka sebelas template di Word | Memastikan tidak ada peringatan korupsi. Tidak memblokir gelombang ini. |

---

## 6. Cara memulai sesi baru

Sesi baru **tidak perlu diberi ringkasan panjang**. Cukup:

```
Baca CLAUDE.md, docs/ai/HANDOFF-DATA.md, lalu docs/ai/RENCANA-GELOMBANG-3.md.
Jalankan: npx tsx scripts/lane.ts status data
Lanjutkan dari situ.
```

Bila menyambung pekerjaan yang setengah jalan, tambahkan satu kalimat tentang
apa yang sedang dikerjakan — sisanya ada di `git log` dan di berkas ini.
