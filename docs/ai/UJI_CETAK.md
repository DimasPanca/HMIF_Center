# UJI_CETAK.md — Uji cetak nyata gambar nota (T-099 🧑)

Tujuan: membuktikan bahwa nota yang difoto lewat HMIF Center, diunduh, lalu
**dicetak di kertas** tetap terbaca untuk LPJ — nominal, tanggal, dan nama
toko. Ini satu-satunya kriteria yang tidak dapat diputuskan test otomatis:
test hanya membuktikan berkas yang diunduh identik byte demi byte dengan
master yang tersimpan (`npm run test -- image-download`, dan uji asap API
2026-10-15: unduhan = berkas unggahan, `Content-Type: image/jpeg`,
`Content-Disposition: attachment`).

T-099 tetap **BLOCKED** sampai tabel hasil di bawah diisi dan lulus.

## Yang dibutuhkan

- Akun pengurus yang boleh mengunggah nota (Kadept/Anggota panitia) di
  periode aktif, ponsel dengan kamera, dan printer biasa (laser/inkjet kantor
  atau tempat fotokopi — bukan printer foto).
- Tiga nota fisik sungguhan dengan sifat berbeda:
  1. **Struk thermal** kecil (minimarket) — teks tipis, mudah pudar.
  2. **Nota tulisan tangan** (toko bangunan/percetakan) — tinta pulpen.
  3. **Invoice/kuitansi A4/A5 cetak** — banyak baris kecil.

## Prosedur

1. Login di ponsel. Unggah ketiga nota lewat alur upload nota (atau, sebelum
   T-101 tersedia, lewat halaman uji yang memanggil `POST /api/images/upload`
   dari pipeline klien T-097). Foto dalam cahaya ruangan biasa, nota
   memenuhi ±80% bingkai, tanpa flash.
2. Di komputer, buka nota tersebut dan tekan **"Unduh resolusi penuh (untuk
   dicetak)"** — tautan ini memanggil `/api/images/{id}/download` dan
   menghasilkan master apa adanya. Jangan menyimpan gambar dengan klik kanan
   pada pratinjau: itu versi 1280px, bukan master.
3. Buka Word (atau template LPJ), **Insert → Pictures**, sisipkan ketiga
   berkas. Atur lebar gambar sesuai kebiasaan LPJ (mis. setengah lebar halaman
   A4 untuk struk, selebar halaman untuk invoice). Jangan memampatkan gambar
   (File → Options → Advanced → *Do not compress images in file* dicentang).
4. Cetak satu halaman dengan pengaturan printer bawaan (bukan mode draft).
5. Periksa kertas pada jarak baca normal (±30 cm), tanpa kaca pembesar:
   - **Nominal** total dan setiap baris harga terbaca tanpa ragu
     (bedakan 3/8, 1/7, 0/6).
   - **Tanggal** transaksi terbaca lengkap.
   - **Nama toko** dan alamat/kop terbaca.
   - Tidak ada artefak kotak-kotak JPEG di sekitar angka.
6. Catat hasilnya di tabel di bawah. Bila ada yang GAGAL, sertakan foto hasil
   cetak dan berkas masternya, lalu laporkan sebelum T-099 ditutup.

## Hasil

| Tanggal | Penguji | Nota | Ukuran cetak | Nominal | Tanggal | Nama toko | Lulus? | Catatan |
|---|---|---|---|---|---|---|---|---|
| | | Struk thermal | | | | | | |
| | | Tulisan tangan | | | | | | |
| | | Invoice A4/A5 | | | | | | |

Printer yang dipakai: …………………  Ponsel yang dipakai: …………………

## Bila gagal — yang diperiksa lebih dulu

- Berkas yang dicetak benar-benar hasil tombol unduh (nama berkas asli,
  ukuran beberapa MB)? Pratinjau berukuran ±100–300 KB.
- Word memampatkan gambar? (langkah 3).
- Master terlalu kecil karena foto diambil terlalu jauh? Sisi panjang master
  maksimal 3000px (`lib/images/constants.ts`); nota kecil yang hanya mengisi
  sebagian bingkai kehilangan resolusi efektif.
- Struk thermal pudar: kontras rendah adalah sifat kertasnya — uji ulang
  dengan mode dokumen (deteksi otomatis T-097) dan pencahayaan lebih terang.
