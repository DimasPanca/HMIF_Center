# HANDOFF-DATA.md — apa yang perlu diketahui sesi berikutnya

Berkas ini untuk agent lane `data` yang memulai sesi baru. Isinya **hanya**
hal-hal yang tidak dapat ditemukan di tempat lain: keputusan yang lahir di
percakapan, jebakan lingkungan yang sudah terlanjur ditemukan, dan arah yang
diminta pemilik produk.

Yang **tidak** ditulis di sini karena sudah ada tempatnya:

| Pertanyaan | Jawabannya di |
|---|---|
| Aturan main lane, batas berkas | `CLAUDE.md`, `docs/ai/PARALLEL_PROTOCOL.md` |
| Task berikutnya apa | `npx tsx scripts/lane.ts status data` |
| Kontrak sebuah task | `docs/ai/tasks/P{fase}-*.md` |
| Kenapa sebuah kode begitu | komentar di berkasnya, dan ADR terkait |
| Apa yang sudah dikerjakan | `git log --oneline` — badan commit memuat alasannya |

**Perbarui berkas ini** setiap kali ada keputusan yang tidak punya rumah lain.
Berkas yang kedaluwarsa lebih berbahaya daripada tidak ada berkas sama sekali:
ia dipercaya.

---

## 1. Keadaan per 2026-09-04

Lane `data` **33/33 DONE**. Tidak ada yang READY — bukan karena pekerjaan habis,
melainkan karena pembagian task ke lane belum dilanjutkan. Lihat §2.

Aplikasi **sudah dapat di-login**. Gate `test:e2e -- login` hijau 31 lulus,
1 sengaja dilewati, dan stabil pada tiga jalan berturut-turut.

---

## 2. Pembagian task ke lane baru separuh jalan

`PEMBAGIAN` di `scripts/lane.ts` hanya pernah menutup gelombang pertama —
fondasi fase 0-2 plus T-045 dan T-046. **73 task lain belum masuk lane mana
pun.**

Sebagian besar tidak dapat diberikan utuh ke satu lane. Diperiksa lewat berkas
yang dibuat tiap kontrak: mayoritas **campuran** — satu task membuat service di
`lib/` sekaligus halaman di `app/`. Contohnya T-065:

```
Buat: lib/proker/{service,schema,status}.ts        <- lane data
      app/api/proker/{route,[id],cek-konflik,kalender}/route.ts   <- lane ui
```

Pola yang sudah terbukti untuk kasus begini adalah **T-045**: lane data menulis
fungsinya, menuliskan tanda tangannya di sebuah berkas kontrak
(`docs/ai/AUTH_CONTRACT.md`), lalu lane ui memanggilnya dari route handler.
Gate E2E-nya milik lane data, dan lane data pula yang menutupnya setelah merge —
karena worktree lane ui sengaja tidak memegang kredensial penuh.

**Pembelahan per task adalah keputusan manusia di sync point, bukan keputusan
agent.** Yang boleh dikerjakan agent tanpa bertanya hanya task yang seluruh
berkasnya jatuh di satu lane.

---

## 3. Arah yang diminta pemilik produk

Persuratan, TOR, Proposal, dan LPJ **ditunda**. Alasannya bukan teknis: ketiga
dokumen besar itu panjang dan butuh sesi pembahasan tersendiri, sementara yang
dibutuhkan sekarang adalah aplikasinya berjalan pada fitur lain lebih dulu.

Template-nya sendiri sudah siap (T-006 selesai, sebelas berkas lulus dry run),
jadi penundaan ini tidak memblokir apa pun — ia hanya menggeser urutan.

**Urutan yang diminta:** fitur non-surat dulu. Yang paling membuka jalan:

1. **T-065 separuh data** — `lib/proker/{service,schema,status}.ts`. Inti
   Program Kerja beserta anti-bentrok kalender. Butuh T-046 (selesai) dan T-033
   (selesai). Sesudahnya tulis kontraknya seperti `AUTH_CONTRACT.md` untuk lane ui.
2. **T-066** — uji konkurensi anti-bentrok. Seluruh berkasnya milik lane data.
3. **T-050, T-047, T-048** — periode dan manajemen user; campuran, perlu dibelah.

---

## 4. Jebakan lingkungan yang sudah ditemukan

Empat hal ini sudah pernah memakan waktu. Jangan mengulanginya.

### 4.1 Ada DUA pembatas percobaan login

Satu milik aplikasi (`lib/auth/rate-limit.ts`, 5 percobaan / 15 menit per
email+IP), satu lagi milik Supabase sendiri di depan endpoint sign-in-nya.

Gate login melakukan puluhan sign-in tiap jalan. Menjalankannya berulang dalam
waktu singkat akan menabrak pembatas Supabase, dan **login dengan password yang
benar pun ditolak**. Gejalanya menyesatkan: test yang gagal berpindah-pindah,
dan yang tertuduh biasanya halaman login.

Bila pesannya menyebut *"dari jaringan ini"*, itu pembatas Supabase — tunggu
beberapa menit sebelum menyalahkan kode.

### 4.2 `db:test` dan fixture E2E saling meniadakan

`seed:e2e-auth` meninggalkan satu periode berstatus `AKTIF` karena login memang
membutuhkannya. `periode_hanya_satu_aktif` mengizinkan paling banyak satu.

Sudah diperbaiki di `scripts/db-test.ts`: runner mengarsipkan periode aktif di
dalam transaksi yang tetap di-ROLLBACK, jadi fixture utuh dan test melihat
keadaan awal yang sama. **Jangan** mengembalikannya menjadi asumsi "database
kosong" — 18 dari 22 berkas pernah gagal karenanya, tanpa satu pun menyebut
sebab sebenarnya.

Pelajaran yang sama berlaku umum: **assertion yang menghitung seluruh isi sebuah
tabel bersama akan pecah begitu ada lalu lintas sungguhan.** `900_integrasi.sql`
kena persis itu dan kini dibatasi pada periode miliknya sendiri.

### 4.3 E2E dijalankan dua worker, bukan setengah jumlah core

Yang diperebutkan bukan CPU melainkan tiga hal yang memang tunggal: satu dev
server yang mengkompilasi rute saat pertama diminta, satu proyek Supabase, satu
database. Pada enam worker, `waitForSelector` menunggu 30 detik untuk form yang
muncul dalam sedetik.

Alasannya tertulis di `playwright.config.ts`. Jangan dinaikkan tanpa mengukur.

### 4.4 Pola bug yang berulang: membaca env saat modul dimuat

Sudah tiga kali: `lib/storage/index.ts`, `lib/storage/supabase-adapter.ts`,
`lib/db/client.ts`. Gejalanya sama tiap kali — worktree lane ui yang sengaja
tidak memegang kredensial penuh gagal bahkan untuk hal yang tidak menyentuh
kredensial itu, dan build Vercel ikut gagal.

Baca env di dalam fungsi, bukan di tingkat modul.

---

## 5. Yang masih menunggu manusia

| # | Hal | Catatan |
|---|---|---|
| 1 | Rotasi publishable key Supabase | Nilainya pernah masuk commit di GitHub. Wajib sebelum data pengurus sungguhan masuk. |
| 2 | ADR-021 masih berstatus **Usulan** | Sebelas template sudah memakainya. Perlu diterima atau ditolak. |
| 3 | Temuan 10 `TEMPLATE_MAPPING.md` | LPJ tidak punya tabel keuangan sama sekali padahal PRD F-12.1 menuntut empat bagiannya. Menambahkannya = membuat template baru, bukan membedah — pekerjaan T-093. |
| 4 | Buka sebelas template di Word | Memastikan tidak ada peringatan korupsi, dan membandingkan kop surat hasil generate dengan aslinya. |

---

## 6. Cara memulai sesi baru

Sesi baru **tidak perlu diberi ringkasan panjang**. Cukup:

```
Baca CLAUDE.md lalu docs/ai/HANDOFF-DATA.md.
Jalankan: npx tsx scripts/lane.ts status data
Lanjutkan dari situ.
```

Bila menyambung pekerjaan yang setengah jalan, tambahkan satu kalimat tentang
apa yang sedang dikerjakan — sisanya ada di `git log` dan di berkas ini.
