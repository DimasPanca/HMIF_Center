# TEMPLATE_MAPPING.md — Peta pembedahan template DOCX

**Task:** T-006 · **Status:** selesai — 11 template dibangun dan lulus dry run
**Sumber:** SYSTEM_DESIGN §8.2, §8.3, §17 · PRD F-4.2, F-10.1, F-10.2, F-12.1 · ADR-021

---

## 0. Status

| Bagian T-006 | Status |
|---|---|
| Peta teks asli → placeholder → sumber data | ✅ dokumen ini |
| `scripts/template-dryrun.ts` | ✅ `LULUS — 11 berkas, nol placeholder tak terisi` |
| `templates/*.docx` — 11 berkas ber-placeholder | ✅ dibangun `scripts/build-templates.ts` |

Pembedahannya **tidak dikerjakan di Word.** Semula bagian ini ditandai butuh
manusia, dengan alasan bahwa menyunting `.docx` lewat kode berarti membongkar
`word/document.xml` dan berisiko merusaknya. Alasan itu berlaku untuk
pembongkaran struktur — dan tidak berlaku untuk apa yang sebenarnya dibutuhkan
di sini.

Yang dibutuhkan hampir seluruhnya penggantian **teks**: `05/379/...` menjadi
`{nomor_lengkap}`, satu baris tabel dibungkus `{#items}`, satu bagian contoh
diganti satu placeholder. `scripts/docx-surgery.ts` hanya menyentuh isi `<w:t>`
dan menyalin `<w:p>` yang sudah ada. Tag struktur — `<w:pPr>`, `<w:rPr>`,
`<w:tblPr>`, relasi gambar — tidak pernah dibaca, apalagi ditulis. Kop surat,
margin, font, penomoran, dan tata letak tabel karena itu tetap persis seperti
aslinya.

Hasilnya juga bisa diulang. Berkas contoh di `Template/` boleh diperbarui kapan
pun; jalankan ulang skripnya dan kesebelas template ikut terbarui, tanpa ada
yang perlu mengingat langkah apa saja yang dulu dikerjakan.

---

## 1. Cara membangun ulang

```bash
npx tsx scripts/build-templates.ts
npx tsx scripts/template-dryrun.ts
```

Perintah pertama membaca berkas contoh di `Template/`, menerapkan resep di
`scripts/build-templates.ts`, dan menulis hasilnya ke `templates/`. Perintah
kedua menjalankan kesebelasnya dengan data dummy lengkap dan gagal bila ada
satu placeholder pun yang tidak menemukan datanya.

Tambahkan `--teks` pada perintah kedua untuk mencetak hasil render sebagai teks
biasa. Itu satu-satunya cara memeriksa hal yang lolos dry run tetapi salah
dibaca manusia — judul notulensi yang menjadi "Rapat Rapat Kerja", atau seluruh
butir daftar yang berdempet jadi satu baris.

**Yang berubah harus resepnya, bukan berkas `.docx`-nya.** Menyunting hasil di
Word akan tertimpa pada `build-templates.ts` berikutnya, dan alasan perubahannya
hilang tanpa jejak. Setiap operasi di resep wajib mengenai sasarannya; yang
meleset menghentikan skrip, karena penggantian yang diam-diam gagal
menghasilkan template yang **kehilangan** satu placeholder — dan `dryrun` tidak
akan menangkapnya, sebab ia hanya memeriksa tag yang ada.

---

## 2. Aturan yang berlaku untuk semua berkas

### 2.1 Kop surat tidak boleh disentuh

Kop surat adalah gambar (`<a:blip>`), bukan teks, dan tidak muncul di satu pun tabel peta di bawah. `docx-surgery.ts` tidak punya operasi yang dapat menyentuhnya: seluruh operasinya bekerja pada isi `<w:t>` atau pada salinan `<w:p>`. Kop surat aman bukan karena dijaga, melainkan karena tidak terjangkau.

### 2.2 Yang aman, dan yang benar-benar berbahaya

Ada satu kekhawatiran yang sering diwariskan turun-temurun soal template DOCX: "placeholder rusak kalau formatnya berubah di tengah". Word memang memecah satu kalimat menjadi beberapa `<w:t>` begitu ada perubahan format sekecil apa pun — berkas contoh ini sendiri menyimpan satu NIM sebagai dua potongan:

```
r2 (4 sel): "Muhammad Zidan Heiqmatyar | NIM. 33372300 | 84"
                                                     ^^^^^^^^
                     satu angka, dua <w:t> — karena formatnya berubah di tengah
```

**Kekhawatiran itu diuji, dan tidak terbukti.** docxtemplater 3.69.3 menyatukan run sebelum mengurai tag:

| Uji | Bentuk di XML | Hasil |
|---|---|---|
| A | `{nama}` dalam satu run | `Halo Dimas` |
| B | `{na` + `ma}` dua run, satu paragraf | `Halo Dimas` |
| C | `{no` + `mor_leng` + `kap}` tiga run | `Nomor : 05/379` |
| D | `{na` di satu paragraf, `ma}` di paragraf berikutnya | `Halo Dimas` |
| J | `{na` di satu sel tabel, `ma}` di sel sebelahnya | `Dimas` |

Itu sebabnya resep di `build-templates.ts` boleh mencari kalimat utuh seperti `"Kelengkapan Persyaratan Administrasi Beasiswa."` tanpa peduli Word memecahnya menjadi berapa potong. `docx-surgery.ts` menggabungkan seluruh `<w:t>` satu paragraf sebelum mencari, lalu mengembalikan hasilnya ke potongan semula — sehingga format bagian yang TIDAK diganti tetap utuh.

**Yang berbahaya justru hal lain: salah ketik nama placeholder tidak menimbulkan galat apa pun.**

```
F. placeholder tanpa data (nullGetter bawaan)
   {tidak_ada}   ->   "X undefined Y"
```

Dokumen tetap jadi, Word tetap membukanya, dan di tengah surat resmi tertulis kata `undefined`. Tidak ada peringatan, tidak ada exit code, tidak ada yang gagal. `{nomor_lengkap}` yang salah ketik menjadi `{nomor_lengkep}` akan lolos sampai ada orang membaca surat yang sudah dicetak.

Itulah alasan `scripts/template-dryrun.ts` tidak menunggu galat, melainkan **memasang pelacak** (`nullGetter`) yang mencatat setiap placeholder yang tidak menemukan datanya, lalu keluar dengan status 1. Satu-satunya cara kesalahan ini tertangkap adalah dengan mencarinya secara aktif.

Kesalahan yang **memang** menimbulkan galat hanya dua, dan keduanya tertangkap saat berkas dibuka:

| Uji | Bentuk | Galat |
|---|---|---|
| E | `{#items}` tanpa `{/items}` | `The loop with tag "items" is unclosed` |
| I | `{@raw}` bersama teks lain di paragraf yang sama | `The raw tag should be the only text in this paragraph` |

Tag `{@...}` tidak dipakai satu pun template di sini, tetapi `{%...}` — yang dipakai — aman disandingkan dengan teks lain dalam satu paragraf.

### 2.3 Kurung kurawal biasa harus dihindari

Segala `{` dan `}` di dalam dokumen dibaca docxtemplater sebagai tag. Bila ada teks asli yang memang memuat kurung kurawal — tidak ditemukan pada sebelas berkas ini, tetapi bisa muncul kelak — ia harus dihapus atau diganti.

Pola `(Nama Rapat)`, `(Tanggal)`, `(...........)` pada `Template Notulensi.docx` dan `Template LPJ HMIF.docx` memakai **kurung biasa**: aman bagi docxtemplater, tetapi semuanya adalah tempat placeholder harus masuk. Seluruhnya tercatat di §5.

### 2.4 Yang tidak boleh berubah

Margin, font, ukuran huruf, spasi baris, jumlah kolom tabel, dan urutan bagian. Placeholder mengganti **nilai**, bukan struktur. Setiap penyimpangan tercatat sebagai temuan di §7 dengan alasan tertulis.

---

## 3. Kamus placeholder

### 3.1 Global — SYSTEM_DESIGN §8.3, dipakai apa adanya

| Placeholder | Sumber | Contoh nilai |
|---|---|---|
| `{nomor_lengkap}` | `surat.nomor_lengkap` | `05/379/UN43.3.7/KT2HMIF/VIII/2025` |
| `{tanggal_surat_format}` | `surat.tanggal_surat`, diformat Indonesia | `Senin, 04 Agustus 2025` |
| `{kota}` | `surat.kota` | `Cilegon` |
| `{lampiran}` | `surat.lampiran` | `1 (satu) Lembar` |
| `{perihal}` | `surat.perihal` | `Permohonan Peminjaman Tandu` |
| `{tujuan_nama}` | `surat.tujuan_nama` | `Ketua DPM FT UNTIRTA` |
| `{tujuan_alamat}` | `surat.tujuan_alamat` | `di Tempat` |
| `{isi_paragraf}` | `surat.isi_html` → teks | (paragraf isi surat) |
| `{nama_kegiatan}` | `data_dinamis.nama_kegiatan` | `AKSARA` |
| `{hari_tanggal}` | `data_dinamis.hari_tanggal` | `Selasa - Kamis, 19 - 21 Agustus 2025` |
| `{waktu}` | `data_dinamis.waktu` | `08:10 - 09:00 WIB` |
| `{tempat}` | `data_dinamis.tempat` | `Kampus FT UNTIRTA` |
| `{%stempel}` | `Stempel Digital HMIF.jpeg` | gambar |

### 3.2 Tambahan — dibutuhkan tujuh surat nyata, tidak ada di §8.3

Semuanya masuk `surat.data_dinamis` (JSONB).

| Placeholder | Dipakai berkas | Contoh nilai | Kenapa perlu |
|---|---|---|---|
| `{tema_kegiatan}` | 04-pemateri · 05-barang · 08 | `Aktualisasi Kepemimpinan Seimbang yang Rasional dan Amanah` | Ketiganya menulis nama panjang tema di dalam kurung sesudah singkatannya. Tanpa field terpisah, kalimat itu harus dititipkan ke `{nama_kegiatan}` dan singkatannya hilang. |
| `{label_atas}` | 03 · 04-pemateri · 05-barang · 05-ruangan · 08 | `Panitia AKSARA IF`, `Hormat Kami,` | Sel gabungan di atas kedua kolom tanda tangan. Bukan nama kegiatan: `Panitia MUSMAIF` untuk kegiatan `MUSMAIF`, tetapi `Panitia AKSARA IF` untuk kegiatan `AKSARA`. Pada Aspirasi sel yang sama berisi `Hormat Kami,`. |
| `{nama_pemohon}` | 02 | `Dicky Saputra` | Surat Keterangan Aktif menerangkan **orang lain**, bukan penandatangan. |
| `{nim_pemohon}` | 02 | `3337220032` | idem |
| `{jabatan_pemohon}` | 02 | `Staff Departemen Kaderisasi` | idem — akhiran `_pemohon` wajib, lihat §3.3 |
| `{keperluan}` | 02 | `Kelengkapan Persyaratan Administrasi Beasiswa` | Kalimat penutup surat keterangan berubah tiap pemohon. |
| `{topik_materi}` | 04-pemateri | `Kepemimpinan` | `...hadir sebagai Pembicara dengan topik {topik_materi}...` |
| `{barang}` | 05-barang | `Tandu` | Kata benda di kalimat isi: `...bermaksud untuk meminjam {barang} guna...`. Terpisah dari tabel `{#items}`: kalimatnya menyebut satu ringkasan, tabelnya merinci. |
| `{ruangan}` | 05-ruangan | `Ruangan Auditorium FT` | idem |
| `{tujuan_jabatan}` | 04-pemateri · 05-ruangan | `Demisioner Ketua Himpunan HMIF 1.0`, `Fakultas Teknik UNTIRTA` | Baris kedua blok alamat, di antara `{tujuan_nama}` dan `{tujuan_alamat}`. Ada pada dua surat, tidak ada pada lima lainnya — karena itu field tersendiri, bukan dilebur ke `tujuan_nama`. |
| `{jenis_mitra}` | 08 | `Rumah Sakit` | `...memohon kerjasama dengan {jenis_mitra} Bapak/Ibu/Saudara...` |

### 3.3 Aturan penamaan: jangan pakai `{nama}`, `{jabatan}`, `{nim}` di tingkat atas

docxtemplater menerapkan **scoping**. Di dalam `{#kiri}...{/kiri}`, tag `{nama}` merujuk pada `kiri.nama`, bukan `nama` tingkat atas. Bila tingkat atas juga memakai `{nama}`, dua hal berbeda memakai satu nama dan yang menang bergantung pada letaknya di dokumen — persis jenis kesalahan yang tidak akan tertangkap sampai ada surat tercetak dengan nama orang yang salah.

Karena itu enam nama ini **dicadangkan** untuk isi blok tanda tangan:

```
{nama}   {jabatan}   {nim}   {label}   {%ttd}   {%stempel}
```

Kebutuhan serupa di tingkat atas memakai akhiran yang menyebut perannya: `{nama_pemohon}`, `{jabatan_pemohon}`, `{nim_pemohon}`, `{tujuan_jabatan}`, `{label_atas}`.

---

## 4. Loop, penanda gambar, dan blok tanda tangan

### 4.1 Empat loop

| Loop | Bentuk di dokumen | Field di dalamnya |
|---|---|---|
| `{#items}` | baris tabel | `{no}` `{kebutuhan}` `{banyaknya}` |
| `{#rundown}` | baris tabel | `{hari_tanggal}` `{waktu}` `{acara}` `{keterangan}` |
| `{#poin}` | paragraf | `{judul}`, lalu `{#paragraf}{teks}{/paragraf}` |
| `{#kiri}` / `{#kanan}` | sel tabel | `{label}` `{jabatan}` `{nama}` `{nim}` `{%ttd}` `{%stempel}` |

**Loop dalam tabel:** letakkan tag pembuka di **sel pertama baris contoh** dan tag penutup di **sel terakhir baris yang sama**. Baris itu akan diulang sebanyak isi data. Jangan menambah baris kosong pembungkus — docxtemplater mengulang barisnya sendiri.

```
SEBELUM                            SESUDAH
+-----+-----------+-----------+    +--------------+-------------+---------------------+
| No. | Kebutuhan | Banyaknya |    | No.          | Kebutuhan   | Banyaknya           |
+-----+-----------+-----------+    +--------------+-------------+---------------------+
| 1.  | Tandu     | 2 unit    |    | {#items}{no} | {kebutuhan} | {banyaknya}{/items} |
+-----+-----------+-----------+    +--------------+-------------+---------------------+
```

**Loop paragraf bersarang (`{#poin}`):** empat paragraf berdiri sendiri, tanpa teks lain di barisnya.

```
{#poin}{judul}
{#paragraf}{teks}{/paragraf}
{/poin}
```

Baris `{judul}` mempertahankan gaya penomoran asli (List Number); baris `{teks}` mempertahankan gaya paragraf biasa. `{#poin}` dan `{judul}` harus berada di **paragraf yang sama** — bila dipisah menjadi dua baris, penomoran otomatis Word menghasilkan satu nomor kosong di setiap iterasi.

### 4.2 Blok tanda tangan — `{#kiri}` dan `{#kanan}`, bukan `{#signers}`

**Alasan lengkap: [ADR-021](../adr/ADR-021-blok-tanda-tangan-bukan-loop.md).** Ringkasnya: blok tanda tangan adalah tabel tiga kolom dengan penandatangan **berdampingan**, sedangkan loop docxtemplater mengulang **baris**. `{#signers}` akan menumpuk dua penandatangan ke bawah dan merusak tata letak surat resmi.

Bentuk tabelnya, sebagaimana terukur pada lima surat dua-penandatangan:

```
      kolom 1 (KIRI)                 kolom 2      kolom 3 (KANAN)
r1  +==========================================================================+
    |  {label_atas}                    (sel gabungan seluruh lebar)            |
r2  +---------------------------+  +----------+  +---------------------------+
    | {#kiri}{jabatan}{/kiri}   |  |          |  | {#kanan}{label}           |
    |                           |  | pemisah  |  | {jabatan}{/kanan}         |
r3  +---------------------------+  |          |  +---------------------------+
    | {#kiri}{%ttd}             |  | (kosong) |  | {#kanan}{%ttd}{%stempel}  |
    | {nama}                    |  |          |  | {nama}                    |
    | NIM. {nim}{/kiri}         |  |          |  | NIM. {nim}{/kanan}        |
r4  +==========================================================================+
    |                                  (sel gabungan, kosong)                  |
    +--------------------------------------------------------------------------+
```

Kolom 2 dibiarkan apa adanya — ia pemisah, dan lebarnya yang menjaga jarak antar tanda tangan.

> **Aturan yang tidak boleh dilanggar: satu pasang `{#kiri}`…`{/kiri}` harus terbuka dan tertutup di dalam SATU sel.**
>
> Karena itu pasangan tag muncul dua kali per kolom — sekali di r2, sekali di r3 — bukan sekali membentang dari r2 sampai r3. Tag yang membentang antar baris membuat docxtemplater memperlakukan r2–r3 sebagai **loop baris**. Untuk satu penandatangan hasilnya kebetulan benar, tetapi begitu `kiri` bernilai `null` kedua baris itu dihapus seluruhnya — **termasuk isi kolom kanan** yang tidak ada hubungannya. Surat satu penandatangan akan kehilangan tanda tangan satu-satunya yang ia punya.

`{label}` menampung baris pembuka milik kolom kanan — nilainya `Mengetahui,` pada lima surat kepanitiaan. Sel gabungan r1 bukan milik salah satu kolom, jadi ia memakai `{label_atas}` di tingkat atas, bukan `{label}`.

Bila surat hanya punya satu penandatangan, generator mengirim `kiri: null` dan seluruh isi sel kiri hilang sementara barisnya tetap ada — tidak perlu template terpisah.

Sumber datanya `surat_signer`, dipetakan generator (T-062):

```ts
kiri:  signers.find((s) => s.posisi === 'KIRI')  ?? null,
kanan: signers.find((s) => s.posisi === 'KANAN') ?? null,
```

| Field blok | Sumber |
|---|---|
| `{label}` | `data_dinamis.label_kanan` — lihat Temuan 5 |
| `{jabatan}` | `surat_signer.jabatan` |
| `{nama}` | `surat_signer.nama` |
| `{nim}` | `surat_signer.nim` |
| `{%ttd}` | gambar `signature` milik `user_id`, bila `pakai_ttd` |
| `{%stempel}` | `Stempel Digital HMIF.jpeg`, bila `pakai_stempel` |

---

## 5. Peta per berkas

Nomor paragraf pada kolom pertama mengikuti keluaran `npx tsx scripts/inspect-templates.ts "<nama berkas>"`, sehingga setiap baris peta dapat dicocokkan langsung dengan berkasnya. Baris yang tidak disebut berarti **teks tetap** — jangan diubah.

### 5.1 `surat-02-keterangan-aktif.docx`

**Sumber:** `Template/Contoh Surat Aktif Organisasi.docx` — 13 paragraf · 1 tabel · 2 gambar

| # | Teks asli | Ganti dengan | Sumber data |
|---|---|---|---|
| 2 | `Nomor : 02/274/UN43.3.7/HMIF/VII/2025` | `Nomor : {nomor_lengkap}` | `surat.nomor_lengkap` |
| 4 | `Nama:` | `Nama : {nama_pemohon}` | `data_dinamis.nama_pemohon` |
| 5 | `NIM :` | `NIM : {nim_pemohon}` | `data_dinamis.nim_pemohon` |
| 6 | `Jabatan:` | `Jabatan : {jabatan_pemohon}` | `data_dinamis.jabatan_pemohon` |
| 9 | `Kelengkapan Persyaratan Administrasi Beasiswa.` | `{keperluan}` | `data_dinamis.keperluan` |
| 10 | `Cilegon, 16 Juli 2025` | `{kota}, {tanggal_surat_format}` | `surat.kota`, `surat.tanggal_surat` |
| 11 | `Ketua HMIF FT UNTIRTA` | `{#kanan}{jabatan}` | `surat_signer.jabatan` |
| 12 | `Dicky Saputra` | `{%ttd}{%stempel}` (baris baru) `{nama}` | `surat_signer` |
| 13 | `NIM 3337220032` | `NIM {nim}{/kanan}` | `surat_signer.nim` |

**Tanda tangan:** hanya kolom kanan. Tabel 1 berisi satu baris dua sel; seluruh blok berada di sel kedua, jadi `{#kanan}` dan `{/kanan}` sudah otomatis berada dalam satu sel. Paragraf 10 (tanggal) berada **di luar** blok — biarkan begitu, ia tidak bergantung pada penandatangan.

**Perhatikan:** berkas ini menulis `NIM` tanpa titik, berbeda dari enam surat lain yang menulis `NIM.`. Pertahankan apa adanya.

**Tidak ada:** `{lampiran}`, `{perihal}`, `{tujuan_nama}`, `{tujuan_alamat}`. Surat keterangan tidak beralamat.

---

### 5.2 `surat-03-aspirasi.docx`

**Sumber:** `Template/018_Surat Aspirasi Keorganisasian Mahasiswa Fakultas Teknik.docx` — 41 paragraf · 1 tabel · 2 gambar

| # | Teks asli | Ganti dengan | Sumber data |
|---|---|---|---|
| 1 | `Nomor: 03/018/...` + `Cilegon, 19 Agustus 2026` | `Nomor: {nomor_lengkap}` ⇥ `{kota}, {tanggal_surat_format}` | `surat` |
| 2 | `Lampiran: 1 (satu) Lembar` | `Lampiran: {lampiran}` | `surat.lampiran` |
| 3 | `Perihal: Aspirasi Keorganisasian ...` | `Perihal: {perihal}` | `surat.perihal` |
| 5 | `Ketua DPM FT UNTIRTA` | `{tujuan_nama}` | `surat.tujuan_nama` |
| 6 | `di Tempat` | `{tujuan_alamat}` | `surat.tujuan_alamat` |
| 9 | `Aspirasi ini disampaikan sebagai bentuk masukan ...` | `{isi_paragraf}` | `surat.isi_html` → teks |
| 11 | `Hormat Kami,` | `{label_atas}` | `data_dinamis.label_atas` |
| 12 | `Ketua HMIF` | `{#kanan}{jabatan}` | `surat_signer.jabatan` |
| 13 | `Dimas Panca Pamungkas` | `{%ttd}{%stempel}` (baris baru) `{nama}` | `surat_signer` |
| 14 | `NIM. 3337240063` | `NIM. {nim}{/kanan}` | `surat_signer.nim` |

**Paragraf 8 dan 10 tetap.** Keduanya kalimat pembuka dan penutup baku yang sama pada setiap surat aspirasi. Hanya paragraf 9 — kalimat yang menyebut isi aspirasi kali ini — yang menjadi `{isi_paragraf}`.

**Lampiran I (paragraf 15–41)** menjadi loop bersarang. Sisakan **satu** poin sebagai kerangka, hapus empat sisanya, lalu bungkus:

```
{#poin}{judul}                     ← gaya List Number asli dipertahankan
{#paragraf}{teks}{/paragraf}       ← gaya paragraf isi
{/poin}
```

Sumber: `data_dinamis.poin` = `[{ judul, paragraf: [teks, ...] }, ...]`.

Menghapus empat poin contoh bukan perubahan tata letak — gaya, penomoran, dan indentasinya justru diwarisi oleh setiap iterasi loop. Yang harus dijaga adalah paragraf `{#poin}{judul}` tetap memakai gaya bernomor yang sama dengan aslinya.

**Tidak ada `{label}`.** Blok kanan berkas ini tidak punya baris `Mengetahui,`; menambahkannya akan menyisipkan baris kosong yang tidak ada pada surat aslinya.

---

### 5.3 `surat-04-undangan-pemateri.docx`

**Sumber:** `Template/Contoh Surat Undangan Pemateri.docx` — 349 paragraf · 4 tabel · 4 gambar

> ⚠ **Pangkas dulu.** Berkas ini bukan satu dokumen, melainkan dua yang tergabung: surat undangan (paragraf 1–21) lalu **TOR lengkap** (paragraf 22–349) beserta Lampiran RAB dan Lampiran Susunan Acara. Lihat Temuan 1. Hapus paragraf 22 sampai akhir sebelum mulai memetakan; isi TOR sudah punya berkasnya sendiri, `tor.docx`.

| # | Teks asli | Ganti dengan | Sumber data |
|---|---|---|---|
| 1 | `Nomor : 04/381/...` + `Cilegon, 07 Agustus 2025` | `Nomor : {nomor_lengkap}` ⇥ `{kota}, {tanggal_surat_format}` | `surat` |
| 2 | `Lampiran : 11 (sebelas) Lembar Acuan Kegiatan` | `Lampiran : {lampiran}` | `surat.lampiran` |
| 3 | `Perihal : Undangan Pembicara Gelar Wicara` | `Perihal : {perihal}` | `surat.perihal` |
| 5 | `Nur Ali Arfan` | `{tujuan_nama}` | `surat.tujuan_nama` |
| 6 | `Demisioner Ketua Himpunan HMIF 1.0` | `{tujuan_jabatan}` | `data_dinamis.tujuan_jabatan` |
| 7 | `di Cilegon` | `{tujuan_alamat}` | `surat.tujuan_alamat` |
| 9 | `... kegiatan AKSARA (Aktualisasi ...) ... Saudara Nur Ali Arfan ... dengan topik Kepemimpinan ...` | `... kegiatan {nama_kegiatan} ({tema_kegiatan}) ... Saudara {tujuan_nama} ... dengan topik {topik_materi} ...` | `data_dinamis` |
| 10 | `Hari, tanggal: Rabu, 20 Agustus 2025` | `Hari, tanggal: {hari_tanggal}` | `data_dinamis.hari_tanggal` |
| 11 | `Waktu: 08:10 - 09:00 WIB` | `Waktu: {waktu}` | `data_dinamis.waktu` |
| 12 | `Tempat: Fakultas Teknik ...` | `Tempat: {tempat}` | `data_dinamis.tempat` |
| 14 | `Panitia AKSARA IF` | `{label_atas}` | `data_dinamis.label_atas` |
| 15–21 | blok tanda tangan dua kolom | terapkan §4.2 | `surat_signer` |

Paragraf 9 diganti **sebagian**, bukan seluruhnya: kerangka kalimatnya baku pada setiap undangan pemateri, hanya empat nilai di dalamnya yang berubah. Mengganti seluruh paragraf dengan `{isi_paragraf}` akan memindahkan penulisan kalimat resmi ini ke tangan pengguna, dan itu justru yang ingin dihindari.

---

### 5.4 `surat-04-undangan-sambutan.docx`

**Sumber:** `Template/Contoh Surat Undangan dan Sambutan.docx` — 50 paragraf · 2 tabel · 3 gambar

| # | Teks asli | Ganti dengan | Sumber data |
|---|---|---|---|
| 1 | `Nomor : 04/492/...` + `Cilegon, 03 Oktober 2025` | `Nomor : {nomor_lengkap}` ⇥ `{kota}, {tanggal_surat_format}` | `surat` |
| 2 | `Lampiran : 1 (satu) Lembar Susunan Acara` | `Lampiran : {lampiran}` | `surat.lampiran` |
| 3 | `Perihal : Undangan Menghadiri Kegiatan MUSMAIF` | `Perihal : {perihal}` | `surat.perihal` |
| 5 | `Dewan Perwakilan Mahasiswa Fakultas Teknik UNTIRTA` | `{tujuan_nama}` | `surat.tujuan_nama` |
| 6 | `di Cilegon` | `{tujuan_alamat}` | `surat.tujuan_alamat` |
| 8 | `... kegiatan MUSMAIF (Musyawarah Mahasiswa Informatika), ... memohon perkenan kepada DPM Fakultas Teknik ...` | `... kegiatan {nama_kegiatan} ({tema_kegiatan}), ... memohon perkenan kepada {tujuan_nama} ...` | `data_dinamis` |
| 9 | `Hari, tanggal: Senin, 06 Oktober 2025` | `Hari, tanggal: {hari_tanggal}` | `data_dinamis` |
| 10 | `Waktu: 16.00 WIB s.d. Selesai` | `Waktu: {waktu}` | `data_dinamis` |
| 11 | `Tempat: Ruang Auditorium FT` | `Tempat: {tempat}` | `data_dinamis` |
| 13–19 | blok tanda tangan dua kolom | terapkan §4.2 | `surat_signer` |
| 21–50 | tabel Susunan Acara | `{#rundown}` | `data_dinamis.rundown` |

**Tanda tangan berkas ini tidak punya sel gabungan `{label_atas}`.** Tabel 1 hanya dua baris: r1 jabatan, r2 nama+NIM. Jangan menambah baris untuk menyeragamkannya dengan berkas lain.

**Susunan Acara (tabel 2, 4 kolom × 7 baris).** Sisakan **satu** baris data, hapus lima sisanya, lalu:

| kolom 1 | kolom 2 | kolom 3 | kolom 4 |
|---|---|---|---|
| `{#rundown}{hari_tanggal}` | `{waktu}` | `{acara}` | `{keterangan}{/rundown}` |

Sumber: `data_dinamis.rundown` = `[{ hari_tanggal, waktu, acara, keterangan }, ...]`.

Pada berkas asli kolom `Hari, Tanggal` hanya terisi di baris pertama dan kosong di baris lanjutan. Perilaku itu **tidak** direproduksi template — generator mengirim string kosong untuk baris lanjutan, sehingga hasilnya sama tanpa perlu aturan penggabungan sel.

---

### 5.5 `surat-05-peminjaman-barang.docx`

**Sumber:** `Template/Contoh Surat Peminjaman Barang.docx` — 25 paragraf · 2 tabel · 3 gambar

| # | Teks asli | Ganti dengan | Sumber data |
|---|---|---|---|
| 1 | `Nomor : 05/379/...` + `Senin, 04 Agustus 2025` | `Nomor : {nomor_lengkap}` ⇥ `{kota}, {tanggal_surat_format}` | `surat` |
| 2 | `Lampiran : -` | `Lampiran : {lampiran}` | `surat.lampiran` |
| 3 | `Perihal : Permohonan Peminjaman Tandu` | `Perihal : {perihal}` | `surat.perihal` |
| 5 | `Kepala Badan Penanggulangan Bencana Daerah (BPBD) Kota Cilegon` | `{tujuan_nama}` | `surat.tujuan_nama` |
| 6 | `di Tempat` | `{tujuan_alamat}` | `surat.tujuan_alamat` |
| 8 | `... kegiatan AKSARA (Aktualisasi ...) ... meminjam Tandu guna ...` | `... kegiatan {nama_kegiatan} ({tema_kegiatan}) ... meminjam {barang} guna ...` | `data_dinamis` |
| 9 | `Hari, tanggal : Selasa - Kamis, 19 - 21 Agustus 2025` + `Tempat: Kampus FT UNTIRTA` | `Hari, tanggal : {hari_tanggal}` ⇥ `Tempat: {tempat}` | `data_dinamis` |
| 11–16 | tabel Peralatan yang dibutuhkan | `{#items}` | `data_dinamis.items` |
| 18 | `Panitia AKSARA IF` | `{label_atas}` | `data_dinamis.label_atas` |
| 19–25 | blok tanda tangan dua kolom | terapkan §4.2 | `surat_signer` |

**Berkas asli berkata `05/379/...VIII/2025Senin, 04 Agustus 2025` tanpa pemisah yang terbaca.** Itu tabulasi yang hilang saat ekstraksi, bukan kesalahan. Biarkan pemisah aslinya apa adanya; ganti hanya kedua sisinya.

**Tabel kebutuhan** — sisakan baris data pertama, lalu:

| No. | Kebutuhan | Banyaknya |
|---|---|---|
| `{#items}{no}` | `{kebutuhan}` | `{banyaknya}{/items}` |

Sumber: `data_dinamis.items` = `[{ no, kebutuhan, banyaknya }, ...]`.

---

### 5.6 `surat-05-peminjaman-ruangan.docx`

**Sumber:** `Template/Contoh Surat Peminjaman Ruangan.docx` — 20 paragraf · 1 tabel · 3 gambar

| # | Teks asli | Ganti dengan | Sumber data |
|---|---|---|---|
| 1 | `Nomor : 05/491/...` + `Senin, 29 September 2025` | `Nomor : {nomor_lengkap}` ⇥ `{kota}, {tanggal_surat_format}` | `surat` |
| 2 | `Lampiran : -` | `Lampiran : {lampiran}` | `surat.lampiran` |
| 3 | `Perihal : Permohonan Peminjaman Ruang Auditorium FT` | `Perihal : {perihal}` | `surat.perihal` |
| 5 | `Kepala Bagian Sekretariat` | `{tujuan_nama}` | `surat.tujuan_nama` |
| 6 | `Fakultas Teknik UNTIRTA` | `{tujuan_jabatan}` | `data_dinamis.tujuan_jabatan` |
| 7 | `di Cilegon` | `{tujuan_alamat}` | `surat.tujuan_alamat` |
| 9 | `... kegiatan MUSMAIF (Musyawarah ...) ... meminjam Ruangan Auditorium FT guna ...` | `... kegiatan {nama_kegiatan} ({tema_kegiatan}) ... meminjam {ruangan} guna ...` | `data_dinamis` |
| 10 | `Hari, tanggal : Kamis, 09 Oktober 2025` + `Pukul: 16.00 - selesai` | `Hari, tanggal : {hari_tanggal}` ⇥ `Pukul: {waktu}` | `data_dinamis` |
| 11 | `Tempat : Auditorium FT` | `Tempat : {tempat}` | `data_dinamis.tempat` |
| 13 | `Panitia MUSMAIF` | `{label_atas}` | `data_dinamis.label_atas` |
| 14–20 | blok tanda tangan dua kolom | terapkan §4.2 | `surat_signer` |

`{ruangan}` dan `{tempat}` sengaja dua field berbeda meskipun pada contoh ini isinya mirip. Yang dipinjam bisa lebih spesifik daripada tempat acara berlangsung — `Ruangan Auditorium FT` dipinjam, `Kampus FT UNTIRTA` tempatnya.

---

### 5.7 `surat-08-kerja-sama.docx`

**Sumber:** `Template/Contoh Surat Permohonan Kerja Sama.docx` — 19 paragraf · 1 tabel · 3 gambar

| # | Teks asli | Ganti dengan | Sumber data |
|---|---|---|---|
| 1 | `Nomor : 08/376/...` + `Cilegon, 02 Agustus 2025` | `Nomor : {nomor_lengkap}` ⇥ `{kota}, {tanggal_surat_format}` | `surat` |
| 2 | `Lampiran : -` | `Lampiran : {lampiran}` | `surat.lampiran` |
| 3 | `Perihal : Permohonan Kerjasama Rumah Sakit` | `Perihal : {perihal}` | `surat.perihal` |
| 5 | `Rumah Sakit Krakatau Medika` | `{tujuan_nama}` | `surat.tujuan_nama` |
| 6 | `di Tempat` | `{tujuan_alamat}` | `surat.tujuan_alamat` |
| 8 | `... kegiatan AKSARA (Aktualisasi ...) ... kerjasama dengan Rumah Sakit Bapak/Ibu/Saudara ...` | `... kegiatan {nama_kegiatan} ({tema_kegiatan}) ... kerjasama dengan {jenis_mitra} Bapak/Ibu/Saudara ...` | `data_dinamis` |
| 9 | `Hari, tanggal : Selasa - Kamis, 19 - 21 Agustus 2025` | `Hari, tanggal : {hari_tanggal}` | `data_dinamis` |
| 10 | `Tempat : Kampus FT UNTIRTA` | `Tempat : {tempat}` | `data_dinamis` |
| 12 | `Panitia AKSARA` | `{label_atas}` | `data_dinamis.label_atas` |
| 13–19 | blok tanda tangan dua kolom | terapkan §4.2 | `surat_signer` |

---

### 5.8 `notulensi.docx`

**Sumber:** `Template/Template Notulensi.docx` — 26 paragraf · 2 tabel · 1 gambar

Berkas ini sudah berupa formulir kosong, bukan surat terisi. Pekerjaannya paling ringan: mengisi tempat yang memang sudah disediakan.

| Letak | Teks asli | Ganti dengan | Sumber data |
|---|---|---|---|
| par 5 | `NOTULENSI Rapat (Nama Rapat)` | `NOTULENSI Rapat {judul}` | `notulensi.judul` |
| tabel 2 r1 kolom 2 | `:` | `: {hari_tanggal}` | `notulensi.tanggal`, diformat |
| tabel 2 r2 kolom 2 | `:` | `: {waktu}` | `waktu_mulai` – `waktu_selesai` |
| tabel 2 r3 kolom 2 | `:` | `: {tempat}` | `notulensi.tempat` |
| tabel 2 r4 kolom 2 | `:` | `: {perihal}` | `data.perihal` |
| tabel 2 r5 kolom 2 | `:` | `: {pemimpin_rapat}` | `app_user` via `pemimpin_id` |
| tabel 2 r6 kolom 2 | `:` | `: {notulis}` | `app_user` via `notulis_id` |
| tabel 2 r7 kolom 2 | `:` | `: {hadir}` | `notulensi_attendance` berstatus `HADIR` |
| par 21 | `..` (di bawah `AGENDA:`) | `{#agenda}{teks}{/agenda}` | `notulensi.konten` |
| par 23 | `..` (di bawah `HASIL RAPAT:`) | `{#hasil}{teks}{/hasil}` | `notulensi.keputusan` |
| par 24 | `Cilegon, (Tanggal)` | `{kota}, {tanggal_format}` | `app_config.kota_default`, `notulensi.tanggal` |
| par 26 | `(.................................................)` | `({notulis})` | `app_user` via `notulis_id` |

**`{#agenda}` bersumber dari `notulensi.konten` yang berbentuk keluaran TipTap**, bukan daftar string. Generator harus meratakannya menjadi `[{ teks }]` lebih dulu. Titik perataannya sengaja di generator, bukan di database: `konten` disimpan sebagai JSON kaya supaya editor dapat memuatnya kembali persis seperti saat disimpan.

**`{#hasil}` bersumber dari `notulensi.keputusan`,** kolom terpisah — bukan bagian `konten`. Pemisahan itu disengaja (lihat komentar migrasi `011_sekretariat.sql`): keputusan rapat adalah hal yang paling sering dicari kembali, dan menguburnya di dalam paragraf bebas membuatnya mustahil dirujuk.

---

### 5.9 `tor.docx`

**Sumber:** `Template/TOR_KT1_2025.docx` — 922 paragraf · 8 tabel · 1 gambar

Keempat belas bagian PRD F-10.1, dengan placeholder yang benar-benar dipakai:

| # | Bagian | Placeholder | Sumber |
|---|---|---|---|
| — | sampul | `{nama_kegiatan}` `{tahun}` | `proker`, `periode` |
| 1 | Nama Kegiatan | `{nama_kegiatan}` | `proker.nama` |
| 2 | Tema Kegiatan | `{tema_kegiatan}` | `tor.data.tema` |
| 3 | Gambaran Umum | `{gambaran_umum}` | `tor.data.gambaran_umum` |
| 4 | Tujuan Kegiatan | `{#tujuan}{teks}{/tujuan}` | `tor.data.tujuan[]` |
| 5 | Bentuk Acara | `{bentuk_acara}` · `{#bentuk}{judul}{uraian}{/bentuk}` | `tor.data` |
| 6 | Waktu & Tempat | `{#sesi}{nama_sesi}{hari_tanggal}{waktu}{tempat}{/sesi}` | `tor.data.sesi[]` |
| 7 | Sasaran Peserta | `{sasaran_peserta}` | `tor.data` |
| 8 | Kondisi Pelaksanaan | `{#kondisi}{nama_sesi}: {ketentuan}{/kondisi}` | `tor.data.kondisi[]` |
| 9 | Parameter Kelulusan | `{#parameter}{kriteria} (bobot {bobot}){/parameter}` · `{kkm}` | `tor.data.parameter[]` |
| 10 | Rangkaian Acara | `{#rangkaian}{nama}{uraian}{/rangkaian}` | `tor.data.rangkaian[]` |
| 11 | Susunan Acara | lihat Lampiran II di bawah | `tor.data.sesi_rundown[]` |
| 12 | Anggaran | `{#rab_divisi}{no}{divisi}{besaran}{/rab_divisi}` · `{rab_total}` | **RAB, ditarik saat generate** |
| 13 | Penutup | `{penutup}` | `tor.data.penutup` |
| 14 | Penandatangan | `{#kanan}` sesuai §4.2 | `kepanitiaan` |

**Bagian 12 tidak disimpan di `tor.data`.** Migrasi `012_dokumen_acara.sql`
menyatakannya eksplisit: angka anggaran selalu ditarik ulang dari RAB saat
generate, supaya perubahan RAB langsung tercermin dan angkanya tidak pernah
bercabang antara dua tempat.

**Bagian 10 mengikuti PRD, bukan berkas contoh.** Berkas contoh merinci setiap
sesi sampai tingkat butir arahan pemateri — 125 paragraf untuk satu kegiatan.
PRD F-10.1 §10 menetapkan bentuk yang jauh lebih ringkas, "Repeatable per sesi:
Nama + Uraian", dan itu yang dipakai: template harus melayani kegiatan apa pun,
bukan mengabadikan susunan SYNCHRONIZE 2025.

**Lampiran II — loop bersarang.** Berkas contoh memakai **lima tabel terpisah**,
satu per sesi. Kelimanya diringkas menjadi satu tabel dengan dua tingkat loop:

```
{#sesi_rundown}{nama_sesi}          ← baris judul sesi
  (dua baris kepala tabel)          ← ikut terulang tiap sesi
  {#rundown}{hari_tanggal} {mulai} {selesai} {durasi} {acara} {pj}{/rundown}
  Total Waktu {total_durasi} {rentang_waktu}
{/sesi_rundown}
```

Bentuk tabelnya — enam kolom dengan kepala bertingkat — tidak berubah sama
sekali; yang berubah hanya jumlah tabelnya, dari lima menjadi satu yang
mengulang dirinya. Lihat Temuan 11.

**Kolom rundown TOR berbeda dari rundown surat undangan**, dan itu disengaja:
larik `rundown` yang sama membawa enam field, dan tiap template mencetak yang
tersedia di tabelnya. Surat memakai `{waktu}` dan `{keterangan}`; TOR memakai
`{mulai}`, `{selesai}`, `{durasi}`, `{pj}`. Datanya satu, penyajiannya dua —
itulah yang membuat kriteria PRD "rundown yang sama muncul konsisten di TOR,
Proposal, dan Surat Undangan" dapat dipenuhi tanpa memaksa ketiganya berbentuk
sama.

---

### 5.10 `proposal.docx`

**Sumber:** `Template/Proposal KT1 IF25.docx` — 897 paragraf · 10 tabel · 1 gambar

| # | Bagian (PRD F-10.2) | Placeholder | Sumber |
|---|---|---|---|
| 1 | Halaman Sampul | `{nama_kegiatan}` `{tahun}` | `proker`, `periode` |
| 2 | Lembar Pengesahan | enam penandatangan bernama — lihat di bawah | `kepanitiaan`, `app_config` |
| 3 | Pendahuluan | `{latar_belakang}` `{landasan_kegiatan}` · `{#asas}{teks}{/asas}` · `{#tujuan}{teks}{/tujuan}` | `proposal.data` |
| 4 | Realisasi Kegiatan | `{sasaran}` `{bentuk_acara}` `{gambaran_umum}` · `{#sesi}` · `{#pengisi}{peran}{nama}{/pengisi}` · `{#rangkaian}{nama}{uraian}{/rangkaian}` | `proposal.data`, terisi otomatis dari `tor.data` |
| 5 | Susunan Kepanitiaan | `{#divisi_panitia}{nama_divisi}` · `{#anggota}{jabatan}: {nama}{/anggota}{/divisi_panitia}` | **`kepanitiaan_member`, ditarik saat generate** |
| 6 | Anggaran | `{#rab_divisi}{no}{divisi}{besaran}{/rab_divisi}` · `{rab_total}` | **RAB, ditarik saat generate** |
| 7 | Penutup | `{penutup}` | `proposal.data.penutup` |
| 8 | Lampiran | `{#sesi_rundown}`/`{#rundown}` · `{#rincian}{divisi}` + `{#item}{no}{jenis_barang}{jumlah}{harga_satuan}{total}{/item}{/rincian}` | rundown + RAB |

Bagian 3 dan 4 memakai nama placeholder yang **sama persis** dengan `tor.docx`
bila artinya sama (`{gambaran_umum}`, `{#tujuan}`, `{#sesi}`, `{#rangkaian}`,
`{#rab_divisi}`, `{#sesi_rundown}`). Itu yang membuat kriteria PRD "membuat
Proposal setelah TOR mengisi otomatis ≥ 60% field" dapat dipenuhi tanpa tabel
penerjemah antara dua dokumen.

**Lembar pengesahan memakai enam penandatangan**, empat di antaranya bukan
pengguna sistem:

```
{ketupel_nama} {ketupel_nim}                 {sekretaris_nama} {sekretaris_nim}
{ketua_bem_nama} {ketua_bem_nim}             {ketua_himpunan_nama} {ketua_himpunan_nim}
{wd3_nama} {wd3_nip}                         {kaprodi_nama} {kaprodi_nip}
```

Model `{#kiri}`/`{#kanan}` tidak cukup di sini; lihat Temuan 4.

**Baris sub-kelompok pada tabel rincian RAB tidak dipertahankan.** Berkas contoh
menyelipkan baris berjudul di tengah item — "KOMSUMSI PANITIA", "KOMSUMSI
PESERTA", "KEBUTUHAN DIVISI". Pengelompokan itu tidak ada di model data RAB, dan
menirunya berarti mengarang struktur yang tidak dapat diisi sistem.

---

### 5.11 `lpj.docx`

**Sumber:** `Template/Template LPJ HMIF.docx` — 623 paragraf · 10 tabel · 20 gambar

| Bagian (PRD F-12.1) | Placeholder | Sumber |
|---|---|---|
| Sampul & Lembar Pengesahan | `{nama_kegiatan}` `{tahun}` `{kota}, {tanggal_format}` | `proker`, `periode` |
| Penandatangan pengesahan | `{ketupel_*}` `{ketua_himpunan_*}` `{kaprodi_*}` `{wd3_*}` | `kepanitiaan`, `app_config` |
| Pendahuluan | `{pendahuluan}` | `lpj.data_manual` |
| Nama & Tema | `{nama_kegiatan}` `{tema_kegiatan}` | `proker`, `tor.data` |
| Maksud & Tujuan | `{#tujuan}{teks}{/tujuan}` | `tor.data` / `proposal.data` |
| Target Peserta | `{target_peserta}` | `tor.data` |
| Waktu Pelaksanaan | `{hari_tanggal}` `{waktu}` `{tempat}` | `proker` |
| Panitia Pelaksana | `{#divisi_panitia}{nama_divisi}` · `{#anggota}{jabatan}: {nama}{/anggota}{/divisi_panitia}` | `kepanitiaan_member` |
| Proses Perencanaan | `{proses_perencanaan}` | `lpj.data_manual` |
| Pelaksanaan Kegiatan | `{pelaksanaan_kegiatan}` | `lpj.data_manual` |
| Output | `{output}` | `lpj.data_manual` |
| Penutup | `{penutup}` | `lpj.data_manual` |
| Narasi per divisi | `{#divisi_narasi}` … `{/divisi_narasi}` — lihat di bawah | `lpj.data_manual` |
| Lampiran Materi | `{catatan_materi}` · `{#materi}{judul}{pengisi}{tautan}{/materi}` | `lpj.data_manual` |
| Lampiran RAB | `{rab_ringkasan}` — lihat Temuan 10 | `lpj.analisis` |
| Lampiran Susunan Acara | `{#rundown}{hari_tanggal}{waktu}{acara}{pj}{/rundown}` | rundown |
| Lampiran Daftar Hadir | `{daftar_hadir}` | `lpj.data_manual` |
| Lampiran Dokumentasi | `{#dokumentasi}{caption}{/dokumentasi}` | unggahan foto kegiatan |

**Narasi per divisi** memakai satu blok berulang, dengan tabel koordinator ikut
di dalamnya:

```
{#divisi_narasi}{nama_divisi}
  Koordinator : {koordinator}
  Anggota     : {#anggota}{nama}{/anggota}
  Narasi              {narasi}
  Perencanaan         {perencanaan}
  Pelaksanaan         {pelaksanaan}
  Faktor Pendukung    {pendukung}
  Faktor Penghambat   {penghambat}
  Saran dan Rekomendasi  {saran}
{/divisi_narasi}
```

Nama loop-nya `divisi_narasi`, **bukan** `narasi`, karena tiap itemnya sendiri
punya field `narasi`. Loop dan field yang senama membuat pencarian docxtemplater
bergantung pada letak tag, bukan pada maksudnya — jenis kesalahan yang tidak
akan terlihat sampai satu dokumen tercetak salah.

**Narasi Badan Pengurus Harian dibuang seluruhnya.** Bentuknya berbeda dari
narasi divisi — dua jabatan per blok, bukan koordinator ditambah anggota — dan
BPH sudah tercakup sebagai salah satu divisi pada data kepanitiaan.


---

## 6. Isi `surat_template.field_schema`

Migrasi `018_seed.sql` menyeed ketujuh varian dengan `field_schema` `'{}'::JSONB` — sengaja kosong, karena isinya baru dapat ditentukan setelah pembedahan ini. Nilai di bawah adalah hasilnya; pengisian ke database dikerjakan T-062, bukan T-006.

Bentuknya mengikuti apa yang dipakai form dinamis (T-063) dan validasi ulang di server (K-04).

```jsonc
// 02 · KETERANGAN_AKTIF
{
  "fields": [
    { "key": "nama_pemohon",    "label": "Nama",     "type": "text", "required": true },
    { "key": "nim_pemohon",     "label": "NIM",      "type": "text", "required": true },
    { "key": "jabatan_pemohon", "label": "Jabatan",  "type": "text", "required": true },
    { "key": "keperluan",       "label": "Dipergunakan sebagai", "type": "text", "required": true }
  ],
  "signers": [{ "posisi": "KANAN", "wajib": true }],
  "pakai": ["nomor_lengkap", "kota", "tanggal_surat_format"]
}

// 03 · ASPIRASI
{
  "fields": [
    { "key": "label_atas", "label": "Salam penutup", "type": "text", "default": "Hormat Kami," },
    { "key": "poin", "label": "Poin aspirasi", "type": "list", "item": {
        "judul":    { "type": "text",      "required": true },
        "paragraf": { "type": "text[]",    "required": true } } }
  ],
  "signers": [{ "posisi": "KANAN", "wajib": true }],
  "pakai": ["nomor_lengkap", "kota", "tanggal_surat_format", "lampiran",
            "perihal", "tujuan_nama", "tujuan_alamat", "isi_paragraf"]
}

// 04 · UNDANGAN_PEMATERI
{
  "fields": [
    { "key": "nama_kegiatan",  "label": "Nama kegiatan",  "type": "text", "required": true },
    { "key": "tema_kegiatan",  "label": "Tema kegiatan",  "type": "text", "required": true },
    { "key": "tujuan_jabatan", "label": "Jabatan tujuan", "type": "text" },
    { "key": "topik_materi",   "label": "Topik materi",   "type": "text", "required": true },
    { "key": "hari_tanggal",   "label": "Hari, tanggal",  "type": "text", "required": true },
    { "key": "waktu",          "label": "Waktu",          "type": "text", "required": true },
    { "key": "tempat",         "label": "Tempat",         "type": "text", "required": true },
    { "key": "label_atas",     "label": "Nama panitia",   "type": "text" }
  ],
  "signers": [{ "posisi": "KIRI", "wajib": true }, { "posisi": "KANAN", "wajib": true }],
  "pakai": ["nomor_lengkap", "kota", "tanggal_surat_format", "lampiran",
            "perihal", "tujuan_nama", "tujuan_alamat"]
}

// 04 · UNDANGAN_SAMBUTAN — sama dengan UNDANGAN_PEMATERI, kecuali:
//   tanpa  topik_materi, tujuan_jabatan, label_atas
//   plus   rundown: list { hari_tanggal, waktu, acara, keterangan }

// 05 · PEMINJAMAN_BARANG — nama_kegiatan, tema_kegiatan, barang, hari_tanggal,
//   tempat, label_atas, plus items: list { no, kebutuhan, banyaknya }
//   signers: KIRI + KANAN

// 05 · PEMINJAMAN_RUANGAN — nama_kegiatan, tema_kegiatan, ruangan, tujuan_jabatan,
//   hari_tanggal, waktu, tempat, label_atas
//   signers: KIRI + KANAN

// 08 · KERJA_SAMA — nama_kegiatan, tema_kegiatan, jenis_mitra, hari_tanggal,
//   tempat, label_atas
//   signers: KIRI + KANAN
```

Setiap varian juga membawa `label_kanan` (default `Mengetahui,`) pada surat yang punya dua penandatangan. Ia tidak muncul di form — nilainya tetap — tetapi tetap harus ikut terkirim ke docxtemplater.

---

## 7. Temuan

| # | Temuan | Akibat | Tindakan |
|---|---|---|---|
| 1 | `Contoh Surat Undangan Pemateri.docx` memuat **dua dokumen**: surat (paragraf 1–21) dan TOR lengkap (22–349) beserta dua lampirannya. | Bila dipakai apa adanya, setiap surat undangan pemateri ikut mencetak 328 paragraf TOR kegiatan lain. | Dipangkas: `{ hapus: ['KERANGKA ACUAN KERJA'] }` dijalankan PALING AWAL, sebelum operasi lain, karena "Ketua Pelaksana" dan "Cilegon, 07 Agustus 2025" muncul lagi di dalam TOR itu. |
| 2 | `Template LPJ HMIF.docx` memuat halaman kerja (`HAPUS HALAMAN INI JIKA SUDAH SEMUA`) dan `FORM DAFTAR PENGAJUAN ANGGARAN KEMAHASISWAAN TAHUN 2024` milik fakultas. | LPJ hasil generate memuat instruksi internal dan formulir tahun lampau. | Dihapus sekaligus lewat `{ hapusHingga: ['SOP LPJ yang sesuai ketentuan', 'PENDAHULUAN'] }`. |
| 3 | Ada **dua** berkas LPJ: `Template LPJ HMIF.docx` dan `Template LPJ_Departemen.docx`. Kontrak hanya menyebut satu keluaran, `lpj.docx`. | Ambigu berkas mana yang menjadi template. | Dipilih `Template LPJ HMIF.docx`: tabel `lpj` bertaut ke `kepanitiaan_id`, jadi LPJ dalam sistem adalah LPJ kegiatan. LPJ departemen tidak punya tabel dan berada di luar cakupan MVP. |
| 4 | Lembar Pengesahan LPJ punya **empat** penandatangan; dua di antaranya pihak fakultas ber-NIP dan tanpa akun. | Model `{#kiri}`/`{#kanan}` (ADR-021) tidak cukup untuk berkas ini. | LPJ memakai placeholder bernama sendiri; nama dan NIP Kaprodi/WD III dari `app_config`. Bila T-093 menyentuh alur ini, usulkan ADR tersendiri. |
| 5 | `{label_atas}` dan `{label}` tidak punya kolom di `surat_signer`. | Teks `Panitia AKSARA IF` dan `Mengetahui,` tidak punya rumah yang jelas. | Sementara masuk `surat.data_dinamis`. Menambah kolom ke `surat_signer` lebih rapi tetapi butuh migrasi baru; ditunda sampai T-062 membuktikan perlunya. |
| 6 | `Contoh Surat Permohonan Kerja Sama.docx` menulis `NIM. 33372300036` (11 digit); berkas lain menulis `3337230036` (10 digit) untuk orang yang sama. | Tidak ada — bukti berkas ini surat sungguhan, bukan contoh yang dirapikan. | Hilang dengan sendirinya begitu menjadi `{nim}`. |
| 7 | Kontrak menyebut 11 berkas keluaran; `Template/` memuat 13 `.docx`. | Dua berkas tanpa tujuan yang jelas. | `Template Haluan Kerja Dasar Departemen.docx` pasca-MVP (ADR-017) dan `Template LPJ_Departemen.docx` (lihat Temuan 3) berada di luar cakupan T-006. |
| 8 | Kontrak butir 4 meminta `{#signers}`; struktur tabel tanda tangan membuatnya mustahil tanpa mengubah tata letak — yang dilarang klausa **Jangan** pada kontrak yang sama. | Dua kalimat kontrak saling bertentangan. | [ADR-021](../adr/ADR-021-blok-tanda-tangan-bukan-loop.md), status Usulan. Dipakai `{#kiri}`/`{#kanan}`. |
| 10 | `Template LPJ HMIF.docx` TIDAK punya tabel apa pun di bawah judul "Lampiran Rancangan Anggaran Biaya (RAB)", padahal PRD F-12.1 menuntut rincian pemasukan, pengeluaran, perbandingan RAB vs aktual, dan sisa dana. | Empat bagian keuangan wajib tidak punya tempat di template. | Sementara diisi satu blok teks `{rab_ringkasan}`. Menambah tabelnya berarti mengarang struktur baru, bukan membedah yang ada — pekerjaan T-093, dan template naik versi (`surat_template.versi`). |
| 11 | Lampiran susunan acara pada TOR dan Proposal memakai **lima tabel terpisah**, satu per sesi. | Tidak dapat dijadikan loop: docxtemplater mengulang baris, bukan tabel, dan paragraf pemisah antar tabel kosong tanpa `<w:t>` sehingga tidak dapat menampung tag. | Diringkas menjadi satu tabel dengan loop bersarang `{#sesi_rundown}` + `{#rundown}`. Bentuk tabelnya tidak berubah; yang berubah jumlahnya, dari lima menjadi satu yang mengulang dirinya. |
| 12 | Lembar pengesahan Proposal punya **enam** penandatangan, empat di antaranya bukan pengguna sistem (Ketua BEM, Wakil Dekan III, Ketua Program Studi, Sekretaris Prodi). | Sama seperti Temuan 4 untuk LPJ: `{#kiri}`/`{#kanan}` tidak cukup. | Placeholder bernama sendiri per posisi. Nama pihak fakultas dari `app_config`, bukan `app_user`. |
| 13 | `setSel` semula MENGOSONGKAN paragraf berlebih alih-alih menghapusnya. | Sel anggota panitia berisi tujuh nama contoh; menulis tiga untai menyisakan empat baris kosong menganga di setiap dokumen. | Paragraf berlebih kini dihapus. Paragraf yang memang kosong sejak semula — ruang tanda tangan — tetap tidak disentuh, karena tidak punya `<w:t>` dan sudah tersaring lebih dulu. |
| 9 | Kontrak butir 5 menamai penanda gambar menurut jabatan (`{%ttd_ketua}`, `{%ttd_sekum}`), padahal penandatangan berubah tiap surat. | Penanda bernama jabatan memaksa template mengetahui siapa yang menandatangani. | `{%ttd}` dan `{%stempel}` di dalam blok posisi, mengikuti `pakai_ttd`/`pakai_stempel`. Tercatat di ADR-021. |

---

## 8. Hasil

```
DRY RUN TEMPLATE — 11 dari 11 berkas ada

  ✓ lpj.docx                          56 tag
  ✓ notulensi.docx                    15 tag
  ✓ proposal.docx                     71 tag
  ✓ surat-02-keterangan-aktif.docx    14 tag
  ✓ surat-03-aspirasi.docx            22 tag
  ✓ surat-04-undangan-pemateri.docx   25 tag
  ✓ surat-04-undangan-sambutan.docx   26 tag
  ✓ surat-05-peminjaman-barang.docx   28 tag
  ✓ surat-05-peminjaman-ruangan.docx  25 tag
  ✓ surat-08-kerja-sama.docx          23 tag
  ✓ tor.docx                          56 tag

  LULUS — 11 berkas, nol placeholder tak terisi.
```

Yang masih menunggu manusia:

- [ ] Buka kesebelas berkas di Word 2016+ dan pastikan tidak ada peringatan
      korupsi. Struktur XML-nya tidak pernah ditulis ulang, jadi ini
      pemeriksaan konfirmasi — bukan perbaikan yang diperkirakan perlu.
- [ ] Bandingkan kop surat satu berkas hasil generate dengan aslinya di
      `Template/`, cetak berdampingan.
- [ ] Putuskan Temuan 10: apakah tabel keuangan LPJ ditambahkan di T-093, dan
      dalam bentuk apa.
