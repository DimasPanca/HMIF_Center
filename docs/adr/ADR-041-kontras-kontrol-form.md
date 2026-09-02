# ADR-041 — Kontras kontrol form dan ambiguitas kontrak T-016

|                    |                                   |
| ------------------ | --------------------------------- |
| **Status**         | **Diterima**                      |
| **Tanggal**        | 2026-09-02                        |
| **Ditemukan oleh** | T-016 saat mengaudit kontrol form |
| **Task terkait**   | T-012, T-016                      |

## Konteks

T-016 mewajibkan setiap komponen lolos Checklist Komponen DESIGN_SYSTEM §15.3,
termasuk kontras WCAG AA di light dan dark mode. Pada saat yang sama,
DESIGN_SYSTEM §8.1 menetapkan kombinasi warna tombol berikut:

- Primary memakai `--primary` dengan teks `--primary-text`.
- Danger memakai `--danger` dengan teks putih.

Dengan token dark mode yang ditetapkan T-012, teks tombol berukuran 14 px tidak
mencapai rasio minimum WCAG AA 4,5:1:

| Kombinasi dark mode                                    |  Rasio |
| ------------------------------------------------------ | -----: |
| `--primary` (`#1E90FF`) + `--primary-text` (`#FFFFFF`) | 3,24:1 |
| `--danger` (`#F87171`) + putih (`#FFFFFF`)             | 2,77:1 |

Mengganti teks kedua tombol menjadi `--text-inverse` (`#111C44`) pada dark mode
menaikkan rasio menjadi masing-masing 5,10:1 dan 5,96:1, tetapi menyimpang dari
pemetaan eksplisit §8.1.

Masalah serupa ada pada batas input yang diwajibkan §8.2. Rasio
`--border-default` terhadap `--bg-panel` hanya 1,26:1 pada light mode dan 1,31:1
pada dark mode. Bahkan `--border-strong` hanya mencapai 1,72:1 dan 1,83:1.
Nilai itu belum mencapai ambang 3:1 untuk informasi visual nonteks yang
dibutuhkan guna mengenali kontrol dan state-nya.

Ada tiga ambiguitas tambahan di kontrak yang sama:

1. T-016 menyebut "14 poin Checklist Komponen", sedangkan §15.3 berisi 15 poin.
2. T-016 dan invariant K-14 mengunci tinggi tombol 34 px serta empat varian,
   sedangkan §8.1 juga menampilkan ukuran 28/40 px dan varian Danger Ghost/Link.
3. T-016 meminta padding input mengikuti §8.2, tetapi §8.2 tidak menetapkan angka
   padding input.

## Keputusan

1. Untuk T-016, kontrak spesifik dan K-14 ditegaskan menang: hanya varian
   `primary`, `secondary`, `ghost`, `danger`, dengan tinggi tombol dan kontrol
   satu baris 34 px. Checkbox tetap 16 px tetapi memakai radius komponen 6 px;
   textarea memakai tinggi minimum 88 px agar tetap menjadi kontrol multibaris.
2. Checklist T-016 diperbaiki menjadi seluruh 15 butir §15.3; butir yang memang
   tidak berlaku pada primitive tertentu boleh dicatat `N/A` dengan alasan.
3. Padding horizontal input ditetapkan 12 px; tombol mengikuti padding medium
   §8.1 sebesar 14 px.
4. Tombol primary/danger memakai `--text-inverse` pada dark mode. Light mode
   tetap memakai `--primary-text`. Aksesibilitas didahulukan daripada pemetaan
   warna literal §8.1.
5. Batas kontrol memakai `--text-tertiary` sebagai sumber warna hingga tersedia
   token batas kontrol tersendiri. Rasionya terhadap `--bg-panel` adalah 4,69:1
   pada light mode dan 3,52:1 pada dark mode, sehingga memenuhi ambang 3:1 tanpa
   mengubah `app/globals.css` di luar daftar file T-016.

Keputusan ini diterima melalui instruksi manusia untuk melanjutkan T-016 setelah
blocker dan rekomendasi ADR dilaporkan.

## Konsekuensi

- Komponen T-016 dapat menyatakan checklist kontras secara benar, bukan hanya
  mencantumkan komentar lulus pada kombinasi yang terukur gagal.
- API tombol tidak membawa varian atau ukuran di luar kontrak task.
- Implementasi input tidak perlu mengarang nilai padding yang tidak tertulis.
- Batas kontrol dapat terlihat jelas pada kedua tema tanpa memakai warna mentah.
- Perubahan kontrak harus disinkronkan ke kedua lane sebelum T-016 dilanjutkan.
