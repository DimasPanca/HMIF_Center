# PERFORMANCE_REPORT — Verifikasi performa (T-114)

Sepuluh metrik PRD §8.1 dan anggaran bundle SYSTEM_DESIGN §19.1, diukur
2026-10-19 dengan `npx tsx scripts/bench-all.ts` terhadap **build produksi**
(`next build && next start`). Semua angka di bawah adalah hasil pengukuran;
tidak ada yang diperkirakan.

## 1. Ringkasan

Profil utama: **4G tersimulasi** (4 Mbps turun / 3 Mbps naik / RTT 20 ms, CDP)
**+ CPU diperlambat 4×** (perangkat kelas menengah). Median 5 jalan; galeri dan
pipeline 3 jalan. Kolom CPU 1× = laptop, pembanding saja.

| # | Metrik | Target | Sebelum (4×) | Sesudah (4×) | Sesudah (1×) | Status |
|---|---|---|---:|---:|---:|---|
| 1 | First Contentful Paint (/login) | < 1000 ms | 384 ms | 400 ms | 332 ms | ✅ |
| 2 | Dashboard + Master Gantt siap (4G) | < 1500 ms | 1337 ms | 1306 ms¹ | 1016 ms | ✅ |
| 3 | Render Master Gantt (48 bar) | < 500 ms | 148 ms | 202 ms¹ | 40 ms | ✅ |
| 4 | Render Gantt (100 task) | < 500 ms | 405 ms | 433 ms¹ | 94 ms | ✅ (tipis) |
| 5 | Validasi konflik proker | < 500 ms | 39 ms | 43 ms | 46 ms | ✅ |
| 6 | Pratinjau surat memperbarui | < 300 ms | 281 ms | 279 ms | 211 ms | ✅ (tipis) |
| 7 | Pemrosesan gambar 12 MP (3 turunan) | < 5000 ms | 1636 ms | 1517 ms | 629 ms | ✅ |
| 8 | Perhitungan ulang RAB (100 item) | < 100 ms | 44 ms | 43 ms | 10 ms | ✅ |
| 9 | Galeri verifikasi 30 nota | < 2000 ms | 746 ms | 762 ms | 674 ms | ✅ |
| 10 | Scroll Gantt 100 task | 60 fps | **59,9 fps, 12% frame tersendat** | 59,9 fps, 3% tersendat | 59,9 fps, 0% | ✅ (sebelumnya ❌) |

| Anggaran bundle §19.1 (JS awal, gzip) | Anggaran | Sebelum | Sesudah | Status |
|---|---:|---:|---:|---|
| Login `/login` | 80 KB | 119,0 KB | 119,1 KB | ❌ — lantai kerangka kerja 100,4 KB, lihat §4 & ADR-035 |
| Beranda `/` (Master Gantt) | 180 KB | **256,3 KB** | **165,1 KB** | ✅ (sebelumnya ❌) |
| Editor RAB `/acara/[id]` | 200 KB | 196,6 KB | 196,7 KB | ✅ |
| Upload Nota `/keuangan/nota/upload` | 250 KB | 181,5 KB | 181,5 KB | ✅ |

| Pelengkap §19.1 / §19.3 | Target | Sebelum | Sesudah |
|---|---|---:|---:|
| Login LCP (4G, CPU 4×) | < 800 ms | 400 ms | 400 ms |
| Login siap dipakai (tombol terhidrasi, 4G, CPU 4×) | < 1000 ms (TTI) | **1103–1281 ms** | **904–961 ms** |
| `v_master_gantt` (48 baris) | < 50 ms | 0,35 ms | 0,42 ms |
| `cek_konflik_proker` (SQL) | < 10 ms, GiST | 0,07 ms | 0,07 ms (indeks `proker_lock_rentang`²) |

¹ Variasi antar-jalan nyata: tiga jalan penuh sesudah optimasi memberi
dashboard 1176 / 1291 / 1306 ms, Master Gantt 164 / 174 / 202 ms, Gantt 100
task 402 / 460 / 433 ms. Yang dilaporkan di tabel adalah jalan terakhir.

² Dengan 12 kunci planner memilih seq scan (lebih murah untuk tabel sekecil
itu); begitu seq scan dimatikan, rencana memakai indeks GiST
`proker_lock_rentang` — indeksnya ada dan dapat dipakai saat tabel membesar.

## 2. Lingkungan pengukuran

- Kontainer Linux 4 vCPU, 15 GB RAM; Node 22.22; Next.js 15.5.25 build produksi.
- Chromium 141 headless (Playwright). Throttle jaringan & CPU lewat CDP.
- Database: **stack Supabase lokal** (Supabase CLI 2.54.11 di Docker:
  Postgres 17.6, GoTrue, PostgREST, Realtime 2.57.3, Storage) dengan seluruh
  50 migrasi diterapkan dari kosong. Produksi berjalan di Vercel `sin1` dengan
  Supabase Singapura — server dan database sama-sama dekat, jadi latensi
  server↔DB lokal (< 1 ms) mendekati produksi; **cold start fungsi Vercel tidak
  ikut terukur**.
- Data realistis disemai skrip (penanda `BENCH114`, dibersihkan di akhir):
  60 proker (10 per departemen, 48 disetujui/berjalan, 12 TERJADWAL mengunci
  kalender lewat `setujui_proker`), satu acara dengan 5 divisi dan **100 item
  RAB**, chart Gantt **100 task** dalam 6 grup, **50 nota** dengan gambar
  sungguhan di storage (30 menunggu verifikasi), **500 surat** (300 terbit, 100
  menunggu, 80 draf, 20 ditolak).

## 3. Optimasi yang diterapkan

Hanya pada yang meleset (kontrak 3). Metrik yang sudah lulus tidak disentuh.

### 3.1 Bundle beranda 256,3 → 165,1 KB

Penelusuran chunk build produksi menunjukkan dua pustaka yang tidak dibutuhkan
saat beranda pertama digambar:

| Penyebab | Chunk | KB gzip | Teknik §19.2 |
|---|---|---:|---|
| `@supabase/ssr` + `supabase-js` (realtime) diimpor statis oleh `MasterGantt` dan `PantauKendalaKritis` | `4586-*`, `44530001-*` | 46,8 + 14,0 | **Dynamic import**: `lib/realtime/klien-browser.ts` (`muatKlienRealtime`). Realtime tersambung sesaat setelah chart tampil |
| `zod` terseret lewat `TaskBar` → `lib/gantt/skema.ts` hanya demi `pxKeHari` | `4191-*` | 26,5 | Helper tanpa zod dipisah ke `lib/gantt/geser.ts`; `skema.ts` mengekspor ulang (kode server tidak berubah) |

Efek samping yang terukur (CPU 4×, tiga jalan sesudah): dashboard siap
1337 → 1176 / 1291 / 1306 ms; FCP beranda 512 → 472 / 520 / 596 ms — yang
terakhir tidak berubah bermakna (masih dalam derau antar-jalan).

### 3.2 Scroll vertikal Gantt: 12% → 0–4% frame tersendat

Pada CPU 4× scroll vertikal chart 100 task memberi p95 33,4 ms dan 12% frame
> 25 ms; horizontal mulus. Penyebab: setiap kali jendela virtualisasi bergeser,
**seluruh** chart dirender ulang — header timeline (satu sel per kolom), garis
grid semua kolom, dan semua bar terlihat (callback inline membuat memo mustahil).

Teknik **memoisasi** (§19.2) di `components/gantt/`:

- Baris dijadikan komponen ber-`React.memo` (`BarisTask`, `BarisGrup`,
  `LabelBaris`) dengan objek aksi berumur tetap (pola ref terbaru), sehingga
  hanya baris yang masuk/keluar jendela yang dirender.
- `TimelineHeader` dan garis kolom (`GarisKolom` di `GridLines`) di-memo;
  garis baris diberi kunci posisi `y` sehingga dipakai ulang, bukan dibuat ulang.

Hasil (CPU 4×): p95 33,4 → 16,8 ms; frame tersendat 12% → 0% / 4% / 3% pada
tiga jalan. CPU 1× 0% sebelum dan sesudah.

### 3.3 Halaman login: siap dipakai 1,1–1,3 s → 0,90–0,96 s

Ditemukan saat mengukur LCP/TTI login: halaman memuat
`logo-hmif-animasi.webm` **4,59 MB** (720×720, 7,4 Mbps) yang ditampilkan
68–84 px, ditambah poster PNG mentah 113 KB — keduanya diunduh bersamaan dengan
JS halaman. Di 4G nyata video saja ±9 detik bandwidth.

| Langkah | Siap dipakai (median, 4G + CPU 4×) |
|---|---:|
| Semula | 1103 / 1181 / 1281 ms (tiga jalan) |
| Video di-encode ulang 256 px VP9 + alpha (4,59 MB → 0,35 MB, visual identik pada ukuran tampil) | 1122 / 1151 ms — dalam derau |
| + video baru dipasang setelah hidrasi | 1029 / 1045 ms |
| + poster lewat optimizer Next (WebP seukuran tampil, ±5 KB) | 904 / 926 / 961 ms |

LCP tetap ±400 ms. Total unduhan halaman login turun ±4,35 MB.

## 4. Yang tidak tercapai

**Anggaran bundle login 80 KB — terukur 119,1 KB.** Runtime Next.js 15 App
Router + React 19 sendiri 100,4 KB (react-dom 53,0 · runtime Next 45,0 ·
webpack/main-app/layout 2,4) dan dimuat di setiap halaman; JS milik halaman
login hanya 18,7 KB. Anggaran 80 KB berada di bawah lantai stack SYSTEM_DESIGN
§2, jadi tidak ada optimasi di dalam stack yang dapat mencapainya. Yang dijaga
anggaran itu — LCP dan TTI login di 4G — terpenuhi (§1). Pertentangan
dokumen ini dicatat sebagai **ADR-035 (Usulan)**: anggaran login dibaca
sebagai runtime + ≤ 20 KB JS halaman. Menunggu keputusan pemilik produk.

## 5. Risiko & tindak lanjut

- **Margin tipis pada CPU 4×:** Gantt 100 task (402–460 ms, satu sampel 531 ms)
  dan pratinjau surat (250–279 ms; ±200 ms di antaranya debounce yang
  disengaja). Di laptop (CPU 1×) keduanya 94 ms dan 211 ms. Bila kelak
  meleset: render awal chart editor didominasi render React baris terlihat +
  header — kandidatnya memuat `GanttEditor` lebih ringan atau mengurangi
  overscan.
- **Ukur ulang di Vercel** (staging) setelah deploy: cold start fungsi dan
  jarak klien↔`sin1` tidak tercakup di sini. Perintahnya sama:
  `npx tsx scripts/bench-all.ts --url https://<staging>` (butuh akun uji dan
  DB yang boleh disemai sementara).
- `klik→bar` (navigasi ke chart 100 task termasuk jaringan 4G) 693–1019 ms
  antar-jalan; bukan metrik PRD, dilaporkan di keluaran bench sebagai konteks.

## 6. Menjalankan ulang

```bash
npm run build && npm start             # build produksi; angka dev tidak sahih
npx tsx scripts/bench-all.ts           # 4G + CPU 4×, 5 jalan, semua metrik
npx tsx scripts/bench-all.ts --cpu 1 --jalan 3 --json hasil.json
npx tsx scripts/bench-all.ts --hanya dashboard,gantt-100,scroll
```

Butuh akun e2e (`npm run seed:e2e-auth`) dan template (`upload-templates.ts`).
Bundle dibaca dari `.next` build terakhir (`scripts/bench-bundle.ts`). Definisi
persis setiap angka ada di kepala `scripts/bench-all.ts`.
