# ADR-038 — Formulir HMIF Center (pengganti Google Form)

|                     |                                                          |
| ------------------- | -------------------------------------------------------- |
| **Status**          | Diterima                                                 |
| **Tanggal**         | 2026-11-01                                               |
| **Diputuskan oleh** | Pemilik produk (sesi tanya-jawab 2026-11-01)             |
| **Kontrak fitur**   | `docs/ai/FORM_CONTRACT.md`                               |

## Konteks

Panitia memakai Google Form untuk pendaftaran peserta, evaluasi acara, open
recruitment, dan pendataan pengurus. Datanya tercecer di luar sistem: peserta
pendaftar diketik ulang ke RAB, evaluasi tidak tersimpan di acara, data
pengurus disalin manual. PRD/SYSTEM_DESIGN (beku) belum memuat modul ini.

## Keputusan

1. **Modul baru "Formulir"**, setara Google Form: bagian (halaman) + logika
   lompat, 12 tipe pertanyaan (teks singkat, paragraf, pilihan ganda, kotak
   centang, dropdown, skala linear, tanggal, waktu, email, angka, unggah
   berkas, kisi pilihan ganda, kisi kotak centang), wajib/opsional, validasi,
   batas waktu & kuota respons.
2. **Kategori wajib** saat membuat form: Pendaftaran Peserta, Evaluasi Acara,
   Open Recruitment, Pendataan Pengurus, Lainnya. Pendaftaran & Evaluasi
   WAJIB terikat satu acara; Open Recruitment & Pendataan Pengurus bersifat
   organisasi (tanpa acara). Ditegakkan CHECK database.
3. **Template** global dikelola Sekum & Admin (bawaan: Evaluasi, Pendaftaran,
   Open Recruitment, Pendataan Pengurus, KT1 — isi KT1 menyusul dari panitia).
   Membuat form dari template = menyalin isinya; mengubah template tidak
   mengubah form yang sudah dibuat.
4. **Pembuat:** Sekum, Ketua, Wakil, Admin untuk form organisasi; panitia
   acara (termasuk Anggota) dan pimpinan untuk form acara.
5. **Responden dipilih per form:** `PUBLIK` (tautan tanpa login, untuk calon
   peserta) atau `INTERNAL` (wajib login, bisa dibatasi satu respons per akun).
   Opsi **anonim** tidak menyimpan identitas responden.
6. **Pembaca respons:** pembuat, panitia acara terkait (form acara), Ketua,
   Wakil, Sekum, Admin. BPH TIDAK membaca respons (data pribadi).
7. **Data terstruktur, bukan satu gumpalan JSON:** `form`, `form_bagian`,
   `form_pertanyaan`, `form_respons`, `form_jawaban` (satu baris per jawaban,
   kolom bertipe: teks/angka/tanggal/waktu/json/berkas) — dapat dikueri,
   diringkas, diekspor.
8. **Integrasi:** respons Pendaftaran otomatis menjadi baris `peserta` acara
   (pemasukan RAB); respons Pendataan Pengurus diterapkan ke `pengurus` setelah
   ditinjau Sekum; respons Open Recruitment disimpan terpisah dengan status
   seleksi (Baru / Lolos / Tidak lolos). Pemetaan memakai `peran` pertanyaan
   (nama_lengkap, nim, email, no_hp, angkatan, jabatan).
9. **Keamanan pengisian publik:** dilayani server (bukan PostgREST anonim),
   token tautan acak 128-bit, rate limit per IP, honeypot anti-bot, kuota &
   batas waktu dicek di dalam transaksi berkunci, validasi ulang setiap
   jawaban di server terhadap struktur form, unggahan dicek magic bytes
   (JPEG/PNG/WebP/PDF), maks 4 MB per berkas dan 4,4 MB per kiriman (Vercel
   menolak badan permintaan > 4,5 MB; foto dikompres di peramban lebih dulu),
   nama berkas tak pernah jadi path, disimpan
   di bucket privat dan hanya diunduh lewat route ber-izin.
10. **Struktur terkunci sebagian setelah ada respons:** tipe pertanyaan yang
    sudah dijawab tidak dapat diubah dan pertanyaan itu hanya diarsipkan
    (bukan dihapus), supaya jawaban lama tidak kehilangan maknanya.
11. **Backup:** tabel formulir masuk modul backup ke-13 `formulir` (PRD
    F-16.1 menyebut 12 modul — modul baru ditambahkan, bukan disisipkan ke
    modul lain).

## Akibat

- Permission baru `form` dan `form_template` di matriks (`lib/auth/permissions.ts`).
- Menu "Formulir" di sidebar Sekum/pimpinan/Kadept/panitia (ADR-037) dan tab
  "Formulir" di halaman acara.
- Rute publik `/f/{token}` dan `/api/f/{token}` dikecualikan dari sesi di middleware.
