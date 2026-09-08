# Kontrak Periode Kepengurusan — T-050

Batas antara lane `data` dan lane `ui` untuk T-050. Lahir dari ADR-050: T-050
semula seluruhnya lane ui, tetapi aktivasi, penghapusan, dan larangan ubah-arsip
adalah aturan data. Codex benar menandainya; T-050 kini dibelah.

Mengikuti pola `AUTH_CONTRACT.md`, `PROKER_CONTRACT.md`, `UNDANGAN_CONTRACT.md`.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-050-DATA` (pemilik `lib/periode/**`) |
| **Dibaca oleh** | lane `ui` — `T-050-UI` |
| **Gate** | `npm run test:e2e -- periode` (milik lane data, sudah ada) |
| **Sumber** | PRD F-2.1 · SYSTEM_DESIGN §7.3 · ADR-003 · ADR-050 |

---

## 1. Pembagian berkas

```
lane data — T-050-DATA, selesai, jangan disentuh lane ui
  lib/periode/service.ts     seluruh keputusan periode
  lib/http/respond.ts        helper K-02 bersama (dipakai SEMUA route)
  e2e/periode.spec.ts        gate, melewati dirinya sampai route ui ada

lane ui — T-050-UI, belum ada
  app/(dashboard)/admin/periode/page.tsx
  app/api/periode/route.ts               GET daftar · POST buat
  app/api/periode/[id]/route.ts          PATCH ubah · DELETE hapus   ← lihat catatan
  app/api/periode/[id]/activate/route.ts POST aktifkan
```

**Catatan cakupan (yang diangkat Codex, ADR-050):** kontrak T-050 di `tasks.json`
hanya menyebut `app/api/periode/{route.ts,[id]/activate/route.ts}`. Route PATCH
dan DELETE menuntut `app/api/periode/[id]/route.ts`, yang tak ada di sana.
Next.js hanya melayani segmen `{id}` lewat berkas itu. Ia resmi menjadi bagian
`T-050-UI` **lewat kontrak ini** — jalur yang sama dengan T-047 yang juga
menambah `[id]/route.ts` lewat kontraknya.

---

## 2. Yang dipanggil route handler

```ts
import {
  daftarPeriode, detailPeriode,
  buatPeriode, ubahPeriode, hapusPeriode, aktifkanPeriode,
  STATUS_GAGAL,
  SkemaBuatPeriode, SkemaUbahPeriode, SkemaAktivasi,
} from '@/lib/periode/service';
import { sukses, gagal } from '@/lib/http/respond';
```

### Pembacaan — tidak perlu transaksi, tidak perlu konteks

```ts
daftarPeriode(klien?): Promise<RingkasPeriode[]>
detailPeriode(id, klien?): Promise<RingkasPeriode | null>
```

PRD F-2.1: periode lama dapat dibaca **semua role**. Otorisasi baca ada di guard
route (`periode.read`, dimiliki semua role), bukan di service.

### Mutasi — `tx` WAJIB

```ts
buatPeriode(tx, input): Promise<Hasil<{ id }>>
ubahPeriode(tx, id, perubahan): Promise<Hasil<{ id }>>
hapusPeriode(tx, id): Promise<Hasil<{ id }>>
aktifkanPeriode(tx, id, konfirmasi): Promise<Hasil<{ periodeLama, nomorPertama }>>
```

`tx` dari `withAuditContext(req, ...)`. Service tidak menerima `konteks`: periode
tidak punya batas baris per-departemen, jadi otorisasinya sepenuhnya di guard
route (`periode.create` dst.) — hanya ADMIN (PRD §5.1). `input` bertipe `unknown`;
validasi dikerjakan service.

### Contoh route handler

```ts
// app/api/periode/route.ts
export async function POST(req: Request) {
  const g = await requirePermission('periode.create');
  if (!g.ok) return g.nilai;

  const badan = await req.json();
  const h = await withAuditContext(req, (tx) => buatPeriode(tx, badan));
  return h.ok
    ? sukses(h.nilai, { status: 201 })
    : gagal(h.kode, h.pesan, { details: h.isu, status: STATUS_GAGAL[h.kode] });
}
```

---

## 3. Bentuk respons — K-02, lewat `lib/http/respond`

Setiap respons `{ ok: true, data }` atau
`{ ok: false, error: { code, message, details? } }`. **Tidak ada bentuk lain**
(K-02). Jangan merakit `NextResponse.json` sendiri — pakai `sukses`/`gagal`.

`gagal(kode, pesan, { details, status })` memetakan `kode → error.code`,
`pesan → error.message`, `details → error.details`. `STATUS_GAGAL` diekspor
service supaya semantik HTTP tidak ditebak ulang di route.

| `kode` | HTTP | Keadaan |
|---|:---:|---|
| `VALIDASI_GAGAL` | 422 | badan tidak lolos skema; `error.details` berisi path→pesan |
| `TIDAK_DITEMUKAN` | 404 | id tidak ada |
| `PERIODE_ARSIP` | 409 | mencoba mengubah periode arsip |
| `PUNYA_SURAT_TERBIT` | 409 | mencoba menghapus periode yang punya surat terbit |
| `BUKAN_PERSIAPAN` | 409 | mengaktifkan periode yang bukan PERSIAPAN |
| `KONFIRMASI_TIDAK_COCOK` | 422 | nama konfirmasi ≠ nama kanonis |
| `TANPA_ADMIN` | 409 | mengaktifkan periode yang belum punya ADMIN |

---

## 4. Bentuk data

```ts
interface RingkasPeriode {
  id: string;
  nama: string;
  status: 'AKTIF' | 'ARSIP' | 'PERSIAPAN';
  tanggal_mulai: string;      // 'YYYY-MM-DD', tidak pernah Date
  tanggal_selesai: string;
  nomor_surat_awal: number;
  ada_surat_terbit: boolean;  // true = tak dapat dihapus
}
```

`ada_surat_terbit` diturunkan di SQL supaya halaman dapat menonaktifkan tombol
Hapus tanpa memanggil endpoint lebih dulu. Tanggal selalu string (K-07) — route
tidak boleh mengubahnya menjadi `Date`.

---

## 5. Aturan yang dipaksakan service (dan tidak boleh diulang route)

| Aturan | Di mana |
|---|---|
| Periode baru selalu `PERSIAPAN`; `status` diabaikan dari badan | `buatPeriode` |
| Menuju AKTIF hanya lewat `aktifkanPeriode` → `aktifkan_periode` DB | kontrak 2 T-050 |
| Periode ARSIP tidak dapat diubah | `ubahPeriode` |
| Periode dengan surat TERBIT tidak dapat dihapus | `hapusPeriode` (klausa Jangan) |
| Aktivasi hanya periode PERSIAPAN | `aktifkanPeriode` |
| Konfirmasi dibanding nama KANONIS server, bukan tebakan klien | `aktifkanPeriode` |
| Aktivasi menolak periode tanpa ADMIN (`TANPA_ADMIN`) | `aktifkanPeriode` (ADR-050 §3) |
| Periode baru menyalin ADMIN dari periode aktif | `buatPeriode` (carry-forward, ADR-024) |

Tiga jaminan **database** T-050 sudah terbukti di test SQL yang di-ROLLBACK dan
TIDAK perlu diulang: `003_core.sql:43` menolak periode AKTIF kedua,
`014b_surat_fn.sql:157` membuktikan `aktifkan_periode` mengarsipkan yang lama,
`:164` membuktikan surat pertama periode baru bernomor 001.

---

## 6. Konfirmasi kritis (PRD F-2.1, kontrak 3)

`aktifkanPeriode(tx, id, konfirmasi)` — `konfirmasi` adalah nama periode yang
diketik ulang. Dibandingkan dengan nama kanonis yang dibaca dari DB **dalam
transaksi yang sama**, di bawah `FOR UPDATE`. Tidak cocok → `KONFIRMASI_TIDAK_COCOK`,
tanpa memanggil `aktifkan_periode`.

UI menampilkan input "ketik nama periode untuk mengonfirmasi" dan mengirim
isinya apa adanya. Jangan membandingkan di klien lalu mengirim boolean —
perbandingan yang menentukan harus di server.

---

## 7. Bootstrap & lockout aktivasi — DISELESAIKAN (ADR-024)

ADR-050 §3 (aktivasi wajib ADMIN di target) dan §4 (jalur bootstrap
terautentikasi untuk periode pertama) keduanya terpenuhi, **tanpa perubahan
skema**. Mekanismenya di ADR-024:

**Carry-forward ADMIN (memenuhi §3).** `buatPeriode` menyalin baris peran ADMIN
dari periode AKTIF ke periode PERSIAPAN baru. Selalu ada sumber: `buatPeriode`
hanya bisa dipanggil saat ada periode aktif (guard `periode.create`). Maka setiap
periode baru sudah punya ADMIN sebelum diaktifkan, dan Admin yang mengaktifkannya
tetap ber-ADMIN sesudahnya. `aktifkanPeriode` menolak `TANPA_ADMIN` bila target
tetap tanpa ADMIN (kasus tepi: seluruh ADMIN dihapus manual).

**Bootstrap lewat seed (memenuhi §4).** Periode pertama + ADMIN pertama dibuat
`prisma/seed.ts`, dijalankan pemegang kredensial penuh. Itu jalur bootstrap
terautentikasi untuk periode pertama. Tidak ada jalur anonim in-app, dan memang
tidak boleh ada — tanpa periode aktif tidak seorang pun dapat diautentikasi
ber-peran.

**Untuk lane ui:** tidak ada yang perlu dikerjakan soal ini. Carry-forward dan
penjaga TANPA_ADMIN seluruhnya di service. UI cukup menampilkan pesan `TANPA_ADMIN`
bila muncul (hampir tak pernah, karena carry-forward), dan **tidak** membuat alur
bootstrap in-app.

Gate `periode` tetap sengaja **tidak pernah mengaktifkan** periode (akan
mengarsipkan fixture E2E). Perilaku carry-forward dan penjaga ADMIN diuji di
`lib/periode/__tests__` dan smoke database, bukan di gate.

---

## 8. Verifikasi yang sudah dijalankan

```
npm run test -- periode-service     25 lulus
npm run test:e2e -- periode         13 dilewati (route T-050-UI belum ada)
npm run verify                      … lulus
```

Ditambah pembuktian terhadap database sungguhan (transaksi di-ROLLBACK):
periode dibuat PERSIAPAN, diubah tanpa kehilangan tanggal, aktivasi dengan
konfirmasi salah ditolak `KONFIRMASI_TIDAK_COCOK`, aktivasi benar mengarsipkan
periode lama dan menyetel counter ke `nomor_surat_awal - 1`, aktivasi ulang
ditolak `BUKAN_PERSIAPAN`, dan fixture aktif utuh setelah rollback.
