# Menyalakan PDF surat — panduan pemilik (T-062)

Surat HMIF selalu dibuat sebagai DOCX dari template resmi. PDF-nya dibuat
**dari DOCX itu** oleh Gotenberg (LibreOffice di dalam Docker), sehingga kop,
tanda tangan, dan stempel identik dengan berkas Word. Vercel tidak dapat
menjalankan LibreOffice, jadi Gotenberg berjalan sebagai layanan terpisah.

Waktu: ±10 menit, sekali saja. Biaya: Rp0 (Render paket Free).

---

## 1. Buat layanan Gotenberg di Render

1. Buka <https://render.com> → **Sign up** (boleh dengan akun GitHub).
2. **New +** → **Web Service** → pilih **Existing Image**.
3. **Image URL**: `docker.io/gotenberg/gotenberg:8` → **Connect**.
4. Isi:
   | Kolom | Nilai |
   |---|---|
   | Name | `hmif-gotenberg` |
   | Region | **Singapore** (terdekat dengan database Supabase) |
   | Instance Type | **Free** |
5. **Environment Variables** → tambahkan tiga:
   | Key | Value |
   |---|---|
   | `PORT` | `3000` |
   | `GOTENBERG_API_BASIC_AUTH_USERNAME` | `hmif` |
   | `GOTENBERG_API_BASIC_AUTH_PASSWORD` | sandi acak panjang — buat dengan **Generate**, simpan di pengelola sandi |
6. **Advanced** → **Docker Command**:
   ```
   gotenberg --api-enable-basic-auth --api-timeout=60s
   ```
   Tanpa `--api-enable-basic-auth`, siapa pun yang tahu URL-nya dapat memakai
   layanan Anda untuk mengonversi berkas apa saja.
7. **Deploy Web Service**. Tunggu sampai status **Live**, lalu salin URL-nya,
   mis. `https://hmif-gotenberg.onrender.com`.

Cek cepat di browser: `https://hmif-gotenberg.onrender.com/health` →
`{"status":"up", ...}`. Bila browser meminta nama pengguna dan sandi, isi
`hmif` dan sandi dari langkah 1.5 — artinya basic auth sudah aktif.

(Flag dan nama variabel di atas dicocokkan dengan dokumentasi resmi
<https://gotenberg.dev/docs/configuration>, 2026-10-15.)

## 2. Uji dari laptop (sebelum menyentuh produksi)

Tambahkan ke `app/.env.local` (berkas ini tidak pernah di-commit):

```
GOTENBERG_URL=https://hmif-gotenberg.onrender.com
GOTENBERG_USERNAME=hmif
GOTENBERG_PASSWORD=<sandi dari langkah 1.5>
```

Lalu jalankan dari folder `app`:

```bash
npx tsx scripts/cek-pdf.ts
```

Hasil yang benar: `LULUS`, plus dua berkas `cek-pdf-contoh.pdf` dan
`cek-pdf-contoh.docx`. Permintaan pertama bisa memakan ±1 menit karena
layanan Free sedang "bangun" — jalankan sekali lagi bila gagal karena waktu.

## 3. Periksa dengan mata

Buka **kedua** berkas berdampingan. Pastikan di PDF:

- [ ] kop UNTIRTA + HMIF dan garisnya utuh;
- [ ] nomor, tanggal, isi sama;
- [ ] tanda tangan + stempel di tempat yang sama;
- [ ] teks dapat diseleksi/disalin (bukan gambar);
- [ ] tetap satu halaman.

Gotenberg memakai font *Liberation Serif* — ukurannya identik dengan Times New
Roman, jadi pemenggalan baris sama. Bila ada perbedaan lain, jangan lanjut —
kabari agent dengan tangkapan layar.

## 4. Nyalakan di produksi (Vercel)

Vercel → project **hmif-center** → **Settings** → **Environment Variables** →
Production:

| Key | Value |
|---|---|
| `GOTENBERG_URL` | URL dari langkah 1.7 |
| `GOTENBERG_USERNAME` | `hmif` |
| `GOTENBERG_PASSWORD` | sandi dari langkah 1.5 (tandai **Sensitive**) |
| `PDF_ENABLED` | `true` |

Lalu **Deployments** → deployment terbaru → **Redeploy**.

## 5. Coba di aplikasi

1. Buat surat → **Format output: Keduanya** → ajukan.
2. Setujui sebagai Ketua/Wakil/Sekum → muncul tombol **Unduh PDF**.
3. Untuk surat yang terbit saat layanan sedang tidur: buka detail surat di
   **Arsip** → **Buat PDF**.

Setelah langkah 5 berhasil, beri tahu agent untuk menandai T-062 **DONE**.

---

### Catatan

- **Paket Free tidur** setelah 15 menit tanpa permintaan; PDF pertama sesudahnya
  menunggu ±1 menit. Bila lewat batas, surat tetap terbit sebagai DOCX dengan
  peringatan dan PDF dapat dibuat belakangan lewat **Buat PDF**. Agar tidak
  pernah tidur: paket Starter Render (berbayar) atau pindah ke VPS dengan
  LibreOffice (`SOFFICE_PATH`).
- Mematikan PDF kapan pun: `PDF_ENABLED=false` lalu redeploy — opsi PDF hilang
  dari form dan permintaan PDF ditolak dengan pesan jelas (ADR-010).
- Mengganti sandi: ubah di Render **dan** Vercel, lalu redeploy keduanya.
