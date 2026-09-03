# Kontrak Autentikasi — T-045

Batas antara lane `data` dan lane `ui` untuk T-045. Lane data memiliki seluruh
keputusan login; lane ui menerjemahkan hasilnya menjadi respons HTTP dan
tampilan.

| | |
|---|---|
| **Ditulis oleh** | lane `data` (pemilik `lib/auth/**`, `middleware.ts`) |
| **Dibaca oleh** | lane `ui` (pemilik `app/(auth)/**`, `app/api/auth/**`) |
| **Sumber** | PRD F-1.1 · USER_FLOW §2.3 · SYSTEM_DESIGN §18.3 |

---

## 1. Pembagian berkas

```
lane data — sudah selesai, jangan disentuh lane ui
  lib/auth/session.ts        seluruh alur login
  lib/auth/rate-limit.ts     pembatas 5 per 15 menit
  middleware.ts              penjaga rute + perpanjangan sesi

lane ui — belum ada
  app/(auth)/login/page.tsx
  app/api/auth/login/route.ts
  app/api/auth/logout/route.ts
```

Tidak ada berkas yang beririsan. `guard` akan menolak bila salah satu lane
menyentuh milik yang lain.

---

## 2. Yang dipanggil route handler

```ts
import { login, logout, sesiSaatIni } from '@/lib/auth/session';
```

### `login(p: ParamLogin): Promise<HasilLogin>`

```ts
interface ParamLogin {
  email: string;
  password: string;
  ip: string | null;          // x-forwarded-for elemen PERTAMA, atau x-real-ip
  userAgent: string | null;
  next?: string | null;       // isi ?next=, boleh diteruskan mentah
}
```

`next` **tidak perlu divalidasi** di route. `login()` sudah membersihkannya —
URL absolut, `//jahat.example`, dan `javascript:` seluruhnya dibuang menjadi
`/`. Memvalidasinya dua kali dengan aturan berbeda justru membuka celah.

```ts
type HasilLogin =
  | { ok: true;  userId: string; namaLengkap: string; redirect: string }
  | { ok: false; kode: KodeGagalLogin; pesan: string; sisaDetik?: number };
```

**`pesan` sudah siap tampil** dalam bahasa Indonesia. Jangan menyusun kalimat
sendiri dari `kode` — lihat §4.

### `logout(): Promise<void>`

Mengakhiri sesi dan menghapus cookie. Tidak melempar.

### `sesiSaatIni(): Promise<Sesi | null>`

```ts
interface Sesi { userId: string; email: string; namaLengkap: string; isActive: boolean }
```

Untuk Server Component yang perlu tahu siapa yang sedang masuk. Memverifikasi
token ke server Supabase, bukan sekadar membaca cookie.

---

## 3. Kode kegagalan dan padanan HTTP-nya

| `kode` | HTTP | Arti | Yang ditampilkan |
|---|:---:|---|---|
| `INPUT_TIDAK_VALID` | 400 | Email atau password kosong | `pesan` |
| `KREDENSIAL_SALAH` | 401 | Email tidak terdaftar **atau** password salah | `pesan` |
| `TERLALU_BANYAK_PERCOBAAN` | 429 | Terkunci; `sisaDetik` terisi | `pesan` |
| `AKUN_NONAKTIF` | 403 | Password benar, `is_active = false` | `pesan` |
| `TIDAK_ADA_PERIODE` | 409 | Tidak ada periode berstatus `AKTIF` | `pesan` |

Pada `TERLALU_BANYAK_PERCOBAAN`, sertakan juga header `Retry-After: <sisaDetik>`
agar peramban dan alat pemantau memperlakukannya dengan benar.

---

## 4. Tiga hal yang akan merusak keamanan bila diubah di sisi UI

**Jangan membedakan "email tidak terdaftar" dari "password salah".**
Keduanya mengembalikan `KREDENSIAL_SALAH` dengan kalimat yang sama persis.
Membedakannya adalah cara termurah bagi siapa pun untuk menyusun daftar
seluruh pengurus HMIF: coba satu email, lihat pesannya. Ini ditetapkan
PRD F-1.1, bukan preferensi.

**Jangan menyusun ulang kalimat dari `kode`.** Pakai `pesan` apa adanya.
Kalimatnya sudah disusun agar tidak membocorkan apa pun, dan kalimat buatan
sendiri mudah menjadi lebih informatif daripada yang aman.

**Jangan memeriksa `is_active`, role, atau periode aktif di sisi UI.**
Ketiganya sudah diperiksa `login()` dengan urutan yang disengaja: `is_active`
diperiksa **setelah** password benar, supaya pesan "akun dinonaktifkan" hanya
sampai kepada orang yang memang tahu passwordnya. Memeriksanya lebih awal di
UI mengembalikan kebocoran yang justru dihindari urutan itu.

---

## 5. Contoh route handler

Bentuknya boleh berbeda; yang tidak boleh berbeda adalah pemetaan kode ke
status dan pemakaian `pesan` apa adanya.

```ts
// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { login, type KodeGagalLogin } from '@/lib/auth/session';

const STATUS: Record<KodeGagalLogin, number> = {
  INPUT_TIDAK_VALID: 400,
  KREDENSIAL_SALAH: 401,
  TERLALU_BANYAK_PERCOBAAN: 429,
  AKUN_NONAKTIF: 403,
  TIDAK_ADA_PERIODE: 409,
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // Elemen PERTAMA, bukan terakhir: yang pertama adalah klien aslinya,
  // sisanya alamat proxy.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    null;

  const hasil = await login({
    email: String(body.email ?? ''),
    password: String(body.password ?? ''),
    ip,
    userAgent: req.headers.get('user-agent'),
    next: typeof body.next === 'string' ? body.next : null,
  });

  if (!hasil.ok) {
    const res = NextResponse.json(
      { kode: hasil.kode, pesan: hasil.pesan },
      { status: STATUS[hasil.kode] },
    );
    if (hasil.sisaDetik) res.headers.set('Retry-After', String(hasil.sisaDetik));
    return res;
  }

  return NextResponse.json({ ok: true, redirect: hasil.redirect });
}
```

```ts
// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { logout } from '@/lib/auth/session';

export async function POST() {
  await logout();
  return NextResponse.json({ ok: true });
}
```

Cookie sesi ditulis `login()` lewat `cookies()` dari `next/headers`; route
tidak perlu menyentuh cookie sama sekali.

---

## 6. Middleware — apa yang sudah dijaga, apa yang belum

`middleware.ts` sudah ada dan **tidak perlu disentuh lane ui**.

Yang sudah dikerjakan:

- Seluruh rute dijaga kecuali `/login`, `/api/auth/login`, `/api/auth/logout`.
  Daftar putih, bukan daftar hitam — halaman baru yang lupa didaftarkan akan
  **meminta login**, bukan terbuka.
- Belum masuk → halaman dialihkan ke `/login?next=<tujuan semula>`.
- Belum masuk → permintaan `/api/*` dijawab **401 JSON**, bukan dialihkan.
  Redirect ke HTML membuat `fetch()` menerima 200 berisi markup login, dan
  kode pemanggil mengira permintaannya berhasil.
- Sudah masuk lalu membuka `/login` → dialihkan ke `/`.
- Sesi 7 hari diperpanjang otomatis setiap kali pengguna aktif.

Yang **tidak** dikerjakan middleware, dan alasannya:

Middleware berjalan di **Edge runtime**, yang tidak dapat menjalankan Prisma.
Karena itu ia hanya memeriksa "apakah ada sesi yang sah" — bukan `is_active`,
bukan role, bukan periode aktif. Ketiganya ada di database.

Lapisan berikutnya yang menanganinya:

| Pemeriksaan | Tempatnya |
|---|---|
| `is_active` | `sesiSaatIni()` |
| Role dan izin | lapisan permission (T-046) |
| Baris mana yang boleh dilihat | RLS di database (migrasi 015b) |

Pembagian ini disengaja. Middleware yang menyaring sebagian besar permintaan
tak berwenang dengan murah, lalu RLS yang menjamin sisanya tidak pernah
melihat baris milik orang lain, lebih kuat daripada satu lapisan yang mencoba
melakukan keduanya.

---

## 7. Halaman login

Yang mengikat dari PRD dan DESIGN_SYSTEM:

- **`--gradient-primary` sebagai hero.** Ini satu-satunya tempat gradien
  diizinkan di seluruh aplikasi.
- Tidak ada tautan "daftar" atau "lupa password". Akun **hanya** dibuat Admin
  (PRD F-1.1); tautan pendaftaran akan menjanjikan sesuatu yang tidak ada.
- Tidak ada tombol OAuth. Di luar cakupan MVP, dinyatakan eksplisit pada
  bagian **Jangan** kontrak T-045.
- Kirim `next` dari query string apa adanya ke API; `login()` yang
  membersihkannya.

---

## 8. Yang menutup T-045

Verifikasinya `npm run test:e2e -- login`, dan itu **butuh kedua bagian ada**.
Tidak satu lane pun dapat menutup T-045 sendirian.

Sisi lane data sudah selesai dan teruji: 20 test, empat di antaranya
membuktikan penjaganya bekerja lewat uji mutasi. Yang belum: halaman login,
kedua route, dan `e2e/login.spec.ts`.

`e2e/**` milik lane data — beri tahu bila halaman dan route sudah siap, dan
spec-nya akan disediakan seperti `e2e/gantt-render.spec.ts` pada T-073.
