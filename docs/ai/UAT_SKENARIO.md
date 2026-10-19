# UAT_SKENARIO — Skenario uji penerimaan pengguna (T-116)

Skenario end-to-end untuk sesi UAT bersama pengurus. Diturunkan dari
`docs/USER_FLOW.md`; setiap skenario dijalankan **oleh pengurus pemegang role
itu, tanpa bantuan**, dengan panduan di `docs/panduan/` sebagai satu-satunya
pegangan. Fasilitator hanya mengamati dan mencatat di `UAT_HASIL.md`.

## Cara menjalankan sesi

1. **Lingkungan:** staging/produksi dengan data periode berjalan (bukan DB uji
   e2e). Admin menyiapkan akun peserta dan satu periode aktif.
2. **Prasyarat data** (disiapkan fasilitator sebelum sesi, lihat kolom
   *Prasyarat* tiap skenario).
3. Peserta membaca panduan rolenya ±10 menit, lalu menjalankan skenario
   berurutan. Fasilitator **tidak** menunjukkan tombol; bila peserta macet
   > 3 menit, catat sebagai temuan lalu bantu dan tandai "dibantu".
4. Setiap skenario dinilai **Lulus** (selesai tanpa bantuan dan hasil sesuai),
   **Lulus dengan catatan**, atau **Gagal**. Setiap temuan diklasifikasikan:
   - **Blocker** — alur tidak dapat diselesaikan atau data salah;
   - **Perbaikan** — selesai, tetapi membingungkan/lambat/berisiko salah;
   - **Catatan** — saran kosmetik atau peningkatan.
5. UAT dinyatakan lulus hanya bila **tidak ada blocker terbuka**.

Kriteria kontrak T-116: Ketua, Sekum, Bendum, dan **dua** Kadept menyelesaikan
alur end-to-end tanpa bantuan (UAT-01 dijalankan dua Kadept berbeda).

---

## UAT-01 · Kadept — proker terjadwal, hadapi konflik, ubah tanggal, ajukan

| | |
|---|---|
| **Aktor** | Kepala Departemen (dijalankan oleh **dua** Kadept) |
| **Sumber** | USER_FLOW §4.1, §4.2 · panduan `kadept.md` §3–4 |
| **Prasyarat** | Ada satu proker terjadwal departemen lain yang sudah **disetujui** (mengunci kalender) pada rentang R yang diberitahukan fasilitator |

1. Masuk sebagai Kadept.
2. Buka **Program Kerja → Kalender Ketersediaan**; temukan rentang R yang
   terkunci dan catat nama proker penguncinya.
3. **Tambah proker**: kategori *Terjadwal*, isi informasi dasar.
4. Di **Penjadwalan**, sengaja pilih masa persiapan/Hari-H yang **beririsan
   dengan R**.
5. **Diharapkan:** peringatan konflik muncul menyebut proker & departemen
   pengunci; Anda belum dapat melanjutkan dengan rentang itu.
6. Geser tanggal ke rentang kosong (masa persiapan 15–45 hari sebelum Hari-H).
7. **Diharapkan:** peringatan hilang.
8. Lengkapi langkah 3–5 wizard (anggaran, kepanitiaan dengan ≥ 2 divisi, Gantt).
9. **Tinjau & Ajukan** → **Ajukan proker**.
10. **Diharapkan:** proker berstatus *Menunggu approval* di Daftar Proker dan
    muncul di Antrian Approval Ketua.

## UAT-02 · Ketua — setujui proker, cek kepanitiaan terbentuk otomatis

| | |
|---|---|
| **Aktor** | Ketua Umum |
| **Sumber** | USER_FLOW §4.3, §6.1 · panduan `ketua.md` §3 |
| **Prasyarat** | UAT-01 selesai (minimal satu proker terjadwal menunggu approval) |

1. Masuk sebagai Ketua; lihat panel **Antrian approval** di Beranda.
2. Buka proker dari UAT-01; periksa jadwal, anggaran, rencana kepanitiaan.
3. Klik **Setujui**.
4. **Diharapkan:** status *Disetujui*; proker tampil di **Master Gantt**
   Beranda; **Kalender Ketersediaan** kini menandai rentangnya terkunci.
5. Buka **Acara Besar → Daftar Acara**.
6. **Diharapkan:** acara baru dari proker itu ada, dengan divisi sesuai rencana
   kepanitiaan dan ruang kerja per divisi.
7. (Opsional) Buka proker kedua, pilih **Minta revisi** dengan catatan.
   **Diharapkan:** proker berstatus *Perlu revisi*, catatan terbaca pengusul.

## UAT-03 · Sekum — surat peminjaman ruangan, setujui, unduh DOCX

| | |
|---|---|
| **Aktor** | Sekretaris Umum |
| **Sumber** | USER_FLOW §5.1, §5.2, §9.3 · panduan `sekum.md` §3–5, §9 |
| **Prasyarat** | Ketua sudah mengunggah tanda tangan di Profil; ada minimal satu ruangan terdaftar |

1. Masuk sebagai Sekum.
2. **Kesekretariatan → Peminjaman Ruangan** → **Catat peminjaman** (ruangan,
   tanggal, jam, kegiatan).
3. Klik **Buat Surat Peminjaman Ruangan** pada peminjaman itu.
4. **Diharapkan:** form surat terbuka dengan ruangan, kegiatan, waktu, dan
   tujuan terisi; pratinjau di kanan ikut berubah saat Anda mengetik.
5. Lengkapi kolom yang masih kosong, klik **Ajukan**.
6. Buka **Persuratan → Antrian Approval**, buka surat tadi, klik **Setujui**.
7. **Diharapkan:** surat *Terbit* dengan nomor berformat
   `05/NNN/UN43.3.7/HMIF/<bulan romawi>/<tahun>`, berurutan dari nomor terakhir.
8. Buka surat → **Unduh DOCX**; buka berkasnya di Word/LibreOffice.
9. **Diharapkan:** kop HMIF, nomor, isi, tanda tangan Ketua dan stempel tampil;
   tidak ada peringatan berkas rusak.

## UAT-04 · Bendum — verifikasi 5 nota, cek RAB Aktual, generate LPJ

| | |
|---|---|
| **Aktor** | Bendahara Umum |
| **Sumber** | USER_FLOW §7.2, §7.4, §6.4 · panduan `bendum.md` §3–5 |
| **Prasyarat** | Satu acara dengan RAB **disetujui & terkunci**; ≥ 5 nota menunggu verifikasi (dari UAT-05 dan/atau panitia); ≥ 1 foto dokumentasi kegiatan |

1. Masuk sebagai Bendum; **Keuangan → Verifikasi Nota**.
2. Untuk **5 nota**: bandingkan gambar dengan data, lalu **Setujui** (minimal
   satu nota diuji **Minta perbaikan** dengan catatan, lalu disetujui setelah
   diperbaiki panitia).
3. **Diharapkan:** antrian berkurang; nota terverifikasi tidak lagi tampil.
4. Buka tab **RAB** acara.
5. **Diharapkan:** RAB berstatus *Realisasi*; RAB aktual per item = jumlah
   alokasi nota terverifikasi; sisa anggaran terhitung.
6. Tab **LPJ** → **Buka LPJ**; lengkapi bagian manual dan foto dokumentasi.
7. **Buat dokumen LPJ** → periksa DOCX → **Ajukan** → **Setujui**.
8. **Diharapkan:** total pengeluaran di LPJ = jumlah nota terverifikasi; lampiran
   nota berisi gambar nota; LPJ menunggu **Setujui & finalkan** Ketua.

## UAT-05 · Anggota — upload nota dari ponsel, alokasi ke 2 item RAB

| | |
|---|---|
| **Aktor** | Anggota (koordinator/panitia sebuah divisi) |
| **Sumber** | USER_FLOW §7.1, §7.3 · panduan `anggota.md` §3–4 |
| **Prasyarat** | Peserta terdaftar di divisi acara yang RAB-nya punya ≥ 2 item; ponsel dengan kamera dan koneksi seluler; satu nota belanja fisik |

1. Di **ponsel**, masuk sebagai Anggota.
2. **Keuangan → Upload Nota** → **Upload nota**.
3. Pilih **dua** item RAB.
4. **Ambil / pilih foto nota** → potret nota fisik → periksa hasil luruskan →
   **Gunakan**.
5. Isi tanggal belanja dan total nota; bagi nominal ke kedua item sampai sisa
   **Rp0**. Coba dulu alokasi yang tidak seimbang.
6. **Diharapkan:** pengiriman ditolak dengan pesan selisih selama alokasi ≠
   total; setelah seimbang, **Kirim nota** berhasil.
7. **Diharapkan:** nota tampil di **Nota saya** sebagai *Menunggu Verifikasi*;
   Bendum melihatnya di antrian (lanjut ke UAT-04).

---

## Skenario tambahan (disarankan)

| ID | Aktor | Skenario | Sumber |
|---|---|---|---|
| UAT-06 | Admin | Undang 2 pengurus (satu manual, satu import), salin tautan, pengurus mengaktifkan akun dan masuk | USER_FLOW §2.1–2.2 · `admin.md` §3 |
| UAT-07 | Sekum | Notulensi rapat dengan daftar hadir dari Data Pengurus, 2 poin keputusan, 1 action item; unduh DOCX | USER_FLOW §9.2 · `sekum.md` §7 |
| UAT-08 | Kadept | Buat 3 kartu Kanban, pindahkan antar-kolom, laporkan kendala **Kritis**; Ketua melihatnya di Beranda < 3 detik | USER_FLOW §8 · `kadept.md` §7–8 |
| UAT-09 | Ketua | Finalkan LPJ dari UAT-04 dan unduh berkas final | USER_FLOW §7.4 · `ketua.md` §6 |
| UAT-10 | BPH | Telusuri audit log perubahan proker UAT-01/02 (siapa, kapan) tanpa dapat mengubah apa pun | USER_FLOW §1.2 · `bph.md` §6 |

## Pemetaan ke gate otomatis

Sebelum sesi, fasilitator memastikan gate e2e yang menutupi alur yang sama
hijau di staging (`npm run test:e2e -- <spec>`). Gate tidak menggantikan UAT —
ia memastikan sesi tidak terbuang oleh bug yang sudah dapat dideteksi mesin.

| Skenario | Gate e2e |
|---|---|
| UAT-01 | `wizard-proker-1-3`, `wizard-proker-4-6`, `kalender-ketersediaan` |
| UAT-02 | `approval-proker` |
| UAT-03 | `peminjaman-ruangan`, `surat-form`, `surat-approval` |
| UAT-04 | `verifikasi-nota`, `rab-lock`, `lpj-generate` |
| UAT-05 | `upload-nota` (proyek mobile 375 px) |
| UAT-06 | `undangan` |
