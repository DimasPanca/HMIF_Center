# Kontrak Submit Wizard Proker (langkah 4–6) — T-069

Batas antara lane `data` dan lane `ui` untuk submit wizard proker. Lane data
memiliki model langkah 4–5, validasi, persistensi rencana, dan service submit
transaksional; lane ui merakit tiga komponen langkah dan route tipisnya.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-069` (pemilik `lib/proker/**`, `supabase/**`) |
| **Dibaca oleh** | lane `ui` — `T-069` (komponen + route) |
| **Gate** | `npm run test:e2e -- wizard-proker-4-6` (milik lane data, sudah ada) |
| **Sumber** | ADR-056 · PRD F-5.3 (Langkah 4–6), F-8.1 · USER_FLOW §4.1 |

---

## 0. Keputusan route — `POST /api/proker/submit`, BUKAN `/[id]/submit`

Kontrak T-069 menyebut `app/api/proker/[id]/submit/route.ts`, tetapi **wizard
belum punya proker_id sebelum submit** — prokernya justru LAHIR dari submit.
Jalur `/[id]/submit` menuntut dua kemungkinan, keduanya buruk:

- membuat proker DRAFT lebih dulu (request 1) lalu mengajukannya (request 2) —
  dua request non-atomik; bila request 2 gagal, tertinggal **proker DRAFT
  yatim**; atau
- memakai id draft sebagai `[id]` — membebani route dengan makna yang bukan
  proker.

**Keputusan (dicatat di ADR-056 §4):** submit adalah **satu request atomik**
tanpa id, mengonsumsi draft server milik sesi:

```
POST /api/proker/submit
```

Berkas yang dibuat lane ui menjadi **`app/api/proker/submit/route.ts`** (bukan
`app/api/proker/[id]/submit/route.ts`). Seluruh operasi — baca draft, validasi,
buat proker, simpan rencana, hapus draft — terjadi dalam satu `withAuditContext`.

---

## 1. Route handler (lane ui) — tipis, K-02

```ts
import { NextResponse } from 'next/server';
import { sukses, gagal } from '@/lib/http/respond';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { konteksSaatIni } from '@/lib/auth/guard';
import { submitWizard, STATUS_GAGAL } from '@/lib/proker/submit';

export async function POST(req: Request) {
  const konteks = await konteksSaatIni();
  if (!konteks?.sesi.isActive) return gagal('TIDAK_LOGIN', 'Sesi tidak aktif.', { status: 401 });

  const hasil = await withAuditContext(req, (tx) => submitWizard(tx, konteks));

  if (!hasil.ok) {
    return gagal(hasil.kode, hasil.pesan, { status: STATUS_GAGAL[hasil.kode], details: hasil.isu });
  }
  return sukses(hasil.nilai, { status: 201 });
}
```

Route TIDAK menulis SQL, TIDAK menentukan status, TIDAK memvalidasi. Semua di
`submitWizard`.

### Tanda tangan

```ts
submitWizard(tx: TxKlien, konteks: Konteks): Promise<HasilSubmit>
```

### Hasil sukses — `sukses(nilai, { status: 201 })`

```ts
{ ok: true, data: { proker_id: string; status: 'MENUNGGU_APPROVAL' | 'DISETUJUI' } }
```

### Kode kegagalan → HTTP (K-02/K-03) — dari `STATUS_GAGAL`

| kode | HTTP | kapan |
|---|---|---|
| `TIDAK_ADA_PERIODE_AKTIF` | 409 | tidak ada periode aktif |
| `DRAFT_KOSONG` | 409 | tidak ada draft untuk diajukan |
| `TIDAK_VALID` | 422 | langkah 1–3 / kepanitiaan / gantt belum memenuhi aturan (`details` = `{path,pesan}[]`) |
| `DI_LUAR_LINGKUP` | 403 | proker bukan milik departemen pengguna |
| `ANGGOTA_TIDAK_SAH` | 422 | ada anggota kepanitiaan yang bukan pengurus aktif |

Badan gagal K-02: `{ ok: false, error: { code, message, details? } }`.

---

## 2. Model langkah 4–5 di `wizard-state.ts` — dipakai KLIEN

Modul murni, tanpa `db`. Komponen langkah mengimpornya untuk menyalakan/mematikan
tombol Lanjut seketika. Validasi yang sama berjalan lagi di server saat submit
(K-04).

```ts
import {
  validasiLangkah, bolehLanjut,          // gating langkah 4 & 5 (TERJADWAL)
  terapkanLangkah,                        // merge patch → draft (null menghapus)
  keRencana,                              // draft → { kepanitiaan, gantt } (dipakai server)
  type DraftKepanitiaan, type DraftGantt, // bentuk LONGGAR untuk state wizard
} from '@/lib/proker/wizard-state';
```

- **Langkah 4 & 5 hanya untuk TERJADWAL.** `langkahUntuk('BERKALA')` /
  `('RESPONSIF')` = `[1,2,3,6]`. Untuk kategori itu `validasiLangkah(draft, 4)`
  dan `(…, 5)` selalu OK (langkahnya dilewati).
- **Gating (ADR-056 §1).** Langkah 4 TERJADWAL valid bila ada `ketua_pelaksana`
  dan minimal satu divisi bernama unik. Langkah 5 valid bila ada minimal satu
  fase dengan **minimal satu task** (di grup mana pun).
- **Langkah 6** tak punya isian sendiri; `validasiLangkah(…, 6)` selalu OK.
  Kelengkapan menyeluruh ditegakkan submit.

### Bentuk draft (LONGGAR — boleh separuh jadi)

```ts
draft.kepanitiaan?: {
  nama_acara?: string;          // kosong → memakai nama proker saat materialisasi (T-070)
  tema?: string;
  ketua_pelaksana?: string;     // app_user id — BEBAS lintas departemen (PRD F-8.1)
  wakil_pelaksana?: string;
  sekretaris?: string;
  bendahara?: string;
  target_anggaran?: number;
  divisi?: {
    nama?: string;              // unik dalam satu acara
    koordinator_id?: string;
    warna?: string;            // #RRGGBB
    anggota?: string[];        // app_user id
  }[];
};

draft.gantt?: {
  judul?: string;
  groups?: {
    nama?: string;             // fase: Persiapan / Pelaksanaan / Evaluasi (atau bebas)
    warna?: string;            // #RRGGBB
    pj_nama?: string;
    tasks?: {
      nama?: string;
      tanggal_mulai?: string;   // YYYY-MM-DD
      tanggal_selesai?: string; // >= mulai
      progres?: number;         // 0–100
      assignee_id?: string;
      is_milestone?: boolean;
    }[];
  }[];
};
```

Draft disimpan/diambil lewat `PUT/GET /api/proker/draft` yang **sudah ada**
(T-068). Kedua medan baru ikut tersimpan otomatis — `WizardShell` tinggal mem-
`terapkanLangkah` seperti langkah 1–3.

- **Ketua Pelaksana & anggota dari SELURUH pengurus aktif** (PRD F-8.1), bebas
  departemen. Sumber daftar: sudah disediakan halaman `/proker/baru` sebagai prop
  `pengurus` (T-068-UI). Keaktifannya diperiksa lagi di server saat submit
  (`ANGGOTA_TIDAK_SAH`).
- **Langkah 6 = ringkasan + cek konflik final + tombol Ajukan.** Cek konflik
  memakai `POST /api/proker/cek-konflik` yang sudah ada (T-065), badannya dari
  `permintaanCekKonflik(draft)`. Tombol Ajukan memanggil `POST /api/proker/submit`.

---

## 3. Setelah submit

- **Draft dihapus** otomatis oleh `submitWizard` (dalam transaksi yang sama).
  UI cukup mengarahkan ke halaman proker/daftar setelah `201`.
- **Kalender BELUM terkunci** (INV-10). `proker_lock` tidak disentuh submit —
  kunci hanya lahir dari approval (`setujui_proker`, T-070). Berlaku juga untuk
  BERKALA yang langsung DISETUJUI (BERKALA bebas bentrok).
- **Kepanitiaan & Gantt belum dibentuk.** Keduanya disimpan sebagai RENCANA di
  `proker_rencana` (migrasi 021), dan dimaterialisasi menjadi
  `kepanitiaan`/`divisi`/`gantt_*` sungguhan oleh `bentukKepanitiaanOtomatis()`
  saat approval (T-070). Kontrak T-069 "Jangan": jangan buat kepanitiaan di sini.

---

## 4. `data-testid` yang dipakai gate `e2e/wizard-proker-4-6.spec.ts`

Wizard langkah 1–3 memakai testid dari `WIZARD_PROKER_CONTRACT.md`. Langkah 4–6
menambah:

```
wizard-field-ketua-pelaksana     pemilih Ketua Pelaksana (Langkah 4)
wizard-divisi-tambah             tombol tambah divisi (Langkah 4)
wizard-field-divisi-nama         input nama divisi (satu per divisi; boleh pakai .nth())
wizard-gantt-task-tambah         tombol tambah task Gantt (Langkah 5)
wizard-field-task-nama           input nama task
wizard-field-task-mulai          input tanggal mulai task
wizard-field-task-selesai        input tanggal selesai task
wizard-ajukan                    tombol Ajukan (Langkah 6)
wizard-submit-sukses             elemen/toast yang muncul setelah submit 201
```

Nama-nama USULAN; bila ada yang lebih cocok, angkat di sync point dan gate ini
yang menyesuaikan. Gate **SKIP** (bukan gagal) sampai `/proker/baru` memuat
komponen langkah 4–6.

---

## 5. Verifikasi yang sudah dijalankan lane data

```
npm run test -- wizard-state        (validasi langkah 4-6, keRencana)
npm run test -- submit              (status per kategori, tanpa proker_lock, hapus draft)
npm run db:migrate                  (021_proker_rencana dari database kosong)
```

Perilaku submit end-to-end (melalui UI) terbukti oleh gate ini SETELAH T-069-UI
tersedia — pola gate-first RENCANA §8.1, sama seperti T-067/T-068.
