# ADR-058 — Prasyarat keamanan dan gate Kanban T-080

| | |
|---|---|
| **Status** | Usulan |
| **Tanggal** | 2026-09-13 |
| **Task terkait** | T-080 |
| **Ditemukan oleh** | lane UI saat memeriksa kontrak T-080 |

## Konteks

T-080 mewajibkan Anggota melihat Kanban departemennya sendiri dan BPH tidak
dapat memindahkan kartu, baik di UI maupun API. AGENT_RULES INV-01 mewajibkan
otorisasi independen di guard aplikasi dan RLS. Kontrak T-080 juga mewajibkan
`npm run test:e2e -- kanban` lulus sebelum task ditutup.

Pada `supabase/migrations/015b_rls_policies.sql` baris 322–323, policy
`kanban_card_update` memakai
`kelola_dept(departemen_id) OR has_role('ANGGOTA')`. Klausa kedua tidak
membatasi `departemen_id`, sehingga Anggota dapat memperbarui kartu departemen
lain bila ia mengirim request langsung melalui jalur yang memakai sesi RLS.
Guard route nantinya dapat menolak request itu, tetapi tidak menjadikan RLS
lapisan otorisasi yang independen. Ini perlu dituntaskan oleh lane data sebelum
route mutasi Kanban dipublikasikan.

Selain itu, tidak ada `e2e/*kanban*` pada branch integrasi. Perintah verifikasi
kontrak menghasilkan `Error: No tests found`, bukan bukti bahwa navigasi
keyboard, optimistic rollback, progres Master Gantt, dan penolakan BPH lulus.

## Usulan keputusan

1. Lane data memperketat policy UPDATE Kanban untuk Anggota agar terikat pada
   departemen role aktif dan konteks kartu yang relevan, tanpa melonggarkan
   larangan tulis BPH. Uji negatif lintas departemen dan BPH harus membuktikan
   penolakan langsung oleh RLS.
2. Lane data menyediakan gate `e2e/kanban.spec.ts` untuk skenario wajib T-080,
   termasuk keyboard dnd-kit, rollback saat API menolak, filter, dan progres
   proker yang tercermin di Master Gantt.
3. Setelah keduanya masuk `main`, lane UI membangun file yang tercantum di
   kontrak T-080, memakai permission dan lingkup dari sesi server, bukan role
   atau departemen dari badan request sebagai sumber otorisasi.

## Konsekuensi sementara

T-080 berstatus BLOCKED. Tidak ada route atau komponen Kanban yang diterbitkan
sebelum persyaratan keamanan dan gate bisa diverifikasi. Keputusan akhir dan
perubahan RLS tetap milik pemilik proyek/lane data; ADR ini tidak mengubah
kontrak beku atau file lane data.
