# Kontrak Notulensi Rapat — T-106

Batas lane `data` ↔ `ui` untuk Notulensi (PRD M13 · USER_FLOW §9.2). Lane data
memiliki service (`lib/notulensi/**`), skema, sanitasi TipTap, generator DOCX,
migrasi (pencarian isi, lampiran, departemen tujuan, RLS berlingkup). Lane ui
merakit halaman, editor, dan route tipis.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-106` (`lib/notulensi/**`, migrasi `027_notulensi.sql`) |
| **Dibaca oleh** | lane `ui` — `T-106-UI` (`app/api/notulensi/**`, `components/notulensi/*`, halaman sekretariat) |
| **Gate** | `npm run test:e2e -- notulensi` (milik lane data; skip hingga route+komponen ada) |
| **Sumber** | PRD M13 · PRD §5.1 (Notulensi) · USER_FLOW §9.2 · INV-03, INV-08 |

---

## 0. Prinsip

- **Konten TipTap DISANITASI** allowlist (`sanitasiKonten`) sebelum simpan dan
  boleh diterapkan ulang sebelum render. JSON ProseMirror, bukan HTML. Node izin:
  paragraph, heading(1–3), bullet/ordered/listItem, taskList/taskItem, table*,
  blockquote, hardBreak, horizontalRule; mark izin: bold, italic, underline,
  strike, code, link(http/https/mailto). Sisanya dibuang.
- **Daftar hadir BUKAN teks bebas** — baris `notulensi_attendance` per pengurus,
  status Hadir/Izin/Sakit/Alfa (T-106 "Jangan").
- **Keputusan** daftar terpisah (`notulensi.keputusan` jsonb string[]).
- **Departemen tujuan action item** eksplisit — notulensi departemen memaksa
  departemennya; notulensi himpunan (`departemen_id=null`) menetapkannya, TIDAK
  ditebak dari PIC. Konversi mengunci baris (anti duplikasi).
- **Pencarian isi**: kolom `konten_teks` (diisi service) + tsvector STORED
  `cari_tsv` (judul+tempat+isi) → cari `plainto_tsquery('indonesian', q)`.
- Semua respons **K-02**; `Cache-Control: no-store`.

## 1. Service (disediakan lane data) — `lib/notulensi/service.ts`

`HasilNotulensi<T>` = `{ok:true,nilai}` | `{ok:false,kode,pesan,details?}`.

| Fungsi | Guna |
|---|---|
| `daftarNotulensi(konteks,{q?,departemenId?},klien?)` | daftar + pencarian isi |
| `detailNotulensi(konteks,id,klien?)` | detail lengkap + ringkasan |
| `daftarPengurus(konteks,departemenId,klien?)` | sumber daftar hadir (pengurus akun, periode aktif) |
| `buatNotulensi(tx,konteks,input)` | buat transaksional (meta+konten+keputusan+hadir+action) |
| `perbaruiNotulensi(tx,konteks,id,input)` | perbarui meta/konten/keputusan/hadir |
| `tambahActionItem(tx,konteks,notulensiId,input)` | tambah action item |
| `hapusActionItem(tx,konteks,itemId)` | hapus action item |
| `konversiActionItem(tx,konteks,itemId,{departemen_id?})` | → kartu Kanban, simpan `kanban_card_id` |
| `generateDocxNotulensi(konteks,id,klien?)` | `{nama_berkas, docx: Buffer}` |

Skema diekspor: `SkemaBuatNotulensi`, `SkemaPerbaruiNotulensi`,
`SkemaActionItemInput`, `SkemaKehadiran`, `SkemaKonversi`.

## 2. Bentuk data (ringkas)

```ts
NotulensiDetail = { id, periode_id, departemen_id|null, judul, tanggal,
  waktu_mulai|null, waktu_selesai|null, tempat|null,
  pemimpin_id|null, pemimpin_nama|null, notulis_id|null, notulis_nama|null,
  konten: <TipTap JSON tersanitasi>, keputusan: string[],
  kehadiran: {user_id,nama,status}[], ringkasan: {hadir,izin,sakit,alfa},
  action_items: {id,tugas,pic_id,pic_nama,deadline,departemen_id,kanban_card_id}[],
  lampiran: {id,nama_berkas,storage_key,mime,ukuran}[] }
RingkasNotulensi = { id, judul, tanggal, tempat, departemen_id, nama_departemen }
Pengurus = { user_id, nama_lengkap, jabatan, departemen_id }
```

## 3. Kode gagal → HTTP (`STATUS_GAGAL_NOTULENSI`)

| kode | HTTP | kapan |
|---|---|---|
| `TIDAK_VALID` | 422 | Zod gagal (`details`=issues); tujuan departemen kurang |
| `TIDAK_BERWENANG` | 403 | di luar lingkup notulensi induk / periode |
| `TIDAK_DITEMUKAN` | 404 | notulensi/action item tidak ada |
| `KONFLIK` | 409 | action item sudah dikonversi (anti duplikasi) |

## 4. Izin & lingkup per role (PRD §5.1)

`notulensi`: ADMIN CRUD · KETUA/WAKIL CRU · SEKUM CRUD · BENDUM R · KADEPT CRU\* ·
ANGGOTA R\* · BPH R. **Tulis** = ADMIN/KETUA/WAKIL/SEKUM lintas-organisasi
(termasuk notulensi himpunan) ATAU KADEPT departemennya (role & departemen pada
baris user_role yang sama). **Hapus notulensi** = ADMIN/SEKUM, atau KADEPT
departemennya. Sub-elemen (kehadiran, action item, lampiran) mengikuti hak TULIS
notulensi induk + periode aktif. BPH tak pernah menulis. Guard route:
`notulensi.read`/`create`/`update`/`delete`.

## 5. Endpoint (dirakit lane ui) — pemetaan yang disarankan

Semua tipis: guard → `withAuditContext((tx)=>fungsi)` → `sukses`/`gagal(kode,
pesan,{status:STATUS_GAGAL_NOTULENSI[kode],details})`.

| Metode & path | Service |
|---|---|
| `GET /api/notulensi?q=&departemen_id=` | `daftarNotulensi` |
| `POST /api/notulensi` | `buatNotulensi` → 201 |
| `GET /api/notulensi/pengurus?departemen_id=` | `daftarPengurus` |
| `GET /api/notulensi/[id]` | `detailNotulensi` |
| `PATCH /api/notulensi/[id]` | `perbaruiNotulensi` |
| `DELETE /api/notulensi/[id]` | (hapus; guard `notulensi.delete`) |
| `POST /api/notulensi/[id]/action-item` | `tambahActionItem` → 201 |
| `DELETE /api/notulensi/[id]/action-item/[aid]` | `hapusActionItem` |
| `POST /api/notulensi/[id]/action-item/[aid]/convert` | `konversiActionItem` |
| `POST /api/notulensi/[id]/generate` | `generateDocxNotulensi` (DOCX attachment) |

Route `app/api/notulensi/**` MILIK LANE UI. Lane data TIDAK membuatnya.

## 6. data-testid WAJIB (agar UI tak menebak selector; dipakai gate)

| testid | elemen |
|---|---|
| `notulensi-cari` | input pencarian arsip |
| `notulensi-list` | kontainer daftar arsip |
| `notulensi-row-{id}` | satu baris arsip |
| `notulensi-editor` | area editor TipTap |
| `notulensi-hadir-{userId}` | kontrol status kehadiran satu pengurus |
| `notulensi-hadir-status-{userId}` | nilai status terpilih (data-status) |
| `notulensi-hadir-ringkasan` | ringkasan `X Hadir · Y Izin · Z Sakit · W Alfa` |
| `notulensi-keputusan` | daftar poin keputusan |
| `notulensi-keputusan-item-{i}` | satu poin keputusan |
| `notulensi-keputusan-tambah` | input/tombol tambah keputusan |
| `notulensi-action-item-{id}` | satu baris action item |
| `notulensi-action-dept-{id}` | pemilih departemen tujuan (notulensi himpunan) |
| `notulensi-action-konversi-{id}` | tombol "Jadikan kartu Kanban" |
| `notulensi-simpan` | tombol simpan |
| `notulensi-generate` | tombol generate DOCX |

## 7. Verifikasi lane data (sudah dijalankan)

```
db:reset (dari kosong) → 027_notulensi diterapkan
db:test 027 → RLS: lintas-departemen, BPH, periode bertentangan, multi-role sah,
  himpunan hanya pimpinan/Sekum
unit lib/notulensi → sanitasi allowlist, ekstraksi, skema, lingkup
DOCX render dari templates/notulensi.docx → OK
verify hijau; guard data OK
```

**Dependency baru (lane data mengubah package files):** `@tiptap/extension-table`,
`-table-row`, `-table-cell`, `-table-header`, `-task-list`, `-task-item` disematkan
`3.31.0` agar cocok dengan `@tiptap/core` terpasang. Lane ui `npm install` setelah sync.
