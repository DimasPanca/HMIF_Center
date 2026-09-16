# Kontrak Checklist Kartu Kanban — T-081

Batas lane `data` ↔ `ui` untuk checklist kartu (PRD F-7.2). Lane data memiliki
service (`lib/kanban/checklist.ts`), skema Zod, penyimpanan & RLS template, dan
perbaikan RLS `checklist_item`. Lane ui merakit route tipis dan komponen.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-081` (`lib/kanban/checklist.ts`, migrasi `026_checklist.sql`) |
| **Dibaca oleh** | lane `ui` — `T-081-UI` (`app/api/kanban/[id]/checklist/**`, `components/kanban/{ChecklistPanel,ChecklistItem,TemplateChecklistDialog}.tsx`) |
| **Gate** | `npm run test:e2e -- checklist` (milik lane data; skip hingga route+komponen ada) |
| **Sumber** | PRD F-7.2, F-7.1, §5.1 · docs/ai/tasks/P4-kanban.md T-081 · INV-03, INV-08 |

---

## 0. Prinsip

- **Progres proker BUKAN dari checklist.** Progres proker tetap dari kolom kartu
  (PRD F-7.1, T-081 "Jangan"). Checklist hanya progres per-kartu `selesai/total`.
- **Lingkup diturunkan dari kartu induk**, bukan role global. Service memaksakan
  ini untuk request aplikasi (koneksi app melewati RLS); RLS memaksakannya untuk
  akses langsung/authenticated. Aturannya identik dengan `PATCH /api/kanban/[id]`
  (T-080): kartu berbasis departemen, periode aktif, role KADEPT/ANGGOTA pada
  departemen kartu (atau ADMIN). **BPH baca saja** (INV-03).
- Semua respons **K-02** (`lib/http/respond.ts`). `Cache-Control: no-store`.

## 1. Service (disediakan lane data) — `lib/kanban/checklist.ts`

Semua menerima `(tx, konteks, …)` dari `withAuditContext` kecuali pembacaan
(boleh `db`). Mengembalikan `HasilChecklist<T>` (`{ok:true,nilai}` |
`{ok:false,kode,pesan,details?}`).

| Fungsi | Guna |
|---|---|
| `daftarChecklist(konteks, cardId, klien?)` | item satu kartu, terurut |
| `tambahChecklist(tx, konteks, cardId, input)` | tambah item |
| `ubahChecklist(tx, konteks, itemId, input)` | ubah teks/centang/assignee/deadline |
| `hapusChecklist(tx, konteks, itemId)` | hapus item |
| `urutkanChecklist(tx, konteks, cardId, input)` | urut ulang (semua id kartu) |
| `daftarTemplate(konteks, departemenId, klien?)` | template departemen |
| `simpanTemplate(tx, konteks, cardId, input)` | simpan checklist kartu jadi template |
| `terapkanTemplate(tx, konteks, cardId, input)` | tambahkan item template ke kartu |

Skema diekspor (route WAJIB memvalidasi bentuk yang sama): `SkemaTambahItem`,
`SkemaUbahItem`, `SkemaUrutkan`, `SkemaSimpanTemplate`, `SkemaTerapkanTemplate`.

## 2. Bentuk data

```ts
ItemChecklist = {
  id, card_id, teks, selesai: boolean,
  assignee_id: string|null, assignee_nama: string|null,
  deadline: string|null /* YYYY-MM-DD */, urutan: number
}
RingkasTemplateChecklist = { id, nama, departemen_id, jumlah_item: number }
```

## 3. Kode gagal → HTTP (`STATUS_GAGAL_CHECKLIST`)

| kode | HTTP | kapan |
|---|---|---|
| `TIDAK_VALID` | 422 | Zod gagal (`details` = issues), atau daftar urutan tak cocok |
| `TIDAK_BERWENANG` | 403 | di luar lingkup kartu (lintas dept, BPH, konteks bertentangan) |
| `TIDAK_DITEMUKAN` | 404 | kartu/item/template tidak ada |

Guard permission route: `kanban.read` (GET) · `kanban.create`/`kanban.update`
(tambah/ubah/urut/template) · `kanban.delete` (hapus item). Tanpa izin → 401/403
K-02 dari guard.

## 4. Endpoint (dirakit lane ui) — pemetaan yang disarankan

Semua tipis: guard → `withAuditContext((tx) => fungsi)` → `sukses`/`gagal(kode,
pesan, {status: STATUS_GAGAL_CHECKLIST[kode], details})`.

| Metode & path | Service | Sukses |
|---|---|---|
| `GET /api/kanban/{cardId}/checklist` | `daftarChecklist` | 200 `ItemChecklist[]` |
| `POST /api/kanban/{cardId}/checklist` | `tambahChecklist` | 201 `ItemChecklist` |
| `PATCH /api/kanban/{cardId}/checklist` | `urutkanChecklist` (body `{urutan:[]}`) | 200 `ItemChecklist[]` |
| `PATCH /api/kanban/{cardId}/checklist/{itemId}` | `ubahChecklist` | 200 `ItemChecklist` |
| `DELETE /api/kanban/{cardId}/checklist/{itemId}` | `hapusChecklist` | 200 `{id}` |
| `GET /api/kanban/{cardId}/checklist/template` | `daftarTemplate` (dept kartu) | 200 `RingkasTemplateChecklist[]` |
| `POST /api/kanban/{cardId}/checklist/template` | `simpanTemplate` | 201 `RingkasTemplateChecklist` |
| `POST /api/kanban/{cardId}/checklist/apply` | `terapkanTemplate` (body `{template_id}`) | 200 `ItemChecklist[]` |

Route `.../checklist/route.ts` dan sub-route item/template MILIK LANE UI. Lane
data TIDAK membuatnya.

## 5. data-testid WAJIB (agar UI tak menebak selector; dipakai gate)

| testid | elemen |
|---|---|
| `checklist-panel` | kontainer panel checklist di detail kartu |
| `checklist-progress` | teks progres panel, mis. `3/8` |
| `checklist-progress-bar` | bar tipis progres panel (`aria-valuenow`) |
| `kanban-card-progress-{cardId}` | teks progres `3/8` pada kartu di papan |
| `checklist-item-{itemId}` | baris satu item |
| `checklist-check-{itemId}` | kontrol centang item (checkbox/role=checkbox) |
| `checklist-teks-{itemId}` | teks item (untuk edit inline bila ada) |
| `checklist-assignee-{itemId}` | assignee opsional item |
| `checklist-deadline-{itemId}` | deadline opsional item |
| `checklist-drag-{itemId}` | handle urut-ulang (Tab/Space/panah, keyboard-accessible) |
| `checklist-tambah-teks` | input teks item baru |
| `checklist-tambah-submit` | tombol tambah item |
| `checklist-template-simpan` | tombol simpan sebagai template |
| `checklist-template-dialog` | dialog kelola/terapkan template |
| `checklist-template-nama` | input nama template saat menyimpan |
| `checklist-template-opsi-{templateId}` | satu template di daftar terapkan |
| `checklist-template-terapkan` | tombol menerapkan template terpilih |

Optimistik (kontrak #4): centang memperbarui `checklist-progress` DAN
`kanban-card-progress-{cardId}` seketika; bila server menolak (403/…), UI
me-rollback tampilan dan menampilkan pesan `error.message`.

## 6. Verifikasi lane data (sudah dijalankan)

```
db:reset (dari kosong) → 026_checklist diterapkan
db:test 026 → RLS: lintas-departemen, BPH, konteks bertentangan, multi-role sah
unit lib/kanban/checklist → skema, pemetaan kode, lingkup dari kartu induk
verify hijau; guard data OK
```
