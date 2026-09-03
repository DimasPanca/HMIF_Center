# Kontrak Program Kerja — T-065

Batas antara lane `data` dan lane `ui` untuk T-065. Lane data memiliki seluruh
aturan proker; lane ui menerjemahkannya menjadi endpoint dan tampilan.

Mengikuti pola `AUTH_CONTRACT.md` persis, dengan alasan yang sama: T-065 adalah
task campuran, dan pembelahannya perlu punya rumah selain percakapan.

| | |
|---|---|
| **Ditulis oleh** | lane `data` (pemilik `lib/proker/**`) |
| **Dibaca oleh** | lane `ui` (pemilik `app/api/proker/**`) |
| **Sumber** | PRD F-5.1, F-5.2, F-5.3 · SYSTEM_DESIGN §6.3–§6.6, §16.2 |

---

## 1. Pembagian berkas

```
lane data — sudah selesai, jangan disentuh lane ui
  lib/proker/schema.ts     skema Zod 3 kategori, dipakai form DAN server (K-04)
  lib/proker/status.ts     9 status, transisi USER_FLOW §11.1, matriks konflik §6.6
  lib/proker/service.ts    seluruh kueri dan keputusan

lane ui — belum ada
  app/api/proker/route.ts                  GET daftar, POST buat
  app/api/proker/[id]/route.ts             GET detail, PATCH ubah
  app/api/proker/cek-konflik/route.ts      POST
  app/api/proker/kalender/route.ts         GET
```

Tidak ada berkas yang beririsan. `guard` akan menolak bila salah satu lane
menyentuh milik yang lain.

**Yang BUKAN bagian T-065**, walau terdaftar di SYSTEM_DESIGN §16.2: `submit`,
`approve`, `reject`, `revisi`. Ketiganya milik T-069 dan T-070, dan `service.ts`
sengaja berhenti sebelum garis itu — tidak ada fungsi di sana yang mengubah
status.

---

## 2. Yang dipanggil route handler

```ts
import {
  buatProker, ubahProker, daftarProker, detailProker,
  cekKonflik, kalenderTerkunci,
} from '@/lib/proker/service';
import { SkemaCekKonflik, SkemaFilterProker } from '@/lib/proker/schema';
```

### Pembacaan — tidak perlu transaksi

```ts
daftarProker(periodeId: string, filter?: FilterProker): Promise<RingkasProker[]>
detailProker(id: string): Promise<DetailProker | null>
cekKonflik(periodeId: string, input: InputCekKonflik): Promise<KonflikProker[]>
kalenderTerkunci(periodeId: string): Promise<EntriKalender[]>
```

Keempatnya menerima argumen terakhir opsional berupa klien transaksi. Route
handler yang hanya membaca **tidak perlu mengisinya**.

### Mutasi — `tx` WAJIB

```ts
buatProker(tx: TxKlien, konteks: Konteks, input: unknown): Promise<Hasil<{ id: string }>>
ubahProker(tx: TxKlien, konteks: Konteks, id: string, perubahan: Record<string, unknown>): Promise<Hasil<{ id: string }>>
```

`tx` datang dari `withAuditContext(req, ...)` dan bukan pilihan gaya: konteks
audit dipasang `set_config(..., true)` yang bersifat transaction-local, sehingga
kueri di koneksi lain menghasilkan baris audit ber-IP NULL tanpa satu pun error.
Tanda tangannya menuntut `tx` supaya kelalaian itu menjadi kesalahan tipe.

`input` sengaja bertipe `unknown`: **validasi dikerjakan service**, bukan route.
Jangan memanggil `SkemaProker.parse()` lebih dulu — dua tempat memvalidasi
dengan aturan yang sedikit berbeda persis cara celah terbentuk.

```ts
// app/api/proker/route.ts
export async function POST(req: Request) {
  const g = await requirePermission('proker.create');
  if (!g.ok) return g.nilai;

  const badan = await req.json();
  const h = await withAuditContext(req, (tx) => buatProker(tx, g.konteks, badan));
  return h.ok
    ? NextResponse.json({ ok: true, id: h.nilai.id }, { status: 201 })
    : NextResponse.json(h, { status: STATUS_GAGAL[h.kode] });
}
```

---

## 3. Bentuk hasil dan padanan HTTP-nya

```ts
type Hasil<T> = { ok: true; nilai: T } | GagalProker;

interface GagalProker {
  ok: false;
  kode: 'TIDAK_DITEMUKAN' | 'DI_LUAR_LINGKUP' | 'TIDAK_VALID' | 'TIDAK_ADA_PERIODE_AKTIF';
  pesan: string;                                   // siap tampil, bahasa Indonesia
  isu?: { path: string; pesan: string }[];          // hanya untuk TIDAK_VALID
}
```

| `kode` | HTTP | Yang ditampilkan |
|---|:---:|---|
| `TIDAK_DITEMUKAN` | 404 | `pesan` |
| `DI_LUAR_LINGKUP` | 403 | `pesan` |
| `TIDAK_VALID` | 422 | `isu` dipasang ke field form; `pesan` sebagai ringkasan |
| `TIDAK_ADA_PERIODE_AKTIF` | 409 | `pesan` — yang harus bertindak Admin, bukan pengguna |

`pesan` sudah siap tampil. Jangan menyusun kalimat sendiri dari `kode`; dua
kalimat untuk keadaan yang sama akan berbeda suatu hari.

`isu[].path` memakai titik (`pola_ulang.hari`) dan cocok langsung dengan
`setError` react-hook-form.

### PATCH mengirim perubahan saja, bukan seluruh proker

`ubahProker` membaca baris tersimpan, **menggabungnya dengan `perubahan`, lalu
memvalidasi hasil gabungan**. Route handler cukup meneruskan badan request apa
adanya.

Itu bukan kenyamanan: aturan durasi persiapan 15–45 hari membandingkan dua
tanggal. PATCH yang hanya mengirim hari-H tidak punya pembanding kecuali
tanggal persiapan yang tersimpan ikut dibaca. Memvalidasi badan request sendiri
akan meloloskan perubahan yang memecah aturan itu, dan penolakannya datang dari
CHECK constraint sebagai error 500.

---

## 4. Tanggal selalu string `'YYYY-MM-DD'`

Masuk dan keluar. Tidak pernah `Date`, tidak pernah ISO berjam.

Kolomnya `DATE` — hari kalender tanpa zona waktu. `new Date('2026-11-01')` di
browser ber-offset negatif menghasilkan 31 Oktober waktu setempat, dan untuk
sistem yang seluruh aturannya tentang tanggal mana yang terkunci, pergeseran
satu hari itu kesalahan yang paling mahal.

Route handler **tidak boleh** mengubahnya menjadi `Date` sebelum meneruskan,
dan **tidak boleh** memformat ulang hasilnya dengan `toISOString()`.

`selisihHari(dari, sampai)` di `schema.ts` menghitung selisih hari bebas zona
waktu, bila komponen butuh menampilkan durasi.

---

## 5. Anti-bentrok: apa yang dijamin dan apa yang tidak

`cekKonflik()` **tidak menjamin apa pun**. Ia memanggil fungsi database
`cek_konflik_proker`, dan daftarnya sudah berpotensi basi saat sampai ke layar
— departemen lain dapat menyetujui proker di rentang yang sama pada detik
berikutnya.

Yang menjamin hanya EXCLUDE constraint `no_overlap_terjadwal` di `proker_lock`,
lewat fungsi `setujui_proker` (INV-09).

Konsekuensinya untuk lane ui:

1. Hasil `cekKonflik` ditampilkan sebagai **peringatan**, bukan sebagai
   penghalang submit. Proker boleh disimpan sebagai draft walau bentrok;
   penolakannya terjadi saat approval.
2. Panel konflik pada halaman approval (T-070) memakai `konflik` dari nilai
   kembalian `setujui_proker`, **bukan** memanggil `cekKonflik` lagi. Yang
   pertama adalah alasan penolakan yang sungguh terjadi; yang kedua tebakan
   baru.
3. Rentang inklusif di **kedua** ujung. `selesai` yang dikembalikan adalah hari
   terakhir yang benar-benar terkunci (INV-11), bukan hari sesudahnya.

Matriks SYSTEM_DESIGN §6.6 tersedia sebagai `konflikDitolak(baru, existing)` di
`status.ts` — hanya TERJADWAL × TERJADWAL yang `true`.

---

## 6. Kalender: satu request, tiga keadaan

`GET /api/proker/kalender` memanggil `kalenderTerkunci(periodeId)` yang
mengembalikan **satu array untuk dua jenis entri**, dalam satu kueri:

```ts
interface EntriKalender {
  jenis: 'TERKUNCI' | 'BERKALA';
  proker_id, nama_proker, departemen_id, nama_departemen: string;
  mulai, selesai: string;                       // 'YYYY-MM-DD', inklusif
  hari_h_mulai, hari_h_selesai: string | null;  // hanya TERKUNCI
  penanggung_jawab: string | null;
  pola_ulang: unknown;                          // hanya BERKALA
}
```

`TERKUNCI` benar-benar memblokir tanggal; `BERKALA` hanya keterangan dan tidak
memblokir apa pun (PRD F-5.2 R4). Keadaan ketiga — **tersedia** — adalah
ketiadaan entri, dihitung di klien.

Tooltip T-067 menuntut lima informasi; kelimanya ada di satu entri
`TERKUNCI`: `nama_proker`, `nama_departemen`, rentang persiapan
(`mulai` … `hari_h_mulai - 1`), rentang hari-H (`hari_h_mulai` …
`hari_h_selesai`), dan `penanggung_jawab`.

Entri `TERKUNCI` dibaca dari `proker_lock`, bukan dari kolom tanggal `proker`.
Keduanya tidak selalu sama: proker yang menunggu approval revisi masih memegang
kunci **lama** (INV-13), dan yang benar bagi kalender adalah kunci itu.

---

## 7. Lingkup — tanda `*` PRD §5.1

`requirePermission()` menolak role yang memang tidak berhak, tetapi ia tidak
tahu baris mana yang sedang disentuh sehingga tidak dapat menegakkan batas
departemen. Service yang menegakkannya, dan lane ui **tidak perlu
menambahkannya lagi**:

- `buatProker` menolak `departemen_id` di luar `konteks.departemenIds` bila
  role pemanggil berlingkup.
- `ubahProker` memeriksa departemen proker tersimpan **dan** departemen tujuan
  bila perubahannya memindahkan proker.

Keduanya mengembalikan `DI_LUAR_LINGKUP`. RLS (015b) tetap menjaganya sebagai
lapis terakhir.

---

## 8. Yang dipaksakan service dan tidak boleh dikirim route

| Medan | Kenapa |
|---|---|
| `status` | Selalu `DRAFT` saat pembuatan. Proker yang lahir `DISETUJUI` tidak punya baris `proker_lock`, sehingga ia memakai tanggal yang tidak dikunci siapa pun dan kalender tidak menyadarinya. |
| `periode_id` | Diambil dari `konteks.periodeId`, yaitu periode berstatus `AKTIF` menurut server. |
| `dibuat_oleh` | Diambil dari `konteks.sesi.userId`. |

Ketiganya diabaikan bila muncul di badan request. Ada test yang menguncinya.

---

## 9. Verifikasi yang sudah dijalankan

```
npm run test -- proker-service     68 lulus
```

Ditambah pembuktian terhadap database sungguhan (di dalam transaksi yang
di-ROLLBACK): 60 proker TERJADWAL disetujui lewat `setujui_proker`, lalu

```
cekKonflik 60 proker -> 2 konflik dalam 40,6 ms   (target kontrak < 500 ms)
kalender   60 entri  dalam 43,4 ms
proker_lock setelah rollback: 0
```
