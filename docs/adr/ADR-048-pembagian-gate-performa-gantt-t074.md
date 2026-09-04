# ADR-048 — Pembagian gate performa Gantt T-074

|                    |                                                 |
| ------------------ | ----------------------------------------------- |
| **Status**         | **Diterima**                                    |
| **Tanggal**        | 2026-09-03                                      |
| **Ditemukan oleh** | T-074 saat membaca kontrak dan kepemilikan lane |
| **Task terkait**   | T-074                                           |

## Konteks

Kontrak T-074 meminta lane `ui` membuat `lib/gantt/use-virtual-rows.ts` dan
`scripts/bench-gantt.ts`, mengubah `components/gantt/GanttChart.tsx`, lalu
menjalankan `npm run test:e2e -- gantt-perf`.

Namun, `AGENTS.md`, `docs/ai/PARALLEL_PROTOCOL.md`, dan sumber kebenaran guard
menetapkan seluruh `scripts/**` dan `e2e/**` sebagai milik lane `data`. Lane
`ui` dilarang mengubah kedua area tersebut. Saat T-074 diklaim, baik
`scripts/bench-gantt.ts` maupun `e2e/gantt-perf.spec.ts` belum tersedia pada
`main` atau branch `lane/data`.

Ini bukan alasan untuk melewati pengukuran. Kontrak mensyaratkan angka nyata
untuk render 100 task, 48 bar, dan scroll horizontal 60 fps; T-074 tidak boleh
ditutup hanya berdasarkan unit test atau perkiraan.

## Keputusan

- lane `ui` mengerjakan virtualisasi dan integrasinya hanya pada
  `lib/gantt/**` serta `components/gantt/**`;
- lane `data` menyediakan `scripts/bench-gantt.ts` dan
  `e2e/gantt-perf.spec.ts` pada sync tak terjadwal;
- selector lintas-lane dibatasi pada atribut stabil yang diekspos
  `GanttChart`: `gantt-root`, `gantt-vertical-scroll`,
  `gantt-timeline-viewport`, `data-rendered-row-count`,
  `data-total-row-count`, dan `data-virtual-buffer`;
- kedua lane menguji hasil gabungan sebelum T-074 ditandai selesai;
- lane `ui` tidak mengklaim target performa dan tidak mengomit gate sambil
  menunggu artefak lane `data`.

## Konsekuensi

- Kepemilikan file tetap utuh dan `guard ui` tidak dilanggar.
- Benchmark dapat mengukur implementasi sebenarnya, bukan salinan algoritma di
  luar komponen.
- T-074 tetap `IN_PROGRESS` sampai benchmark dan E2E milik lane `data`
  tersedia serta ketiga target terukur lulus.
- Bila test membutuhkan fixture 100 task pada route QA, bentuk fixture dan
  route disepakati saat sync agar lane `ui` tidak menebak kontrak selector.

Sync tak terjadwal pada 2026-09-04 menerima pembagian ini. Lane `data`
menyediakan benchmark dan gate melalui commit `5ced522`; kontrak gate tersebut
menetapkan `app/qa/gantt/page.tsx` sebagai pasangan milik lane `ui`, dengan
fixture bawaan tetap dan dua dataset tambahan: `48bar` serta `100task`.
