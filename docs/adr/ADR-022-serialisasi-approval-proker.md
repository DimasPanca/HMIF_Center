# ADR-022 — Approval proker diserialkan advisory lock per periode

| | |
|---|---|
| **Status** | Usulan |
| **Tanggal** | 2026-09-04 |
| **Ditemukan oleh** | T-066, pada jalan pertama `scripts/stress-anti-bentrok.ts` |
| **Lane** | `data` |
| **Task terkait** | T-033, T-065, T-066, T-070 |

## Konteks

`setujui_proker` (migrasi 014a) menjamin bahwa dua proker TERJADWAL beririsan
tidak pernah sama-sama terkunci. Jaminan itu datang dari EXCLUDE constraint
`no_overlap_terjadwal`, dan tetap berlaku tanpa keputusan ini (INV-09).

T-066 menuntut pembuktiannya dengan koneksi database yang benar-benar berjalan
bersamaan. Pada jalan pertama, dua approval simultan menghasilkan:

```
40P01  deadlock detected
Process A waits for ShareLock on transaction 7624; blocked by process B.
Process B waits for ShareLock on transaction 7625; blocked by process A.
  while checking exclusion constraint on tuple (0,1) in relation "proker_lock"
  SQL statement "INSERT INTO proker_lock (proker_id, periode_id, rentang) ..."
  PL/pgSQL function setujui_proker(uuid,uuid) line 61
```

Terjadi pada **dua dari tiga jalan** — intermiten, seperti umumnya race
condition.

Penyebabnya bukan cacat kode melainkan sifat pemeriksaan EXCLUDE constraint.
Masing-masing transaksi menyisipkan barisnya, melihat baris lawan yang belum
di-commit, lalu **menunggu** keputusan lawan. Keduanya saling menunggu, dan
PostgreSQL memutus siklusnya dengan membunuh salah satu.

`deadlock_detected` bukan `exclusion_violation`, sehingga blok `EXCEPTION` di
014a tidak menangkapnya. Akibatnya bagi pengguna:

| | Yang seharusnya | Yang terjadi |
|---|---|---|
| Respons approver | panel konflik | error 500 |
| Status proker | `PERLU_REVISI` | tetap `MENUNGGU_APPROVAL` |
| Daftar konflik | terisi | tidak pernah terbentuk |

PRD F-5.2 Acceptance Criteria menuntutnya kata per kata:

> Dua Kadept submit proker bentrok pada detik yang sama → hanya satu berhasil,
> satunya mendapat **pesan konflik**

Bagian "hanya satu berhasil" sudah terpenuhi sejak 014a. Bagian "mendapat pesan
konflik" belum.

Satu detail yang membalik dugaan: **sepuluh** approval serentak justru selalu
lulus. Yang pertama menyisipkan lebih dulu dan sembilan sisanya mengantre di
belakang satu baris, sehingga tidak ada siklus. Kasus **dua** pesaing — yang
paling mungkin terjadi di organisasi berisi enam departemen — justru satu-satunya
yang rusak. Menguji beban besar saja akan melewatkannya.

## Keputusan

`setujui_proker` mengambil `pg_advisory_xact_lock` berbasis `periode_id`
sebelum menyentuh `proker_lock`, lewat migrasi baru
`019_setujui_proker_serial.sql`.

Tiga batas yang menyertainya:

1. **Hanya untuk TERJADWAL.** BERKALA dan RESPONSIF keluar dari fungsi sebelum
   kunci diambil; keduanya tidak menyentuh `proker_lock` sama sekali, jadi tidak
   ada gunanya membuat mereka mengantre.
2. **Row lock dulu, advisory lock kemudian.** Semua pemanggil mengambilnya dalam
   urutan yang sama, sehingga tidak ada siklus yang mungkin terbentuk. Membalik
   urutannya mengembalikan deadlock lewat pintu lain.
3. **Berbasis periode, bukan global.** Periode berbeda tidak saling memblokir.

Idiom, nama fungsi, dan alasannya sama persis dengan `alokasi_nomor_surat`
(migrasi 014b, INV-15) — argumen kedua `hashtextextended` dibedakan (`1`, bukan
`0`) supaya kedua keyspace tidak pernah bertabrakan.

## Konsekuensi

**Yang membaik.** Approval kedua menunggu approval pertama selesai, lalu
INSERT-nya gagal seketika dengan `exclusion_violation` yang memang ditangkap
blok `EXCEPTION`: pesan konflik lengkap, status `PERLU_REVISI`, tanpa deadlock.
Lima skenario T-066 lulus dan stabil pada tiga jalan berturut-turut.

**Yang dibayar.** Approval TERJADWAL dalam satu periode menjadi berurutan.
Praktis nihil: approval terjadi beberapa puluh kali per kepengurusan, bukan
beberapa kali per detik, dan blok yang diserialkan berjalan di bawah 50 ms.

**Yang TIDAK berubah.** Advisory lock ini bukan pengganti EXCLUDE constraint. Ia
hanya membuat penolakannya rapi. Constraint tetap satu-satunya yang menjamin
INV-09, dan tetap bekerja seandainya seseorang menghapus baris `PERFORM`-nya.

Karena itu `supabase/tests/021_konflik_konkuren.sql` menguji **keberadaan
kuncinya** secara langsung lewat `pg_locks`, bukan hanya akibatnya. Tanpa itu,
menghapus kunci ini tidak membuat satu pun test merah — yang kembali hanyalah
deadlock intermiten pada dua approval bersamaan, sesuatu yang tidak pernah
terlihat di lingkungan satu pengguna.

## Alternatif yang ditolak

**Menangkap `deadlock_detected` di blok EXCEPTION.** Menangani gejalanya, bukan
sebabnya. Transaksi yang sudah dibunuh deadlock tidak dapat melanjutkan apa pun —
`UPDATE proker SET status = 'PERLU_REVISI'` di dalam handler akan gagal juga,
karena seluruh transaksinya sudah dibatalkan. Pesan konflik tetap tidak terbentuk.

**Mengulang di sisi aplikasi.** Route handler menangkap 40P01 lalu memanggil
ulang. Bekerja, tetapi memindahkan aturan database ke aplikasi — yang justru
dilarang PRD F-5.2 R7 — dan setiap pemanggil baru (`app/api`, Server Action,
skrip cron) harus mengingatnya sendiri.

**Menaikkan level isolasi ke SERIALIZABLE.** Menggantikan deadlock dengan
`serialization_failure`, yang juga tidak ditangkap blok EXCEPTION. Masalah yang
sama dengan nama yang berbeda, ditambah biaya pada seluruh transaksi lain.
