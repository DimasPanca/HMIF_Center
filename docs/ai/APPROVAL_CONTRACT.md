# Kontrak Approval Proker & Pembentukan Kepanitiaan — T-070

Batas lane `data` ↔ `ui` untuk approval. Lane data memiliki keputusan approval,
penegakan anti-bentrok, dan pembentukan kepanitiaan; lane ui merakit halaman
antrian + detail dan route tipisnya.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-070` (pemilik `lib/proker/**`, `lib/kepanitiaan/**`, `supabase/**`) |
| **Dibaca oleh** | lane `ui` — `T-070-UI` |
| **Gate** | `npm run test:e2e -- approval-proker` (milik lane data, sudah ada) |
| **Sumber** | PRD F-5.4, F-8.1 · USER_FLOW §4.3, §6.1 · INV-04, INV-05, INV-09 |

---

## 1. Route handler (lane ui) — tipis, K-02

Tiga route di `app/api/proker/[id]/{approve,reject,revisi}/route.ts`. Semua:
`guard can('proker.approve')` → `withAuditContext` → fungsi service → `sukses`/`gagal`.

```ts
import { sukses, gagal } from '@/lib/http/respond';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { konteksSaatIni } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { setujuiProker, tolakProker, mintaRevisi, STATUS_GAGAL } from '@/lib/proker/approval';

// approve:
const konteks = await konteksSaatIni();
if (!konteks?.sesi.isActive) return gagal('TIDAK_LOGIN', 'Sesi tidak aktif.', { status: 401 });
if (!can(konteks.roles, 'proker.approve')) return gagal('TIDAK_BERHAK', 'Bukan hak Anda.', { status: 403 });

const hasil = await withAuditContext(req, (tx) => setujuiProker(tx, konteks, id));
if (!hasil.ok) return gagal(hasil.kode, hasil.pesan, { status: STATUS_GAGAL[hasil.kode], details: hasil.konflik });
return sukses(hasil.nilai);
```

`can('proker.approve')` benar HANYA untuk Ketua & Wakil (matriks PRD §5.1:
`proker_approve` = A untuk KETUA/WAKIL, kosong untuk lainnya termasuk ADMIN & BPH).
Itu yang menegakkan INV-05 (hanya Ketua/Wakil) dan INV-04 (BPH tak melihat antrian).

### Tanda tangan

```ts
daftarApproval(konteks): Promise<RingkasApproval[]>            // antrian
setujuiProker(tx, konteks, prokerId): Promise<HasilApproval<{ status:'DISETUJUI'; locked:boolean; kepanitiaan_id?:string }>>
tolakProker(tx, prokerId, alasan): Promise<HasilApproval<{ status:'DITOLAK' }>>
mintaRevisi(tx, prokerId, catatan): Promise<HasilApproval<{ status:'PERLU_REVISI' }>>
```

### Kode kegagalan → HTTP (K-02/K-03)

| kode | HTTP | kapan |
|---|---|---|
| `TIDAK_DITEMUKAN` | 404 | proker tak ada |
| `STATUS_TIDAK_SESUAI` | 409 | bukan MENUNGGU_APPROVAL/REVISI, atau transisi tak sah |
| `WAJIB_ALASAN` | 422 | tolak/revisi tanpa alasan/catatan |
| `KONFLIK` | 409 | tanggal bentrok; `details` = daftar `{proker,departemen,mulai,selesai}` |

Badan gagal K-02: `{ ok:false, error:{ code, message, details? } }`.

---

## 2. Yang terjadi saat SETUJUI (satu transaksi)

`setujuiProker` menjalankan, dalam SATU `withAuditContext`:

1. `setujui_proker(prokerId, approver)` — menegakkan anti-bentrok (EXCLUDE
   constraint, INV-09) dan mengunci kalender untuk TERJADWAL. Bila bentrok:
   proker → `PERLU_REVISI`, fungsi mengembalikan **`KONFLIK`** + daftar bentrok
   (untuk panel inline; JANGAN pesan generik — "Selesai bila 3").
2. Hanya bila lolos DAN TERJADWAL: `bentuk_kepanitiaan(prokerId, approver)` —
   membentuk `kepanitiaan` + `divisi` + `divisi_member` + `rab_meta` (DRAFT) +
   `job_desk` kosong + `gantt_chart` per divisi + `gantt_chart` proker (dari
   struktur langkah 5) dari `proker_rencana`, lalu menghapus `proker_rencana`.

Gagal di langkah mana pun mengurungkan seluruhnya — tak pernah ada kepanitiaan
yatim atau kunci tanpa kepanitiaan (kontrak T-070 "Jangan"). BERKALA tak pernah
sampai ke antrian (ia DISETUJUI saat submit); RESPONSIF disetujui tanpa lock &
tanpa kepanitiaan.

**"Folder dokumen"** (kontrak §5) TIDAK dibentuk sebagai baris/transaksi: folder
pada object storage bersifat virtual dan lahir saat unggah pertama (`lib/storage`).
Keputusan ini dicatat di migrasi 022. Bila kelak perlu registri folder eksplisit,
itu task tersendiri.

---

## 3. Halaman (lane ui)

- **`app/(dashboard)/proker/approval/page.tsx`** — antrian dari `daftarApproval`
  (server component), hanya untuk Ketua/Wakil. Tiap baris: nama, departemen,
  kategori, tanggal, tombol ke detail.
- **Detail approval** — seluruh data proker (`detailProker`), pratinjau Gantt,
  dan **peta konflik** bila ada (panggil `POST /api/proker/cek-konflik` dengan
  rentang proker, atau tampilkan `details` dari respons `KONFLIK` setelah mencoba
  setujui). Tiga aksi: **Setujui**, **Tolak** (wajib alasan), **Minta Revisi**
  (wajib catatan).

### `data-testid` yang dipakai gate `e2e/approval-proker.spec.ts`

```
approval-antrian                 pembungkus daftar antrian
approval-item-<prokerId>         satu baris antrian (atribut/di dalamnya link ke detail)
approval-setujui                 tombol Setujui (di detail)
approval-tolak                   tombol Tolak
approval-revisi                  tombol Minta Revisi
approval-alasan                  input alasan/catatan (untuk tolak & revisi)
approval-konflik                 panel konflik inline (daftar proker bentrok)
approval-sukses                  status sukses setelah aksi
```

Nama USULAN; bila lebih cocok yang lain, angkat di sync point dan gate menyesuaikan.
Gate **SKIP** sampai `/proker/approval` memuat `approval-antrian`.

---

## 4. Verifikasi yang sudah dijalankan lane data

```
npm run test -- approval          (9 lulus: setujui/konflik/tolak/revisi)
npm run db:migrate                (022_bentuk_kepanitiaan dari database kosong)
smoke DB (ROLLBACK): setujui_proker + bentuk_kepanitiaan → kepanitiaan/divisi/
  member/rab_meta(DRAFT)/job_desk/gantt(divisi+proker) terbentuk, proker_rencana
  terhapus, proker_lock terisi, status DISETUJUI, kode_kegiatan = slug.
```

Alur approval end-to-end lewat UI dibuktikan gate ini SETELAH T-070-UI tersedia
(pola gate-first RENCANA §8.1).
