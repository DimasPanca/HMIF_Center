# ADR-057 — Prasyarat dan gate dashboard kontekstual T-077

|                    |                                                             |
| ------------------ | ----------------------------------------------------------- |
| **Status**         | **Diterima**                                                |
| **Tanggal**        | 2026-09-12                                                  |
| **Disetujui**      | pemilik proyek, 2026-09-12                                  |
| **Ditemukan oleh** | T-077 saat memeriksa panel approval dan alat ukur dashboard |
| **Task terkait**   | T-060, T-075, T-076, T-077                                  |

## Konteks

Kontrak beku T-077 menyatakan dependency `T-075, T-060`. Panel Ketua/Wakil
wajib memuat antrian approval proker dan surat, badge harus akurat, dan setiap
item harus membuka detail yang menyediakan tindakan Setujui/Tolak. Namun state
lane UI yang dibangun ulang hanya mencantumkan dependency T-075 sehingga T-077
dipromosikan menjadi READY walaupun `tasks.json` masih menandai T-060 sebagai
TODO.

Keadaan repository pada 2026-09-12 membuktikan bahwa hasil T-060 belum ada:

- `app/(dashboard)/surat/approval/page.tsx` tidak ada;
- folder `app/api/surat/` tidak ada;
- item surat dari antrian tidak memiliki halaman detail maupun route tindakan
  yang dapat dituju;
- `e2e/dashboard-role.spec.ts` tidak ada;
- `scripts/bench-dashboard.ts` tidak ada.

Membangun T-077 dalam keadaan ini akan menghasilkan salah satu dari dua
kegagalan: menyembunyikan approval surat sehingga panel tidak sesuai PRD F-3.2,
atau menampilkannya sebagai tautan menuju 404 sehingga acceptance criterion
"langsung membuka detail beserta tombol Setujui/Tolak" tidak benar.

Selain itu target siap interaksi kurang dari 1,5 detik tidak dapat dibuktikan
tanpa benchmark yang disebut langsung oleh kontrak. Mengganti angka itu dengan
waktu build atau perkiraan bukan verifikasi yang setara.

## Keputusan

Pemilik proyek memilih pengiriman bertahap dengan destination-gating:

1. T-077 dilanjutkan tanpa menunggu seluruh rantai T-056 → T-058 → T-060.
2. `approval-antrian` hanya memuat jenis `PROKER`, satu-satunya jenis yang sudah
   mempunyai tujuan detail dan tindakan approval. Jenis `SURAT` ditambahkan
   setelah T-060 selesai, melalui satu konstanta `JENIS_BERTUJUAN` pada kontrak
   data dashboard.
3. Sekum tetap melihat kartu approval dengan badge 0 sampai tujuan surat ada.
   Angka itu jujur karena sama dengan jumlah item yang benar-benar dapat dibuka.
4. Bentuk respons, aturan lingkup, dan deduplikasi mengikuti
   `docs/ai/DASHBOARD_CONTRACT.md` yang disediakan lane data.
5. `e2e/dashboard-role.spec.ts` dan `scripts/bench-dashboard.ts` menjadi gate
   wajib T-077. Keduanya sudah tersedia dari slice data T-077.
6. T-077 tidak lagi BLOCKED setelah tiga prasyarat data pada butir 4–5 masuk
   branch integrasi.

## Konsekuensi implementasi

- Dashboard tidak memperkenalkan tautan approval surat yang berakhir 404.
- Badge approval dapat dibandingkan dengan sumber data yang sama melalui gate,
  bukan hanya dinilai secara visual.
- Query data berlingkup tidak ditentukan sepihak di route UI.
- T-060 tetap diperlukan untuk mengaktifkan approval surat, tetapi tidak lagi
  menahan kartu dashboard lain yang sudah mempunyai data dan tujuan valid.
