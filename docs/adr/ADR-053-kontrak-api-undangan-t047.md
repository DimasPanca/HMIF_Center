# ADR-053 — Penyelarasan kontrak API undangan T-047

|                    |                                                        |
| ------------------ | ------------------------------------------------------ |
| **Status**         | **Usulan**                                             |
| **Tanggal**        | 2026-09-04                                             |
| **Ditemukan oleh** | T-047-UI saat membaca gate undangan                    |
| **Task terkait**   | T-047, T-047-UI, T-048                                |

## Konteks

K-02 mewajibkan seluruh respons API berbentuk `{ ok: true, data }` atau
`{ ok: false, error: { code, message, details? } }`. Keputusan yang sama sudah
diterima untuk T-050 melalui ADR-050.

Namun, `e2e/undangan.spec.ts` membaca hasil undangan dari field top-level
`body.tautan`, `body.kedaluwarsa`, dan `body.userId`; kegagalan dibaca dari
`body.kode` serta `body.isu`. Contoh route pada `UNDANGAN_CONTRACT.md` juga
memakai bentuk top-level tersebut. API yang mengikuti K-02 akan gagal pada gate,
sedangkan menambahkan field duplikat agar dua bentuk lulus akan menciptakan dua
kontrak hidup dan melanggar frasa “tidak ada bentuk lain” pada K-02.

Pembagian berkas dalam `UNDANGAN_CONTRACT.md` juga mewajibkan
`app/api/auth/activate/route.ts`, tetapi route itu tidak tercantum pada field
**Buat** atau **Ubah** T-047. Halaman aktivasi tidak dapat bekerja tanpa route
tersebut, sementara membuatnya tanpa keputusan cakupan eksplisit berlawanan
dengan AGENT_RULES P-10.

## Keputusan

T-047-UI diusulkan dilanjutkan dengan penyelarasan berikut:

1. Seluruh route undangan memakai K-02 secara ketat: nilai sukses berada di
   `data`, sedangkan kode/pesan/isu kegagalan berada di `error` dan `details`.
2. `e2e/undangan.spec.ts` diperbarui agar membaca `body.data.*` dan
   `body.error.*`; tidak ada field kompatibilitas top-level.
3. Contoh route pada `UNDANGAN_CONTRACT.md` diperbarui ke bentuk yang sama.
4. `app/api/auth/activate/route.ts` ditambahkan resmi ke cakupan **Buat**
   T-047-UI karena merupakan satu-satunya endpoint aktivasi yang dirujuk halaman
   publik dan gate.
5. Pembagian tanggung jawab tetap: lane data memiliki service dan gate; lane UI
   hanya membuat halaman serta adapter HTTP tipis.
6. T-047-UI tetap `BLOCKED` sampai usulan ini diterima atau gate dan cakupan
   diperbaiki dengan keputusan lain.

## Konsekuensi implementasi

- Klien tidak perlu mendukung dua bentuk respons undangan.
- Pesan service tetap digunakan apa adanya dan isu validasi tetap dapat dipasang
  ke field melalui `error.details`.
- Route aktivasi publik dapat dibuat tanpa pelanggaran cakupan tersembunyi.
- T-048-UI menunggu halaman Admin T-047-UI agar target **Ubah**-nya benar-benar
  tersedia.

## Catatan penerapan (2026-09-27, mode single-agent)

Status dokumen ini tetap *Usulan* sampai pemilik produk menerimanya, tetapi
isinya sudah terwujud di kode:

- Butir 1–3 (K-02 ketat, gate membaca `body.data.*`/`body.error.*`): diterapkan
  lewat commit `99a361e` (perbaikan K-02 menyeluruh), sebelum T-047 UI dimulai.
- Butir 4 (`app/api/auth/activate/route.ts` masuk cakupan): dibuat bersama
  T-047 UI.
- Butir 5–6 (pembagian lane, status BLOCKED): tidak relevan lagi sejak mode
  single-agent; T-047 UI selesai dengan gate `undangan` 26/26.
