# ADR-049 — Kontrak integrasi editor Gantt T-078

|                    |                                                           |
| ------------------ | --------------------------------------------------------- |
| **Status**         | **Usulan**                                                |
| **Tanggal**        | 2026-09-04                                                |
| **Ditemukan oleh** | T-078 setelah gate lintas-lane `gantt-editor` tersedia    |
| **Task terkait**   | T-078                                                     |

## Konteks

Kontrak T-078 mewajibkan satu editor yang dapat menambah, mengubah, dan
menghapus task maupun grup; menggeser bar; mengubah durasi melalui tepi bar;
menggambar dependensi Finish-to-Start; serta mengekspor PNG dan PDF. Namun,
field **Ubah** bernilai kosong dan field **Buat** hanya memuat empat komponen
baru serta tiga route handler.

Implementasi Gantt yang sudah ada menempatkan geometri dan bar interaktif di
`GanttChart.tsx` serta `TaskBar.tsx`, sedangkan konektor berada di
`Connectors.tsx`. Menambahkan drag, resize, dan dependensi tanpa mengubah titik
integrasi tersebut akan memerlukan lapisan DOM kedua yang menduplikasi geometri.
Itu rapuh terhadap virtualisasi dan berisiko melanggar larangan membuat
komponen Gantt kedua.

Gate lintas-lane yang kini tersedia juga menetapkan harness
`app/qa/gantt-editor/page.tsx`. Berkas itu tidak tercantum pada field **Buat**
atau **Ubah** T-078. Membuatnya diam-diam melanggar AGENT_RULES P-10.

Terakhir, kontrak meminta CRUD task dan grup serta dependensi opsional, tetapi
daftar route hanya menyediakan data chart, perubahan task berdasarkan ID, dan
export. Tidak ada route yang bentuknya tegas untuk membuat task, CRUD grup,
atau CRUD dependensi. Memasukkan semua operasi ke satu route generik akan
mengarang kontrak API baru, yang dilarang P-09.

Jalur export juga belum tunggal: kontrak menyebut rasterisasi SVG ke canvas 2x,
tetapi sekaligus meminta route export, sementara dependency PDF tidak tersedia.
Tanpa keputusan, implementasi dapat berakhir dengan dua renderer yang memberi
hasil berbeda. Bagian API pada gate memerlukan konteks data yang sengaja tidak
tersedia di worktree lane `ui`, dan pemeriksaan "terbaca saat disisipkan ke
Word" tetap merupakan uji manusia, bukan sesuatu yang boleh dinyatakan lulus
hanya dari dimensi berkas.

## Keputusan

T-078 diusulkan menjadi task integrasi lintas-lane dengan kontrak eksplisit:

1. Lane `ui` tetap memakai satu `GanttChart`, tetapi diizinkan mengubah
   `GanttChart.tsx`, `TaskBar.tsx`, `Connectors.tsx`, serta tipe/transformasi di
   `lib/gantt/**` untuk drag, resize, dan dependensi.
2. `app/qa/gantt-editor/page.tsx` ditambahkan ke daftar **Buat** lane `ui`
   sebagai pasangan resmi `e2e/gantt-editor.spec.ts`.
3. API Gantt memakai route yang tidak ambigu: baca chart; tambah, ubah, dan
   hapus task; tambah, ubah, dan hapus grup; tambah dan hapus dependensi; serta
   export. Tanda tangan operasi, validasi, izin, dan bentuk respons disediakan
   lane `data` dalam kontrak lintas-lane, lalu route handler milik lane `ui`
   hanya mengadaptasi HTTP ke kontrak tersebut.
4. Kontrak lintas-lane tersebut juga menetapkan satu jalur export PNG/PDF,
   cara memancarkan event `gantt:{chart_id}`, dan jaminan izin pada lapisan
   aplikasi serta RLS sebelum route ditulis.
5. Verifikasi dibagi apa adanya: lane `ui` menjalankan gate tampilan tanpa
   kredensial database; lane `data` menjalankan skenario API berautentikasi
   setelah merge; manusia memeriksa PNG 2x di Word.
6. T-078 tetap `BLOCKED` sampai usulan ini diterima atau kontrak task diperbaiki
   dengan keputusan lain di `main`.

## Konsekuensi implementasi

- Lane `ui` tidak membuat overlay geometri tandingan, endpoint generik yang
  tidak terdokumentasi, atau stub API yang hanya ditujukan untuk menghijaukan
  gate.
- Lane `data` dapat menegakkan izin, validasi relasi chart, RLS, dan pemancaran
  realtime pada satu lapisan domain yang sama untuk seluruh route.
- Selector dan parameter pada `e2e/gantt-editor.spec.ts` baru mengikat setelah
  halaman harness tercantum resmi dalam cakupan T-078.
- Diperlukan sync tak terjadwal sebelum implementasi dilanjutkan; sampai saat
  itu hanya ADR ini dan status task yang berubah.
