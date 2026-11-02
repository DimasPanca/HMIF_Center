# ADR-064 — Halaman login: panel pemandangan malam & form bercahaya (palet HMIF)

|                     |                                                               |
| ------------------- | ------------------------------------------------------------- |
| **Status**          | Diterima                                                      |
| **Tanggal**         | 2026-11-02                                                    |
| **Diputuskan oleh** | Pemilik produk ("login terlalu monoton" + gambar referensi)   |
| **Melengkapi**      | ADR-060, kontrak T-045                                        |

## Konteks

Login lama: blok gradien navy dengan logo dan teks, form polos di kanan; pemilik menilainya membosankan.
Putaran pertama memakai arah *Loud and flat* dari skill `design-taste-frontend` (poster surat resmi
HMIF). Pemilik lalu mengirim gambar referensi (panel foto bukit pasir malam di kiri, form gelap bercahaya
di kanan) dan meminta gaya itu **dengan palet HMIF**. Keputusan pemilik mengalahkan arah yang diundi.

## Keputusan

- **Halaman selalu gelap**: latar navy HMIF (#03050C → #0B2A66) dengan pendar biru HMIF (#0066A9) dari
  bawah (`radial-gradient`, permintaan eksplisit pemilik mengalahkan larangan gradien dari skill).
- **Panel kiri** (`components/auth/PanelLogin.tsx`, test id `login-hero`): pemandangan malam bukit pasir
  digambar sebagai **SVG** dalam palet HMIF (navy, biru #1E90FF, cyan #00B4D8): bintang, pendar cakrawala,
  punggungan berpendar biru, riak pasir. Tanpa foto berlisensi, tajam di semua layar. Logo beranimasi
  (permintaan 2026-10-17) dan "Kabinet Vardhana 2026–2027" di pojok; keterangan "HMIF Center / Satu ruang
  kerja himpunan" di bawah, huruf tipis seperti referensi. Latar elemennya tetap `linear-gradient`
  (langit) untuk kontrak T-045 butir 7.
- **Form kanan**: input gelap transparan berikon, pendar biru saat fokus, tombol gelap bergradasi halus
  seperti referensi. "Lupa kata sandi?" diarahkan ke Admin HMIF (tidak ada reset mandiri; tidak ada
  pendaftaran/OAuth). Label & test id lama dipertahankan.
- **Keluar sebelum hidrasi**: form keluar kini punya `action` asli; `/api/auth/logout` menjawab 303 ke
  `/login` untuk kiriman form biasa (sebelumnya pengguna tertahan di "/?" bila menekan Keluar sebelum
  JavaScript aktif — terlihat di e2e `login.spec` "keluar mengakhiri sesi").
- Diperiksa di 1440/768/390 px tanpa luapan dengan `playwright-cli`; *reduced motion*: logo statis,
  transisi mati.
