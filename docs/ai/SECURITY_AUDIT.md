# SECURITY_AUDIT.md — Audit & uji penetrasi internal (T-113)

|                |                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Tanggal**    | 2026-10-17                                                                                                                                |
| **Lingkup**    | SYSTEM_DESIGN §18 · PRD §8.4 · kontrak T-113                                                                                              |
| **Alat**       | `npx tsx scripts/security-scan.ts` (HTTP sungguhan + SQL ber-RLS) · `npm run db:test -- 015c_rls_negatif`                                 |
| **Lingkungan** | `next dev` lokal → Supabase dev (data dummy). Header diperiksa pada respons server; konfigurasinya sama untuk produksi (`next.config.ts`) |
| **Status**     | Seluruh temuan **diperbaiki** atau **dimitigasi eksplisit** (§4). Tidak ada temuan terbuka.                                               |

Jalankan ulang setiap kali menyentuh guard, RLS, upload, storage, atau
middleware. Skrip membuat data ujinya sendiri (proker/acara/divisi/gambar
bertanda `SEC…`) dan menghapusnya di akhir.

---

## 1. Hasil uji penetrasi — tiga jalur, dua lapis

Setiap serangan dicoba lewat **aplikasi** (HTTP dengan sesi akun uji e2e) dan
lewat **RLS** (SQL sebagai role `authenticated` dengan JWT akun yang sama, di
transaksi yang di-rollback — setara akses langsung PostgREST memakai token
pengguna). Setiap jalur juga punya **kontrol positif** (aksi sah yang sama
diterima) supaya penolakan terbukti berasal dari pemeriksaan hak, bukan dari
validasi yang kebetulan gagal.

### 1.1 Akses lintas departemen

| Serangan                                                                   | Lapis    | Hasil                                                                         |
| -------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| Kadept membuat proker di departemen lain (`POST /api/proker`, badan valid) | Aplikasi | **403**, 0 baris tersimpan (`dalamLingkup`, lib/proker/service.ts)            |
| Kontrol: badan yang sama untuk departemennya sendiri                       | Aplikasi | 201                                                                           |
| `INSERT proker` departemen lain sebagai Kadept                             | RLS      | **ditolak** — `new row violates row-level security policy for table "proker"` |
| Kadept/BPH/Anggota lain (015c skenario 3, 10)                              | RLS      | ditolak — `npm run db:test -- 015c_rls_negatif` lulus                         |

### 1.2 Akses lintas divisi (INV-30)

| Serangan                                                                       | Lapis    | Hasil                                             |
| ------------------------------------------------------------------------------ | -------- | ------------------------------------------------- |
| Koordinator Konsumsi mengubah item RAB divisi PDD (`PATCH /api/rab/item/{id}`) | Aplikasi | **403**, item tidak berubah                       |
| Kontrol: item RAB divisinya sendiri                                            | Aplikasi | 200                                               |
| `UPDATE rab_item` divisi lain sebagai koordinator Konsumsi                     | RLS      | **0 baris** terkena                               |
| Kontrol: `UPDATE` item divisinya sendiri                                       | RLS      | 1 baris                                           |
| Tulis Gantt divisi lain, tombol tulis di DOM                                   | Aplikasi | 403 / tidak dirender — `e2e/cross-divisi.spec.ts` |
| Skenario 11–14 (migrasi 039/040)                                               | RLS      | ditolak — 015c                                    |

### 1.3 Upload berbahaya (`POST /api/images/upload`)

| Serangan                                                           | Lapis    | Hasil                                                                                                                                                                                            |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PDF menyamar sebagai JPG (`Content-Type: image/jpeg`, `struk.jpg`) | Aplikasi | **422 FILE_TIDAK_VALID** — magic bytes (`file-type`), Content-Type klien diabaikan                                                                                                               |
| Berkas 100 MB                                                      | Aplikasi | **413** dari `Content-Length` **sebelum** badan dibaca (batas 15 MB, ADR-014)                                                                                                                    |
| SVG berisi `<script>` (sebagai SVG maupun menyamar `.jpg`)         | Aplikasi | **422** — hanya JPEG/PNG/WebP, lalu di-decode sharp                                                                                                                                              |
| Nama berkas `../../../etc/passwd.jpg`                              | Aplikasi | diterima sebagai gambar sah, key storage **`nota/master/{uuid}.jpg`** (nama klien tak pernah jadi path), nama asli dinetralkan menjadi `passwd.jpg`; `keys.ts` menolak segmen ber-`/`, `\`, `..` |
| Menyisipkan baris `image` atas nama pengguna lain                  | RLS      | **ditolak** — policy `image_insert` (`uploader_id = auth.uid()`)                                                                                                                                 |
| Storage langsung                                                   | Storage  | bucket privat tanpa akses anonim; key hanya lahir dari `lib/storage/keys.ts`                                                                                                                     |

### 1.4 Header & CSRF

| Pemeriksaan                                                                                                    | Hasil                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` | ada                                                                                 |
| `Permissions-Policy: camera=(self), microphone=(), geolocation=()`                                             | ada                                                                                 |
| `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`                                      | ada                                                                                 |
| `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`      | ada (lihat M-02)                                                                    |
| `POST /api/*` dengan `Origin` situs lain                                                                       | **403 ORIGIN_DITOLAK** (middleware)                                                 |
| Server Actions (`app/(dashboard)/profil`)                                                                      | Origin = Host ditegakkan Next.js                                                    |
| Cookie sesi                                                                                                    | `SameSite=Lax` eksplisit, `Secure` di produksi (middleware + `lib/auth/session.ts`) |

### 1.5 Berkas privat (PRD §8.4 S4, ADR-011)

| Pemeriksaan                                                                      | Hasil                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| master / preview / thumbnail nota lewat URL publik (bucket publik maupun privat) | **400** — tidak terbuka                                                        |
| Signed URL thumbnail                                                             | terbuka, umur **300 detik** (klaim `exp − iat`)                                |
| Unduh master tanpa sesi                                                          | **401**                                                                        |
| Seluruh pemanggilan signed URL                                                   | `DETIK_SIGNED_URL` (5 menit); `MAKS_DETIK_SIGNED_URL` 1 jam ditegakkan adapter |
| Berkas privat lain (dokumen, TTD, lampiran kendala/notulensi, backup)            | hanya lewat route ber-guard yang membaca `storage.get()` di server             |

---

## 2. Rate limiting (SYSTEM_DESIGN §18.3)

| Endpoint                                                | Batas                   | Penegak                          | Penghitung                                          |
| ------------------------------------------------------- | ----------------------- | -------------------------------- | --------------------------------------------------- |
| `/api/auth/login`                                       | 5 / 15 mnt per email+IP | `lib/auth/rate-limit.ts` (T-045) | `audit_log` kegagalan setelah login sukses terakhir |
| `/api/images/upload`                                    | 30 / jam per user       | route upload (T-098)             | baris `image` milik pengunggah                      |
| `/api/surat/{id}/approve`, `/api/surat/batch` (setujui) | 100 / jam per user      | `cekBatas` (T-113)               | `rate_limit` (migrasi 050)                          |
| `/api/backup` (manual)                                  | 3 / hari WIB            | `mulaiBackup` (T-111)            | baris `backup` MANUAL hari ini                      |
| Umum                                                    | 300 / mnt per IP        | middleware `cekBatas` (T-113)    | `rate_limit` lewat PostgREST                        |

Semua respons 429 berbentuk K-02 dengan `Retry-After`. `rate_limit_cek` adalah
satu pernyataan atomik (`INSERT … ON CONFLICT DO UPDATE … RETURNING`); hanya
service role yang boleh memanggilnya (anon → 401 `permission denied`, diuji).
Jendela lama dibersihkan cron harian.

---

## 3. Sanitasi konten kaya (kedua sisi)

`lib/security/sanitize.ts` adalah pintu tunggal: `sanitasiKonten` (allowlist
node/mark/atribut ProseMirror; tautan hanya `http(s)`/`mailto`) dan
`sanitasiIsiHtml` (allowlist tag HTML isi surat).

| Fitur     | Simpan                                | Baca/render                                  |
| --------- | ------------------------------------- | -------------------------------------------- |
| Notulensi | `buatNotulensi` / `perbaruiNotulensi` | `detailNotulensi` (**ditambahkan T-113**)    |
| Job desk  | `simpanJobDesk`                       | `muatJobDesk`                                |
| TOR       | `simpanTor`                           | `muatTor` (`sanitasiData`)                   |
| Proposal  | `simpanProposal`                      | `muatProposal` (`sanitasiData`)              |
| Surat     | `lib/surat/draft.ts`                  | `render-preview.ts`, `data-mapper.ts` (DOCX) |

Satu-satunya `dangerouslySetInnerHTML` berisi data pengguna
(`components/surat/SuratPreview.tsx`) hanya menerima keluaran
`render-preview.ts`. Yang lain (`app/layout.tsx`) adalah skrip tema statis.

---

## 4. Temuan

| ID       | Temuan                                                                                                                                                                                                                                 | Tingkat | Status                                                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-01** | Preview & thumbnail nota berada di bucket **publik** (`keys.ts` PREFIX_PUBLIK memuat `nota/preview/`, `nota/thumb/`) — bertentangan dengan ADR-011 dan PRD §8.4 S4; siapa pun yang memegang URL dapat membaca nota keuangan tanpa sesi | Tinggi  | **Diperbaiki**: prefix dikeluarkan dari daftar publik; tampilan memakai signed URL 5 menit secara batch (`urlBertanda`, `urlGambarNotaBanyak`); 64 berkas lama dipindah ke bucket privat dan salinan publiknya dihapus (`scripts/pindah-turunan-nota.ts`, diverifikasi SHA-256); uji adapter diperbarui |
| **S-02** | Tidak ada pembatasan persetujuan surat per user dan tidak ada batas umum per IP                                                                                                                                                        | Sedang  | **Diperbaiki**: migrasi 050 + `lib/security/rate-limit.ts`                                                                                                                                                                                                                                              |
| **S-03** | Tidak ada verifikasi `Origin` untuk mutasi `/api/*` (hanya SameSite)                                                                                                                                                                   | Sedang  | **Diperbaiki**: middleware menolak Origin asing (403)                                                                                                                                                                                                                                                   |
| **S-04** | Konten notulensi tidak disaring ulang saat dibaca                                                                                                                                                                                      | Rendah  | **Diperbaiki**: `detailNotulensi`                                                                                                                                                                                                                                                                       |
| **S-05** | Tidak ada header CSP                                                                                                                                                                                                                   | Rendah  | **Diperbaiki sebagian** → M-02                                                                                                                                                                                                                                                                          |
| **S-06** | Berkas uji lama `nota/master/uji-t044-*` tersimpan di bucket publik (sisa uji adapter T-044; isinya teks uji, bukan nota)                                                                                                              | Info    | **Dimitigasi**: tidak terjangkau aplikasi (bucket diturunkan dari key); pemilik dapat menghapusnya manual                                                                                                                                                                                               |

### Mitigasi eksplisit

- **M-01 — Fail-open penghitung rate limit.** Bila PostgREST tak terjangkau
  (3 detik), permintaan dibiarkan lewat dan dicatat `console.warn`. Alasan:
  pembatas yang tidak terjangkau tidak boleh mematikan seluruh aplikasi.
  Login, upload, dan backup tidak terdampak (dihitung dari tabel domainnya).
- **M-02 — CSP tanpa `script-src`.** Next.js menyisipkan skrip inline
  (hidrasi + skrip tema); membatasinya menuntut nonce per permintaan dan
  rendering dinamis penuh. XSS ditahan sanitasi allowlist di kedua sisi (§3)
  dan escaping React. CSP menutup pembingkaian, plugin, `<base>`, dan
  `form-action` lintas situs.
- **M-03 — Batas umum hanya di produksi.** Server dev tidak menghadap
  internet, dan gate e2e paralel dari localhost wajar melampaui 300/menit.
  Fungsi penghitungnya sama dan diuji langsung (RPC: 3 permintaan dengan
  batas 2 → `ok:false` pada yang ketiga).
- **M-04 — Permintaan tanpa header `Origin`** (skrip, cron, klien non-browser)
  tidak ditolak pemeriksaan CSRF: CSRF hanya dapat dilancarkan browser, yang
  selalu mengirim `Origin` untuk POST lintas situs. Sesi tetap diperiksa.
- **M-05 — HSTS di lokal.** Header dikirim juga oleh `next dev`; browser
  mengabaikan HSTS pada HTTP biasa, jadi tidak mengganggu pengembangan.
