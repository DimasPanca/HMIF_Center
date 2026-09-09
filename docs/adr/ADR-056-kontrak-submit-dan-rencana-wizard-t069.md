# ADR-056 — Kontrak submit dan rencana wizard T-069

|                    |                                                         |
| ------------------ | ------------------------------------------------------- |
| **Status**         | **Diterima**                                            |
| **Tanggal**        | 2026-09-09                                              |
| **Ditemukan oleh** | T-069 saat memeriksa batas data langkah 4–6             |
| **Task terkait**   | T-068, T-068-UI, T-069, T-070                           |

## Konteks

T-069 meminta lane UI membuat tiga komponen langkah 4–6 dan route
`POST /api/proker/[id]/submit`. Namun keputusan dan operasi data yang dibutuhkan
route tersebut belum memiliki kontrak atau implementasi pada lane data:

1. `lib/proker/wizard-state.ts` hanya memodelkan medan langkah 1–3.
   `validasiLangkah()` sengaja mengembalikan sukses tanpa syarat untuk langkah
   4–6, sehingga aturan Ketua Pelaksana, minimal satu divisi, dan minimal satu
   task Gantt belum dapat ditegakkan dari satu sumber kebenaran.
2. `lib/proker/service.ts` secara eksplisit menyatakan bahwa operasi `submit`
   bukan bagian T-065 dan belum mengubah status proker. Route UI tidak boleh
   menulis SQL atau menentukan transisi `MENUNGGU_APPROVAL`/`DISETUJUI` sendiri.
3. `proker_draft.data` dapat menyimpan JSON parsial, tetapi kontrak T-068
   memerintahkan draft dihapus setelah submit. Data rencana kepanitiaan langkah
   4 dibutuhkan lagi oleh T-070 saat approval, sedangkan T-069 dilarang membuat
   entri `kepanitiaan`. Belum ada tempat persisten yang mengaitkan rencana
   tersebut dengan proker setelah draft pengguna dihapus.
4. Struktur task Gantt langkah 5 belum masuk `WizardDraft` dan belum ada service
   yang menyimpan chart, grup fase, serta task secara atomik bersama submit.
5. Gate kontrak `e2e/wizard-proker-4-6.spec.ts` belum ada. Perintah verifikasi
   T-069 saat ini berhenti dengan `Error: No tests found`, sehingga syarat
   selesai tidak dapat dibuktikan.

Mengarang bentuk JSON hanya di komponen akan membuat lane data T-070 menebak
ulang struktur yang sama. Menyimpan langsung ke tabel `kepanitiaan` akan
melanggar larangan T-069 dan membuka kemungkinan kepanitiaan yatim sebelum
approval.

## Keputusan yang diusulkan

T-069 dipecah menjadi fondasi data dan implementasi UI, dengan urutan data lebih
dahulu:

1. Lane data memperluas model draft murni dengan bentuk bertipe untuk rencana
   kepanitiaan dan Gantt, termasuk validasi langkah 4–6. Aturan minimalnya:
   Ketua Pelaksana berasal dari seluruh pengurus aktif, setiap divisi mempunyai
   nama unik, dan TERJADWAL mempunyai minimal satu task Gantt.
2. Lane data menetapkan penyimpanan rencana kepanitiaan setelah submit. Bentuk
   persistensinya boleh berupa tabel rencana terpisah atau kolom JSON yang
   terikat ke `proker_id`, tetapi tidak boleh membuat `kepanitiaan`, `divisi`,
   atau `divisi_member` sebelum approval T-070.
3. Lane data menyediakan satu service transaksi untuk submit yang:
   - membaca dan memvalidasi draft server milik sesi;
   - membuat proker sungguhan dari `keInputProker()`;
   - menyimpan rencana kepanitiaan dan Gantt tanpa membentuk kepanitiaan;
   - menetapkan TERJADWAL/RESPONSIF ke `MENUNGGU_APPROVAL` dan BERKALA langsung
     ke `DISETUJUI`;
   - tidak menulis `proker_lock`;
   - menghapus draft hanya setelah seluruh operasi berhasil.
4. Tanda tangan fungsi, kode kegagalan, status HTTP K-02, dan bentuk hasil
   sukses dicatat di kontrak lintas-lane. Route UI hanya menjalankan guard,
   `withAuditContext`, service tersebut, lalu `sukses()`/`gagal()`.
5. Lane data menyediakan `e2e/wizard-proker-4-6.spec.ts` beserta fixture yang
   membuktikan minimal satu task, pilihan Ketua Pelaksana lintas departemen,
   status hasil submit per kategori, dan ketiadaan `proker_lock` setelah submit.
6. Lane UI melanjutkan tiga komponen dan menghubungkannya ke `WizardShell`
   setelah bentuk data, service, dan gate tersebut tersedia.

T-069 tetap `BLOCKED` sampai kontrak lintas-lane tersebut tersedia atau pemilik
proyek menerima keputusan lain yang menetapkan tempat persisten dan operasi
submit secara eksplisit.

## Konsekuensi

- Data langkah 4 tidak hilang ketika draft pengguna dibersihkan.
- T-070 dapat membentuk kepanitiaan dari rencana yang tervalidasi tanpa menebak
  bentuk JSON buatan komponen.
- Route submit tetap tipis, berformat K-02, dan tidak mengambil keputusan bisnis
  di lane UI.
- Transisi BERKALA dan ketiadaan lock setelah submit dapat dibuktikan lewat gate,
  bukan hanya diasumsikan dari tampilan.
- T-069 tertunda satu sync point, tetapi tidak menghasilkan UI yang terlihat
  lengkap sementara data kepanitiaannya hilang atau statusnya salah.

Keputusan ini diterima oleh pemilik proyek pada 2026-09-09.
