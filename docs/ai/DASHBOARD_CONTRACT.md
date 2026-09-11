# Kontrak Data Dashboard Kontekstual — T-077

Menetapkan bentuk respons `app/api/dashboard/route.ts` **sebelum** query agregat
ditulis (ADR-057 keputusan #5). Route milik lane `ui`; kontrak ini milik lane
`data` karena aturan lingkup dan sumber angka adalah keputusan data/otorisasi,
bukan presentasi.

| | |
|---|---|
| **Ditulis oleh** | lane `data` (aturan lingkup, sumber badge, dedup) |
| **Dibaca oleh** | lane `ui` — `T-077-UI` (`app/api/dashboard/route.ts`, `components/dashboard/*`) |
| **Gate** | `e2e/dashboard-role.spec.ts` (milik lane data; skip hingga route ada) · `scripts/bench-dashboard.ts` |
| **Sumber** | PRD F-3.2 · SYSTEM_DESIGN §4/§14 · USER_FLOW §3.1 · ADR-057 |

---

## 0. Prasyarat yang belum terpenuhi (BACA DULU)

Kontrak beku T-077 bergantung pada **T-075 dan T-060**. T-075 (Master Gantt)
ada; **T-060 (alur approval surat) belum** — `lib/surat/` kosong, `app/api/surat/`
dan halaman detail surat tidak ada (lihat ADR-057). Konsekuensinya untuk kontrak
ini: **item approval SURAT tidak boleh ditautkan** karena tujuannya 404
("Selesai bila" F-3.2: klik item *langsung membuka detail beserta tombol
Setujui/Tolak"). Aturan **destination-gating** di §4 menegakkannya.

Skema database lengkap (semua tabel ada), jadi seluruh kartu dapat *di-query*
dan mengembalikan data nyata (sering kosong sampai modulnya dibuat). Yang
membatasi bukan data, melainkan adanya **tujuan navigasi** untuk aksi.

---

## 1. Endpoint & envelope

`GET /api/dashboard` → K-02. Auth: sesi wajib (middleware); tanpa izin khusus —
setiap pengguna berhak melihat dashboard-nya. `runtime = 'nodejs'`,
`dynamic = 'force-dynamic'`, `Cache-Control: no-store`.

```ts
{ ok: true, data: {
  peran: RoleCode[],                       // role efektif pengguna pada periode aktif
  lingkup: { departemenIds: string[], userId: string },
  badgeApproval: number,                   // §4 — angka badge antrian approval
  kartu: { [kunci: string]: Kartu },       // §2 — union kartu, ter-dedup by kunci
} }
```

`Kartu` selalu memuat status ketersediaan agar UI tak menampilkan angka palsu:

```ts
type Kartu =
  | { kunci: string; panel: string; judul: string; tersedia: true;  data: unknown }
  | { kunci: string; panel: string; judul: string; tersedia: false; menunggu: string }; // mis. "T-060"
```

---

## 2. Peta role → kartu (PRD F-3.2) & dedup

Respons adalah **union kartu** dari seluruh role pengguna, di-dedup **berdasarkan
`kunci`** (objek ber-key sudah dedup secara alami). Multi-role → satu kartu per
`kunci`, kontennya dihitung dari **gabungan** hak seluruh role (lihat approval
§4). Kunci stabil di bawah ini adalah kontrak; jangan diganti.

| Role | Kartu (`kunci`) |
|---|---|
| Ketua/Wakil | `approval-antrian` · `kendala-kritis` · `keuangan-ringkas` · `aktivitas-terbaru` |
| Sekum | `approval-antrian` (lingkup surat) · `surat-terbit-bulan` · `notulensi-terakhir` · `nomor-surat-terakhir` |
| Bendum | `rab-rekap` · `nota-verifikasi` · `sisa-anggaran` · `lpj-progres` |
| Kadept | `proker-departemen` · `kanban-ringkas` · `kendala-terbuka` · `deadline-terdekat` |
| Anggota | `tugas-saya` · `deadline-terdekat` · `kendala-saya` |
| BPH | `ringkasan-departemen` · `kendala-lintas` · `statistik-kepatuhan` |
| Admin | `sistem-kesehatan` · `statistik-user` · `backup-terakhir` · `audit-terbaru` |

Catatan dedup penting: `approval-antrian` muncul untuk Ketua/Wakil DAN Sekum →
**satu** kartu. `deadline-terdekat` muncul untuk Kadept DAN Anggota → **satu**
kartu, dengan lingkup gabungan (§3). Pengguna Ketua+Sekum melihat satu
`approval-antrian`, bukan dua.

`panel` menandai kelompok layout (mis. `"ketua"`, `"admin"`) agar UI menata
Suspense per-panel; kartu bersama (`approval-antrian`, `deadline-terdekat`)
memakai `panel` role tertinggi yang memilikinya.

---

## 3. Aturan lingkup

`lingkup.departemenIds` dan `lingkup.userId` berasal dari `konteksSaatIni()`
(`lib/auth/guard.ts`) pada **periode aktif** — sumber yang sama dengan gate audit
(pola R\*).

- **Kadept — lingkup DEPARTEMEN.** Kartu `proker-departemen`, `kanban-ringkas`,
  `kendala-terbuka`, `deadline-terdekat` menyaring ke `departemen_id IN
  (lingkup.departemenIds)`. Departemen kosong → kartu kosong, bukan global.
- **Anggota — lingkup PENGGUNA.** Kartu `tugas-saya`, `kendala-saya`,
  `deadline-terdekat` menyaring ke penerima = `lingkup.userId`
  (`kanban_card.assignee`/`kendala.ditugaskan_ke`).
- **Ketua/Wakil/Sekum/Bendum/BPH/Admin — lingkup GLOBAL** untuk kartu ringkasan
  organisasi (tetap dibatasi periode aktif).
- Kartu bersama dengan lingkup berbeda antar-role (mis. `deadline-terdekat`
  Kadept=departemen vs Anggota=pengguna): pengguna multi-role memakai lingkup
  **paling luas** yang menjadi haknya (union), tetap satu kartu.

Seluruh query WAJIB dibatasi `periode_id = periode aktif` kecuali kartu lintas-
periode yang eksplisit (tidak ada di F-3.2).

---

## 4. Sumber angka badge approval (destination-gated)

Satu sumber: view **`v_antrian_approval`** (migrasi 016) yang menyatukan proker
& surat beserta `approver_roles` per baris.

```
baris badge = v_antrian_approval
  WHERE periode_id = <aktif>
    AND approver_roles && <peran pengguna>     -- overlap array: hanya yang boleh ia putuskan
    AND jenis = ANY(<JENIS_BERTUJUAN>)         -- GATING navigasi
badgeApproval = COUNT(baris badge)
kartu 'approval-antrian'.data = daftar baris badge (judul, asal, pengaju, jenis, entitas_id, revisi)
```

- **`JENIS_BERTUJUAN` = `['PROKER']` untuk saat ini.** `PROKER` punya tujuan
  `/proker/approval/[id]` (T-070/T-071-UI, ada). `SURAT` **dikecualikan** hingga
  T-060 menyediakan halaman + route approval surat; menambahkannya lebih awal
  menautkan badge ke 404 (dilarang ADR-057 & instruksi tugas).
- Konsekuensi jujur: **Sekum** (hanya approver surat) melihat `approval-antrian`
  berisi 0 sampai T-060 ada — benar, bukan bug. Kartu tetap tampil dengan badge
  0; jangan memalsukannya dengan menghitung surat yang tak bisa dibuka.
- **Setelah T-060 merged:** ubah `JENIS_BERTUJUAN` menjadi `['PROKER','SURAT']`
  dan tautkan item surat ke `/surat/approval/[id]`. Satu titik ubah.
- Klik item → `entitas_id` + `jenis` menentukan tujuan: `PROKER` →
  `/proker/approval/{entitas_id}`. Detail memuat tombol Setujui/Tolak (milik
  T-070/T-060), bukan dashboard.

Badge angka WAJIB sama dengan jumlah item yang benar-benar dapat dibuka — gate
`dashboard-role.spec.ts` membandingkannya dengan query yang sama.

---

## 5. Sumber data per kartu (skema lengkap; sebagian kosong sampai modul dibuat)

| kunci | sumber | catatan |
|---|---|---|
| `approval-antrian` | `v_antrian_approval` | §4, destination-gated |
| `kendala-kritis` | `kendala` WHERE `prioritas='KRITIS'` AND `status<>'SELESAI'` | Ketua/Wakil/BPH juga (F-3.2 #5) |
| `keuangan-ringkas` | `v_ringkasan_rab` / `rab_meta` | agregat seluruh acara aktif |
| `aktivitas-terbaru` | `audit_log` ORDER BY `created_at` DESC LIMIT n | |
| `surat-terbit-bulan` | `surat` WHERE `status='TERBIT'` bulan berjalan | kosong sampai T-060 |
| `notulensi-terakhir` | `notulensi` ORDER BY tanggal DESC | |
| `nomor-surat-terakhir` | `surat_counter` / `surat` nomor final terakhir | kosong sampai T-060 |
| `rab-rekap` / `sisa-anggaran` | `v_ringkasan_rab`, `rab_meta`, `rab_item` | |
| `nota-verifikasi` | `nota` WHERE `status='MENUNGGU_VERIFIKASI'` | |
| `lpj-progres` | `lpj` | |
| `proker-departemen` | `proker` WHERE `departemen_id IN (…)` | lingkup Kadept |
| `kanban-ringkas` / `tugas-saya` / `deadline-terdekat` | `kanban_card` | lingkup dept/pengguna |
| `kendala-terbuka` / `kendala-saya` / `kendala-lintas` | `kendala` | lingkup sesuai role |
| `ringkasan-departemen` / `statistik-kepatuhan` | `proker` + `proker_lock` | on-track vs telat |
| `sistem-kesehatan` / `statistik-user` | `app_user`, `db` | |
| `backup-terakhir` | `backup` ORDER BY `created_at` DESC | kosong sampai T-111 |
| `audit-terbaru` | `audit_log` | |

Kartu yang **datanya** belum bisa dihitung sama sekali (mis. butuh modul yang
tabelnya ada tetapi tak pernah terisi) tetap dikembalikan `tersedia:true` dengan
data kosong — kosong itu jujur. Gunakan `tersedia:false` + `menunggu` HANYA bila
kartu butuh **tujuan/aksi** yang belum ada (analog surat approval), bukan sekadar
data kosong.

---

## 6. Performa (kontrak #6 / bench)

Dashboard + Master Gantt siap interaksi **< 1,5 detik pada 4G** (`scripts/
bench-dashboard.ts`). Implikasi bentuk respons:

- Satu route mengembalikan seluruh kartu pengguna dalam **satu round-trip**
  (hindari N request per panel). Query per kartu berjalan paralel di server.
- Kartu berat (agregat RAB/kepatuhan) memakai view teragregasi (`v_ringkasan_rab`)
  bukan perhitungan per-baris di route.
- Ukur pada **build produksi** (`npm run build && npm start`); dev server tak
  pernah 1,5 detik. Bench menolak menilai bila server tak siap.
