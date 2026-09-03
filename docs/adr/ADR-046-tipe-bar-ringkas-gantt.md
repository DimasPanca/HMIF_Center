# ADR-046 — Tipe bar ringkas Gantt

|                    |                                         |
| ------------------ | --------------------------------------- |
| **Status**         | **Diterima**                            |
| **Tanggal**        | 2026-09-03                              |
| **Ditemukan oleh** | T-072 saat menerapkan model data render |
| **Task terkait**   | T-072                                   |

## Konteks

`SYSTEM_DESIGN §10.2` menetapkan `GanttGroupVM.bars: GanttBarVM[]`, tetapi tidak
mendefinisikan `GanttBarVM` di bagian tersebut maupun di lokasi lain dalam
dokumen. Tanpa tipe pendukung, empat interface wajib tidak dapat dikompilasi.
Kontrak T-072 juga mengharuskan bar ringkas memuat rentang gabungan seluruh anak.

## Keputusan

Definisikan `GanttBarVM` sebagai tipe pendukung kecil dengan:

- `id`, agar setiap bar mempunyai identitas render stabil;
- `start` dan `end`, sebagai rentang inklusif hasil agregasi;
- `color`, mengikuti identitas grup;
- `progress`, berupa rata-rata aritmetika progres anak yang sudah dinormalisasi
  ke rentang 0–100.

Tipe ini tidak menambah field pada empat interface yang ditetapkan secara
eksplisit. Transform selalu menghasilkan tepat satu bar ringkas untuk grup yang
memiliki anak dan tidak menghasilkan bar untuk grup kosong.

Keputusan ini diterima melalui instruksi manusia untuk menyelesaikan mismatch
secara eksplisit sebelum melanjutkan task.

## Konsekuensi

- Model pada `SYSTEM_DESIGN §10.2` dapat dikompilasi tanpa tipe implisit.
- Komponen render berikutnya tidak perlu menghitung ulang rentang atau progres
  grup di React.
- Rata-rata progres ini hanya metadata presentasi; tidak mengubah maupun menulis
  nilai progres ke database.
