# Kontrak Wizard Proker (draft per langkah) — T-068

Batas antara lane `data` dan lane `ui` untuk T-068. Lane data memiliki mesin
keadaan wizard, penyimpanan draft, dan jalur cek konflik; lane ui merakit layar.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-068` (pemilik `lib/proker/**`, `supabase/**`) |
| **Dibaca oleh** | lane `ui` — `T-068-UI` |
| **Gate** | `npm run test:e2e -- wizard-proker-1-3` (milik lane data, sudah ada) |
| **Sumber** | PRD F-5.3 (Langkah 1–3) · USER_FLOW §4.1 |

---

## 1. Pembagian berkas

```
lane data — selesai, jangan disentuh lane ui
  lib/proker/wizard-state.ts   mesin keadaan MURNI (aman di klien): model 6
                               langkah, validasi per langkah, durasi, cek konflik
  lib/proker/draft-store.ts    persistensi draft SERVER-ONLY (simpan/ambil/hapus)
  supabase/migrations/020_proker_draft.sql   tabel draft + RLS
  e2e/wizard-proker-1-3.spec.ts              gate

lane ui — T-068-UI, belum ada
  app/(dashboard)/proker/baru/page.tsx
  components/proker/wizard/{WizardShell,Langkah1Informasi,Langkah2Jadwal,Langkah3Anggaran}.tsx
  app/api/proker/draft/route.ts   GET ambil · PUT simpan · DELETE buang  ← lihat §4
```

`app/api/proker/draft/route.ts` tidak tercantum di "Buat" T-068 (yang hanya
menyebut halaman + komponen + wizard-state.ts). Ia resmi menjadi bagian
`T-068-UI` lewat kontrak ini — draft WAJIB di server (klausa "Jangan": bukan
localStorage saja), jadi endpoint tipisnya diperlukan.

---

## 2. `wizard-state.ts` — dipakai KLIEN

Modul murni, tanpa `db`. `WizardShell` mengimpornya di klien untuk menyalakan/
mematikan tombol Lanjut seketika. Validasi yang sama berjalan lagi di server saat
submit (K-04) — jangan menganggap validasi klien cukup.

```ts
import {
  LANGKAH, langkahUntuk,          // model 6 langkah; mana yang berlaku per kategori
  validasiLangkah, bolehLanjut,   // gating "langkah belum valid tak bisa dilewati"
  terapkanLangkah,                // merge patch → draft (null menghapus medan)
  durasiPersiapan, pesanDurasi,   // hitungan + pesan berangka aktual (kontrak 4)
  permintaanCekKonflik,           // bentuk badan cek-konflik, atau null
  keInputProker,                  // rakit draft → payload submit (dipakai T-069)
  type WizardDraft, type NomorLangkah,
} from '@/lib/proker/wizard-state';
```

- **Langkah per kategori (kontrak 5).** `langkahUntuk('BERKALA')` dan
  `('RESPONSIF')` mengembalikan `[1,2,3,6]` — kepanitiaan (4) & Gantt (5) hanya
  untuk TERJADWAL. Langkah 2 selalu ada tetapi ISINYA berbeda: BERKALA memakai
  form pola pengulangan, bukan penjadwalan; UI menyembunyikan cek konflik.
- **Gating (kontrak 1).** `bolehLanjut(draft, nomor)` → langkah itu valid.
  Langkah 4–6 milik T-069; di sini keduanya dianggap valid supaya navigasi tidak
  tertahan aturan yang belum ditulis.
- **Durasi (kontrak 4).** `pesanDurasi(12)` = `"Persiapan 12 hari — minimal 15
  hari."` Angka aktual, bukan "durasi tidak valid".
- Aturan 15–45 hari, urutan tanggal, tanggal 'YYYY-MM-DD' — dibaca dari
  `schema.ts`, sama persis dengan yang ditegakkan database.

---

## 3. Cek konflik real-time (kontrak 3)

```ts
const badan = permintaanCekKonflik(draft);   // { mulai, selesai, exclude_id? } | null
if (badan) {
  const r = await fetch('/api/proker/cek-konflik', { method: 'POST', body: JSON.stringify(badan) });
  // tampilkan InlineAlert MERAH (bukan modal) berisi daftar bentrok; sebelum Lanjut
}
```

`permintaanCekKonflik` mengembalikan `null` untuk BERKALA (bebas bentrok) dan
RESPONSIF (tidak mengunci), serta selama tanggal TERJADWAL belum lengkap. Rentang
yang dicek adalah **mulai persiapan … hari terakhir acara** (INV-11), bukan hanya
hari-H.

Endpoint `POST /api/proker/cek-konflik` sudah ada (T-065-UI) dan memanggil
`cekKonflik()` di `lib/proker/service.ts`; targetnya < 500 ms sudah terukur
(PROKER_CONTRACT §9). Wizard tinggal memanggilnya — jangan menulis pengecekan
sendiri di klien.

**Peringatan muncul SEBELUM Lanjut** ("Selesai bila" #1): setelah tanggal dipilih
di Langkah 2, jalankan cek; bila ada bentrok, tampilkan alert dan biarkan draft
tetap tersimpan, tetapi jangan naikkan langkah sampai user memilih tanggal lain
atau memahami konfliknya. Ini bukan penghalang keras di server (draft boleh
bentrok) — penegakan sesungguhnya di approval (INV-09).

---

## 4. Penyimpanan draft — server, lewat `draft-store.ts`

Draft milik lane data; route handler `app/api/proker/draft/route.ts` (lane ui)
tipis dan memakai helper K-02:

```ts
import { sukses, gagal } from '@/lib/http/respond';
import { ambilDraft, simpanDraft, hapusDraft, STATUS_GAGAL } from '@/lib/proker/draft-store';

// GET  → sukses(draft | null)            (ambilDraft, tanpa tx)
// PUT  → withAuditContext → simpanDraft(tx, konteks, data, langkah)
// DELETE → withAuditContext → hapusDraft(tx, konteks)
```

- **Satu draft per pengguna per periode** (UNIQUE di migrasi 020). `simpanDraft`
  meng-UPSERT: menyimpan tiap perpindahan langkah menimpa baris yang sama.
- **`user_id` dari sesi, tidak pernah dari badan.** Draft pribadi (RLS
  `user_id = auth.uid()`); menerima user_id dari klien membuka jalan membaca
  draft orang lain.
- **Pulih setelah ditinggal** ("Selesai bila" #2): `WizardShell` saat dibuka
  memanggil GET; bila draft ada, isi ulang seluruh medan dan lompat ke
  `draft.langkah`.
- **Setelah submit** (T-069): panggil `hapusDraft` supaya wizard berikutnya
  bersih.
- **Kenapa tabel sendiri, bukan baris `proker` DRAFT:** CHECK proker
  (`terjadwal_wajib_tanggal`, `durasi_persiapan_15_45`) menyala pada TERJADWAL
  tanpa peduli status, jadi draft separuh jadi ditolak database. Draft hidup di
  `proker_draft` sebagai JSONB parsial; baris `proker` sungguhan baru lahir saat
  submit.

`WizardDraft` (bentuk `data`): seluruh medan opsional — `nama`, `kategori`,
`deskripsi`, `tujuan`, `sasaran`, `estimasi_peserta`, `penanggung_jawab`,
`departemen_id`, `tanggal_*`, `pola_ulang`, `estimasi_anggaran`, `sumber_dana`,
`kebutuhan_ruangan`, `kebutuhan_barang`. Dua terakhir tidak punya kolom `proker`
dan dibuang saat submit — hanya dipulihkan sebagai isian.

---

## 5. Verifikasi yang sudah dijalankan

```
npm run test -- wizard-state        40 lulus
npm run db:test                     … lulus (migrasi 020 dari database kosong)
```

Ditambah smoke `draft-store` terhadap database sungguhan (transaksi di-ROLLBACK):
GET-kosong `null`, simpan L1, UPSERT L2 (tetap 1 baris, `langkah` = 2), hapus
(1 terhapus), GET-pasca `null`, simpan tanpa periode aktif ditolak
`TIDAK_ADA_PERIODE_AKTIF`.
