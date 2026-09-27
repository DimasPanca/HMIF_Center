# HANDOFF.md — Apa yang perlu diketahui sesi berikutnya

**Baca ini di awal setiap sesi.** Berkas ini menyimpan hal-hal yang **tidak
dapat ditemukan di tempat lain**: keadaan riil project sekarang, keputusan yang
lahir di percakapan, jebakan lingkungan, dan langkah berikutnya yang sudah
disepakati.

Yang **tidak** ditulis di sini karena punya rumah lain:

| Pertanyaan | Jawabannya di |
|---|---|
| Aturan proses & konvensi kode | `docs/ai/AGENT_RULES.md` |
| Di mana kode apa | `docs/ai/ARCHITECTURE.md` |
| Kontrak sebuah task | `docs/ai/tasks/P{fase}-*.md` |
| Kontrak fitur (auth, notulensi, dsb.) | `docs/ai/*_CONTRACT.md` |
| Aturan bisnis / produk | `docs/PRD.md`, `docs/SYSTEM_DESIGN.md` |
| Alasan kode begitu | komentar di file + ADR terkait di `docs/adr/` |
| Riwayat pekerjaan | `git log --oneline` — badan commit berisi alasannya |

**Perbarui berkas ini setiap kali ada keputusan yang tidak punya rumah lain.**
Berkas kedaluwarsa lebih berbahaya daripada tidak ada — ia dipercaya.

---

## 1. Keadaan per 2026-09-27

Project berjalan **mode single-agent** (sebelumnya dua-lane data+ui). Konsolidasi
selesai hari ini: infrastruktur lane (`scripts/lane.ts`, `docs/ai/lanes/`,
`PARALLEL_PROTOCOL.md`, `HANDOFF-DATA.md`) dihapus. Semua file boleh disentuh
satu agent.

**~70 dari 116 task selesai.** Angka pasti: hitung sendiri dari `git log
--oneline | grep -c "^[0-9a-f]* T-"` — badan commit memuat status yang lebih
akurat daripada `tasks.json` (yang dibekukan selama fase paralel).

Aplikasi **sudah bisa login**, sudah punya kerangka navigasi
(`app/(dashboard)/layout.tsx`), dan sudah menjalankan alur inti: proker, kanban,
Gantt, dashboard, notulensi (lengkap sejak T-106 UI).

**Koreksi 2026-09-27:** versi sebelumnya berkas ini menyebut "surat" sudah
berjalan — **salah**. Seluruh rantai surat T-054…T-062 belum dikerjakan
(`lib/surat/`, `lib/documents/` masih kerangka T-011). Pemilik produk memutuskan
rantai ini dikerjakan **belakangan** (ADR-025). T-077 juga sudah punya commit
`1c3f8c8` (dengan destination-gate badge surat), bukan lagi blocked.

### Gate hijau saat konsolidasi

```
npm run verify           579 lulus  (typecheck + lint + secret-scan + unit)
npm run db:test          27/27 file lulus (SQL + RLS)
npm run test:e2e         beberapa gate skip-until-UI (dokumentasi eksplisit)
```

### Commit terakhir sebelum konsolidasi

```
afbb6ca Merge pull request #54 from DimasPanca/lane/data
b30f61d T-106 (fondasi data): notulensi rapat — service, sanitasi, DOCX, RLS, gate
0c9a20f Merge pull request #53 from DimasPanca/lane/ui
6283d6e T-106: catat blocker fondasi notulensi
9e06040 T-081: tutup checklist setelah gate integrasi
```

---

## 2. Yang paling baru selesai

### T-106 UI · notulensi rapat (2026-09-27)

Routes `app/api/notulensi/**` (daftar/buat, detail/ubah, pengurus, action item
tambah/hapus/konversi, generate DOCX), halaman `app/(dashboard)/sekretariat/
notulensi/{page,baru,[id]}`, komponen `components/notulensi/*` (editor TipTap,
daftar hadir, keputusan, action item, form). Gate `notulensi` 14/14.

Keputusan yang lahir di sini (ADR-025):
- T-106 dikerjakan mendahului T-061 atas persetujuan pemilik produk; pengecualian
  **tidak** berlaku untuk task surat/dokumen lain.
- Lingkup baca notulensi (`R*`/`CRU*`) kini ditegakkan di service.
- Skema Zod notulensi pindah ke `lib/notulensi/skema.ts` (aman untuk klien).

Sisa di luar kontrak (hapus notulensi, lampiran, pengetatan RLS SELECT) →
`docs/ai/BACKLOG.md`.

### T-106 · fondasi data notulensi

Commit `b30f61d`. 11 file dibuat/diubah, 1646 baris ditambah.

- `supabase/migrations/027_notulensi.sql` — kolom `konten_teks` + `cari_tsv`
  (tsvector STORED) untuk pencarian isi; tabel `notulensi_lampiran`; kolom
  `action_item.departemen_id`; helper `notulensi_boleh_tulis`; RLS attendance/
  action_item/lampiran/notulensi berlingkup periode+departemen dari notulensi
  induk.
- `lib/notulensi/service.ts` — daftar/detail/pencarian isi, buat & perbarui
  transaksional, daftar hadir, keputusan terpisah, action item, konversi ke
  Kanban (lock `FOR UPDATE`, anti-duplikasi), generate DOCX. Lingkup dipaksakan
  di service.
- `lib/notulensi/sanitasi.ts` — allowlist TipTap JSON (node/mark aman, href
  aman) + ekstraksi teks pencarian.
- `lib/notulensi/docx.ts` — generate DOCX dari `templates/notulensi.docx`
  (docxtemplater + pizzip).
- `docs/ai/NOTULENSI_CONTRACT.md` — bentuk data, kode→HTTP, izin per role,
  data-testid wajib.
- `e2e/notulensi.spec.ts` — gate data-owned 8 skenario, skip-until-UI.
- `supabase/tests/027_notulensi.sql` — RLS negatif: lintas-departemen, BPH,
  periode bertentangan, multi-role sah, himpunan hanya pimpinan/Sekum.
- `lib/notulensi/__tests__/notulensi.test.ts` — unit sanitasi/ekstraksi/skema/
  lingkup (12 test).
- `package.json` — tambah `@tiptap/extension-{table,-row,-cell,-header,
  task-list,task-item}@3.31.0` (pin exact karena peer-dep ke `@tiptap/core`).

---

## 3. Blocker aktif

1. **Rantai surat ditunda (keputusan, bukan kebuntuan).** T-054, T-055, T-056
   READY; T-058 → T-060 → T-061 berurutan. Yang ikut menunggu: T-063, T-064,
   T-095 (TOR), T-096 (Proposal), T-105 (LPJ), T-108 (Peminjaman ruangan), dan
   T-113…T-116. Jangan terapkan pengecualian ADR-025 ke task-task ini.
2. **Daftar hadir notulensi kosong sampai T-107.** Tabel `pengurus` berisi 0
   baris; T-107 (Data pengurus) yang mengisinya, dan T-107 menunggu **T-048**
   yang baru separuh (UI blocked oleh ADR-054 berstatus *Usulan*).

---

## 4. Jebakan lingkungan yang sudah ditemukan

Tujuh hal yang tidak obvious dari kode:

1. **Koneksi app bypass RLS.** `withAuditContext()` set audit config
   (`app.ip`/`user_agent`/`periode_id`) tapi **tidak** set
   `request.jwt.claims`, jadi service **harus** memaksakan lingkup di JS. RLS
   menjaga akses langsung/authenticated saja (diuji `db:test` dengan
   `SET LOCAL ROLE authenticated`).
2. **RLS scope correlation.** Role+departemen harus di baris `user_role` yang
   **sama** — bukan pakai `my_departemen()` set yang mencampur role
   (BPH-with-dept bocor).
3. **`db:reset` menghapus akun e2e.** Setelah tiap `db:reset`, wajib
   `npm run seed:e2e-auth` sebelum jalankan test e2e.
4. **TipTap extension peer-dep exact.** Semua `@tiptap/*` harus sama versi
   `@tiptap/core` (saat ini 3.31.0). `^3.6.2` gagal `ERESOLVE`.
5. **Realtime butuh JWT.** `klien.realtime.setAuth(access_token)` +
   `onAuthStateChange` diperlukan supaya RLS aktif di realtime channel
   (`lib/realtime/use-master-gantt-realtime.ts`).
6. **Gate e2e gagal di jalan pertama pada dev server dingin.** Halaman berat
   (mis. editor TipTap) dikompilasi saat diminta pertama kali dan bisa melewati
   batas 30 dtk/test. Jalankan ulang sekali sebelum menganggapnya bug; kalau
   gagal lagi, itu nyata.
7. **Tombol toolbar editor wajib `onMouseDown={e => e.preventDefault()}`.**
   Tanpa itu tombol mencuri fokus dan TipTap memulihkannya lewat
   `requestAnimationFrame`, yang tak berjalan di tab tak terlihat — teks jatuh di
   luar node yang baru dibuat.

---

## 5. Langkah berikutnya (rekomendasi)

1. **T-048 → T-107** — selesaikan import massal (putuskan ADR-054 dulu), lalu
   Data pengurus. Ini yang membuat daftar hadir notulensi benar-benar berisi.
2. **Task di luar rantai surat** (21 task, mis. T-083 peringatan deadline,
   T-084…T-094 acara/RAB, T-097…T-104 nota, T-110…T-112 backup) — pilih yang
   `depends_on`-nya DONE.
3. **Rantai surat** T-054/T-055/T-056 → T-058 → T-060 → T-061 → T-062, lalu
   turunannya (ADR-025).

`tasks.json` tidak bisa dipercaya untuk status task lama (dibekukan selama fase
paralel): cek `git log --oneline | grep " T-0XX"` sebelum menganggap sebuah
dependency DONE. Baca kontrak di `docs/ai/tasks/P{fase}-*.md`.
