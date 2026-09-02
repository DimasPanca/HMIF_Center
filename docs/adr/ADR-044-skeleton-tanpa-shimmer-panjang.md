# ADR-044 — Skeleton tanpa shimmer berdurasi panjang

|                    |                                       |
| ------------------ | ------------------------------------- |
| **Status**         | **Diterima**                          |
| **Tanggal**        | 2026-09-02                            |
| **Ditemukan oleh** | T-018 saat menerapkan skeleton loader |
| **Task terkait**   | T-018                                 |

## Konteks

DESIGN_SYSTEM §12.2 memberi contoh shimmer berulang dengan durasi 1,5 detik.
Aturan kode K-13 dan instruksi lane yang lebih tinggi membatasi animasi pada
120/180 ms serta melarang indikator berputar terus-menerus. T-018 juga melarang
spinner kontinu.

Nilai utama skeleton menurut kontrak adalah bentuknya: skeleton harus menyerupai
konten tabel, kartu, atau chart, bukan menjadi kotak generik. Shimmer bukan syarat
kriteria selesai dan tidak boleh mengalahkan batas animasi global.

## Keputusan

- Skeleton T-018 bersifat statis dan memakai token latar muted/subtle.
- Varian skeleton tetap menyusun bentuk internal yang menyerupai tabel, kartu,
  chart, teks, atau avatar.
- Status loading disampaikan melalui `aria-busy`/teks aksesibel pada kontainer
  pemakai, bukan melalui gerakan tanpa batas.

Keputusan ini diterima melalui instruksi manusia untuk melanjutkan dengan
prioritas pada implementasi yang aman dan konsisten dengan aturan lane.

## Konsekuensi

- Tidak ada animasi 1,5 detik atau loop kontinu yang melanggar K-13.
- Pengguna yang mengurangi gerakan tidak menerima efek khusus tambahan.
- Skeleton masih memberi petunjuk struktur dan kepadatan konten yang akan muncul.
