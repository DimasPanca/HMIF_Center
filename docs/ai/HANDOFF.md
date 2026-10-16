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

### T-089 · Status & penguncian RAB (2026-10-16)

Migrasi **041_rab_status** (trigger mesin status `rab_meta`) dan
**042_audit_entitas_rab_meta** (fn_audit kini mengisi `entitas_id` =
`kepanitiaan_id` untuk rab_meta — sebelumnya NULL, jejak kunci RAB tak
tertelusuri; baris lama tidak diubah, audit append-only). Keduanya sudah
`db:migrate` ke DB dev. Route `POST /api/rab/[kepanitiaanId]/{submit,lock,unlock}`
(jalur bersama `app/api/rab/_status.ts`), `components/rab/StatusRabBar.tsx`,
`ubahStatusRab` + `majukanStatusRab` di `lib/rab/service.ts`.

- **Trigger 041 berlaku untuk SEMUA koneksi** (termasuk app/postgres): transisi
  hanya DRAFT→DIAJUKAN, DIAJUKAN→DRAFT|DISETUJUI, DISETUJUI→DRAFT|REALISASI,
  REALISASI→SELESAI; kembali ke DRAFT wajib `alasan_buka_kunci` BARU ≥ 10
  karakter. **Fixture/tes yang mengubah status langsung wajib lewat jalur sah**
  (lihat 015c skenario 7/15, rab-grid "RAB terkunci").
- Hak (`hitungIzinStatus`): ajukan = panitia acara/Admin/Bendum; kunci & buka
  = `rab.lock`; kembalikan (DIAJUKAN→DRAFT) = `rab.lock` atau Ketua
  Pelaksana. `/unlock` memilih kembalikan vs buka di dalam transaksi
  (`FOR UPDATE`). Tidak ada jalur paksa untuk Admin.
- **T-102 & T-105 wajib memanggil `majukanStatusRab(tx, id, 'REALISASI'|'SELESAI')`.**
- "Konfirmasi tingkat tinggi" buka kunci = `ConfirmDialog level="reason"`
  (satu-satunya level yang menangkap alasan); tombolnya disabled selama kosong.

### T-088 · Kalkulasi RAB (2026-10-16)

`lib/rab/calculate.ts`: `hitungRab(divisi, dana)` → per item/sub-section/divisi,
`totalDivisi` (tanpa dana), `grandTotal` (+ Dana Tak Terduga, baris terakhir
ringkasan per RAB_CELL_MAP), `itemTanpaJumlah`. Uang = rupiah bulat; jumlah ×
harga lewat BigInt perseratus + pembulatan setengah-ke-atas (`kaliRupiah`);
`bulatkanJumlah` meniru NUMERIC(12,2) Postgres (2,675 → 2,68). `item.ts`
(`totalItem`, `jumlahkan*`) kini membungkusnya → klien = server.

- PATCH item menerima `total_klien` (tak disimpan); jawaban memuat
  `diverifikasi { total_klien, total_server, selisih }` dan grid memberi tahu
  bila selisih (INV-27).
- Tes gate bernama `lib/rab/__tests__/rab-calculate.test.ts` (bukan
  `calculate.test.ts` seperti di kontrak) supaya `npm run test -- rab-calculate`
  benar-benar memilihnya.
- **Untuk T-090/T-103/T-104:** pakai `hitungRab`, jangan menjumlahkan sendiri.
- tsconfig target < ES2020: tulis `BigInt(50)`, bukan literal `50n`.

### T-087 · Grid RAB inline-editable (2026-10-16)

`lib/rab/{item,service}.ts`, `components/rab/{RabGrid,RabRow,RabSectionHeader,RabSummary,CurrencyInput,JumlahInput}.tsx`,
`GET/POST /api/kepanitiaan/[id]/rab` (pohon + aksi struktur: TAMBAH/HAPUS_DIVISI,
TAMBAH/UBAH/HAPUS_SECTION, TAMBAH_ITEM), `PATCH/DELETE /api/rab/item/[id]`.
Dipasang di tab RAB `/acara/[id]?tab=rab` dan bagian RAB ruang kerja divisi
(`fokusDivisi`).

- **Satu fungsi aturan item:** `terapkanUbah()` di `lib/rab/item.ts` dipakai
  grid (optimistis, setiap ketikan) DAN server (kebenaran, INV-27). Rupiah =
  integer; total = round(numerik × harga) kecuali `total_manual`. Jumlah butuh
  manual → perkiraan angka pertama sampai pengguna mengisi "jumlah untuk
  perhitungan". **T-088** membuat `hitungRab` lengkap — ganti `jumlahkan*`.
- Simpan saat sel ditinggalkan (blur/Enter/Tab), PATCH berisi field yang
  berubah, diantrekan; aksi struktur menunggu antrean. Esc → nilai tersimpan.
- Hak: item/sub-section = `bisaTulisDivisi` + RAB DRAFT/DIAJUKAN (409
  `RAB_TERKUNCI`); tambah divisi = pimpinan/Kadept PIC/Ketua Pelaksana; hapus
  divisi tanpa Ketua Pelaksana (cermin RLS) dan ditolak bila divisi punya nota.
- "Konfirmasi tingkat sedang" untuk hapus divisi/sub-section ditafsirkan
  `ConfirmDialog level="typed"` (ketik nama) — tidak ada definisi tingkat di
  DESIGN_SYSTEM; hapus item tanpa konfirmasi.
- Grid memberi `data-siap="1"` setelah hydration — test yang mengetik lewat
  event sintetis WAJIB menunggunya (sebelum itu React belum mendengar).
- Rekalkulasi terukur ±20 ms (anggaran 100 ms). Fixture e2e harus konsisten:
  `total` tanpa `total_manual` dihitung ulang grid dari numerik × harga.

### T-085 · Visibilitas cross-divisi (2026-10-16)

Migrasi **039_tulis_divisi** + **040_panitia_koordinator** (sudah diterapkan ke
DB dev lewat `db:migrate`), `lib/kepanitiaan/akses.ts`,
`components/acara/ModeBacaSajaBanner.tsx`.

- **Satu aturan tulis divisi, dua lapis:** SQL `panitia_tulis_divisi()` /
  `tulis_divisi()` ⇄ TS `bisaTulisPanitiaDivisi()` / `bisaTulisDivisi()`.
  Panitia = koordinator, anggota divisi, atau Ketua Pelaksana; periode AKTIF;
  role non-BPH. `tulis_divisi` menambah Admin & Bendum. **Route tulis RAB
  (T-087), job desk (T-093), dan nota (T-101) WAJIB memanggil versi TS** — app
  bypass RLS.
- Celah yang ditutup 039: Ketua Pelaksana ditolak RLS RAB; `gantt_task_update`
  terbuka untuk SEMUA Anggota (kini `gantt_divisi_boleh()` untuk chart DIVISI);
  BPH yang tercatat panitia bisa menulis RAB. 040: koordinator yang tak ada di
  `divisi_member` kini termasuk `my_kepanitiaan()` (dulu tak bisa membaca RAB
  divisinya sendiri).
- Gantt app: chart DIVISI ditulis panitia divisinya / Kadept PIC (role+dept
  sebaris, `kadeptPic`) / Admin-Ketua-Wakil — bukan lagi setiap Anggota
  departemen PIC. `GanttEditor` tidak lagi merender "Tambah task" tanpa izin
  (dulu disabled; INV-30).
- Halaman divisi: `data-mode="tulis|baca"`, banner untuk divisi lain, aksi
  tulis (`divisi-aksi-tulis`) hanya dirender bila boleh.
- Tes DB 014c & 017 dibuat hermetik (menyaring baris ujinya sendiri): audit_log
  nyata kini memuat DELETE kepanitiaan/rab_item dari pembersihan fixture e2e.
- `db:reset` dari kosong untuk 039/040 BELUM dijalankan (butuh izin pemilik).

### T-100 · Kamera & auto-scan dokumen (2026-10-15)

`components/nota/{CameraCapture,ScanPreview,ScanOverlay}.tsx`,
`lib/images/{jscanify-loader,pemindai}.ts`, harness `/qa/kamera`,
`scripts/bench-bundle.ts`, **ADR-032** (baca sebelum menyentuh pemindai).

- Keluaran `CameraCapture.onGunakan`: `{ berkas: Blob, terpindai, sumber }` —
  SATU berkas untuk `processImage` T-097 (`isScanned = terpindai`). T-101 tinggal
  memasangnya di `/keuangan/nota/upload`.
- jscanify + OpenCV.js dari jsDelivr (versi terkunci + SRI), disisipkan saat
  kamera dibuka; loader sendiri lewat `import()`. Gagal muat / tepi tak
  meyakinkan (`lib/images/pemindai.ts`: luas ≥ 20% bingkai, cembung, sisi ≥ 120
  px) → foto apa adanya, tidak memblokir.
- **Jebakan:** `window.cv` adalah Module *thenable* — jangan `await`/`return`
  dari fungsi async (tab membeku). Gate e2e yang memuat CDN wajib
  `extraHTTPHeaders: {}` (header `x-forwarded-for` dari config gagal preflight CORS).
- Gallery tidak memuat OpenCV (kontrak 1: hanya saat kamera dibuka).
- Bundle `/qa/kamera`: 114 KB gzip / 385 KB mentah (anggaran §19.1 dibaca
  gzip). Ukur ulang di rute T-101:
  `MSYS_NO_PATHCONV=1 npx tsx scripts/bench-bundle.ts -- /keuangan/nota/upload`
  (hentikan `next dev` dulu — skrip menimpa `.next`; di Git Bash wajib
  `MSYS_NO_PATHCONV=1` atau `/rute` berubah jadi path Windows).

### T-084 · Ruang kerja acara (2026-10-15)

Baca saja, tanpa migrasi. `lib/acara/service.ts` (`daftarAcara`, `muatAcara`,
`muatDivisi`), `components/acara/{AcaraHeader,TabNav,DivisiCard,RingkasanAcara,BelumTersedia}.tsx`,
halaman `/acara`, `/acara/[id]?tab=…` (8 tab), `/acara/[id]/divisi/[divId]` (6 bagian).

- **Visibilitas** (app bypass RLS): `kepanitiaan.read` tanpa lingkup → semua
  acara periode aktif; Kadept/Anggota → acara departemennya + acara tempat ia
  panitia (cermin `my_kepanitiaan()`). **Angka RAB/nota** hanya untuk `rab.read`
  tanpa lingkup (≈`is_pimpinan()`), Kadept PIC (`R*`), atau panitia; selain itu
  `null` → UI menulis "Terbatas", bukan Rp0. Catatan: RLS `rab_*_select` TIDAK
  memberi Kadept PIC yang bukan panitia — matriks memberi `R*`; app mengikuti
  matriks.
- Tab = `?tab=` (bukan subrute) supaya T-087/T-094/T-096/T-105 bebas memakai
  `/acara/[id]/rab|tor|proposal|lpj` (USER_FLOW §12) — ganti tautan tabnya saat itu.
  Tab yang belum punya fitur memakai `BelumTersedia` (pembungkus klien
  `EmptyState`, karena aksinya wajib `<Button>`).
- Progres = kartu Kanban `divisi_id` berkolom DONE ÷ semua kartu divisi.
- "Buat Surat untuk acara ini" → `/surat/baru?acara=<id>`; halaman surat membaca
  kepanitiaan di server (aturan baca yang sama) dan mengisi `kode_kegiatan`,
  `nama_kegiatan`, `tema_kegiatan` lewat prop baru `SuratForm.isianAwal`.
- Mode baca saja/penjagaan tulis divisi lain = T-085 (belum). Menu sidebar
  "Ruang Kerja Divisi" (`/acara/ruang-kerja`) masih 404 seperti sebelumnya.

### T-108 · Peminjaman ruangan (2026-10-15)

Tanpa migrasi — tabel `ruangan`/`booking_ruangan`, RLS, dan permission `ruangan`
sudah ada sejak 011/015b. `lib/ruangan/{skema,bentrok,service}.ts`,
`app/api/ruangan/{route,[id]/route,booking/route,booking/[id]/route,booking/[id]/surat/route}.ts`,
`components/ruangan/{DaftarRuangan,FormPeminjaman,KalenderBooking,PeringatanBentrok}.tsx`.

- **Bentrok = ruangan + tanggal sama** (USER_FLOW §9.3), jam tidak menyaring;
  irisan jam hanya ditandai "(jam beririsan)". Server menjawab 409 `BENTROK`
  berisi `details.bentrok`; klien mengirim ulang dengan
  `lanjutkan_meski_bentrok: true`. Tidak ada constraint/penolakan (T-030).
- **Hak:** kelola ruangan = `ruangan.update` (ADMIN/SEKUM, cermin RLS
  `ruangan_insert`) — KADEPT `C*` hanya mencatat booking. Hapus booking =
  `ruangan.delete`. "Hapus" ruangan = nonaktifkan (FK booking tanpa CASCADE).
  Halaman terbuka untuk `ruangan.read` ATAU `ruangan.create`; menu disembunyikan
  dari Anggota (`tampil` di Sidebar).
- **Surat 05:** `POST /api/ruangan/booking/[id]/surat` membuat draft
  `PEMINJAMAN_RUANGAN` terisi dari booking (ruangan, kegiatan, hari-tanggal,
  waktu, tempat, tujuan = pengelola) dan **langsung** menautkan
  `booking_ruangan.surat_id` (bukan menunggu terbit — supaya klik kedua membuka
  draft yang sama, bukan draft baru). Nomor tampil di booking begitu
  `nomor_lengkap` terisi; surat DIBATALKAN dianggap tidak tertaut.
- Booking dan bentrok ber-scope periode aktif (INV-08).

### T-083 · Sistem peringatan deadline (2026-10-15)

`lib/deadline.ts` (murni: nomor hari kalender bilangan bulat, 4 tingkat,
teks "Besok"/"3 hari lagi"/"Terlambat 2 hari"), `lib/deadline-config.ts`
(ambang dari `app_config`), `components/shared/{DeadlineBadge,KonteksDeadline}.tsx`.
Dipakai di KanbanCard, ChecklistItem (lewat `KonteksDeadline` di halaman
Kanban), baris "Tenggat" GanttPanel, dan dashboard (`ItemDashboard.deadline`).

- Migrasi 038: `hari_ini_jakarta()` — **pakai ini, bukan CURRENT_DATE** (server
  UTC; 00.00–07.00 WIB masih "kemarin"). Dashboard & cron sudah dialihkan.
  Tabel `deadline_ringkasan` (agregat per departemen, disegarkan cron harian,
  dibaca kartu BPH "Ringkasan seluruh departemen"). `app_config` WAJIB tepat
  5 kunci (test 013) — jangan menaruh agregat di sana.
- `vitest.config.ts` kini `esbuild.jsx = 'automatic'` (komponen tanpa
  `import React` dapat dirender di unit test).
- Kartu "Deadline terdekat" Kadept kini juga memuat yang terlambat.
- **Jebakan lingkungan e2e:** dev server lokal lambat (kompilasi dingin halaman
  15–20 s, Kanban hangat ±6 s). Test dengan anggaran 30 s (kanban, checklist,
  approval link di dashboard-role) gagal acak karena timeout — dibuktikan A/B:
  tanpa perubahan T-083 gagalnya sama. Matikan proses node sisa
  (`Get-CimInstance Win32_Process` berisi `HMIF_Centerpp`) sebelum menjalankan
  ulang; server basi di port 3000 membuat dev baru pindah ke 3001 dan test
  memukul server yang sekarat.

### T-099 · Unduhan master & uji cetak — kode selesai, BLOCKED uji manusia (2026-10-15)

`GET /api/images/[id]/download` (`lib/images/download.ts`): selalu
`master_path`, dikirim apa adanya (uji asap: byte unduhan = byte unggahan),
`attachment` + nama asli tersanitasi, `Cache-Control: private, max-age=3600`.
Hak: pengunggah; pemilik `nota.read` tanpa lingkup (Ketua/Wakil/Sekum/Bendum/
BPH); setelah jadi nota juga Kadept departemen proker, anggota/koordinator
divisi, ketua pelaksana. Tidak berhak → 404 (tak membocorkan). Bukan
`requirePermission('nota.read')` karena Anggota/Kadept hanya punya C.
`components/nota/NotaImage.tsx` hanya `'thumb' | 'preview'` (+ tautan unduh);
URL dari `lib/images/url-gambar.ts`.

- **Pemilik:** jalankan `docs/ai/UJI_CETAK.md` (3 nota fisik → unduh → Word →
  cetak) dan isi tabelnya. Setelah lulus, set T-099 DONE.

### T-098 · Validasi & penyimpanan gambar sisi server (2026-10-15)

`POST /api/images/upload` (form: `master`, `preview`, `thumb`, metadata sumber)
→ `lib/images/{server-validate,strip-metadata,upload}.ts`. Jenis dari magic
bytes (`file-type`), decode penuh dengan sharp (`stats()` + `failOn`), batas
15 MB & dimensi per peran, 30 unggahan/jam/pengguna (hitung tabel `image`),
UUID di key (`keys.notaMaster(uuid, ekstensi)` kini menerima ekstensi).

- **ADR-031:** metadata dibuang pada tingkat byte (APP1/APP13/COM JPEG; chunk
  teks/eXIf PNG; EXIF/XMP WebP) — BUKAN `sharp().withMetadata`, yang selalu
  meng-encode ulang dan melanggar I3. Tag orientasi > 1 ditolak.
- Urutan: validasi → simpan → baca ulang master → record; gagal → seluruh
  berkas dihapus (`Promise.allSettled`), tanpa record. Dibuktikan unit test
  `image-upload` (storage dalam memori) + uji asap API nyata (201/422/403).
- `tasks.json` T-044/T-097/T-086 masih READY padahal sudah ber-commit
  (`3d07af1`, `67b454d`, `fd9223e`) — status lama dari fase paralel.

### T-078 · Editor Gantt empat level (2026-10-15)

`components/gantt/{GanttEditor,TaskForm,ScaleSwitcher,GanttExport,BuatChartDepartemen}.tsx`
memakai `GanttChart` yang SAMA dengan Master Gantt (prop baru `drag`,
`onTaskActivate`, `labelColumnTitle`; konektor FS dari `task.dependsOn`).
`lib/gantt/{skema,service,export-svg}.ts`, `/api/gantt/{[chartId],[chartId]/export,
task/[id],grup/[id],departemen}`. Halaman: `/proker/gantt` (indeks per level —
sebelumnya tautan sidebar mati), `/gantt/[chartId]`, `/departemen/[kode]/gantt`
(buat chart departemen sekali), tombol "Gantt proker" di `/proker/[id]`.
Harness `/qa/gantt-editor?level=&izin=` (mode lokal, tanpa sesi).

- Migrasi 037: `gantt_chart.periode_id` (trigger isi dari proker/kepanitiaan/
  divisi, lalu periode AKTIF), unik satu chart DEPARTEMEN per departemen+periode,
  `gantt_task.chart_id` dijaga trigger (filter realtime `chart_id=eq.`),
  gantt_task & gantt_group masuk publication.
- Hak tulis: matriks `gantt` + panitia acara (anggota/koordinator divisi,
  ketua pelaksana) walau beda departemen — sama dengan RLS `my_kepanitiaan()`.
  Chart periode lain baca saja. Hak aksi dicek sebelum keberadaan (BPH 403).
- **ADR-030: export PNG saja** (keputusan pemilik). PNG 2x digambar ulang dari
  view model, bukan salinan layar. Dicek: disisipkan ke Word A4 landscape
  selebar halaman ≈ 259 dpi, label terbaca. Uji cetak fisik tetap baik
  dilakukan pemilik.
- `gantt-editor-data.spec.ts` hanya desktop (chart departemen = state global).
- **Jebakan e2e:** batas login 5×/15 menit per email+IP. Menjalankan ulang
  `master-gantt` (8 login) beberapa kali berturut-turut membuat login gagal
  dan test tampak rusak — tunggu 15 menit. `gantt-perf` "baseline tidak
  terukur" sudah gagal SEBELUM T-078 (diuji dengan kode chart lama).

### T-082 · Kendala departemen (2026-10-15)

`/departemen/kendala` (semua dalam lingkup + cari arsip lintas periode),
`/departemen/[kode]/kendala` (daftar + "Lapor kendala"), `/departemen/kendala/[id]`
(detail + utas). `lib/kendala/{skema,service,lampiran,berkas,filter-halaman}.ts`,
`/api/kendala/{,[id],[id]/reply,[id]/lampiran,lampiran/[lampiranId]}`,
`components/kendala/*`. Migrasi 035 (periode_id, updated_at, kolom FTS `cari`
judul+deskripsi+catatan, tabel `kendala_lampiran`, publication realtime) &
036 (trigger updated_at + periode otomatis dari proker).

- Hak: Ketua/Wakil/Admin ubah semua; Sekum/Bendum/BPH BACA saja (tak bisa
  membalas — hak balas = `kendala.create`); Kadept/Anggota departemennya.
  Periode lain = arsip baca saja (service `kunci()` menolak).
- Mention: token `@[Nama](uuid)` di teks; `MentionInput` hanya mengubah nama
  yang DIPILIH dari saran menjadi token. Tidak ada notifikasi (di luar MVP).
- Realtime Kritis: `components/dashboard/PantauKendalaKritis.tsx` dipasang di
  dashboard untuk KETUA/WAKIL/BPH/ADMIN → `router.refresh()` (debounce 250 ms).
- Tanggal dari SQL harus ISO (`to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
  `::text` timestamptz ditolak `format-tanggal`.
- Lampiran: bucket privat `kendala/{id}/{lid}.{ext}`, maks 5 MB & 10/kendala,
  dicek magic bytes (PNG/JPG/WEBP/PDF/DOCX/XLSX).
- Gate `kendala` 5/5 desktop + 5/5 mobile. `dashboard-role` dapat gagal di
  jalan pertama karena kompilasi dingin `/` (> 15 s) — hangatkan server dulu.

### T-107 · Data Pengurus (2026-10-15)

`/sekretariat/pengurus` (`components/pengurus/{PengurusTable,FormPengurusDialog,
ImportPengurusDialog,PilihUntukSurat}.tsx`), `lib/pengurus/{skema,service}.ts`,
`/api/pengurus/{,[id],import,export}`. Import CSV/XLSX memakai `parse-tabel`
+ `ImportPreview` T-048: pemetaan → pratinjau → simpan dalam SATU transaksi.
NIM yang sudah ada dicentang lewati bawaan; menghapus centang MEMPERBARUI
(tak pernah menabrak unik periode+NIM). Tidak membuat akun; baris ber-NIM
akun pengguna ditautkan `user_id`. Pilih banyak → "Buat Surat Aktif" →
`/surat/massal?pilih=`. Kadept/Anggota hanya departemennya.

- **DB dev berisi 30 pengurus CONTOH** (nama "(Contoh)", NIM `980000xxxx`,
  `scripts/seed-pengurus-contoh.ts`, hapus dengan `--hapus`). Data asli
  diimpor pemilik.
- ADR-052 → tidak diperlukan (single agent).

Gate: `data-pengurus` 10/10 (desktop + mobile), unit `skema-pengurus` 6.

### T-062 lanjutan · Gotenberg siap dipasang pemilik (2026-10-15)

Keputusan pemilik: PDF surat lewat **Gotenberg di Render Free**. Ditambahkan
basic auth (`GOTENBERG_USERNAME`/`GOTENBERG_PASSWORD`), `scripts/cek-pdf.ts`
(uji konverter + lapisan teks), `POST /api/surat/[id]/pdf` + tombol **Buat PDF**
di detail arsip (untuk surat yang terbit saat layanan tidur). Panduan langkah
demi langkah: **`docs/ai/GOTENBERG_SETUP.md`**. T-062 tetap BLOCKED sampai
pemilik menyelesaikan langkah 5 panduan itu.

### T-064 · generate massal Surat Keterangan Aktif (2026-10-15)

`/surat/massal` (`components/surat/SuratMassal.tsx`), `POST/GET
/api/surat/batch`, `lib/surat/batch.ts`. Migrasi **034**: `surat.batch_id`.
Sekum memilih pengurus + satu keperluan → N surat dibuat & diajukan dalam
SATU transaksi (validasi jalur `simpanDraft`, K-04). Approver menyetujui satu
batch dalam SATU request: `alokasi_nomor_batch` satu transaksi (nomor urut
nama, tanpa disela), lalu generate per dokumen dengan progres NDJSON
di-stream; yang gagal tetap bernomor → "Terbitkan ulang yang gagal". ZIP
`{nomor}-{nama}.docx` lewat `GET /api/surat/batch?batch=`.

- **Sumber = tabel `pengurus` (T-107), saat ini 0 baris** — halaman menampilkan
  empty state. Gate menyuntik 30 pengurus uji. Tidak ada fallback ke app_user.
- Surat batch MENUNGGU tidak muncul di antrian approval satuan dan ditolak
  `setujuiSurat` (409) — nomornya akan disela. Antrian menautkan ke /surat/massal.
- Cache TTD+stempel per versi tanda tangan (`generator.ts`), ZIP unduh paralel 6,
  `withAuditContext(..., { timeout })` baru untuk transaksi massal (bawaan 5 dtk
  terlewati: 30 draft ±5,2 dtk ke DB jarak jauh).
- Diperiksa di Word: 30/30 DOCX dari ZIP terbuka, masing-masing 1 halaman.
- Kegagalan SEBAGIAN diuji unit (`batch.test.ts`, penerbit tiruan); e2e
  menguji gagal-semua (TTD dihapus) → terbit ulang.

Gate: `surat-massal` 4 (desktop; mobile skip — data global), `surat-approval`
9+3, `arsip-surat` 9+1, `surat-form` 18, `surat-preview` 8 (sendirian;
latensi < 300 ms sensitif beban CPU), `verify` 816, `db:test` 32/32.

### T-063 · Arsip surat (2026-10-15)

`/surat` (route group `(arsip)` + `loading.tsx` skeleton + `layout.tsx`
penjaga akses) dan `/surat/[id]` (rincian, unduh ulang DOCX/PDF, pratinjau
dengan nomor final, tombol **Batalkan** untuk Ketua/Wakil/Sekum).
`GET /api/surat` (kursor 50 baris; `?format=xlsx` export). Service
`lib/surat/arsip.ts`; skema filter client-safe `lib/surat/filter-arsip.ts`
(satu skema untuk URL, API, export — K-04). Migrasi **033**: kolom tergenerasi
`surat.cari` (perihal/nomor A, tujuan B, isi HTML + NILAI data_dinamis C).

- Draft & DITOLAK hanya terlihat pembuatnya; Kadept hanya departemennya;
  periode lain boleh dibuka (baca saja). DIBATALKAN selalu tampil + badge.
- Filter "kegiatan" = `kode_kegiatan` di nomor (mis. KT2HMIF), bukan
  `kepanitiaan_id` — form surat belum mengisi kepanitiaan.
- Bug yang ditangkap gate: kursor memuat `created_at::text` Postgres, dan
  `Date.parse` menolak offset `+00` → halaman 2 mengulang halaman 1.

Gate: `arsip-surat` 9 + 1 skip, `surat-approval`/`surat-form`/`surat-preview`
35 + 3 skip, `verify` 811, `db:test` 32/32.

### T-061 lanjutan · tanda tangan Ketua sungguhan (2026-10-15)

Pemilik (Dimas Panca Pamungkas, Ketua Himpunan) mengirim tanda tangannya.
Generator disetel ulang dengannya — `rapikanTtd` (latar putih → transparan,
pangkas margin), ukuran 180×90 px, dua tambatan `{%ttd}`/`{%ttd_nama}`
(ADR-029 bagian "Penyesuaian"). Diperiksa di Word: 8 template, nama tak
tertimpa, jabatan tak tertimpa. Ikut diperbaiki: halaman kosong Undangan
Pemateri dan butir kosong lampiran Aspirasi. Template 02/03/04-pemateri → v3.

- **Berkas tanda tangan TIDAK disimpan di repo maupun di DB** — itu data
  pribadi, dan DB dev belum punya akun Dimas (satu-satunya KETUA = akun uji
  `e2e-aktif`, yang tanda tangannya ditimpa gate e2e). Agar surat sungguhan
  memakai tanda tangan ini: Admin mengundang akun Dimas dengan role KETUA,
  lalu Dimas mengunggahnya sendiri di `/profil`. Catatan: penandatangan =
  KETUA PALING AWAL didaftarkan di periode (`bacaPenandatanganKetua`).

### T-062 · konversi PDF — KODE SAJA, status BLOCKED (2026-10-15)

`lib/documents/pdf-converter.ts`: `docxToPdf()` (Gotenberg → soffice →
fallback HTML hanya bila `PDF_FALLBACK_HTML=true`, dan fallback itu sendiri
belum dipasang → penolakan jelas), `periksaPdfBerteks()` menolak PDF raster.
Generator membuat PDF bila `format_output` PDF/BOTH; gagal/dimatikan → tetap
TERBIT sebagai DOCX + peringatan "PDF belum tersedia". Unduh
`?format=pdf` → 409 `PDF_NONAKTIF` saat flag mati.

**Sesuai keputusan pemilik: tidak ditandai DONE.** `tasks.json` = BLOCKED +
`blocked_reason`. Langkah mengaktifkan PDF (manusia): ADR-010 bagian
"Status nyata" — pasang Gotenberg/LibreOffice, uji satu surat BOTH, pastikan
teks PDF dapat diseleksi & kop utuh, baru `PDF_ENABLED=true` di produksi.

Gate: unit `pdf-converter` 14/14, `verify` 801, `surat-approval` (+ cek
`?format=pdf` → 409) dan `surat-form` 27 lulus + 3 skip.

### T-061 · Document Engine DOCX (2026-10-15)

`lib/documents/`: `docx-engine.ts` (`renderDocx` — placeholder tanpa data =
`GalatTemplate`, bukan "undefined"), `data-mapper.ts` (`petakanSurat`,
`paragrafDariIsiHtml`), `image-module.ts` (modul gambar sendiri +
`gabungTtdStempel`), `template-loader.ts` (storage + cache memori).
`lib/surat/generator.ts` kini sungguhan; `terbitkanSurat(request, konteks, id)`
mencatat baris `dokumen` + TERBIT dalam satu transaksi beraudit.
`GET /api/surat/[id]/download` (`lib/surat/unduh.ts`). Tombol "Unduh DOCX" di
hasil approval. Keputusan lengkap: **ADR-029**.

- **Template surat memuat tanda tangan & stempel ASLI orang lain** (sisa
  T-006) — kini dibuang saat build (`hapusGambar`). Ketujuh template naik versi
  (02–05 → v2, 08 → v3) dan sudah diunggah; `surat-umum_v1.docx` dan
  `aset/stempel-hmif.png` juga. `upload-templates --kering` → 13 TETAP.
- Versi template ditetapkan saat **disetujui** (`pasangTemplateAktif`), jadi
  draft lama yang menunjuk v1 tidak akan pernah di-generate dari v1.
- **Ketua tanpa tanda tangan → generate gagal** (DISETUJUI + peringatan).
  Unggah di `/profil` lalu "Terbitkan ulang". Akun e2e Ketua kini punya
  tanda tangan dummy dari gate.
- Tag gambar wajib di AKHIR run-nya (`{nama}{%ttd}`) — teks sesudahnya
  kehilangan format. Dikunci test.
- Diperbaiki: `storage.get()` ke bucket publik selalu gagal "Bucket not found"
  sejak T-044 (lihat jebakan #8). Keterangan Aktif tak lagi dua halaman.
- **Pemeriksaan Word manual sudah dijalankan** lewat Word 16 COM (lihat
  jebakan #9) — menemukan dan memperbaiki satu korupsi sungguhan (Default png
  ganda). Pemilik tetap disarankan membuka satu surat terbit di Word sendiri.

Gate: unit `docx-engine` 26/26 (11 jenis × template sungguhan),
`template-dryrun` 12/12, `surat-approval` 9 lulus + 3 skip (test tanda tangan
hanya di project desktop — keadaan global), `surat-form` + `surat-preview`
26/26, `verify` hijau.

### T-060 · alur approval surat (2026-10-15)

`lib/surat/status.ts`: `TRANSISI` (state machine USER_FLOW §11.2),
`ajukanSurat` (pembuat + skema lengkap), `setujuiSurat` (baris dikunci
`FOR UPDATE` → `alokasiNomor`), `terbitkanSurat` (transaksi TERPISAH sesudah
commit), `tolakSurat` / `batalkanSurat` (alasan ≥ 5 karakter),
`daftarAntrianSurat`. Route `api/surat/[id]/{submit,approve,reject,cancel}`.
Halaman `surat/approval` (daftar kiri + pratinjau & aksi kanan) dengan
`SegarkanBerkala` (router.refresh tiap 10 dtk & saat tab difokus).

- **`lib/surat/generator.ts` masih stub** yang selalu gagal — semua surat
  disetujui berhenti di DISETUJUI dengan peringatan, nomor tetap sah. T-061
  tinggal mengisi `generateDokumenSurat(id)`; tombol "Terbitkan ulang"
  (`{terbitkanUlang:true}`) sudah ada.
- Approver kedua yang terlambat mendapat 409 "sudah disetujui oleh X dengan
  nomor Y", bukan nomor kedua.
- `muatSurat()` (draft.ts) = pemuat tanpa cek kepemilikan untuk approver;
  `detailDraft()` = milik pembuat. DITOLAK boleh disunting pembuat → DRAFT.
- Migrasi **030** (diajukan_at, kolom pembatalan), **031** (diajukan_at
  diisi trigger — CHECK 030 mematahkan 7 test SQL), **032** (alasan batal
  wajib hanya untuk surat bernomor). **Pelajaran: constraint baru pada tabel
  yang sudah dipakai → jalankan SELURUH `db:test` dan stress T-057.**
- Bug T-058 yang ditemukan di sini: Keterangan Aktif tak pernah dapat
  diajukan (tujuan tersembunyi `-` terbaca preset "Lainnya" saat dimuat).
  Field umum tak terpakai kini selalu dari default.
- Belum ada UI untuk membatalkan surat TERBIT — API siap, tombolnya di arsip
  T-063.

Gate: `surat-approval` 10/10 (desktop + mobile), `db:test` 31/31.

### T-059 · pratinjau surat langsung (2026-10-15)

`lib/surat/render-preview.ts` (murni): `susunPratinjau(nilai, konfig, ketua)`
→ model surat; segmen kosong berlabel, isi surat lewat `sanitasiIsiHtml`.
`components/surat/SuratPreview.tsx`: kertas A4 794×1123 px diskala ke lebar
panel (ResizeObserver), garis batas halaman, kop UNTIRTA + HMIF
(`public/kop/`), nomor lewat `NomorSuratBadge` sementara. Isi kertas
`React.memo` — form re-render tiap ketikan. Kertas disembunyikan sampai
skalanya terukur (HTML server belum tahu lebar panel). Ketua Himpunan untuk
kolom kanan dari `bacaKetuaHimpunan(periodeId)`.

Keputusan:
- **Debounce 200 ms, bukan 250** — render kertas ±45–75 ms di dev server;
  terukur 249–265 ms dari ketikan terakhir (desktop + mobile).
- **`formatTanggalSurat()`** (`lib/utils/format-tanggal.ts`) = "02 Agustus
  2025" tanpa nama hari. **T-061 wajib memakainya untuk
  `{tanggal_surat_format}`** supaya DOCX = pratinjau.
- Test membandingkan kalimat baku pratinjau dengan teks `templates/*.docx`
  (dibuktikan lewat mutasi). Mengubah resep template kini wajib diikuti
  `render-preview.ts`.

Ditemukan & diperbaiki: template Kerja Sama berbunyi "panitia AKSARA" untuk
semua surat (sisa T-006). Resep diperbaiki, template naik ke **v2**
(v1 nonaktif) — jalur VERSI_BARU T-055 terpakai sungguhan pertama kali.
Catatan: `build-templates.ts` mengubah kesebelas `.docx` meski isinya sama
(stempel waktu zip) — **commit hanya berkas yang memang berubah**, kalau
tidak skrip unggah membuat versi baru palsu untuk semuanya.

Gate: `surat-preview` 8/8, `surat-form` 18/18. Temuan Aspirasi→DPM di BACKLOG.

### T-058 · form surat dinamis (2026-10-14)

Halaman `app/(dashboard)/surat/baru` (`?id=` lanjutkan draft, `?jenis=`
jenis awal) → `components/surat/SuratForm.tsx` (60/40, pratinjau kanan
masih kerangka + `NomorSuratBadge` sementara — isinya T-059),
`FieldRenderer.tsx` (render dari `serialisasiFieldSchema`; daftar berulang
dengan tambah/naik/turun/hapus), `IsiSuratEditor.tsx` (TipTap: paragraf,
tebal, miring, daftar saja). API `POST /api/surat` + `GET/PATCH
/api/surat/[id]` → `lib/surat/draft.ts`. Auto-save tiap 10 dtk dan saat
fokus keluar form, hanya bila ada perubahan; id draft dipasang ke URL lewat
`history.replaceState` (bukan router, supaya form tak di-render ulang).

Keputusan (ADR-028):
- Migrasi **029**: `surat.template_id` boleh NULL hanya untuk kode generik
  01/06/07/09. Prisma diperbarui (`template_id String?`).
- Draft disimpan lewat `SkemaDraftSurat` (tipe & ukuran saja);
  kelengkapan tetap `periksaKelengkapan()` dari skema penuh.
- Isi surat: allowlist 7 tag tanpa atribut (`lib/surat/isi-html.ts`), dan
  "wajib" dinilai dari teks (`<p></p>` = kosong).
- **Ajukan masih sementara**: menyimpan draft lengkap + toast. T-060 wajib
  menggantinya dengan route submit dan menolak yang belum lolos skema penuh.

Gate: `surat-form` 18/18 (desktop + mobile). Unit 3 berkas baru/ubah.
Template untuk 4 kode generik belum ada — lihat BACKLOG.

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

1. **[SELESAI 2026-10-15] Rantai surat T-054…T-064.** Semua DONE kecuali
   T-062 (kode siap, BLOCKED menunggu Gotenberg — ADR-010). Yang tadinya
   menunggu rantai ini kini dapat dikerjakan: T-095 (TOR), T-096 (Proposal),
   T-105 (LPJ), T-107 bagian surat massal, T-108 (Peminjaman ruangan).
   Yang menunggu rantai ini: T-063, T-064, T-095 (TOR), T-096 (Proposal),
   T-105 (LPJ), T-108 (Peminjaman ruangan), dan T-113…T-116.
2. **[SELESAI 2026-10-15] Daftar hadir notulensi** kini terisi dari Data
   Pengurus (T-107). Saat ini berisi 30 pengurus contoh.
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

5. **[DITEMUKAN 2026-10-14] Gate `command-palette` gagal 10–13 test, sudah
   sejak sebelum T-058.** Dibuktikan dengan menjalankan spec yang sama pada
   commit `796c449` (T-057) lewat stash: 10 dari 14 gagal di desktop. Pola
   galatnya sama: `waiting for "http://localhost:3000/" navigation to
   finish` lalu `command-palette` tidak muncul dalam 5 dtk — beranda (Master
   Gantt) belum selesai dimuat saat pintasan ditekan. Belum diselidiki apakah
   penyebabnya beranda yang lambat di dev server atau test yang terlalu cepat.

## 4. Jebakan lingkungan yang sudah ditemukan

Dua belas hal yang tidak obvious dari kode:

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
6. **Gate e2e gagal di jalan pertama pada dev server dingin.** Spec yang
   memuat editor TipTap memakai `timeout: 90_000` (lihat `surat-form`).
   Browser Playwright juga harus cocok versinya: `npx playwright install
   chromium` bila galatnya "Executable doesn't exist". Halaman berat
   (mis. editor TipTap) dikompilasi saat diminta pertama kali dan bisa melewati
   batas 30 dtk/test. Jalankan ulang sekali sebelum menganggapnya bug; kalau
   gagal lagi, itu nyata.
7. **Tombol toolbar editor wajib `onMouseDown={e => e.preventDefault()}`.**
   Tanpa itu tombol mencuri fokus dan TipTap memulihkannya lewat
   `requestAnimationFrame`, yang tak berjalan di tab tak terlihat — teks jatuh di
   luar node yang baru dibuat.
8. **Bucket publik bernama `public` bentrok dengan rute Storage.**
   `download()` supabase-js → `/object/public/{key}` = rute objek publik, yang
   membaca segmen pertama key sebagai nama bucket ("Bucket not found").
   `SupabaseStorageAdapter.get()` kini membaca bucket publik lewat URL
   publiknya. Jangan kembalikan ke `download()`.
9. **Memeriksa DOCX di Word tanpa membukanya manual.** Word 16 terpasang di
   mesin pengembang; dari PowerShell: `$w = New-Object -ComObject
   Word.Application; $d = $w.Documents.Open($path, $false, $true)` — berkas
   korup melempar "The file appears to be corrupted"; `$d.SaveAs2($pdf, 17)`
   menghasilkan PDF untuk dilihat; `$d.ComputeStatistics(2)` = jumlah halaman.
   Selalu `$w.Quit()` di `finally`.
10. **`loading.tsx` membuat `notFound()` di halaman menjadi HTTP 200.** Next
   mulai streaming sebelum halaman berjalan. Penjaga akses halaman yang punya
   skeleton wajib di `layout.tsx` segmennya (lihat `surat/(arsip)/layout.tsx`),
   kalau tidak test `status() === 404` gagal walau isinya halaman 404.
   Jalur gate e2e juga bisa gagal massal karena DNS Supabase putus sesaat
   (`ENOTFOUND ...pooler.supabase.com`) — cek `npm run db:ping` dulu.
11. **Tanda tangan Ketua uji = keadaan global e2e.** `surat-approval` menghapusnya,
   `surat-massal` membutuhkannya. Keduanya memegang advisory lock sesi
   (`e2e/fixtures/kunci-ttd.ts`) di project desktop supaya tidak berjalan
   bersamaan. Spec baru yang menyentuh tanda tangan Ketua WAJIB memakainya.
   `next.config.ts` `onDemandEntries` (1 jam) mencegah dev server
   mengompilasi ulang rute di tengah gate panjang.

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
4. **Rantai surat selesai.** Lanjutan alami: T-107 (Data Pengurus — mengisi
   sumber surat massal), T-083, T-108, T-084…T-105 (acara/RAB/nota/LPJ).

`tasks.json` tidak bisa dipercaya untuk status task lama (dibekukan selama fase
paralel): cek `git log --oneline | grep " T-0XX"` sebelum menganggap sebuah
dependency DONE. Baca kontrak di `docs/ai/tasks/P{fase}-*.md`.
