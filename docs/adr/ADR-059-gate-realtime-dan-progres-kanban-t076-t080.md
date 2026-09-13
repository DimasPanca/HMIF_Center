# ADR-059 — Gate Realtime dan pembaruan progres Kanban

| | |
|---|---|
| **Status** | Usulan |
| **Tanggal** | 2026-09-13 |
| **Task terkait** | T-076-UI, T-080 |
| **Ditemukan oleh** | lane UI saat memeriksa gate T-080 |

## Konteks

T-080 mewajibkan progres `(kartu Done / total kartu) × 100` langsung tercermin
di Master Gantt. Gate `e2e/kanban.spec.ts` membuktikannya pada dua tab yang sudah
terbuka: setelah kartu dipindahkan ke Done, label bar Master Gantt harus berubah
dari 50 menjadi 100 persen tanpa navigasi ulang. Master Gantt belum memiliki
langganan atau jalur refetch setelah muatan pertama; penyambungan Realtime
merupakan cakupan T-076-UI, tetapi T-080 tidak mencantumkannya sebagai
dependency atau file `Ubah`.

T-076-UI sendiri mewajibkan `npm run test:e2e -- realtime-gantt`. Pada checkout
2026-09-13, perintah itu keluar dengan kode 1 dan `Error: No tests found`:
berkas gate tersebut belum tersedia di `e2e/**` yang dimiliki lane data.

Fondasi data T-076 saat ini hanya mempublikasikan `proker` dan `proker_lock` ke
`supabase_realtime`, lalu hooknya berlangganan perubahan kedua tabel tersebut.
Mutasi kartu T-080 mengubah `kanban_card`; migrasi RLS 024 tidak mempublikasikan
perubahan itu ataupun memicu perubahan `proker`. Karena itu sekadar memasang
hook T-076 ke Master Gantt tidak akan menyalakan refetch progres Kanban.

## Usulan keputusan

1. Lane data menyediakan gate `e2e/realtime-gantt.spec.ts` sesuai kontrak
   T-076; gate harus membuktikan bar baru muncul dalam 3 detik, degradasi saat
   koneksi putus, dan data terakhir tetap tampil. Gate tidak boleh dinyatakan
   lulus hanya karena semua test skip.
2. Lane data menetapkan jalur peristiwa ber-sesi untuk perubahan progres kartu
   agar Master Gantt mendapat sinyal refetch yang benar juga lintas pengguna.
   Pilihan teknisnya dapat berupa publikasi `kanban_card` dengan langganan
   berlingkup, atau pemicu perubahan pada sumber kanal `proker`; perubahan
   migration/hook milik lane data dan harus ditinjau terhadap RLS, audit, dan
   volume peristiwa. Broadcast antartab lokal saja tidak memenuhi live update
   lintas pengguna.
3. Setelah data dan gate masuk `main`, lane UI menuntaskan T-076-UI lebih dulu,
   lalu T-080, tanpa memindahkan perubahan Master Gantt ke commit T-080.

## Konsekuensi sementara

T-076-UI dan T-080 tetap BLOCKED. Tidak ada klaim bahwa gate Realtime atau
pembaruan progres Kanban telah terverifikasi. ADR ini tidak mengubah kontrak
beku ataupun file lane data.
