# ADR-045 — Entry test geometri untuk verifikasi T-072

|                    |                                                            |
| ------------------ | ---------------------------------------------------------- |
| **Status**         | **Diterima**                                               |
| **Tanggal**        | 2026-09-03                                                 |
| **Ditemukan oleh** | T-072 saat mencocokkan nama berkas dan perintah verifikasi |
| **Task terkait**   | T-072                                                      |

## Konteks

Kontrak T-072 mewajibkan test utama pada
`lib/gantt/__tests__/geometry.test.ts`, tetapi perintah verifikasinya memakai
filter posisi `npm run test -- gantt-geometry`. Vitest mencocokkan filter posisi
terhadap path berkas, bukan judul suite. Akibatnya berkas wajib tersebut tidak
terpilih dan opsi global `--passWithNoTests` dapat menghasilkan sukses semu
dengan nol test.

## Keputusan

- Pertahankan `geometry.test.ts` sebagai test lengkap yang diwajibkan kontrak.
- Tambahkan `lib/gantt/__tests__/gantt-geometry.test.ts` sebagai entry test
  terfokus yang namanya cocok dengan filter verifikasi dan menjalankan golden
  case lintas skala, minimum bar satu hari, serta rentang lintas tahun.
- Jalankan perintah kontrak dan full verify; keduanya wajib benar-benar
  melaporkan test yang dieksekusi.

Keputusan ini diterima melalui instruksi manusia untuk memperbaiki mismatch dan
tidak menerima verifikasi semu sebelum melanjutkan.

## Konsekuensi

- Perintah verifikasi T-072 tidak lagi bisa hijau dengan nol test.
- Test lengkap tetap berada pada path yang ditentukan kontrak.
- T-072 menambah satu berkas test dan satu ADR di luar daftar **Buat**, tetapi
  keduanya tetap berada dalam kepemilikan lane `ui`.
