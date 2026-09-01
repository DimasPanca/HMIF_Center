# AI Execution Plan — HMIF Center

**Tujuan:** rencana pengendali untuk AI agent yang bekerja melalui folder docs/ai. Berkas ini mengunci keputusan lintas-dokumen, menjelaskan protokol eksekusi, dan mendefinisikan gerbang fase. Detail implementasi per task ada di docs/ai/tasks.

**Status:** Siap dieksekusi dari task T-001. Status nyata pekerjaan hanya disimpan pada docs/ai/tasks.json.

## 1. Cara agent memakai rencana ini

Pada awal setiap sesi, agent WAJIB melakukan urutan ini:

1. Baca docs/ai/AGENT_RULES.md secara penuh.
2. Baca docs/ai/tasks.json dan cari tepat satu task berstatus READY yang seluruh depends_on-nya DONE.
3. Baca berkas fase yang memuat task tersebut di docs/ai/tasks.
4. Baca hanya bagian dokumen produk yang tercantum pada field Baca task.
5. Kerjakan satu task itu saja, mengikuti Kontrak, Buat/Ubah, dan Verifikasi task.
6. Bila semua verifikasi lulus, buat satu commit dengan format yang diwajibkan lalu ubah task menjadi DONE.
7. Bila task membutuhkan tindakan manusia, ubah status menjadi BLOCKED dan tulis blocked_reason yang konkret.

Jangan memilih task berdasarkan urutan nomor saja. Dependency di tasks.json selalu lebih penting.

## 2. Keputusan Terkunci

Keputusan pada bagian ini wajib diturunkan menjadi 17 ADR oleh T-002. Agent tidak boleh mengubah keputusan ini tanpa instruksi eksplisit dari pemilik produk.

### 2.1 Produk, dokumen, dan workflow

| ADR | Judul | Keputusan final | Konsekuensi |
|---|---|---|---|
| ADR-001 | Kode administrasi surat | Gunakan UN43.3.7 sebagai nilai awal. Nilainya berasal dari app_config dan Admin boleh mengubahnya untuk periode mendatang. | Jangan hardcode di form atau generator. |
| ADR-002 | Kode Surat Aspirasi | Surat Aspirasi memakai kode 03 sebagai varian ASPIRASI dari Surat Pemberitahuan. | Field schema khusus Aspirasi dan template surat-03-aspirasi dipakai. |
| ADR-003 | Counter surat periode baru | Nomor pertama periode baru adalah 001 secara default. Admin dapat mengisi nomor_surat_awal saat membuat periode. | aktifkan_periode membuat counter pada nomor_surat_awal - 1. |
| ADR-004 | Penandatangan surat | Ketua HMIF adalah penandatangan utama dan stempel melekat pada bloknya. Sekum ditampilkan hanya pada template/varian yang mendefinisikan signers[] demikian. | Jangan memaksa TTD Sekum pada semua surat. |
| ADR-009 | Strategi cron | Gunakan satu endpoint /api/cron/harian dan satu jadwal cron harian. Setiap hari menjalankan lifecycle proker dan deadline; tanggal 1 juga backup. | Kompatibel dengan batas Vercel Hobby dan tidak boleh membuat tiga cron terpisah. |
| ADR-010 | Strategi PDF | DOCX selalu tersedia. PDF hanya tersedia bila PDF_ENABLED=true dan Gotenberg/LibreOffice telah lolos verifikasi. Nilai awal PDF_ENABLED=false. | Saat false, UI menyembunyikan PDF dan server menolaknya dengan pesan jelas; tidak ada fallback diam-diam berkualitas rendah. |
| ADR-012 | Pengurus tanpa akun | Record pengurus boleh memiliki user_id NULL. Akun aplikasi hanya dibuat melalui Admin/undangan. | Data pengurus dapat dipakai untuk surat aktif tanpa memberikan akses aplikasi. |
| ADR-013 | Divisi acara | Gunakan sembilan divisi preset: Acara, Konsumsi, Humas, Peralatan, PDD, P3K, Sekretaris, Bendahara, Komdis. Preset dapat ditambah/dikurangi per acara. | Koor dan anggota disimpan sebagai data kontekstual pada kepanitiaan/divisi, bukan global role. |
| ADR-014 | Batas upload nota | Ukuran upload maksimum 15 MB per file. Hanya JPEG, PNG, dan WebP melalui validasi magic bytes. | Gunakan MAX_UPLOAD_BYTES=15728640 dan error FILE_TIDAK_VALID. |
| ADR-015 | Approval LPJ | State LPJ adalah DRAFT → DIAJUKAN → DISETUJUI_BENDUM → FINAL. Final membutuhkan persetujuan Bendum lalu Ketua, dan tidak dapat diubah. | Gunakan enum lpj_status dan empat kolom approver/timestamp, bukan TEXT bebas. |
| ADR-016 | Retensi backup | Simpan 12 backup otomatis terbaru. Backup MANUAL dan PRA_RESTORE tidak dihapus otomatis. | Retensi menghapus objek storage serta record backup dan mencatat audit. |
| ADR-017 | Haluan Kerja pasca-MVP | Haluan Kerja Departemen serta LPJ Departemen tidak dibangun pada MVP. | Hilangkan menu dan command palette entry; catat M17 di BACKLOG.md, tetapi jangan hapus template sumber. |

### 2.2 Skema database, keamanan, dan integritas data

| ADR | Judul | Keputusan final | Konsekuensi |
|---|---|---|---|
| ADR-005 | Urutan migration | Buat kepanitiaan dan divisi sebelum gantt. Nama migration: 005_kepanitiaan lalu 006_gantt. | Gantt memiliki FK valid ke divisi dan kepanitiaan pada database kosong. |
| ADR-006 | Pengeluaran di luar RAB | Nota boleh dialokasikan di luar RAB dengan rab_item_id NULL dan uraian_luar_rab wajib terisi. | LPJ dapat menemukan pengeluaran luar RAB secara nyata. |
| ADR-007 | Total alokasi nota | Trigger DB hanya menolak total alokasi yang melebihi total nota. Service submit dan verifikasi wajib menolak bila total tidak persis sama. | Insert bertahap tetap bisa dilakukan; invariant kesamaan tetap dipenuhi sebelum nota diproses. |
| ADR-008 | Durasi persiapan proker | Durasi 15–45 hari adalah aturan organisasi tetap pada MVP. Jangan simpan durasi_persiapan_min/max di app_config. | Gunakan CHECK constraint database, bukan nilai configurable. |
| ADR-011 | Privasi turunan nota | Master, preview, dan thumbnail nota berada di storage privat. Preview/thumb dikirim melalui signed URL yang diautorisasi. Bucket public hanya untuk aset yang memang boleh publik, misalnya logo/stempel/avatars. | Konsisten dengan PRD: file nota tidak dapat diakses dengan URL publik. |

SQL final yang harus dicantumkan oleh T-002:

~~~sql
-- ADR-006
rab_item_id UUID REFERENCES rab_item(id),
uraian_luar_rab TEXT,
CONSTRAINT nota_alokasi_target_wajib CHECK (
  rab_item_id IS NOT NULL OR uraian_luar_rab IS NOT NULL
);
CREATE UNIQUE INDEX nota_alokasi_item_unik
  ON nota_alokasi (nota_id, rab_item_id)
  WHERE rab_item_id IS NOT NULL;

-- ADR-008
CONSTRAINT durasi_persiapan_15_45 CHECK (
  kategori <> 'TERJADWAL' OR
  (tanggal_hari_h_mulai - tanggal_mulai_persiapan) BETWEEN 15 AND 45
);
~~~

Catatan ADR-007: validasi persamaan dilakukan setelah semua alokasi telah ada, ketika request submit nota dan ketika Bendahara menekan verifikasi. Trigger constraint tetap DEFERRABLE INITIALLY DEFERRED untuk menjaga batas atas.

## 3. Peta fase dan task

| Fase | Task | Output fase |
|---|---|---|
| P0 — Prasyarat | T-001 sampai T-008 | Repo, ADR, environment, layanan, aset, template, pemetaan Excel, seed reference |
| P1 — Fondasi | T-009 sampai T-053 | Aplikasi dasar, design system, database, RLS, audit, auth, periode, shell |
| P2 — Persuratan | T-054 sampai T-064 | Form surat, penomoran atomik, DOCX/PDF, arsip, batch |
| P3 — Proker & Gantt | T-065 sampai T-079 | Anti-bentrok, wizard, approval, Master Gantt realtime |
| P4 — Kanban | T-080 sampai T-083 | Kanban, checklist, kendala, deadline |
| P5 — Kepanitiaan & RAB | T-084 sampai T-093 | Workspace acara, RAB, Excel, pemasukan, job desk |
| P6 — TOR & Proposal | T-094 sampai T-096 | Editor dan generator TOR/Proposal |
| P7 — Nota & LPJ | T-097 sampai T-105 | Pipeline gambar, nota, RAB aktual, LPJ |
| P8 — Kesekretariatan | T-106 sampai T-109 | Notulensi, pengurus, ruangan, backlog M17 |
| P9 — Rilis | T-110 sampai T-116 | Backup, restore, security, performance, a11y, UAT |

Fase P0 dapat dimulai paralel dengan P1 hanya untuk task yang dependency-nya mengizinkan. Agent tetap hanya boleh mengerjakan satu task per sesi.

## 4. Aturan pemilihan dan pelaporan task

### 4.1 Status task

| Status | Arti | Aksi agent |
|---|---|---|
| TODO | Dependency belum selesai atau belum dipilih | Jangan kerjakan. |
| READY | Semua dependency selesai dan dapat dimulai | Pilih satu task ini. |
| IN_PROGRESS | Sedang dikerjakan pada sesi aktif | Jangan ada agent lain menyentuhnya. |
| BLOCKED | Membutuhkan kredensial, keputusan manusia, atau kondisi eksternal | Tulis alasan, lanjut ke READY independen bila ada. |
| DONE | Kontrak dan verifikasi lulus | Jangan ubah tanpa task perbaikan baru. |

### 4.2 Laporan hasil task

Setelah setiap task, laporan agent wajib memuat:

1. Task ID dan judul.
2. File yang dibuat atau diubah, persis.
3. Perintah verifikasi yang dijalankan beserta output nyata.
4. Status tasks.json dan commit hash.
5. Penyimpangan, blocker, atau ADR baru bila ada.

Tidak boleh menyatakan selesai hanya karena kode berhasil ditulis.

## 5. Tooling dan perintah quality gate

T-010 wajib membuat command berikut. Nama ini stabil agar seluruh task dapat menggunakannya.

| Perintah | Fungsi wajib |
|---|---|
| npm run verify | Menjalankan typecheck, lint, dan unit test; gagal jika salah satu gagal. |
| npm run typecheck | TypeScript strict tanpa error. |
| npm run lint | Lint project. |
| npm run test | Unit/integration test. |
| npm run test:e2e | Test Playwright. |
| npm run build | Build production Next.js. |
| npm run db:reset | Menghapus database development test secara aman lalu menjalankan migration dari nol. |
| npm run db:migrate | Menerapkan migration berurutan dan memverifikasi checksum. |
| npm run db:test | Menjalankan test SQL dan matriks integrasi. |
| npm run seed | Memasukkan seed reference tanpa data personal fiktif. |
| npm run check:env | Memvalidasi variable environment dan mencetak seluruh variable yang kurang. |

Sebelum task bertanda DONE, agent menjalankan seluruh perintah pada field Verifikasi task dan npm run verify. Untuk task database, db:reset, db:migrate, dan db:test juga wajib.

## 6. Gerbang fase

Agent tidak boleh mengerjakan task fase tujuan yang bergantung pada gerbang ini sampai seluruh kriteria lulus dan field gerbang di tasks.json diperbarui.

| Gerbang | Transisi | Kriteria lulus |
|---|---|---|
| G0 | P0 → P1 | 11 template DOCX lulus dry run; stempel PNG transparan; 17 ADR tertulis. |
| G1 | P1 → P2/P3 | db:reset bersih dari nol; db:test hijau; 8 role memiliki 8 menu; audit merekam setiap mutasi. |
| G2 | P2 → P6 | 50 approval paralel menghasilkan 50 nomor unik; DOCX terbuka di Word tanpa peringatan. |
| G3 | P3 → P5 | Uji concurrency dua koneksi nyata lulus; Master Gantt 48 bar di bawah 500 ms; realtime di bawah 3 detik. |
| G4 | P5 → P7 | Export Excel identik template; roundtrip import identik; RAB terkunci ditolak RLS. |
| G5 | P7 → P9 | Uji cetak fisik nota lulus; total LPJ sama dengan jumlah nota terverifikasi. |
| G6 | P9 → RILIS | Restore end-to-end di bawah 1 jam; 10 metrik performa terukur; UAT lima pengurus selesai. |

## 7. Invariant non-negotiable

Detail lengkap invariant ada di docs/ai/AGENT_RULES.md. Ringkasan ini dipakai sebagai pemeriksaan sebelum agent menyelesaikan task:

- RLS dan application guard selalu hadir untuk akses data.
- BPH tidak pernah memperoleh hak tulis atau menjadi approver.
- Anti-bentrok TERJADWAL hanya dikunci oleh EXCLUDE constraint pada database.
- Nomor surat hanya dialokasikan saat approval melalui advisory lock database.
- Audit log append-only dan setiap mutasi memiliki audit context.
- RAB terkunci ditolak di RLS; Excel bukan antarmuka input utama.
- Turunan gambar dibuat paralel dari satu sumber; master tidak pernah direkompresi saat diunduh.
- Status selalu memiliki teks/ikon pendamping, bukan hanya warna.

## 8. Kondisi berhenti

Agent harus berhenti dan menandai BLOCKED bila:

1. Task menyatakan butuh manusia dan data/kredensial belum diberikan.
2. Ada dua kegagalan verifikasi dengan penyebab yang sama.
3. Requirement tidak dapat diputuskan dari Keputusan Terkunci, PRD, atau System Design.
4. Implementasi memerlukan dependency di luar SYSTEM_DESIGN §2.
5. Perubahan berisiko membutuhkan penggantian secret, provisioning akun, atau tindakan eksternal yang belum disetujui.

Saat berhenti, agent tidak menambal secara spekulatif. Ia melaporkan task ID, bukti error, file terdampak, keputusan yang dibutuhkan, dan langkah aman berikutnya.

## 9. Definisi MVP siap rilis

MVP dinyatakan siap hanya bila G0 sampai G6 lulus, tidak ada task MVP berstatus TODO/READY/IN_PROGRESS, task BLOCKED memiliki keputusan eksplisit untuk dikeluarkan dari scope, dan seluruh bukti verifikasi disimpan sesuai kontrak task.
