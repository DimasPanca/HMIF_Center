# ADR-024 — Aktivasi periode dijaga carry-forward ADMIN; bootstrap lewat seed

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-08 |
| **Disetujui** | pemilik proyek, 2026-09-08 |
| **Ditemukan oleh** | T-050-DATA, saat mengimplementasikan ADR-050 §3 dan §4 |
| **Lane** | `data` |
| **Task terkait** | T-050, T-047 |
| **Menyempurnakan** | ADR-050 (butir 3 dan 4) — tidak menggantikannya |

## Konteks

ADR-050 (DITERIMA) menuntut dua hal untuk pengelolaan periode:

> §3 — aktivasi hanya menerima periode PERSIAPAN … dan menolak target yang belum
> memiliki sedikitnya satu role `ADMIN`.
> §4 — kontrak menetapkan jalur bootstrap terautentikasi untuk periode pertama.

Sekilas keduanya bertentangan, dan pada iterasi pertama T-050-DATA saya menolak
§3 karena tampak membuntu. Alasannya: peran disimpan **per periode**
(`user_role.periode_id`), dan undangan (T-047) menuliskan peran ke periode yang
sedang **AKTIF**. Maka periode `PERSIAPAN` baru tidak punya satu baris peran pun,
sehingga §3 membuat **tidak ada periode baru yang pernah bisa diaktifkan** —
deadlock — dan Admin yang mengaktifkannya pun akan kehilangan seluruh perannya di
periode baru (lockout).

Penolakan itu keliru. Pemilik produk menegaskan ADR-050 diterima **penuh**, dan
setelah diperiksa ulang, §3 dan §4 **dapat dipenuhi bersamaan tanpa mengubah
skema.** Yang hilang bukan konsistensi, melainkan satu mekanisme yang ADR-050
sendiri tidak sebutkan: bagaimana ADMIN masuk ke periode PERSIAPAN.

## Keputusan

Dua mekanisme, keduanya di lane `data`, tanpa migrasi:

### 1. Carry-forward ADMIN (memenuhi ADR-050 §3)

`buatPeriode` **menyalin** setiap baris peran `ADMIN` dari periode AKTIF ke
periode PERSIAPAN yang baru, dalam transaksi yang sama:

```sql
INSERT INTO user_role (user_id, periode_id, role, departemen_id)
SELECT ur.user_id, <periode_baru>, 'ADMIN', ur.departemen_id
FROM user_role ur JOIN periode p ON p.id = ur.periode_id AND p.status = 'AKTIF'
WHERE ur.role = 'ADMIN'
ON CONFLICT DO NOTHING
```

Selalu ada sumber untuk disalin: `buatPeriode` hanya dapat dipanggil ketika ADA
periode aktif, karena guard `requirePermission('periode.create')` menolak dengan
`TIDAK_ADA_PERIODE` bila tidak ada periode aktif. Maka setiap periode baru sudah
punya ADMIN **sebelum** diaktifkan.

`aktifkanPeriode` menegakkan §3 apa adanya: bila target tidak punya ADMIN, tolak
`TANPA_ADMIN` (409). Penjaga ini bukan lagi deadlock melainkan jaring untuk kasus
tepi — mis. periode yang seluruh ADMIN-nya sengaja dihapus setelah dibuat.

Konsekuensi yang diinginkan: **Admin yang mengaktifkan periode baru tetap
ber-ADMIN sesudahnya.** Lockout tertutup.

### 2. Bootstrap lewat seed (memenuhi ADR-050 §4)

Periode **pertama** beserta ADMIN pertamanya dibuat `prisma/seed.ts`, dijalankan
pemegang kredensial penuh (`SUPABASE_SECRET_KEY` + `DATABASE_URL`). Itulah jalur
bootstrap terautentikasi untuk periode pertama.

Tidak ada — dan tidak boleh ada — jalur bootstrap **anonim in-app**. Tanpa periode
aktif, `konteksSaatIni()` mengembalikan `roles: []` untuk siapa pun (peran
per-periode), jadi tidak seorang pun dapat diautentikasi ber-peran. Autentikasi
periode pertama karena itu HARUS berada di luar sistem peran: pemegang kredensial
yang menjalankan seed. Ini sejalan dengan migrasi 002 yang menyebut ADMIN
"bersifat teknis dan berada di luar struktur organisasi".

## Konsekuensi

- ADR-050 §3 dan §4 keduanya terpenuhi, **tanpa** perubahan skema, RLS, atau
  `aktifkan_periode`. Seluruh perubahan di `lib/periode/service.ts`.
- Carry-forward menyalin **hanya** ADMIN. Peran lain (KETUA, KADEPT, dst.)
  ditetapkan ke periode setelah aktif, lewat undangan/`ubahPengguna` seperti biasa
  — menyalin seluruh struktur organisasi lama ke periode baru adalah keputusan
  produk yang tidak diambil di sini.
- Terbukti terhadap database sungguhan (transaksi di-ROLLBACK): periode baru
  menerima 1 ADMIN hasil salin, aktivasi ber-ADMIN lolos, aktivasi periode
  tanpa-ADMIN ditolak `TANPA_ADMIN`, fixture aktif utuh.

## Batas dan alternatif yang ditolak

**Menjadikan ADMIN lintas-periode** (kolom `periode_id` nullable, atau tabel admin
terpisah) juga menyelesaikan lockout dan memungkinkan bootstrap in-app. Ditolak
untuk gelombang ini: ia menyentuh resolusi peran di `konteksSaatIni()` DAN 188
policy RLS yang seluruhnya mengasumsikan peran per-periode — perubahan besar dan
berisiko, di luar cakupan T-050. Carry-forward mencapai hasil yang sama untuk
kebutuhan sekarang dengan permukaan jauh lebih kecil. Bila kelak bootstrap in-app
benar-benar dibutuhkan, opsi lintas-periode dibuka lewat ADR tersendiri.

**Menyalin seluruh peran, bukan hanya ADMIN.** Ditolak: itu diam-diam membawa
struktur kepengurusan lama ke periode baru, padahal pergantian periode justru
saat menyusun ulang kepengurusan. Hanya ADMIN yang wajib demi mencegah lockout.
