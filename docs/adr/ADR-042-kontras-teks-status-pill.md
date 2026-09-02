# ADR-042 — Kontras teks Status Pill

|                    |                                            |
| ------------------ | ------------------------------------------ |
| **Status**         | **Diterima**                               |
| **Tanggal**        | 2026-09-02                                 |
| **Ditemukan oleh** | T-017 saat mengaudit Badge dan Status Pill |
| **Task terkait**   | T-012, T-017                               |

## Konteks

DESIGN_SYSTEM §8.3 memasangkan warna teks status dengan latar subtle yang
sewarna. Ukuran teks komponen hanya 11 px, sehingga memerlukan rasio kontras
minimum 4,5:1. Pada light mode, sebagian besar pasangan yang ditetapkan tidak
mencapainya:

| Pasangan token                   | Rasio light |
| -------------------------------- | ----------: |
| `--success` / `--success-subtle` |      3,03:1 |
| `--warning` / `--warning-subtle` |      2,90:1 |
| `--danger` / `--danger-subtle`   |      4,15:1 |
| `--info` / `--info-subtle`       |      2,23:1 |
| `--neutral` / `--neutral-subtle` |      4,22:1 |
| `--primary` / `--primary-subtle` |      5,29:1 |

Kontrak T-017 juga mewajibkan status dikenali melalui warna, label Indonesia,
dan ikon sekaligus. Karena label sudah menyampaikan arti status secara eksplisit,
ikon warna dapat diperlakukan sebagai penguat visual dan disembunyikan dari
accessibility tree.

## Keputusan

- Latar Badge/Status Pill tetap memakai token subtle sesuai tone status.
- Ikon tetap memakai token warna status sesuai §8.3.
- Label yang terlihat memakai `--text-primary` agar kontras teks aman pada light
  maupun dark mode.
- Status selalu menampilkan ikon dan label; warna tidak pernah menjadi satu-satunya
  pembeda.

Keputusan ini diterima melalui instruksi manusia untuk melanjutkan pekerjaan
setelah temuan aksesibilitas dilaporkan, dengan keselamatan implementasi sebagai
syarat utama.

## Konsekuensi

- Seluruh label status 11 px tetap terbaca dengan kontras WCAG AA.
- Warna domain masih terlihat konsisten pada latar dan ikon.
- Warna teks tidak lagi mengikuti tabel §8.3 secara literal; penyimpangan ini
  sengaja dibatasi pada aksesibilitas label.
