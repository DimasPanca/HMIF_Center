# RENCANA-GELOMBANG-3.md — fitur ringan dulu, dokumen berat menyusul

Keputusan pemilik produk **2026-09-04**. Berkas ini mengikat sampai dicabut:
`scripts/lane.ts` menegakkan pembagiannya secara mekanis, dan alasan tiap
keputusan ada di sini supaya tidak perlu ditebak ulang.

---

## 1. Empat keputusan yang membentuk gelombang ini

| | Keputusan |
|---|---|
| **Cakupan** | Bundel **C** — seluruh fitur ringan. Ditunda: P2 persuratan, P5 RAB, P6 TOR & Proposal, P7 nota & LPJ. |
| **Target rilis** | **Vercel, dapat dibuka dari HP.** Bukan localhost. |
| **Kredensial** | Codex memperoleh `.env.local` **penuh** supaya dapat memegang lane `data` saat Claude kena limit. |
| **Struktur lane** | Tetap **dua lane**. Codex bergantian `lane/data` dan `lane/ui`, `guard` tetap wajib. |

Keadaan saat keputusan diambil: **53 dari 116 task selesai (45,7%)**. Lane data
35/35 habis tanpa sisa READY; lane ui tinggal T-078. Tujuh puluh task belum
pernah dibagi ke lane mana pun — itulah yang dibereskan berkas ini.

---

## 2. Yang dikerjakan gelombang ini

Dua puluh enam task, ditambah sepuluh task turunan hasil pembelahan.

```
P1 sisa   T-047 T-048 T-049 T-050 T-051 T-052 T-053
P3        T-065-UI T-067 T-068 T-069 T-070 T-071 T-075 T-076 T-077 T-078 T-079
P4        T-080 T-081 T-082 T-083
P8        T-106 T-107 T-108 T-109
P9        T-113            <- minimum untuk deploy publik
```

**Tidak dikerjakan:** T-054…T-064 (persuratan), T-084…T-096 (RAB, TOR,
Proposal), T-098…T-105 (nota, LPJ), T-110…T-112 (backup), T-114, T-115.

---

## 3. Jalur kritis — kerjakan dengan urutan ini

Satu task menahan tujuh task lain sekaligus, dan ia sendiri hanya menunggu satu
task. Itu titik ungkit terbesar gelombang ini:

```
T-050 Periode  ->  T-051 Layout/Sidebar  ->  T-052, T-053, T-080, T-106, T-109
                                              (dan lewat T-080: T-081, T-082)
```

Sampai T-051 selesai, aplikasi **belum punya kerangka navigasi sama sekali** —
yang ada hanya `/login` dan halaman harness `/qa/*`. Sebagus apa pun Gantt-nya,
belum ada tempat untuk membukanya.

Urutan yang disarankan:

**Tahap 1 — buka kunci** (paralel di dua lane)
```
ui    T-050  ->  T-051
data  T-047  ->  ui T-047-UI  ->  data T-048  ->  ui T-048-UI
ui    T-065-UI          <- empat route handler di atas service yang sudah ada
```

**Tahap 2 — proker & Gantt** (inti permintaan pemilik produk)
```
ui    T-067  ->  data T-068  ->  ui T-068-UI  ->  ui T-069
      ->  data T-070  ->  ui T-070-UI  ->  ui T-075
      ->  data T-071  ->  ui T-071-UI
      ->  data T-076  ->  ui T-076-UI
      ->  data T-079  ->  ui T-079-UI
ui    T-078            <- gate-nya sudah ada, tinggal komponen & API
```

**Tahap 3 — fitur ringan sisanya**
```
ui    T-049, T-052, T-053, T-077
ui    T-080  ->  T-081, T-082
data  T-083  ->  ui T-083-UI
ui    T-107  ->  T-108
ui    T-106, T-109
```

**Tahap 4 — rilis**
```
data  T-113  ->  ui T-113-UI  ->  deploy Vercel
```

---

## 4. Pembelahan task campuran

Sebelas task menulis di dua lane sekaligus. **Pembelahannya sudah diputuskan
seluruhnya di muka** dan tercatat di `PEMBAGIAN` serta `TURUNAN` di
`scripts/lane.ts`.

Cara lama — memutuskan pembelahan saat task diklaim — sudah **dua kali**
menghentikan pekerjaan di tengah: T-074 dan T-078 sama-sama baru ketahuan butuh
berkas milik lane lain setelah separuhnya selesai ditulis.

| Task | Lane `data` menulis | Lane `ui` menulis (task turunan) |
|---|---|---|
| T-065 | `lib/proker/{service,schema,status}.ts` ✅ selesai | `T-065-UI` — `app/api/proker/{route,[id],cek-konflik,kalender}` |
| T-047 | `lib/auth/invitation.ts` | `T-047-UI` — halaman admin/pengguna, undangan, `app/api/users/**` |
| T-048 | `lib/import/parse-tabel.ts` | `T-048-UI` — `app/api/users/bulk-import`, `ImportPreview.tsx` |
| T-068 | `lib/proker/wizard-state.ts` | `T-068-UI` — `app/(dashboard)/proker/baru`, komponen wizard 1–3 |
| T-070 | `lib/kepanitiaan/bentuk-otomatis.ts` | `T-070-UI` — halaman approval, `app/api/proker/[id]/{approve,reject,revisi}` |
| T-071 | `lib/proker/klasifikasi-perubahan.ts` | `T-071-UI` — `app/(dashboard)/proker/[id]`, ubah route PATCH |
| T-076 | `lib/realtime/**`, migrasi `020_realtime.sql` | `T-076-UI` — `KoneksiBanner.tsx`, langganan di `MasterGantt.tsx` |
| T-079 | `lib/cron/**`, `vercel.json` | `T-079-UI` — `app/api/cron/harian/route.ts` |
| T-083 | `lib/deadline.ts`, `lib/cron/cek-deadline.ts` | `T-083-UI` — `DeadlineBadge.tsx`, ubah `KanbanCard.tsx` |
| T-113 | `lib/security/**`, `next.config.ts`, `middleware.ts` | `T-113-UI` — terapkan sanitasi di route handler |
| T-074 | gate & benchmark ✅ selesai | ✅ selesai (status ditinjau, lihat §7) |

Task turunan **selalu bergantung pada induknya**. Itu bukan formalitas: tanpa
`depends_on`, separuh ui akan tampil READY sejak hari pertama dan lane ui akan
menulis route handler untuk fungsi yang tanda tangannya belum ada.

**Setiap separuh data yang dipanggil lane ui wajib meninggalkan berkas kontrak**
`docs/ai/<DOMAIN>_CONTRACT.md`, mengikuti `AUTH_CONTRACT.md` (T-045) dan
`PROKER_CONTRACT.md` (T-065). Keduanya terbukti: lane ui tidak perlu membaca
kode untuk tahu bentuk argumen yang diterimanya.

---

## 5. Dependensi yang dilonggarkan, dan apa yang hilang karenanya

Empat task bundel C bergantung pada task di fase yang **ditunda**. Dibiarkan apa
adanya, keempatnya tidak akan pernah READY dan bundel ini tidak dapat
diselesaikan sama sekali.

`depends_on` aslinya ada di `tasks.json` yang **BEKU**. Pelonggarannya karena
itu dicatat eksplisit di `PELONGGARAN` (`scripts/lane.ts`), dicetak setiap kali
`sync --init` dijalankan, dan mudah dicabut.

| Task | Dilepas dari | Yang TIDAK ikut selesai |
|---|---|---|
| T-077 Dashboard | T-060 | Panel Sekum berisi antrean approval surat |
| T-106 Notulensi | T-061 | Endpoint `generate` notulensi (butuh Document Engine) |
| T-108 Ruangan | T-058 | Tautan ke surat peminjaman |
| T-113 Hardening | T-105, T-096, T-112 | — audit hanya mencakup rute yang ada saat dijalankan |

> **T-113 WAJIB diulang** setelah fase berat masuk. Audit keamanan yang
> dijalankan atas separuh aplikasi tidak berlaku untuk separuh sisanya.

Yang **tidak** dilonggarkan: ketergantungan antar-task di dalam gelombang ini.
Melonggarkannya berarti mengizinkan halaman ditulis sebelum service yang
dipanggilnya ada.

Bagian yang hilang di atas **wajib disebut di laporan task masing-masing.**
Jangan ditutup seolah tidak pernah ada di kontrak.

---

## 6. Tiga jebakan yang sudah menunggu

### 6.1 Nomor migrasi 019 sudah terpakai

Kontrak T-076 menyebut `supabase/migrations/019_realtime.sql`. **Nomor itu sudah
dipakai** `019_setujui_proker_serial.sql` (ADR-022). Menulis 019 kedua akan
ditolak checksum runner, atau lebih buruk, menimpa berkas yang ada.

**Pakai `020_realtime.sql`.** Sebelum menamai migrasi apa pun:
`ls supabase/migrations/` — nomor berikutnya adalah yang tertinggi + 1.

### 6.2 `db:reset` menghapus fixture E2E

`npm run db:reset` menjalankan seluruh migrasi dari nol dan periode "Periode Uji
E2E" beserta empat akunnya ikut hilang. Gate login akan gagal seluruhnya
sesudahnya, dengan pesan yang menuduh halaman login.

**Jalankan `npm run seed:e2e-auth` setiap kali sesudah `db:reset`.**

### 6.3 Dua pembatas percobaan login

Satu milik aplikasi (`lib/auth/rate-limit.ts`, 5 percobaan / 15 menit per
email+IP), satu lagi milik Supabase di depan endpoint sign-in-nya. Menjalankan
gate login berulang dalam waktu singkat menabrak pembatas Supabase, dan **login
dengan password yang benar pun ditolak**.

Bila pesannya menyebut *"dari jaringan ini"*, itu pembatas Supabase — tunggu
beberapa menit sebelum menyalahkan kode.

---

## 7. Yang menunggu keputusan manusia

| # | Hal | Kenapa mendesak |
|---|---|---|
| 1 | **Rotasi publishable key Supabase** | Nilainya pernah masuk commit di GitHub. **Wajib sebelum deploy publik**, bukan sebelum data asli masuk — begitu URL-nya hidup, kuncinya terpapar. |
| 2 | Status DONE **T-074** ditinjau | Ditutup atas 10/10 lulus di mesin lane ui; tidak reproduksi di mesin lain (3/10 gagal). Lihat ADR-023. |
| 3 | **ADR-023** — gate performa menegakkan biaya marginal, bukan angka absolut | Kriteria absolut PRD F-6.3 belum pernah terverifikasi oleh siapa pun. Usul: ukur di T-075 pada halaman sungguhan. |
| 4 | **ADR-022** — advisory lock approval proker | Sudah diimplementasikan migrasi 019. Perlu diterima atau ditolak. |
| 5 | **ADR-021** — blok tanda tangan template | Sebelas template sudah memakainya. Menunggu sejak gelombang kedua. |
| 6 | Buka sebelas template di Word | Memastikan tidak ada peringatan korupsi. Tidak memblokir gelombang ini. |

---

## 8. Perubahan cara kerja — apa yang diubah dan kenapa

Lima hal yang terbukti memakan waktu di dua gelombang sebelumnya, beserta
perbaikannya yang sudah dipasang.

### 8.1 Gate E2E ditulis LEBIH DULU, bukan sesudah

`e2e/**` milik lane `data`, tetapi sebagian besar gate memverifikasi pekerjaan
lane `ui`. Akibatnya dua kali: T-074 dan T-078 sama-sama tidak dapat dibuktikan
karena berkas gate-nya belum ada, dan lane ui terpaksa menulis ADR untuk
melaporkan kebuntuannya.

**Aturan baru:** untuk task ui yang verifikasinya berupa gate E2E, lane data
menulis gate-nya **sebelum** task ui dimulai. Gate itu `test.skip()` dengan
pesan yang menyebut persis apa yang kurang, jadi ia hijau sampai pekerjaannya
datang. Sudah dipakai dua kali dan bekerja: `gantt-perf.spec.ts` dan
`gantt-editor.spec.ts`.

### 8.2 Harness QA dengan parameter query

Menguji komponen lewat halaman sungguhan menyeret autentikasi, periode aktif,
seed, dan RLS — satu di antaranya berubah dan gate gagal karena hal yang tidak
ada hubungannya.

**Pola yang dipakai:** `/qa/<fitur>?<varian>` — halaman nonproduksi, data tetap,
tanpa sesi. Sudah terbukti pada `/qa/gantt` (T-073, T-074) dan sudah dikontrakkan
untuk `/qa/gantt-editor` (T-078). Dijaga dua lapis supaya tidak dapat dicapai di
produksi: pengecualian middleware hanya berlaku di luar produksi, dan halamannya
memanggil `notFound()`.

### 8.3 `sync --init` tidak lagi menghapus pekerjaan

Versi lama membangun state **sepenuhnya** dari `tasks.json`. Karena berkas itu
beku dan hanya diperbarui di sync point, sepuluh task yang selesai sesudah sync
terakhir masih tercatat TODO di sana — termasuk T-045, T-065, T-066, T-072,
T-073, T-074. Menjalankan `sync --init` akan mengembalikan kesepuluhnya menjadi
TODO **tanpa satu pun peringatan**.

Sekarang status diambil dari state lane yang sudah ada, dan task yang keluar
dari `PEMBAGIAN` dilaporkan — bukan dibuang diam-diam.

### 8.4 Detektor "baca env saat modul dimuat" diganti

Sampai keputusan hari ini, worktree lane ui sengaja tidak memegang kredensial
penuh. Itu bukan sekadar hak minimum — ia **detektor**, dan menangkap pola bug
yang sama tiga kali (`lib/storage/index.ts`, `lib/storage/supabase-adapter.ts`,
`lib/db/client.ts`).

Sejak kedua lane memegang kredensial penuh, detektor itu hilang. Penggantinya
`npm run check:lazy-env`, sudah masuk `npm run verify`: environment dikosongkan,
lalu setiap modul server di `lib/` diimpor satu per satu.

Pada jalan pertamanya ia langsung menemukan **kejadian keempat** yang selama ini
lolos karena lane ui kebetulan tidak pernah mengimpornya —
`lib/db/connection.ts`. Sudah diperbaiki dengan pola Proxy yang sama.

### 8.5 Satu task satu commit, laporan berisi output nyata

Tidak berubah, tetapi patut diulang: laporan tanpa output verifikasi nyata tidak
dapat dipercaya, dan gate yang merah karena hal sepele lama-lama diabaikan —
yang mematikan gate yang kelak merah karena sebab sungguhan.

---

## 9. Yang harus disiapkan pemilik produk

**Sebelum Codex mengambil alih lane `data`:**

1. Salin `.env.local` ke worktree Codex. Berkas itu tidak masuk version control.
2. **Rotasi `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` lebih dulu** — nilainya pernah
   masuk commit di GitHub. Perbarui di kedua worktree sesudahnya.
3. Tidak perlu `npm install`: gelombang ini tidak menambah dependency.

**Sebelum deploy Vercel:**

4. Buat proyek Vercel, isi environment variable: `DATABASE_URL`, `DIRECT_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `SCHEMA_VERSION`,
   `MAX_UPLOAD_BYTES`, `STORAGE_*`. Rinciannya di `docs/ai/ENV_SETUP.md`.
5. `vercel.json` mendaftarkan Vercel Cron dan dibuat T-079 — jangan dibuat tangan.

**Yang tidak boleh dilupakan:** harness `/qa/*` tidak dapat dicapai di produksi,
dan itu disengaja. Jangan melonggarkannya demi mengukur performa; usulan
penggantinya ada di ADR-023.

---

## 10. Antrean gate E2E — status per 2026-09-04

Setiap task ui gelombang ini diverifikasi lewat `e2e/*.spec.ts`, dan **seluruh
`e2e/**` milik lane data.** Tanpa gate-nya ditulis lebih dulu, lane ui akan
menabrak tembok T-074/T-078 tiga belas kali lagi (§8.1).

| Gate | Untuk | Status |
|---|---|---|
| `undangan.spec.ts` | T-047-UI | ✅ ada — 13 test |
| `periode.spec.ts` | T-050 | ✅ ada — 13 test |
| `sidebar-role.spec.ts` | T-051 | ✅ ada — 15 test |
| `gantt-perf.spec.ts` | T-074 | ✅ ada |
| `gantt-editor.spec.ts` | T-078 | ✅ ada — 13 test |
| `gantt-render.spec.ts` | T-073 | ✅ ada |
| `login.spec.ts` | T-045 | ✅ ada — hijau |
| `kalender-ketersediaan.spec.ts` | T-067 | ✅ ada — 10 test |
| `wizard-proker-4-6.spec.ts` | T-069 | ⬜ **belum** |
| `master-gantt.spec.ts` | T-075 | ⬜ **belum** |
| `dashboard-role.spec.ts` + `scripts/bench-dashboard.ts` | T-077 | ⬜ **belum** |
| `kanban.spec.ts` | T-080 | ⬜ **belum** |
| `checklist.spec.ts` | T-081 | ⬜ **belum** |
| `kendala.spec.ts` | T-082 | ⬜ **belum** |
| `notulensi.spec.ts` | T-106 | ⬜ **belum** |
| `data-pengurus.spec.ts` | T-107 | ⬜ **belum** |
| `peminjaman-ruangan.spec.ts` | T-108 | ⬜ **belum** |

T-109 tidak butuh gate — verifikasinya `grep -rin "haluan" app components lib`.

**Urutan menulisnya mengikuti jalur kritis §3**, bukan urutan nomor. Yang paling
mendesak berikutnya `master-gantt` (T-075) dan `wizard-proker-4-6` (T-069),
keduanya di rantai proker yang menjadi prioritas pemilik produk.

### Tiga pola yang sudah terbukti, pakai ulang

**Harness `/qa/<fitur>?<varian>`** untuk apa pun yang dapat diuji tanpa sesi.
Menguji komponen lewat halaman sungguhan menyeret autentikasi, periode aktif,
seed, dan RLS — satu di antaranya berubah dan gate gagal karena hal yang tidak
ada hubungannya. Sudah dipakai `/qa/gantt`, dikontrakkan untuk `/qa/gantt-editor`
dan `/qa/sidebar`.

**Masuk lewat `POST /api/auth/login` sekali per worker**, bukan lewat form, untuk
gate yang butuh sesi. Tiap sign-in membebani dua pembatas sekaligus, dan gate
login sudah memakai puluhan tiap jalan.

**Keberadaan route diperiksa MEMAKAI SESI.** Middleware menolak seluruh `/api/*`
tanpa sesi dengan 401 sebelum routing terjadi — permintaan tanpa sesi menjawab
401 bahkan untuk route yang belum pernah dibuat. Gate yang menyimpulkan
keberadaan route dari sana akan hijau tanpa menguji apa pun; itu sudah terjadi
sekali di `gantt-editor.spec.ts` dan tertangkap sebelum commit.

### Satu bahaya yang harus diingat penulis gate berikutnya

**Jangan mengaktifkan periode di dalam gate.** Aktivasi mengarsipkan periode
lama, dan yang aktif sekarang adalah "Periode Uji E2E" milik `seed:e2e-auth`.
Mengarsipkannya membuat `konteksSaatIni()` mengembalikan `TIDAK_ADA_PERIODE`,
dan gate login beserta gate undangan gagal seluruhnya dengan pesan yang menuduh
halaman login.

`periode.spec.ts` sengaja tidak mengaktifkan apa pun, dan memuat satu test
penjaga: **tepat satu periode AKTIF, dan namanya bukan periode uji.** Bila
seseorang kelak menambahkan aktivasi, test itu yang merah lebih dulu.
