# Matriks Uji Row Level Security

Hasil `supabase/tests/015c_rls_negatif.sql`, disajikan sebagai peran × aksi.

Semua baris bertanda **diuji** berasal dari assertion yang benar-benar berjalan
sebagai role `authenticated`, bukan dari pembacaan policy.

Diperbarui pada T-039.

---

## Kenapa berkas ini perlu ada terpisah

Role `postgres` di Supabase memiliki `BYPASSRLS` — `rolsuper=false`,
`rolbypassrls=true`, dan `FORCE ROW LEVEL SECURITY` pun tidak menghentikannya.
Seluruh berkas test lain berjalan lewat koneksi itu.

Artinya **ke-19 berkas test lainnya akan tetap hijau seandainya 180 policy
dihapus seluruhnya.** `015c_rls_negatif.sql` satu-satunya yang memakai
`SET LOCAL ROLE authenticated`, sehingga satu-satunya yang menguji otorisasi.

Angka "20 lulus" pada `npm run db:test` **tidak** mengatakan apa pun tentang
keamanan. Yang mengatakannya hanya berkas itu.

---

## Peran × aksi

Tanda: **YA** boleh · **TIDAK** ditolak · **0** boleh dijalankan tetapi tidak
mengubah baris apa pun.

### Approval — titik paling sensitif (INV-05)

| Aksi | Admin | Ketua | Wakil | Sekum | Bendum | Kadept | Anggota | BPH | Diuji |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| `setujui_proker()` | YA | **YA** | **YA** | TIDAK | TIDAK | TIDAK | TIDAK | TIDAK | Ketua, Wakil, Sekum, Kadept |
| INSERT langsung ke `proker_lock` | YA | YA | YA | **TIDAK** | TIDAK | TIDAK | TIDAK | TIDAK | Sekum, Bendum, Kadept, Anggota, BPH |
| `alokasi_nomor_surat()` | YA | YA | YA | **YA** | TIDAK | TIDAK | TIDAK | TIDAK | Sekum, Kadept |
| UPDATE langsung ke `surat_counter` | YA | YA | YA | YA | **0** | 0 | 0 | 0 | Bendum, Kadept, Anggota, BPH |

Perhatikan bahwa **Sekum ditolak pada proker tetapi diterima pada surat**. Dua
daftar approver yang memang berbeda (PRD §5.2); kalau keduanya sama, salah satu
policy pasti keliru.

### Lintas divisi dalam satu kepanitiaan (INV-30)

| Aksi | Anggota divisi lain | Diuji |
|---|:--:|---|
| SELECT `rab_item` divisi lain, acara sama | **YA** | ya |
| UPDATE `rab_item` divisi lain | **0 baris**, bukan error | ya |
| INSERT `rab_section` di divisi sendiri | YA | ya |

Baris kedua penting bentuknya, bukan hanya hasilnya: permintaan itu **berhasil
dijalankan** dan mengubah nol baris. Kalau ia melempar exception, antarmuka
akan menampilkan kegagalan teknis untuk hal yang sebenarnya normal.

### RAB terkunci (INV-29)

| Status `rab_meta` | Panitia menulis `rab_section` | Diuji |
|---|:--:|---|
| `DRAFT` | YA | ya |
| `DISETUJUI` | **TIDAK** | ya |
| dibuka kembali ke `DRAFT` | YA | ya |

Baris ketiga ada dengan sengaja: policy yang menolak selamanya juga akan
membuat baris kedua lulus.

### BPH — pengawas, bukan penulis (INV-03, INV-04)

| Aksi | BPH | Diuji |
|---|:--:|---|
| SELECT `proker` | **YA** | ya |
| SELECT `audit_log` | **YA** | ya |
| INSERT `proker` | TIDAK | ya |
| UPDATE `departemen` | **0 baris** | ya |
| INSERT `proker_lock` | TIDAK | ya |
| UPDATE `surat_counter` | 0 baris | ya |

`npm run rls:coverage` menolak setiap policy tulis yang menyebut `'BPH'`:
0 dari 180 saat ini.

### Multi-role (INV-03)

Pengguna dengan peran `ANGGOTA` **dan** `BPH` sekaligus.

| Aksi | Hasil | Diuji |
|---|:--:|---|
| INSERT `rab_section` di divisinya | **YA** | ya |

Hak bersifat gabungan. BPH restriktif dalam arti **tidak menambah apa pun** —
ia tidak boleh mengurangi hak yang sudah dimiliki peran lain. Kalau iya, setiap
pengurus yang ditunjuk sebagai pengawas akan kehilangan pekerjaannya sendiri.

### Lingkup departemen dan eskalasi hak

| Aksi | Hasil | Diuji |
|---|:--:|---|
| Kadept INSERT `proker` departemennya | YA | ya |
| Kadept INSERT `proker` departemen lain | TIDAK | ya |
| Anggota INSERT `user_role` untuk dirinya sebagai `KETUA` | TIDAK | ya |
| Anggota SELECT `audit_log` | **0 baris** | ya |

---

## Dua bentuk penolakan, dan mengapa itu penting

Kesalahan paling mudah saat menulis test RLS adalah menganggap "ditolak" selalu
berarti "melempar error". Tidak.

| Yang terjadi | Bentuk penolakan | Cara mengujinya |
|---|---|---|
| Baris tidak lolos `USING` pada SELECT | query sukses, **0 baris** | periksa jumlah baris |
| Baris tidak lolos `USING` pada UPDATE/DELETE | perintah sukses, **0 baris terpengaruh** | `GET DIAGNOSTICS ... ROW_COUNT` |
| Baris baru tidak lolos `WITH CHECK` | **exception** `42501` | blok `EXCEPTION` |
| `SELECT ... FOR UPDATE` tersaring policy UPDATE | fungsi masuk cabang **NOT FOUND** | terima juga `no_data_found` |

Baris terakhir ditemukan saat menulis test ini. `setujui_proker()` yang
dipanggil Sekum melapor **"Proker tidak ditemukan"** — padahal prokernya ada,
Sekum saja yang tidak berhak. PostgreSQL menerapkan policy UPDATE pada
`SELECT ... FOR UPDATE`, sehingga barisnya tidak terlihat sama sekali.

Yang ditegakkan tetap benar. Yang perlu diperbaiki adalah **pemetaan pesan di
lapisan service** (T-045 dan seterusnya): kode `no_data_found` dari fungsi
approval harus diterjemahkan menjadi "Anda tidak berhak menyetujui", bukan
"data tidak ditemukan".

---

## Uji mutasi

Test hijau belum tentu menguji apa pun. Empat policy sengaja dilonggarkan satu
per satu untuk memastikan testnya berteriak.

| Policy yang dilonggarkan | Tertangkap | Pesan gagalnya |
|---|:--:|---|
| `SEKUM` ditambahkan ke `proker_lock_insert` | ya | Sekum berhasil mengunci kalender langsung ke `proker_lock` |
| `rab_terbuka()` dilepas dari `rab_section_insert` | ya | panitia berhasil menambah RAB setelah status `DISETUJUI` |
| `BPH` ditambahkan ke `departemen_update` | ya | BPH mengubah 1 baris departemen |
| `rab_item_select` dipersempit ke divisi sendiri | ya | anggota tidak dapat membaca RAB divisi lain dalam acara yang sama |

### Yang ditemukan uji mutasi, dan sudah diperbaiki

Mutasi pertama semula **LOLOS** — menambahkan Sekum ke `proker_lock_insert`
tidak membuat test gagal.

Sebabnya: pada versi awal, penolakan Sekum diuji hanya lewat
`setujui_proker()`. Sekum tidak punya departemen, sehingga ia sudah tertahan
policy `proker_update` saat `SELECT ... FOR UPDATE` — jauh sebelum menyentuh
`proker_lock`. Perlindungannya **kebetulan, bukan disengaja**, dan akan runtuh
tanpa suara bila Sekum kelak diberi hak menyunting proker.

Perbaikannya bukan melonggarkan test, melainkan menambahkan blok 5b yang
menyerang `proker_lock` dan `surat_counter` **secara langsung** — persis
seperti yang akan dilakukan seseorang yang memegang kredensial dan berbicara ke
PostgREST tanpa lewat aplikasi. Setelah itu keempat mutasi tertangkap.

---

## Yang belum diuji

| Hal | Alasan | Pemilik |
|---|---|---|
| Guard aplikasi sebagai lapis kedua (INV-01) | lapisan service belum ada | T-045 dan seterusnya |
| `BPH` tidak muncul di antrian approval (INV-04) | antrian adalah konsep antarmuka | lane `ui` |
| View agregat | belum ada view | T-040 — **wajib** `WITH (security_invoker = true)`, kalau tidak view menembus seluruh policy |
| Storage bucket | policy Storage terpisah dari RLS tabel | T-044 |

---

## Menjalankan

```bash
npm run db:test -- 015c_rls_negatif
```

Dan pemeriksaan cakupannya, yang statis:

```bash
npm run rls:coverage
```
