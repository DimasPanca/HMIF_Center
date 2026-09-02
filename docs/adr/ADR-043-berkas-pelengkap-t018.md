# ADR-043 — Berkas pelengkap kontrak T-018

|                    |                                                           |
| ------------------ | --------------------------------------------------------- |
| **Status**         | **Diterima**                                              |
| **Tanggal**        | 2026-09-02                                                |
| **Ditemukan oleh** | T-018 saat mencocokkan daftar berkas dan kriteria selesai |
| **Task terkait**   | T-018                                                     |

## Konteks

Kontrak T-018 mewajibkan komponen `InlineAlert` varian `konflik`, tetapi daftar
**Buat** hanya menyebut enam berkas lain. Kriteria selesai juga mewajibkan tiga
tingkat konfirmasi tersedia dan diuji, sementara daftar tersebut tidak menyebut
berkas test.

Menaruh `InlineAlert` di dalam modul yang tidak berhubungan hanya agar daftar
nama berkas dipatuhi akan membuat API design system sulit ditemukan. Mengabaikan
test juga akan membuat kriteria selesai tidak memiliki bukti otomatis.

## Keputusan

- Tambahkan `components/ui/inline-alert.tsx` sebagai modul yang dapat ditemukan
  langsung dari nama komponennya.
- Tambahkan `components/ui/__tests__/feedback.test.ts` untuk menguji aturan dan
  integrasi antarmuka ketiga tingkat konfirmasi serta jaminan toast gagal tanpa
  dependency baru.
- Kedua berkas tetap berada sepenuhnya di dalam kepemilikan lane `ui` dan harus
  melewati guard yang sama dengan enam berkas utama.

Keputusan ini diterima melalui instruksi manusia untuk menuntaskan task secara
proper dan memperbaiki mismatch sebelum melanjutkan.

## Konsekuensi

- Seluruh butir kontrak T-018 memiliki implementasi dan bukti test yang eksplisit.
- Tidak ada komponen yang disembunyikan di modul dengan nama yang menyesatkan.
- T-018 mengubah lebih banyak berkas daripada daftar **Buat**, tetapi tidak
  melampaui batas lane `ui`.
