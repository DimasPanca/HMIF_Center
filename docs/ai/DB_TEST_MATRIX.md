# Matriks Test Database

Memetakan 30 invariant `AGENT_RULES` §2 ke test yang membuktikannya.

Gunanya satu: **membedakan invariant yang benar-benar dijaga dari yang baru
tertulis di dokumen.** Sebuah invariant tanpa test bukan jaminan, melainkan
niat. Karena itu kolom status di bawah tidak pernah diisi berdasarkan
pembacaan kode — hanya berdasarkan assertion yang benar-benar berjalan.

Diperbarui pada T-036. Wajib diperbarui setiap kali test baru ditambahkan.

## Cara membaca status

| Status | Artinya |
|---|---|
| **TERBUKTI** | Ada assertion yang gagal bila invariantnya dilanggar. |
| **SEBAGIAN** | Satu sisi terbukti, sisi lain belum. Sisi yang belum disebutkan eksplisit. |
| **CELAH** | Belum ada test sama sekali. Kolom pemilik menyebut task yang akan menutupnya. |

Lapisan penegakan disingkat: **DB** = constraint atau fungsi database,
**RLS** = row level security, **APP** = guard di service TypeScript,
**UI** = perilaku antarmuka.

---

## Otorisasi dan audit (INV-01 … INV-08)

| # | Inti invariant | Lapis | Status | Bukti / pemilik celah |
|---|---|---|---|---|
| INV-01 | Otorisasi dua lapis independen: RLS + guard aplikasi | RLS+APP | **SEBAGIAN** | Lapis RLS **TERBUKTI**: `015c_rls_negatif.sql` menguji sebagai role `authenticated` sungguhan, dan 4 uji mutasi membuktikannya tidak sia-sia (lihat [RLS_TEST_MATRIX](RLS_TEST_MATRIX.md)). **Belum ada:** lapis guard aplikasi. T-045 dan seterusnya |
| INV-02 | Klien tidak pernah menentukan role | RLS+APP | **SEBAGIAN** | `015a_rls_helpers.sql` menyisipkan klaim `role: ADMIN` palsu ke JWT dan memastikan `auth_roles()` tetap kosong; `015c_rls_negatif.sql` membuktikan Anggota tidak dapat menyisipkan `user_role` untuk dirinya sendiri. **Belum terbukti:** guard di sisi service. T-045 dan seterusnya |
| INV-03 | `BPH` tidak pernah memberi hak tulis | RLS | **TERBUKTI** | `015c_rls_negatif.sql` membuktikan BPH ditolak menulis di enam titik dan tetap dapat membaca; juga bahwa pengguna `ANGGOTA`+`BPH` tetap dapat menulis sebagai Anggota. `rls-coverage.ts` menolak policy tulis yang menyebut `'BPH'`. Mutasi menambahkan BPH ke `departemen_update` tertangkap |
| INV-04 | `BPH` tidak muncul sebagai approver | RLS+APP | **CELAH** | T-039 |
| INV-05 | Approver proker = Ketua/Wakil; surat = Ketua/Wakil/Sekum | RLS | **TERBUKTI** | `015c_rls_negatif.sql` menguji lewat fungsi **dan** menyerang `proker_lock` serta `surat_counter` langsung. Uji mutasi menambahkan Sekum ke `proker_lock_insert` tertangkap — versi awal test ini LOLOS, lihat catatan 8 |
| INV-06 | `audit_log` append-only | DB | **TERBUKTI** | `013_audit.sql` menolak UPDATE, DELETE, dan TRUNCATE bahkan dari pemilik database; `014c_audit_fn.sql` memastikan trigger audit tidak membuka celah untuk menyuntingnya |
| INV-07 | Setiap operasi tulis meninggalkan baris audit | DB | **SEBAGIAN** | `014c_audit_fn.sql` membuktikan isi barisnya benar dan konteks kosong tidak menjatuhkan mutasi; `900_integrasi.sql` memastikan proker, surat, dan proker_lock tercatat. **Belum terbukti:** hanya 12 tabel yang dipasangi trigger, jadi tulisan ke tabel lain tidak tercatat sama sekali. Lihat catatan 2 |
| INV-08 | Semua data ber-scope periode | DB+RLS | **SEBAGIAN** | `011_sekretariat.sql` (NIM unik per periode), `014b_surat_fn.sql` (counter direset per periode), dan `015a_rls_helpers.sql` (peran periode ARSIP tidak terbawa ke periode aktif). **Belum terbukti:** `my_divisi()` dan `my_kepanitiaan()` sengaja tidak menyaring periode — lihat catatan 5. T-038 |

## Anti-bentrok proker (INV-09 … INV-13)

| # | Inti invariant | Lapis | Status | Bukti / pemilik celah |
|---|---|---|---|---|
| INV-09 | Bentrok ditolak `EXCLUDE USING gist`, bukan logika aplikasi | DB | **TERBUKTI** | `000_smoke.sql` dan `001_extensions.sql` memastikan `btree_gist` tersedia; `004_proker_lock.sql` menguji constraint-nya langsung; `014a_proker_fn.sql` menguji lewat `setujui_proker`; `900_integrasi.sql` menguji dalam alur nyata. Terbukti tidak sia-sia lewat mutasi pada T-023 |
| INV-10 | Hanya `TERJADWAL` yang mengunci kalender | DB | **TERBUKTI** | `014a_proker_fn.sql` memastikan BERKALA dan RESPONSIF disetujui tanpa membuat baris `proker_lock`; `900_integrasi.sql` memastikan TERJADWAL memang mengunci |
| INV-11 | Rentang terkunci inklusif di kedua ujung | DB | **TERBUKTI** | `004_proker_lock.sql`, `014a_proker_fn.sql`, dan `900_integrasi.sql` memeriksa `upper(rentang) = tanggal_hari_h_selesai + 1` — hari terakhir acara ikut terkunci |
| INV-12 | Durasi persiapan wajib 15–45 hari | DB | **TERBUKTI** | `004_proker_lock.sql` menolak 14 dan 46 hari lewat CHECK constraint |
| INV-13 | Revisi mempertahankan kunci lama sampai diputuskan | DB | **TERBUKTI** | `014a_proker_fn.sql` memastikan `DELETE` kunci lama ikut dibatalkan saat INSERT-nya gagal; `900_integrasi.sql` memastikan kunci proker pertama utuh setelah approval proker lain ditolak. Terbukti tidak sia-sia lewat mutasi pada T-033 |

## Penomoran surat (INV-14 … INV-17)

| # | Inti invariant | Lapis | Status | Bukti / pemilik celah |
|---|---|---|---|---|
| INV-14 | Nomor dialokasikan saat approval, bukan saat draft | DB | **TERBUKTI** | `014b_surat_fn.sql` menolak alokasi untuk surat `DRAFT` dan memastikan counter tidak naik akibat penolakan itu; `009_surat.sql` memastikan kolom nomor boleh NULL selama draft |
| INV-15 | Alokasi hanya lewat fungsi database, dengan advisory lock per periode | DB | **SEBAGIAN** | `014b_surat_fn.sql` membuktikan sisi kebenaran: format nomor, idempotensi terhadap retry, urutan pada batch, penolakan batch > 50. **Belum terbukti oleh test yang tersimpan:** serialisasi di bawah beban serentak. Lihat catatan 3 |
| INV-16 | Nomor yang dibatalkan tidak didaur ulang | DB | **TERBUKTI** | `900_integrasi.sql` membatalkan surat bernomor 001 lalu memastikan surat berikutnya tetap memperoleh 002; `009_surat.sql` menolak counter bernilai negatif |
| INV-17 | Counter direset ke `nomor_surat_awal` pada periode baru | DB | **TERBUKTI** | `014b_surat_fn.sql` memastikan surat pertama periode baru kembali ke 001 walau periode lama sudah di 32, dan `nomor_surat_awal = 503` menghasilkan `503` |

## Pipeline gambar (INV-18 … INV-24)

| # | Inti invariant | Lapis | Status | Bukti / pemilik celah |
|---|---|---|---|---|
| INV-18 | Tiga turunan dibuat paralel dari satu sumber decode | APP | **CELAH** | T-097, T-098 |
| INV-19 | Unduhan selalu `master_path`, tanpa rekompresi | APP | **SEBAGIAN** | `lib/storage/__tests__/adapter.test.ts` membuktikan pada bucket dev sungguhan bahwa master nota berada di bucket privat, TIDAK dapat diambil lewat URL publik, dan hanya terbuka lewat signed URL 5 menit. `keys.ts` menolak permintaan menyimpannya ke bucket publik. **Belum terbukti:** endpoint unduh selalu memilih master dan tidak merekompresi. T-098 |
| INV-20 | EXIF dirotasi sebelum resize, metadata sensitif dihapus sesudahnya | APP | **CELAH** | T-097 |
| INV-21 | MIME divalidasi lewat magic bytes; nama file storage memakai UUID | APP+DB | **SEBAGIAN** | `image.storage_uuid` bersifat `UNIQUE` dan diisi UUID, bukan nama dari pengguna. **Belum terbukti:** validasi magic bytes. T-097 |
| INV-22 | Tidak pernah upscale; aspect ratio tidak dipaksa | DB | **TERBUKTI** | `008_nota.sql` menolak baris `image` yang master-nya lebih besar dari sumbernya |
| INV-23 | Pemrosesan gagal: hapus file parsial, jangan buat record | APP | **CELAH** | T-098 |
| INV-24 | `NotaImage` tidak punya varian `master` | UI | **CELAH** | Lane `ui` |

## RAB, nota, dan LPJ (INV-25 … INV-30)

| # | Inti invariant | Lapis | Status | Bukti / pemilik celah |
|---|---|---|---|---|
| INV-25 | Excel adalah keluaran, bukan masukan utama | APP | **CELAH** | Fase 5 |
| INV-26 | `jumlah` disimpan dua kali: teks dan numerik | DB | **TERBUKTI** | `007_rab.sql` dan `900_integrasi.sql` memastikan `jumlah_teks` tersimpan apa adanya (`'150 kotak'`) agar ekspor Excel identik dengan arsip, sementara `jumlah_numerik` dipakai berhitung |
| INV-27 | Kalkulasi klien wajib diverifikasi ulang di server | APP | **CELAH** | Fase 5 |
| INV-28 | Total alokasi nota sama dengan total nota | DB+APP | **SEBAGIAN** | `008_nota.sql` dan `900_integrasi.sql` membuktikan **batas atas** dijaga trigger `cek_total_alokasi`, termasuk lewat jalur alokasi luar RAB. **Belum terbukti:** kesamaan persis saat submit, yang memang tugas service (ADR-006) |
| INV-29 | RAB terkunci menolak perubahan di level RLS | RLS | **TERBUKTI** | `015c_rls_negatif.sql` menguji ketiga keadaan: `DRAFT` boleh, `DISETUJUI` ditolak, dibuka kembali boleh lagi. Mutasi melepas `rab_terbuka()` dari policy tertangkap |
| INV-30 | Lintas divisi: baca boleh, tulis tidak | RLS+UI | **SEBAGIAN** | `015c_rls_negatif.sql` membuktikan sisi database: anggota membaca RAB divisi lain dalam acara sama, dan UPDATE-nya mengubah **0 baris** tanpa error. Mutasi mempersempit `rab_item_select` tertangkap. **Belum terbukti:** tombol edit tidak dirender di antarmuka — lane `ui` |

---

## Catatan

### 1. INV-05 tidak dijaga di lapisan mana pun saat ini

`setujui_proker` dan `alokasi_nomor_surat` menerima `p_approver_id` apa adanya.
Keduanya tidak menyentuh tabel `user_role` sama sekali — diperiksa dengan
mencari rujukan `user_role` di `014a_functions_proker.sql` dan
`014b_functions_surat.sql`: nol pada keduanya.

Artinya, hari ini id pengguna mana pun dapat dicatat sebagai penyetuju, dan
`900_integrasi.sql` yang memakai Ketua dan Sekum sebagai approver hanya
mencerminkan kebiasaan pemanggilnya, bukan aturan yang ditegakkan.

Ini bukan cacat pada fungsinya. Penegakan role memang direncanakan di RLS
(T-038, T-039) dan guard aplikasi. Yang berbahaya adalah membaca
`900_integrasi.sql` lalu menyimpulkan INV-05 sudah aman. Selama baris INV-05
di atas masih **CELAH**, jangan menganggapnya terjaga.

### 2. Hanya 12 tabel yang diaudit

Daftar tabel teraudit ditetapkan SYSTEM_DESIGN §14.1 dan diperiksa jumlahnya
oleh `014c_audit_fn.sql` (dihitung dari fungsi `fn_audit`, bukan dari nama
trigger, supaya tidak tertukar dengan trigger append-only milik migrasi 013).

Tabel bervolume tinggi seperti `kanban_card` dan `gantt_task` sengaja
dikecualikan agar jejak audit tidak tenggelam oleh perubahan remeh. Karena
itu INV-07 dibaca sebagai "setiap operasi tulis **pada entitas yang diaudit**".
Bila kelak sebuah tabel perlu masuk daftar, tambahkan di 014c dan naikkan
angka `12` pada test tersebut.

### 3. Serialisasi INV-15 belum punya test tersimpan

Sisi kebenaran penomoran diuji `014b_surat_fn.sql`. Sisi serialisasinya tidak
dapat diuji dari satu koneksi, sehingga tidak ada di berkas test mana pun.

Pada T-034 hal itu diuji sekali secara ad hoc dengan 20 approval serentak
lewat transaction pooler nyata, terhadap empat varian fungsi:

| varian | hasil |
|---|---|
| pola atomik + advisory lock | 20 nomor unik berurutan |
| pola atomik tanpa lock | 20 nomor unik berurutan |
| pola baca-lalu-tulis tanpa lock | 18 dari 20 ditolak index unik parsial |
| pola baca-lalu-tulis + lock | 20 nomor unik berurutan |

Kesimpulannya: yang menanggung beban harian adalah bentuk
`UPDATE ... SET n = n + 1 RETURNING`; index unik parsial
`surat_nomor_unik_per_periode` adalah benteng terakhir; advisory lock
melindungi dari refactor yang memecah keatomikan `UPDATE` itu.

Pengujian itu **tidak tersimpan sebagai test**. T-057 bertugas membuatnya
permanen. Sampai itu selesai, INV-15 tetap **SEBAGIAN**.

### 4. Test yang sudah dibuktikan tidak sia-sia

Test hijau belum tentu menguji apa pun. Tiga belas test kritis dibuktikan lewat
mutasi — kodenya sengaja dirusak untuk memastikan testnya berteriak:

| Yang dirusak | Test yang menangkap | Pesan gagalnya |
|---|---|---|
| `EXCLUDE` constraint dilemahkan (T-023) | `004_proker_lock.sql` | proker bertabrakan diterima |
| `DELETE` dikeluarkan dari blok exception (T-033) | `014a_proker_fn.sql` | kunci lama hilang saat revisi ditolak |
| `NULLIF` dihapus dari `app.ip` (T-035) | `014c_audit_fn.sql` | `invalid input syntax for type inet: ""` |
| Penangkap error dihapus dari `konteks_user_id` (T-035) | `014c_audit_fn.sql` | `invalid input syntax for type json` |
| `DELETE FROM proker_lock` dilumpuhkan di `lepas_kunci_selesai` (T-036) | `900_integrasi.sql` | kunci tidak dilepas untuk proker selesai |
| `SEKUM` ditambahkan ke `proker_lock_insert` (T-039) | `015c_rls_negatif.sql` | Sekum berhasil mengunci kalender langsung |
| `rab_terbuka()` dilepas dari `rab_section_insert` (T-039) | `015c_rls_negatif.sql` | panitia menambah RAB setelah `DISETUJUI` |
| `BPH` ditambahkan ke `departemen_update` (T-039) | `015c_rls_negatif.sql` | BPH mengubah 1 baris departemen |
| `rab_item_select` dipersempit ke divisi sendiri (T-039) | `015c_rls_negatif.sql` | anggota tak dapat membaca RAB divisi lain |
| pemeriksaan bucket dilepas dari `put()` (T-044) | `lib/storage/__tests__/adapter.test.ts` | master nota diterima ke bucket publik |
| `getPublicUrl()` tak lagi menolak key privat (T-044) | `lib/storage/__tests__/adapter.test.ts` | URL publik diberikan untuk berkas privat |
| `my_kepanitiaan()` dikembalikan ke bentuk SYSTEM_DESIGN §5.2 (T-037) | `015a_rls_helpers.sql` | ketua pelaksana memperoleh `{}` |
| `SET search_path` dilepas dari `auth_roles()` (T-037) | `015a_rls_helpers.sql` | hanya 5 dari 6 helper terkunci |

Lakukan hal yang sama untuk setiap test invariant baru sebelum menandainya
**TERBUKTI**.

---

## Menjalankan

```bash
npm run db:reset      # bangun ulang dari database kosong
npm run db:test       # seluruh berkas, ringkasan "X lulus / Y gagal"
```

Setiap berkas dijalankan di dalam transaksi yang **selalu** di-rollback, jadi
test tidak pernah meninggalkan data. Menjalankan satu berkas saja:

```bash
npm run db:test -- 900_integrasi
```

### 5. `my_divisi()` dan `my_kepanitiaan()` sengaja tidak menyaring periode

Berbeda dengan `auth_roles()` dan `my_departemen()` yang hanya membaca periode
`AKTIF`, dua helper itu mengembalikan seluruh keanggotaan lintas periode. Itu
disengaja: mode arsip mengizinkan mantan panitia membaca kembali acara periode
lalu.

Akibatnya keduanya **tidak boleh dipakai sendirian pada policy tulis**. Policy
INSERT, UPDATE, dan DELETE di 015b wajib menambahkan syarat periode aktif —
tanpa itu, mantan panitia 2025/2026 masih dapat menyunting RAB acara yang sudah
diarsipkan. T-038 yang menutupnya, dan T-039 yang membuktikannya dengan test
negatif.

### 6. Cacat yang ditemukan pada SYSTEM_DESIGN §5.2

`my_kepanitiaan()` versi dokumen menggabungkan dua `SELECT` beragregat dengan
`UNION`. Bentuk itu menghasilkan dua **baris** array, sedangkan fungsi SQL yang
mengembalikan `UUID[]` hanya mengambil baris pertama — sehingga cabang ketua
pelaksana tidak pernah ikut. Diukur pada T-037 terhadap versi dokumen:

| kasus | hasil versi dokumen | seharusnya |
|---|---|---|
| hanya ketua pelaksana | `{}` | 1 kepanitiaan |
| anggota divisi dan ketua acara lain | 1 kepanitiaan | 2 kepanitiaan |

Migrasi `015a` memakai bentuk yang benar: himpunan id digabung lebih dulu, baru
diagregat satu kali. Dokumen sumbernya tidak diubah karena beku selama kerja
paralel; koreksinya tercatat di header migrasi.

### 7. Tidak ada satu pun berkas test yang menguji RLS

Ini yang paling mudah salah paham, jadi ditulis eksplisit.

Role `postgres` di Supabase memiliki **BYPASSRLS** — diperiksa langsung:
`rolsuper=false, rolbypassrls=true`. Bahkan `FORCE ROW LEVEL SECURITY` tidak
menghentikannya. Seluruh berkas di `supabase/tests/` berjalan lewat koneksi
`postgres`.

Akibatnya: **ke-19 berkas test itu akan tetap hijau seandainya seluruh policy
di `015b` dihapus.** Angka "19 lulus" tidak mengatakan apa pun tentang
otorisasi.

Test yang benar-benar menguji RLS wajib memakai `SET LOCAL ROLE authenticated`
beserta `request.jwt.claims`. Itu tugas T-039.

Dua jebakan yang sudah ditemukan saat memverifikasi T-038, supaya T-039 tidak
mengulanginya:

- **Penolakan SELECT tidak melempar error.** RLS menyaring baris, bukan
  menolak query. `select count(*) from audit_log` sebagai Anggota tetap
  sukses — hasilnya saja 0. Test negatif yang hanya menunggu exception akan
  lulus walau seluruh jejak audit terbuka. Periksa jumlah barisnya.
- **Satu penolakan membatalkan seluruh transaksi.** Setiap percobaan negatif
  harus dibungkus `SAVEPOINT`, kalau tidak percobaan berikutnya gagal dengan
  alasan yang menyesatkan (`current transaction is aborted`).

Sementara ini, verifikasi T-038 dilakukan lewat probe ad hoc sebagai role
`authenticated`: 20 pemeriksaan, seluruhnya lulus. Probe itu tidak tersimpan
sebagai test.

### 8. Test yang lulus karena alasan yang salah

Ditemukan pada T-039 lewat uji mutasi, dan layak diingat karena bentuk
kesalahannya umum.

Versi pertama test negatif RLS menguji penolakan Sekum hanya lewat pemanggilan
`setujui_proker()`. Test itu hijau. Tetapi ketika policy `proker_lock_insert`
sengaja dilonggarkan sampai mengizinkan Sekum, **test tetap hijau** — jadi ia
tidak menguji apa pun.

Sebabnya: Sekum tidak punya departemen, sehingga sudah tertahan policy
`proker_update` saat `SELECT ... FOR UPDATE` di dalam fungsi, jauh sebelum
menyentuh `proker_lock`. Perlindungannya kebetulan, dan akan runtuh tanpa suara
bila Sekum kelak diberi hak menyunting proker.

Perbaikannya bukan melonggarkan test, melainkan **menyerang titik penegakannya
secara langsung** — `INSERT INTO proker_lock` dan `UPDATE surat_counter` tanpa
lewat fungsi, persis seperti yang dilakukan seseorang yang memegang kredensial
dan berbicara ke PostgREST.

Pelajarannya: menguji sebuah invariant lewat jalur yang nyaman belum tentu
menguji invariantnya. Uji mutasi yang membedakan keduanya.

### 9. `npm run db:test` tidak mengukur keamanan

Diulang di sini karena mudah terlupa: dari 20 berkas test, **hanya satu** yang
menguji RLS. Sisanya berjalan sebagai `postgres` yang ber-BYPASSRLS.

Bila suatu saat 180 policy hilang, 19 dari 20 berkas tetap hijau. Yang berteriak
hanya `015c_rls_negatif.sql` dan `npm run rls:coverage`.
