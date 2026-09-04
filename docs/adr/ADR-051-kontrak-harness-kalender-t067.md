# ADR-051 — Kontrak harness kalender ketersediaan T-067

|                    |                                                           |
| ------------------ | --------------------------------------------------------- |
| **Status**         | **Usulan**                                                |
| **Tanggal**        | 2026-09-04                                                |
| **Ditemukan oleh** | T-067 setelah gate `kalender-ketersediaan` diperiksa      |
| **Task terkait**   | T-067, T-068                                              |

## Konteks

Kontrak T-067 hanya mengizinkan pembuatan halaman
`app/(dashboard)/proker/kalender/page.tsx` dan tiga komponen di
`components/proker/**`. Gate `e2e/kalender-ketersediaan.spec.ts` mewajibkan
halaman tambahan `/qa/kalender`, yang hanya dapat diwujudkan melalui
`app/qa/kalender/page.tsx`. Berkas tersebut tidak tercantum pada field **Buat**
atau **Ubah** task, sehingga membuatnya tanpa keputusan eksplisit melanggar
AGENT_RULES P-10.

Harness bukan sekadar kemudahan test. Delapan pemeriksaan visual dan interaksi
memerlukan fixture tetap untuk tiga keadaan tanggal dan tooltip, sedangkan
halaman sungguhan membutuhkan sesi, periode aktif, storage, serta database.
Worktree lane `ui` sengaja tidak memiliki `DATABASE_URL`, dan dua lane tidak
boleh menjalankan E2E database bersamaan. Tanpa harness, gate melewati seluruh
pemeriksaan komponen dan tidak membuktikan tiga keadaan, legenda K-15, atau isi
tooltip.

Skenario terakhir gate juga sengaja berjalan di halaman sungguhan untuk
membuktikan data diambil satu kali. Skenario itu harus dijalankan setelah hasil
lane UI dan data digabung, bukan dengan menambahkan kredensial database ke
worktree UI.

## Keputusan

T-067 diusulkan menjadi integrasi lintas-lane dengan batas berikut:

1. `app/qa/kalender/page.tsx` ditambahkan resmi ke daftar **Buat** lane UI.
2. Harness memakai `KalenderKetersediaan` yang sama dengan halaman sungguhan,
   bukan salinan komponen, serta fixture tetap yang sudah ditetapkan di kepala
   `e2e/kalender-ketersediaan.spec.ts`.
3. Nama `data-testid` dan atribut `data-keadaan` pada gate diterima sebagai
   kontrak pengujian T-067.
4. Lane UI menjalankan bagian harness yang tidak membutuhkan database; lane
   data menjalankan skenario halaman sungguhan setelah merge untuk membuktikan
   hanya satu request ke `/api/proker/kalender`.
5. T-067 tetap `BLOCKED` sampai usulan ini diterima atau kontrak task diperbaiki
   dengan keputusan lain.

## Konsekuensi implementasi

- Lane UI tidak membuat berkas di luar cakupan task secara diam-diam dan tidak
  mengisi `DATABASE_URL` hanya untuk menghijaukan gate.
- Perilaku komponen dapat diverifikasi deterministik tanpa melemahkan
  autentikasi halaman produksi.
- T-068 tetap menunggu komponen kalender yang sama, sehingga tidak ada kalender
  kedua yang berpotensi berbeda perilaku.
