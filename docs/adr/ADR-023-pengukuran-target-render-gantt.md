# ADR-023 — Gate performa Gantt menegakkan biaya marginal, bukan angka absolut

| | |
|---|---|
| **Status** | Usulan |
| **Tanggal** | 2026-09-04 |
| **Ditemukan oleh** | T-074, saat menjalankan gate gabungan terhadap harness lane ui |
| **Lane** | `data` |
| **Task terkait** | T-074, T-075 |

## Konteks

PRD F-6.3 Acceptance Criteria dan PRD §11 menetapkan dua angka:

> Chart dengan 100 task ter-render **< 500 ms**
> Dengan 6 departemen × 8 proker (48 bar), render awal **< 500 ms**

`e2e/gantt-perf.spec.ts` dibuat untuk mengukurnya. Begitu harness berdataset
dari lane ui masuk, angkanya terukur — dan bersamanya terbukti bahwa kriteria
itu **tidak dapat diukur di lingkungan yang tersedia.**

### Harness hanya hidup di mode dev

Halaman `/qa/gantt` sengaja tidak dapat dicapai di produksi, dijaga dua lapis
yang keduanya disengaja dan terdokumentasi:

1. `middleware.ts` hanya melewatkan prefix `/qa/` saat `NODE_ENV !== 'production'`;
2. `app/qa/gantt/page.tsx` memanggil `notFound()` di produksi.

Diukur: `npm run build && npm run start` menjawab `/qa/gantt` dengan 307 ke
`/login`. `next start` memaksa `NODE_ENV=production`, jadi tidak ada celah yang
dapat dibuka tanpa melemahkan salah satu lapis itu — dan melemahkannya berarti
membuka halaman tanpa autentikasi di produksi demi sebuah angka.

### Di mode dev, anggaran 500 ms sudah habis sebelum Gantt dirender

Diukur pada worktree ini, `responseEnd` sampai bar pertama tergambar, dua
proyek Playwright, rute sudah panas:

| Yang diukur | Pengamatan |
|---|---|
| Baseline harness bawaan (**3 baris**) | 398,5 · 415,2 · 423,2 · 430,2 · 531,6 ms |
| 48 bar (54 baris data) | 386,0 · 442,4 · 448,4 · 495,9 ms |
| 100 task (106 baris data) | 463,0 · 473,2 · 517,3 · 534,0 ms |

**Chart tiga baris sudah memakan 400–530 ms.** Artinya angka absolut di mode
dev hampir seluruhnya mengukur bundle pengembangan yang tidak diminifikasi
beserta React build pengembangan — bukan Gantt.

Konsekuensinya langsung terlihat: dua jalan berturut-turut atas kode yang sama
persis menghasilkan **2 gagal** lalu **10 lulus**. Lane ui melaporkan 10/10
lulus dengan render 377–440 ms di mesinnya; pengukuran yang sama di mesin ini
memberi 386–651 ms. Keduanya jujur, dan justru itu masalahnya.

Gate yang hasilnya undian tidak menjaga apa pun. Ia mengajari orang menjalankan
ulang sampai hijau — dan kebiasaan itu mematikan gate yang kelak merah karena
sebab sungguhan. `playwright.config.ts` sudah memuat peringatan yang sama untuk
alasan yang berbeda.

### Satu cacat instrumentasi ikut ditemukan

Versi pertama mengukur baseline pada navigasi **pertama** ke `/qa/gantt`, lalu
mengukur dataset pada navigasi kedua yang rutenya sudah panas. Baseline jadi
memuat kompilasi webpack sementara pembandingnya tidak, dan hasilnya baseline
812,2 ms terhadap render 641,7 ms — selisih negatif, mustahil bila baseline
benar-benar biaya dasar. Sudah diperbaiki dengan navigasi pemanasan yang
dibuang.

## Keputusan yang diusulkan

Gate menegakkan tiga hal yang benar-benar dapat diukur di mode dev, dan
melaporkan angka absolutnya tanpa menegakkannya.

**Yang diassert:**

1. **Biaya marginal** dataset terhadap baseline pada bundle yang sama,
   anggaran **250 ms**. Terukur setelah perbaikan: 48 bar −38,2 … +44,1 ms,
   100 task −7,5 … +44,1 ms. Anggarannya kira-kira 2,6× pengukuran terburuk
   sebelum perbaikan (+94,1 ms).
2. **Virtualisasi**: baris yang dirender jauh lebih sedikit daripada baris
   data, dan buffer-nya 5. Terukur 19 dari 106. Inilah penjaga langsung
   terhadap regresi yang paling mungkin.
3. **Scroll 60 fps**, yang tidak terpengaruh beban bundle sama sekali. Terukur
   59,9 fps, 0 dari 85 frame melewati anggaran.

**Yang dilaporkan tanpa diassert:** angka absolut, ditandai
`BELUM TERVERIFIKASI` pada setiap barisnya supaya deretan angka di bawah 500 ms
tidak terbaca sebagai "target PRD tercapai".

**Yang menunggu keputusan manusia:** bagaimana kriteria absolut PRD F-6.3
diverifikasi. Tiga jalan yang terlihat, dan ketiganya menyentuh wilayah di luar
lane `data`:

| Jalan | Biaya |
|---|---|
| Harness produksi di balik rahasia (mis. header `CRON_SECRET`-style) | Membuka permukaan tanpa autentikasi di produksi; perlu persetujuan eksplisit |
| Ukur pada halaman sungguhan di T-075 dengan sesi dan seed | Butuh Master Gantt selesai; mengukur jalur nyata, bukan harness |
| Terima bahwa angka absolut hanya diverifikasi manual saat UAT | Murah, tetapi tidak pernah menjadi gate |

Usulan penulis: **jalan kedua**. T-075 memang membuat beranda Master Gantt yang
dilihat pengguna, dan itulah tempat angka 500 ms benar-benar berarti. Sampai
saat itu, kriteria absolutnya berstatus belum terverifikasi dan tidak boleh
diklaim tercapai.

## Konsekuensi

**Yang membaik.** Gate stabil: 10/10 lulus pada tiga jalan berturut-turut
setelah perubahan, dari sebelumnya 2 gagal lalu 10 lulus pada kode yang sama.
Dan yang dijaganya kini benar-benar milik T-074 — biaya yang dibawa data
tambahan, dan virtualisasi yang membuat biaya itu kecil.

**Yang dibayar.** Kriteria absolut PRD tidak lagi dijaga otomatis. Itu
kehilangan nyata, dan sengaja dicatat di sini alih-alih ditutupi: gate yang
sebelumnya "menjaga" angka itu sebenarnya hanya melempar koin.

**Batas kejujuran usulan ini.** Daya beda anggaran 250 ms terhadap regresi
virtualisasi **diargumentasikan, bukan diukur** — melumpuhkan virtualisasi
menuntut menyunting berkas lane ui, yang tidak boleh dilakukan lane ini. Yang
menjaga regresi itu secara langsung adalah assertion virtualisasi, bukan
angkanya.

**T-074 belum layak ditutup atas dasar performa.** Lane ui menandainya DONE
berdasarkan 10/10 lulus di mesinnya; angka itu tidak reproduksi di mesin ini,
dan kriteria yang dianggap terpenuhi ternyata tidak terukur. Status DONE-nya
perlu ditinjau ulang di sync point bersama ADR-048.
