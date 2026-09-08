# Kontrak Undangan & Manajemen Pengguna — T-047

Batas antara lane `data` dan lane `ui` untuk T-047. Lane data memiliki seluruh
keputusan undangan; lane ui menerjemahkannya menjadi halaman dan endpoint.

Mengikuti pola `AUTH_CONTRACT.md` (T-045) dan `PROKER_CONTRACT.md` (T-065).

| | |
|---|---|
| **Ditulis oleh** | lane `data` (pemilik `lib/auth/**`) |
| **Dibaca oleh** | lane `ui` — task turunan **`T-047-UI`** |
| **Gate** | `npm run test:e2e -- undangan` (milik lane data, sudah ada) |
| **Sumber** | PRD F-1.2 · USER_FLOW §2.1, §2.2 · SYSTEM_DESIGN §16.2 |

---

## 1. Pembagian berkas

```
lane data — sudah selesai, jangan disentuh lane ui
  lib/auth/invitation.ts     seluruh keputusan undangan & manajemen pengguna
  e2e/undangan.spec.ts       gate, sudah ada dan melewati dirinya sampai ui siap
  e2e/fixtures/akun.ts       akun uji, termasuk e2e-admin@uji.test

lane ui — T-047-UI, belum ada
  app/(dashboard)/admin/pengguna/page.tsx
  app/(auth)/undangan/[token]/page.tsx
  app/api/users/route.ts               GET  daftar
  app/api/users/invite/route.ts        POST undang
  app/api/users/[id]/route.ts          PATCH ubah
  app/api/auth/activate/route.ts       POST aktivasi
```

**Akun uji baru:** `e2e-admin@uji.test` berperan **ADMIN**, password sama dengan
akun uji lainnya. Ia satu-satunya yang berhak mengundang — matriks PRD §5.1
memberi `user: CRUD` hanya kepada ADMIN, dan `e2e-aktif` berperan KETUA yang
hanya `R`. Jalankan `npm run seed:e2e-auth` untuk membuatnya.

---

## 2. Yang dipanggil route handler

```ts
import {
  undang, aktivasi, periksaUndangan, daftarPengguna, ubahPengguna,
  SkemaUndang, SkemaAktivasi, SkemaUbahPengguna,
} from '@/lib/auth/invitation';
```

### Mutasi — `tx` WAJIB

```ts
undang(tx: TxKlien, konteks: Konteks, input: unknown, asalUrl: string): Promise<Hasil<UndanganTerbuat>>
aktivasi(tx: TxKlien, input: unknown): Promise<Hasil<{ userId: string; email: string }>>
ubahPengguna(tx: TxKlien, konteks: Konteks, userId: string, perubahan: unknown): Promise<Hasil<{ id: string }>>
```

`tx` datang dari `withAuditContext(req, ...)`. Bukan pilihan gaya: konteks audit
dipasang `set_config(..., true)` yang transaction-local, sehingga kueri di
koneksi lain menghasilkan baris audit ber-IP NULL tanpa satu pun error (K-09).

`input` bertipe `unknown` — **validasi dikerjakan service, bukan route.** Jangan
memanggil `SkemaUndang.parse()` lebih dulu; dua tempat memvalidasi dengan aturan
yang sedikit berbeda persis cara celah terbentuk.

### Pembacaan — tidak perlu transaksi

```ts
periksaUndangan(token: string): Promise<Hasil<UndanganDibuka>>
daftarPengguna(periodeId, filter?, klien?): Promise<RingkasPengguna[]>
```

`periksaUndangan` **tidak butuh sesi** — halaman aktivasi memang dibuka orang
yang belum punya akun.

### Contoh route handler

```ts
// app/api/users/invite/route.ts
import { sukses, gagal } from '@/lib/http/respond';
import { STATUS_GAGAL } from '@/lib/auth/invitation';

export async function POST(req: Request) {
  const g = await requirePermission('user.create');
  if (!g.ok) return g.nilai;   // sudah K-02: { ok:false, error:{code,message} }

  const badan = await req.json();
  const asal = new URL(req.url).origin;

  const h = await withAuditContext(req, (tx) => undang(tx, g.konteks, badan, asal));
  return h.ok
    ? sukses(h.nilai, { status: 201 })
    : gagal(h.kode, h.pesan, { details: h.isu, status: STATUS_GAGAL[h.kode] });
}
```

**Bentuk respons WAJIB K-02**, dan satu-satunya cara benar adalah lewat
`sukses`/`gagal` dari `lib/http/respond` — jangan merakit `NextResponse.json`
sendiri. Sukses `{ ok: true, data }`; gagal `{ ok: false, error: { code, message,
details? } }`. `STATUS_GAGAL` diekspor service supaya semantik HTTP-nya tidak
ditebak ulang di route. `requirePermission` sudah mengembalikan bentuk yang sama.

`asalUrl` diminta dari pemanggil, bukan dibaca dari `NEXT_PUBLIC_APP_URL`:
tautan yang salah domain membuat undangan tidak dapat dibuka, dan itu baru
ketahuan setelah dikirim ke orangnya.

---

## 3. Bentuk hasil dan padanan HTTP-nya

```ts
type Hasil<T> = { ok: true; nilai: T } | GagalUndangan;

interface GagalUndangan {
  ok: false;
  kode: KodeGagalUndangan;
  pesan: string;                            // siap tampil, bahasa Indonesia
  isu?: { path: string; pesan: string }[];   // hanya untuk TIDAK_VALID
}
```

| `kode` | HTTP | Yang ditampilkan |
|---|:---:|---|
| `TIDAK_VALID` | **422** | `isu` dipasang ke field form; `pesan` sebagai ringkasan |
| `EMAIL_TERDAFTAR` | **409** | `pesan` |
| `NIM_TERDAFTAR` | **409** | `pesan` |
| `TIDAK_ADA_PERIODE` | **409** | `pesan` — yang harus bertindak Admin |
| `TIDAK_DITEMUKAN` | **404** | `pesan` |
| `TOKEN_TIDAK_DIKENAL` | **404** | halaman "Tautan tidak dikenali" |
| `TOKEN_KEDALUWARSA` | **410** | halaman "Undangan kedaluwarsa, hubungi Admin" |
| `TOKEN_TERPAKAI` | **409** | halaman "Sudah digunakan, silakan login" |
| `AUTH_YATIM` | **500** | `pesan` — memuat email yang harus dibersihkan tangan |

Di respons HTTP, `kode` menjadi `error.code`, `pesan` menjadi `error.message`,
dan `isu` menjadi `error.details` (K-02). Pemetaan itu dikerjakan `gagal()`; route
tidak menyentuhnya.

`error.details[].path` memakai titik (`roles.0.departemen_id`) dan cocok langsung
dengan `setError` react-hook-form.

**`pesan` sudah siap tampil.** Jangan menyusun kalimat sendiri dari `kode` — dua
kalimat untuk keadaan yang sama akan berbeda suatu hari.

---

## 4. Tautan undangan HANYA ADA SEKALI

`undang()` mengembalikan `tautan` lengkap. Yang tersimpan di database hanya
SHA-256-nya.

**Tautan yang hilang tidak dapat ditampilkan ulang.** Itu disengaja dan tidak
boleh "diperbaiki": menyimpan token mentah supaya bisa ditampilkan lagi berarti
siapa pun yang membaca isi database dapat menebus setiap undangan yang belum
dipakai — dan undangan adalah jalan masuk ke akun ber-role.

Konsekuensi untuk lane ui:

1. Halaman **wajib** menampilkan tautannya sekali dengan jelas, dengan tombol
   salin. Menyembunyikannya di balik toast yang hilang sendiri berarti Admin
   kehilangan satu-satunya salinan.
2. Bila Admin kehilangan tautannya, satu-satunya jalan adalah **mengundang
   ulang**. Jangan membuat endpoint "tampilkan tautan lagi".
3. Email TIDAK dikirim. MVP belum punya layanan email (PRD §6.2), dan klausa
   **Jangan** T-047 melarangnya.

---

## 5. Keadaan pengguna — empat, bukan dua

`daftarPengguna()` mengembalikan `keadaan` yang **diturunkan**, bukan disimpan:

| `keadaan` | Artinya | Tindakan Admin |
|---|---|---|
| `AKTIF` | sudah mengaktifkan akun | — |
| `MENUNGGU_AKTIVASI` | diundang, undangan masih berlaku | tunggu, atau salin ulang? **tidak bisa** — undang ulang |
| `UNDANGAN_KEDALUWARSA` | diundang, lewat 7 hari | undang ulang |
| `NONAKTIF` | sengaja dinonaktifkan Admin | aktifkan kembali |

Tabel `app_user` hanya punya `is_active`. Tiga keadaan terakhir semuanya
`is_active = false` — tanpa turunan ini halaman Admin tidak dapat membedakan
pengguna yang **belum pernah** mengaktifkan akunnya dari yang **sengaja**
dinonaktifkan, padahal tindakan yang tepat untuk keduanya berbeda.

`daftarPengguna` hanya mengembalikan pengguna yang punya peran pada periode
aktif. Itu memang maksudnya — halamannya mendaftar pengurus periode berjalan.

---

## 6. Menonaktifkan bukan menghapus

```ts
await ubahPengguna(tx, konteks, id, { is_active: false });
```

Hanya kolom itu yang berubah. Tidak ada baris lain yang disentuh, dan itulah
maksudnya (PRD F-1.2 AC 4): proker, surat, dan nota yang pernah dibuatnya tetap
punya pemilik agar jejak audit utuh. **Jangan** membuat endpoint DELETE untuk
pengguna — ia akan memutus seluruh foreign key itu.

### `roles` mengganti, bukan menambah

Mengirim `roles` akan **menghapus seluruh peran pengguna pada periode aktif**
lalu menulis ulang daftar yang dikirim. Form Admin memang mengirim daftar utuh,
dan dua jalur penulisan untuk hal yang sama pasti berbeda perilakunya suatu
hari.

Daftar kosong ditolak skema. Tanpa penolakan itu, pengguna kehilangan seluruh
perannya, lenyap dari `daftarPengguna()`, dan tidak ada lagi cara memulihkannya
lewat antarmuka.

### `null` dan `undefined` berbeda

Untuk `angkatan` dan `no_hp`:

- medan **tidak dikirim** → nilai lama dipertahankan
- medan dikirim **`null`** → dikosongkan

Bedanya nyata: form yang mengirim seluruh medan apa adanya akan mengosongkan
angkatan setiap kali Admin hanya mengganti nama. Kirim hanya yang berubah.

---

## 7. Halaman aktivasi — tiga kegagalan, tiga tampilan

USER_FLOW §2.2 menuntut tiga halaman berbeda, dan tindakan penggunanya memang
berbeda:

```ts
const h = await periksaUndangan(params.token);
if (!h.ok) {
  // h.kode: TOKEN_TIDAK_DIKENAL | TOKEN_KEDALUWARSA | TOKEN_TERPAKAI
  // Tampilkan h.pesan di [data-testid="aktivasi-pesan"]
} else {
  // h.nilai: { email, namaLengkap, roles }
  // Tampilkan [data-testid="aktivasi-form"]
}
```

**Halaman ini dapat dibuka TANPA sesi — sudah disiapkan lane data.** Penerima
undangan belum punya akun; bila middleware mengalihkannya ke `/login`, ia diminta
masuk memakai akun yang justru sedang ia buat.

`/undangan` dan `/api/auth/activate` sudah masuk `RUTE_PUBLIK` di
`middleware.ts`. Lane ui **tidak perlu dan tidak boleh** menyuntingnya.

Password wajib memenuhi PRD F-1.1: minimal 8 karakter, mengandung huruf dan
angka. Skemanya `kataSandi`, diekspor dan dipakai bersama form (K-04).

---

## 8. `data-testid` untuk halaman admin

Gate `undangan.spec.ts` **tidak** memakai nama-nama di bawah — ia menguji
halaman admin lewat API, bukan lewat DOM. Daftar ini panduan tampilan, bukan
kontrak yang dijaga test:

```
pengguna-tabel               tabel daftar pengguna
pengguna-baris-<userId>      satu baris
pengguna-keadaan             sel keadaan (lihat §5)
undang-buka                  tombol membuka form
undang-form                  form undangan
undang-tautan                kotak berisi tautan hasil — lihat §4 butir 1
undang-salin                 tombol salin tautan
```

Yang **dijaga** gate hanya dua, keduanya di halaman aktivasi: `aktivasi-form`
dan `aktivasi-pesan`.

---

## 9. Verifikasi yang sudah dijalankan

```
npm run test -- invitation          47 lulus
npm run test:e2e -- undangan        13 dilewati (route T-047-UI belum ada)
npm run verify                      383 lulus
```

Ditambah pembuktian terhadap Supabase dan database sungguhan — undangan dibuat,
diaktifkan, lalu dibersihkan kembali:

```
undang         -> userId, kedaluwarsa 7 hari
duplikat email -> EMAIL_TERDAFTAR
periksa        -> { email, namaLengkap, roles: ['KADEPT','SEKUM'] }
keadaan        -> MENUNGGU_AKTIVASI -> AKTIF -> NONAKTIF
aktivasi ke-2  -> TOKEN_TERPAKAI          (sekali pakai benar-benar bekerja)
ubah nama      -> angkatan 2022 tetap utuh
```

---

## 10. Import massal — T-048

Separuh data T-048 adalah `lib/import/parse-tabel.ts`. Ia **generik sejak awal**
(kontrak butir 5): T-092 data peserta dan T-107 data pengurus akan memakainya
dengan kolom dan aturan berbeda, jadi modul itu tidak tahu apa pun tentang NIM
maupun pengguna.

| | |
|---|---|
| **Task turunan ui** | `T-048-UI` |
| **Verifikasi lane data** | `npm run test -- import` — 42 lulus |
| **Berkas ui** | `app/api/users/bulk-import/route.ts` · `components/shared/ImportPreview.tsx` |

### Alur yang harus dibangun lane ui

```ts
import {
  bacaTabel, parseTabel, barisUntukDisimpan, laporanCsv,
  type DefinisiKolom,
} from '@/lib/import/parse-tabel';

const KOLOM: DefinisiKolom[] = [
  { kunci: 'nama_lengkap', label: 'Nama Lengkap', alias: ['Nama'], wajib: true },
  { kunci: 'nim',          label: 'NIM',                            wajib: true },
  { kunci: 'email',        label: 'Email', alias: ['Alamat Email'], wajib: true },
  { kunci: 'angkatan',     label: 'Angkatan' },
];

// 1. Unggah -> pratinjau. TIDAK menyimpan apa pun.
const matriks = await bacaTabel(berkas.name, buffer);
const hasil = parseTabel(matriks, KOLOM, SKEMA_BARIS, {
  kunciUnik: 'nim',
  sudahAda: (nim) => nimTerdaftar.has(nim),   // disuntik dari database
});

// 2. Pengguna menekan konfirmasi, mengirim nomor baris yang dilewati.
const disimpan = barisUntukDisimpan(hasil, lewati);
```

### Empat hal yang mudah salah

**1. `parseTabel` TIDAK menyimpan apa pun, dan tidak bisa.** Modul itu tidak
punya akses database sama sekali — bentuknya sendiri yang memenuhi klausa
**Jangan** T-048, bukan disiplin pemanggil. Penyimpanan seluruhnya urusan route
handler, dan hanya setelah pengguna menekan konfirmasi.

**2. Duplikat adalah PERINGATAN, bukan ERROR.** USER_FLOW §9.1 menetapkannya,
dan alasannya: NIM yang sama bisa berarti ekspor ganda, bisa juga dua orang
berbeda yang salah satunya salah ketik. Sistem tidak dapat membedakannya, jadi
ia tidak boleh memutuskan. Baris PERINGATAN **ikut tersimpan** kecuali pengguna
mencentangnya untuk dilewati.

**3. Duplikat terhadap database masuk lewat `sudahAda`.** Modul ini tidak
mengenal database; route handler yang mengambil daftar NIM yang sudah ada lalu
menyuntikkan predikatnya. Tanpa itu, pratinjau hanya melihat duplikat DI DALAM
berkas, dan bentrokan baru muncul saat penyimpanan.

**4. `nomor` menunjuk baris di BERKAS, bukan indeks array.** Baris data pertama
bernomor 2 karena baris 1 adalah header. Angka yang meleset membuat pengguna
memperbaiki baris yang salah di Excel.

### Bentuk hasil

```ts
interface HasilParse<T> {
  peta: Record<string, number>;   // kunci kolom -> indeks; -1 = tidak ditemukan
  takDikenal: string[];           // judul kolom yang tak dikenali -> layar pemetaan
  hilang: string[];               // kolom wajib yang belum dipetakan
  baris: BarisHasil<T>[];
  ringkas: { total; valid; peringatan; error };
}

interface BarisHasil<T> {
  nomor: number;                  // nomor baris di berkas, 1-based
  data: T | null;                 // null bila status ERROR
  masalah: { tingkat: 'ERROR' | 'PERINGATAN'; kolom?: string; pesan: string }[];
  status: 'VALID' | 'PERINGATAN' | 'ERROR';
}
```

`takDikenal` dan `hilang` bersama-sama mengisi layar pemetaan kolom (USER_FLOW
§9.1). Bila pengguna memetakan sendiri, kirim ulang lewat `opsi.petaManual` —
ia menimpa deteksi otomatis.

`laporanCsv(hasil)` menghasilkan berkas unduhan untuk kontrak butir 4. Ia memuat
baris ERROR **dan** PERINGATAN sekaligus: memisahkannya membuat orang memperbaiki
separuh lalu mengunggah ulang.

### Yang sudah diurus dan tidak perlu diulang

Bentuk berkas nyata yang gagal **diam** bila tidak ditangani, seluruhnya sudah
ada testnya:

- pemisah `;` dari Excel berbahasa Indonesia (dibaca dengan koma → satu kolom)
- BOM UTF-8 (kolom pertama tak pernah cocok)
- CRLF, koma dan baris baru di dalam medan berkutip
- baris kosong berekor (Excel menyisakan puluhan)
- NIM yang menjadi **angka** di XLSX, rich text, dan sel berformula
- hanya sheet PERTAMA yang dibaca — sheet dropdown tidak ikut
