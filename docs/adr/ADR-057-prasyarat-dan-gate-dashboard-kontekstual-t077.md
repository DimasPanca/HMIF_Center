# ADR-057 — Prasyarat dan gate dashboard kontekstual T-077

|                    |                                                                    |
| ------------------ | ------------------------------------------------------------------ |
| **Status**         | **Usulan**                                                         |
| **Tanggal**        | 2026-09-12                                                         |
| **Ditemukan oleh** | T-077 saat memeriksa panel approval dan alat ukur dashboard        |
| **Task terkait**   | T-060, T-075, T-076, T-077                                        |

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

T-077 diusulkan menunggu sinkronisasi berikut:

1. Dependency T-060 pada state pelaksana dipulihkan agar sesuai kontrak beku,
   atau pemilik proyek menyetujui revisi kontrak yang secara eksplisit
   menghapus panel approval surat dari cakupan T-077.
2. Bila T-060 tetap menjadi prasyarat, lane data menyelesaikan state machine,
   antrian, halaman detail, dan route approval surat sebelum T-077 dilanjutkan.
3. Lane data menyediakan `e2e/dashboard-role.spec.ts` untuk membuktikan tujuh
   susunan role, gabungan multi-role tanpa kartu duplikat, badge approval, dan
   navigasi item approval.
4. Lane data menyediakan `scripts/bench-dashboard.ts` dengan profil jaringan
   4G yang mengukur waktu dashboard dan Master Gantt siap interaksi.
5. Bentuk respons `app/api/dashboard/route.ts` ditetapkan sebelum query agregat
   ditulis, termasuk aturan lingkup departemen untuk Kadept dan identitas user
   untuk panel Anggota.
6. T-077 tetap BLOCKED sampai keputusan dependency serta gate di atas tersedia.

## Konsekuensi implementasi

- Dashboard tidak memperkenalkan tautan approval surat yang berakhir 404.
- Badge approval dapat dibandingkan dengan sumber data yang sama melalui gate,
  bukan hanya dinilai secara visual.
- Query data berlingkup tidak ditentukan sepihak di route UI.
- Lane UI dapat melanjutkan task READY lain sambil T-060/T-077 diselaraskan.
