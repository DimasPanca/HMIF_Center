# ADR-061 — Rombak desain v2 Tahap 2: konsistensi visual seluruh halaman

|                     |                                                   |
| ------------------- | ------------------------------------------------- |
| **Status**          | Diterima                                          |
| **Tanggal**         | 2026-11-02                                        |
| **Diputuskan oleh** | Pemilik produk (lanjutan ADR-060, "Lanjut Tahap 2") |
| **Melengkapi**      | ADR-060                                           |

## Konteks

Tahap 1 (ADR-060) memasang token gaya Linear, Guide, Dhana, Lapor bug, dan Beranda baru. Halaman
lain masih memakai pola lama yang dilarang skill `hmif-design-linear` dan `design-taste-frontend`
(aturan app-screen): ikon di kotak berwarna di samping judul, label kecil berhuruf kapital
bertracking di atas judul dan di kepala tabel, serta tabel arsip surat yang terpotong di kanan.

## Keputusan

1. **Kepala halaman**: 19 halaman (proker, acara, surat, sekretariat, keuangan, admin) kehilangan
   ikon berkotak dan label kapital di atas `h1`. Judul + deskripsi saja, satu bahasa visual.
2. **Label huruf kapital kecil → huruf kalimat** di tabel bersama (`components/ui/table.tsx`),
   kalender ketersediaan, Kanban, kalender booking, audit, palet perintah, Gantt, peserta, dan form
   publik. Dikecualikan: `RabGrid`, `RabSectionHeader`, `RabSummary` — sengaja meniru format
   dokumen RAB resmi yang diekspor.
3. **Ikon pilihan** di wizard form tidak lagi di kotak berwarna.
4. **Arsip surat**: kolom Jenis menempel di bawah Perihal, Pembuat & Penyetuju menjadi satu kolom
   "Oleh", Status tidak terbungkus — tabel tidak lagi terpotong di kanan pada 1440 px.
5. **Audit Web Interface Guidelines** pada komponen baru Tahap 1: placeholder diakhiri "…",
   fokus terlihat pada hasil pencarian Guide, `overscroll-behavior: contain` di panel Dhana,
   animasi menghormati `prefers-reduced-motion`, input diberi `name`/`autocomplete`.

## Konsekuensi

- Tidak ada perubahan data, izin, atau test id. Teks yang diuji e2e tidak berubah (CSS
  `uppercase` tidak memengaruhi `textContent`).
- Sisa pekerjaan visual per halaman (mis. panel filter kalender bersama, kerapatan tabel RAB)
  dicatat di checkpoint untuk putaran berikutnya.
