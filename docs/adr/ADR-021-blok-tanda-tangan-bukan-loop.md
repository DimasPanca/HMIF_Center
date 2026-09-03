# ADR-021 — Blok tanda tangan memakai `{#kiri}`/`{#kanan}`, bukan `{#signers}`

| | |
|---|---|
| **Status** | Usulan |
| **Tanggal** | 2026-09-03 |
| **Ditemukan oleh** | T-006, saat membedah struktur tabel ketujuh surat contoh |
| **Lane** | `data` |
| **Task terkait** | T-006, T-062, T-063 |

## Konteks

Kontrak T-006 butir 4 menetapkan empat tabel dinamis diubah menjadi loop, salah satunya blok tanda tangan:

> `{#signers}…{/signers}` (blok TTD)

Kontrak yang sama, pada klausa **Jangan**, menetapkan:

> jangan mengubah margin, font, atau **tata letak** template asli.

Pembedahan XML ketujuh surat memperlihatkan kedua kalimat itu tidak dapat dipenuhi sekaligus. Blok tanda tangan bukan susunan vertikal, melainkan **tabel tiga kolom** dengan penandatangan berdampingan:

```
=== Contoh Surat Permohonan Kerja Sama.docx
  --- tabel 1: 4 baris
    r1 (1 sel): "Panitia AKSARA"
    r2 (3 sel): "Ketua Pelaksana"  ||  ""  ||  "Mengetahui, | Ketua HMIF"
    r3 (3 sel): "Muhammad Imam Faturrohman | NIM. 33372300036"  ||  ""  ||  "Dicky Saputra | NIM. 3337220032"
    r4 (1 sel): ""
```

Kolom 1 adalah penandatangan kiri, kolom 2 sekadar pemisah, kolom 3 penandatangan kanan. Pola yang sama muncul pada Peminjaman Barang, Peminjaman Ruangan, Undangan dan Sambutan, dan Undangan Pemateri. Pada Aspirasi dan Keterangan Aktif hanya kolom kanan yang terisi — satu penandatangan, tetapi tabelnya tetap melebar.

docxtemplater mengulang **baris** tabel, bukan kolom. `{#signers}` di dalam tabel ini akan menghasilkan dua penandatangan yang **bertumpuk ke bawah**, bukan berdampingan. Satu-satunya cara membuat `{#signers}` benar adalah menyusun ulang tabelnya menjadi satu penandatangan per baris — yaitu mengubah tata letak, yang dilarang klausa **Jangan** pada kontrak yang sama.

Skema database sudah memihak susunan tetap dua posisi, bukan daftar berapa pun:

```sql
posisi TEXT NOT NULL,
CONSTRAINT surat_signer_posisi_sah CHECK (posisi IN ('KIRI', 'KANAN'))
```

`posisi` bukan `urutan` yang dirender berurutan; ia menyebut **tempat di halaman**. Kolom itu tidak akan ada bila blok tanda tangan memang sebuah loop.

## Keputusan

Blok tanda tangan memakai dua bagian bersyarat, bukan satu loop:

```
sel kolom 1                     sel kolom 3
┌──────────────────────────┐    ┌──────────────────────────┐
│ {#kiri}{label}           │    │ {#kanan}{label}          │
│ {jabatan}                │    │ {jabatan}                │
│                          │    │                          │
│ {%ttd}                   │    │ {%ttd}                   │
│ {nama}                   │    │ {nama}                   │
│ NIM. {nim}{/kiri}        │    │ NIM. {nim}{/kanan}       │
└──────────────────────────┘    └──────────────────────────┘
```

Sisi data tetap `surat_signer`. Generator (T-062) memetakannya menjadi dua kunci sebelum render:

```ts
const data = {
  kiri:  signers.find((s) => s.posisi === 'KIRI')  ?? null,
  kanan: signers.find((s) => s.posisi === 'KANAN') ?? null,
};
```

### Pasangan tag wajib terbuka dan tertutup di dalam satu sel

Dua percobaan pada docxtemplater 3.69.3 dengan `kiri: null`, memakai tabel dua kolom dua baris yang kolom kanannya berisi `KANAN-r1` dan `KANAN-r2`:

| Uji | Letak `{#kiri}` … `{/kiri}` | Keluaran |
|---|---|---|
| K | membentang dari baris 1 ke baris 2 | `""` — **seluruh tabel hilang**, termasuk kedua sel kanan |
| L | sepasang di dalam tiap sel kiri | `KANAN-r1`, `KANAN-r2` utuh; sel kiri kosong; baris tetap ada |

Uji K adalah bentuk yang tampak paling wajar bagi orang yang mengedit di Word — membuka tag di sel jabatan dan menutupnya di sel nama. Untuk surat dua penandatangan hasilnya kebetulan benar, sehingga kesalahannya baru muncul pada surat pertama yang hanya punya satu penandatangan: tanda tangan satu-satunya yang ia punya ikut terhapus.

Karena itu setiap kolom memakai **dua** pasang tag — satu di sel jabatan, satu di sel nama — bukan satu pasang yang membentang. Aturan ini tercatat juga di TEMPLATE_MAPPING.md §4.2 sebagai satu-satunya larangan bercetak tebal di dokumen itu.

docxtemplater memperlakukan objek truthy sebagai loop satu iterasi dan objek `null`/`false` sebagai nol iterasi. Karena itu surat satu penandatangan — Keterangan Aktif dan Aspirasi — cukup mengirim `kiri: null`, dan seluruh isi sel kiri hilang tanpa menyisakan baris kosong atau placeholder mentah. Tidak ada cabang khusus di kode generator.

Tiga loop lain pada kontrak butir 4 **tidak berubah**, karena ketiganya memang vertikal dan `{#…}` bekerja apa adanya:

| Loop | Tabel | Arah |
|---|---|---|
| `{#items}` | Peminjaman Barang, 3 kolom × 2 baris | baris ✓ |
| `{#rundown}` | Undangan dan Sambutan, 4 kolom × 7 baris | baris ✓ |
| `{#poin}` | Aspirasi, Lampiran I (paragraf, bukan tabel) | paragraf ✓ |

### Penanda gambar ikut menjadi relatif

Kontrak T-006 butir 5 menyebut tiga penanda gambar: `{%ttd_ketua}`, `{%ttd_sekum}`, `{%stempel}`. Dua yang pertama menamai **jabatan**, padahal penandatangan surat HMIF tidak tetap jabatannya — pada Peminjaman Barang yang bertanda tangan kiri adalah Ketua Pelaksana, pada Aspirasi tidak ada penandatangan kiri sama sekali, dan pada Keterangan Aktif hanya Ketua HMIF yang tampil. Penanda bernama jabatan memaksa template mengetahui siapa yang akan menandatangani, yaitu justru hal yang berubah tiap surat.

Karena itu penanda gambar ikut masuk ke dalam blok posisi dan namanya menjadi relatif:

| Kontrak butir 5 | Dipakai | Letak |
|---|---|---|
| `{%ttd_ketua}`, `{%ttd_sekum}` | `{%ttd}` | di dalam `{#kiri}` dan `{#kanan}` |
| `{%stempel}` | `{%stempel}` | di dalam blok yang sama |

Keduanya mengikuti kolom `surat_signer.pakai_ttd` dan `surat_signer.pakai_stempel`, yang memang per penandatangan — bukan per surat. Generator mengisi `ttd`/`stempel` dengan buffer gambar bila kolomnya `true`, dan dengan `null` bila `false`; docxtemplater melewati penanda bernilai `null` tanpa menyisakan bingkai kosong.

## Konsekuensi

**Baik.** Tata letak surat resmi HMIF tidak berubah sama sekali — hasil generate identik dengan surat asli. Kasus satu penandatangan tertangani oleh mekanisme yang sama, tanpa template terpisah dan tanpa percabangan. Nama placeholder cocok persis dengan nilai `posisi` di database, sehingga tidak ada lapisan terjemahan yang bisa salah.

**Buruk.** Jumlah penandatangan terbatas dua. Surat dengan tiga penandatangan — belum pernah ditemukan pada tujuh contoh yang ada — akan butuh template baru, bukan sekadar data baru. Batas itu sebetulnya sudah ditetapkan lebih dulu oleh `CHECK (posisi IN ('KIRI','KANAN'))`; ADR ini hanya membuatnya terlihat di template juga.

**Perlu diketahui lane ui.** Form penandatangan (T-063) mengisi `posisi`, bukan mengurutkan daftar. Dua penandatangan pada `posisi` yang sama akan membuat salah satunya tidak tercetak — validasi bentuknya harus menolak itu, dan kontrak sudah menyediakan tempatnya lewat `surat_template.field_schema`.

## Alternatif yang ditolak

**Menyusun ulang tabel menjadi satu penandatangan per baris.** Membuat `{#signers}` bekerja apa adanya, tetapi mengubah tata letak surat resmi: dua penandatangan menjadi bertumpuk, dan tanda tangan Ketua Pelaksana tidak lagi sejajar dengan Ketua HMIF. Surat yang keluar tidak lagi menyerupai surat HMIF, dan itu justru yang paling terlihat oleh penerima.

**Loop kolom lewat modul berbayar docxtemplater.** Ada modul yang mendukung pengulangan kolom, tetapi berlisensi komersial. SYSTEM_DESIGN §2 tidak mencantumkannya dan proyek ini tidak memiliki anggaran lisensi.

**Dua template terpisah: satu penandatangan dan dua penandatangan.** Menggandakan sebelas berkas menjadi lebih banyak lagi, dan setiap perbaikan kop surat kelak harus dikerjakan dua kali. Perbedaan yang dijadikan alasan menggandakan hanya satu sel tabel.
