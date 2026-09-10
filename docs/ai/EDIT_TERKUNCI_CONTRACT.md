# Kontrak Edit Proker Terkunci — T-071

Batas lane `data` ↔ `ui` untuk menyunting proker yang sudah DISETUJUI (mengunci
kalender). Lane data memiliki klasifikasi minor/mayor, jalur simpan/ajukan-revisi,
dan penolakan revisi; lane ui merakit halaman edit dan menyambung penolakan revisi
di halaman approval.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-071` (pemilik `lib/proker/**`, `supabase/**`) |
| **Dibaca oleh** | lane `ui` — `T-071-UI` (+ satu penyesuaian route approval T-070) |
| **Gate** | `npm run test:e2e -- edit-proker-terkunci` (milik lane data) |
| **Sumber** | PRD §5.2 no.4 · USER_FLOW §4.4, §11.1 · INV-13 |

---

## 1. Menyunting proker DISETUJUI — `PATCH /api/proker/[id]` (lane ui)

Route memilih jalur berdasarkan status yang sedang disunting:

- **DISETUJUI** → `editProkerTerkunci` (berkas ini).
- **DRAFT / PERLU_REVISI / DITOLAK** → `ubahProker` biasa (belum mengunci apa pun).

```ts
import { sukses, gagal } from '@/lib/http/respond';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { konteksSaatIni } from '@/lib/auth/guard';
import { editProkerTerkunci, STATUS_GAGAL } from '@/lib/proker/edit-terkunci';

// status DISETUJUI:
const hasil = await withAuditContext(req, (tx) => editProkerTerkunci(tx, konteks, id, perubahan));
if (!hasil.ok) return gagal(hasil.kode, hasil.pesan, { status: STATUS_GAGAL[hasil.kode], details: hasil.isu });
return sukses(hasil.nilai); // { status, jenis }
```

### Tanda tangan & hasil

```ts
editProkerTerkunci(tx, konteks, id, perubahan): Promise<HasilEdit>
// sukses → { ok:true, data:{ status:'DISETUJUI'|'MENUNGGU_APPROVAL_REVISI', jenis:'TIDAK_ADA'|'MINOR'|'MAYOR' } }
```

| kode | HTTP | kapan |
|---|---|---|
| `TIDAK_DITEMUKAN` | 404 | proker tak ada / periode lain (hardening) |
| `STATUS_TIDAK_SESUAI` | 409 | status bukan DISETUJUI |
| `DI_LUAR_LINGKUP` | 403 | proker bukan milik departemen Anda |
| `TIDAK_VALID` | 422 | perubahan melanggar aturan proker (`details` = `{path,pesan}[]`) |

### Minor vs Mayor — SATU sumber (`klasifikasi-perubahan.ts`)

UI **wajib** memakai `klasifikasiPerubahan(lama, perubahan)` (atau
`perluApprovalUlang`) untuk memutuskan kapan menampilkan peringatan — JANGAN
menyimpulkan sendiri field mana yang mayor (K-04).

```ts
import { klasifikasiPerubahan, perluApprovalUlang, MEDAN_MAYOR, MEDAN_MINOR } from '@/lib/proker/klasifikasi-perubahan';
```

- **MAYOR** = `tanggal_mulai_persiapan`, `tanggal_hari_h_mulai`, `tanggal_hari_h_selesai`, `kategori`, `departemen_id`.
- **MINOR** = sisanya (nama, deskripsi, tujuan, sasaran, estimasi_peserta, penanggung_jawab, estimasi_anggaran, sumber_dana, pola_ulang).

Sebelum menyimpan perubahan MAYOR, tampilkan peringatan eksplisit (kontrak §4):
**"Perubahan tanggal memerlukan persetujuan ulang Ketua/Wakil."**

### Apa yang terjadi di server

- **MINOR** → disimpan langsung; proker TETAP `DISETUJUI`; kunci kalender tak
  tersentuh.
- **MAYOR** → nilai baru ditulis ke proker; status → `MENUNGGU_APPROVAL_REVISI`;
  **kunci LAMA dipertahankan** (INV-13 — tak ada jendela tanpa kunci); nilai lama
  di-snapshot ke `proker_revisi` untuk revert. Proker masuk antrian Ketua/Wakil.

---

## 2. Keputusan revisi di halaman approval (penyesuaian T-070-UI)

Proker `MENUNGGU_APPROVAL_REVISI` muncul di antrian approval yang sama (T-070).
Keputusannya:

- **Setujui** → `setujuiProker(tx, konteks, id)` (SUDAH ADA, tak berubah): pada
  status revisi ia memindah kunci lama→baru lewat `setujui_proker` dan
  membersihkan snapshot; kepanitiaan TIDAK dibentuk ulang. Bila rentang baru
  bentrok, kunci LAMA tetap berlaku dan proker jatuh ke PERLU_REVISI.
- **Tolak** → **`tolakRevisi(tx, konteks, id)`** (BARU), **bukan** `tolakProker`.
  Menolak revisi mengembalikan tanggal/kategori/departemen ke nilai lama dan
  status ke `DISETUJUI` (kunci lama masih berlaku) — **bukan** memindah ke
  `DITOLAK`. Route `app/api/proker/[id]/reject/route.ts` harus BERCABANG:

  ```ts
  // di dalam withAuditContext, setelah memuat status proker:
  const hasil = statusProker === 'MENUNGGU_APPROVAL_REVISI'
    ? await tolakRevisi(tx, konteks, id)
    : await tolakProker(tx, id, alasan);
  ```

  `tolakRevisi` tak memerlukan alasan (§4.4: penolakan revisi hanya mengembalikan
  tanggal). Kode gagal & HTTP-nya memakai `STATUS_GAGAL` yang sama dengan approval.
  UI dapat menyembunyikan input alasan saat status `MENUNGGU_APPROVAL_REVISI`.

---

## 3. `data-testid` untuk gate `e2e/edit-proker-terkunci.spec.ts`

Halaman edit `app/(dashboard)/proker/[id]/page.tsx`:

```
edit-field-deskripsi         input deskripsi (contoh medan MINOR)
edit-field-harih-selesai     input hari-H selesai (contoh medan MAYOR)
edit-peringatan-mayor        peringatan "memerlukan persetujuan ulang" (muncul saat medan mayor diubah)
edit-simpan                  tombol Simpan
edit-sukses                  status sukses setelah simpan
```

Keputusan revisi memakai testid approval yang sudah ada (`approval-setujui`,
`approval-tolak`, `approval-sukses`) di halaman detail approval proker
`MENUNGGU_APPROVAL_REVISI`. Nama USULAN; angkat sync point bila perlu. Gate SKIP
sampai halaman edit + percabangan tolak revisi tersedia.

---

## 4. Verifikasi yang sudah dijalankan lane data

```
npm run test -- klasifikasi-perubahan   (11 lulus)
npm run test -- edit-terkunci           (7 lulus: minor/mayor/tolakRevisi)
npm run test -- approval                (revisi disetujui tak membentuk kepanitiaan ulang)
npm run db:migrate                      (023_proker_revisi dari database kosong)
smoke DB (ROLLBACK): edit mayor MEMPERTAHANKAN kunci lama; setujui revisi
  MEMINDAH kunci ke rentang baru; status kembali DISETUJUI.
```

Alur end-to-end (UI edit + keputusan revisi) dibuktikan gate ini SETELAH T-071-UI
tersedia (pola gate-first RENCANA §8.1).
