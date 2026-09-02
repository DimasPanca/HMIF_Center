# RAB_CELL_MAP — Koordinat Sel `RAB_Template.xlsx`

Hasil pembedahan template asli. **Ini satu-satunya sumber konstanta untuk exporter T-090** — dilarang menebak koordinat di kode.

| | |
|---|---|
| **Dibuat oleh** | T-007 |
| **Dipakai oleh** | T-090 (export Excel), T-091 (import), T-092 (pemasukan), T-103 (RAB aktual) |
| **Sumber** | `Template/RAB_Template.xlsx` · dump lengkap: `npx tsx scripts/inspect-rab-template.ts` |
| **Gerbang** | G4 mensyaratkan hasil export **identik struktur** dengan template ini |

Template berisi 4 sheet: **RAB · PEMASUKAN · PENGELUARAN · RAB AKTUAL**.

---

## 1. Sheet `RAB` — 80 baris

Dua blok berdampingan: daftar item di kolom **B:F**, ringkasan divisi di kolom **H:J**.

### 1.1 Lebar kolom

| Kolom | Lebar | Isi |
|:---:|---:|---|
| A | 5.78 | margin kiri (kosong) |
| B | 8.78 | NO |
| C | 30.44 | Jenis Barang |
| D | 26.78 | Jumlah |
| E | 17.11 | Harga satuan |
| F | 16.33 | Total |
| H | *(default)* | NO. (ringkasan) |
| I | 21.11 | DIVISI |
| J | 25.11 | BESARAN BIAYA |

### 1.2 Blok item (B:F) — pola berulang per divisi

| Baris | Bentuk | Merge | Contoh nyata |
|---|---|---|---|
| Header divisi | teks `DIVISI {NAMA}` | **`B{n}:F{n}`** | `B2:F2` = `DIVISI KOMSUMSI` |
| Header kolom | `NO` · `Jenis Barang` · `Jumlah` · `Harga satuan` · `Total ` | — | baris 3 |
| Header sub-section | teks `{NAMA SUB-SECTION}` | **`B{n}:F{n}`** | `B4:F4` = `KOMSUMSI PANITIA` |
| Item | B=no · C=nama · D=jumlah · E=harga · F=formula | — | baris 5, 6, 8, 12… |
| **TOTAL divisi** | label `TOTAL` | **`B{n}:E{n}`** | `B17:E17`, nilai di `F17` |

> **Perhatikan:** header divisi dan sub-section di-merge **B:F** (lima kolom), sedangkan baris TOTAL di-merge **B:E** (empat kolom) karena `F` menampung angkanya. Salah satu dari dua pola ini terbalik = struktur tidak identik.

**Header kolom `F3` bernilai `"Total "` dengan spasi di belakang.** Ini ada di template asli; salin apa adanya.

### 1.3 Formula

| Sel | Formula template | Keterangan |
|---|---|---|
| `F{n}` item | `=SUM(D{n}*E{n})` **atau** `=E{n}*D{n}` | Template asli tidak konsisten — dua bentuk dipakai bergantian |
| `F{total}` | `=SUM(F{awal}:F{akhir})` | mis. `F17 = SUM(F4:F16)` |
| `J{n}` ringkasan | angka statis **atau** referensi ke total divisi | mis. `J5 = F69` |
| `J{total}` | `=SUM(J{awal}:J{akhir})` | `J13 = SUM(J4:J12)` |

> **Keputusan untuk exporter:** pakai bentuk **`=D{n}*E{n}`** secara konsisten. Kedua bentuk menghasilkan nilai sama; template asli tidak konsisten karena diketik manual lintas tahun.

### 1.4 Blok ringkasan divisi (H:J)

| Baris | Isi |
|---|---|
| **3** | Header: `H3`=`NO.` · `I3`=`DIVISI` · `J3`=`BESARAN BIAYA` |
| 4 … 12 | Satu baris per divisi + baris `Dana Tak Terduga` |
| **13** | `TOTAL`, merge **`H13:I13`**, nilai `J13 = SUM(J4:J12)` |

`Dana Tak Terduga` adalah **baris terakhir sebelum TOTAL**, diperlakukan seperti divisi dalam ringkasan.

---

## 2. Sheet `RAB AKTUAL` — 80 baris

Struktur blok item **identik dengan sheet RAB** (B:F, merge dan pola yang sama).
Yang berbeda hanya **posisi vertikal blok ringkasan**:

| | Sheet `RAB` | Sheet `RAB AKTUAL` |
|---|:---:|:---:|
| Kolom item | B:F | **B:F** (sama) |
| Kolom ringkasan | H:J | **H:J** (sama) |
| Baris header ringkasan | **3** | **2** |
| Baris data ringkasan | 4–12 | **3–11** |
| Baris TOTAL ringkasan | 13 | **12** |
| Merge label TOTAL | `H13:I13` | **`H12:I12`** |
| Formula TOTAL | `=SUM(J4:J12)` | **`=SUM(J3:J11)`** |

> ⚠️ **Ini menyimpang dari SYSTEM_DESIGN §11.3** yang menyatakan RAB Aktual memakai "kolom C:G, ringkasan J:L". Lihat §5 Temuan.

---

## 3. Sheet `PEMASUKAN` — 168 baris

Dua blok bertumpuk.

### 3.1 Blok ringkasan sumber dana (B:D)

| Baris | Isi |
|---|---|
| 2 | Judul `PEMASUKAN` di `C2` |
| **3** | Header: `B3`=`NO` · `C3`=`Keterangan` · `D3`=`Saldo` |
| 4 … 5 | Sumber dana, mis. `Total Pembayaran SYNCHRONIZE` = 23.400.000, ` Himpunan` = 2.600.000 |
| **6** | `TOTAL`, merge **`B6:C6`**, `D6 = D4+D5` |

### 3.2 Blok data peserta (B:F)

| Baris | Isi |
|---|---|
| **9** | Judul, merge **`C9:E9`** = `RINCIAN PEMASUKAN DAN DATA …` |
| **11** | Header: `B`=`No` · `C`=`Nama Lengkap` · `D`=`BAYAR` · `E`=`Tgl BAYAR` · `F`=`JUMLAH` |
| 12 … 167 | Data peserta — **156 baris**. `B12 = ROW(B12)-11` (nomor otomatis), `D` boolean, `E` tanggal, `F` nominal |
| **168** | `F168 = SUM(F12:F167)` |

Lebar kolom: `C`=36.78 · `D`=26 · `E`=22.11 · `F`=13.44

---

## 4. Sheet `PENGELUARAN` — 42 baris

Buku kas dengan saldo berjalan. Kolom **C:H**.

| Baris | Isi |
|---|---|
| **3** | Header: `C`=`NO` · `D`=`Tgl` · `E`=`URAIAN` · `F`=`DIVISI` · `G`=`PENGELUARAN` · `H`=`SALDO` |
| 4 … 5 | Baris **pemasukan**: hanya `C`, `E`, `H` terisi (`G` kosong) |
| **6** | `TOTAL`, merge **`C6:G6`**, `H6 = SUM(H4:H5)` — ini saldo awal |
| 7 … | Baris **pengeluaran**: `H{n} = H{n-1} - G{n}` (saldo berjalan) |

> Struktur ini **cocok** dengan kode contoh SYSTEM_DESIGN §11.4.
> Saldo berjalan bersifat berantai: menghapus satu baris di tengah mengharuskan **hitung ulang seluruh rantai**, bukan sekadar menghapus barisnya (kontrak T-103).

---

## 5. Temuan — selisih terhadap SYSTEM_DESIGN §11.3

| # | Klaim SYSTEM_DESIGN §11.3 | Kenyataan di template | Tindakan |
|:-:|---|---|---|
| **1** | RAB Aktual memakai **kolom C:G**, ringkasan **J:L** | Kolom item **B:F**, ringkasan **H:J** — persis sama dengan sheet RAB | **[ADR-019](../adr/ADR-019-koordinat-rab-aktual.md)** berstatus *Usulan* |
| 2 | *(tidak disebut)* | Baris header ringkasan berbeda antar sheet: RAB di baris 3, RAB AKTUAL di baris 2 | Dicatat di §2, exporter memakai konstanta terpisah per sheet |
| 3 | `{ formula: 'D{r}*E{r}' }` | Template asli memakai dua bentuk bergantian: `=SUM(D*E)` dan `=E*D` | Exporter distandarkan ke `=D{r}*E{r}` |
| 4 | `numFmt: '"Rp"#,##0'` | Template memakai **tiga** format berbeda: `"Rp"#,##0`, `[$Rp-421]#,##0`, `[$Rp]#,##0` | Exporter distandarkan ke `"Rp"#,##0` sesuai SYSTEM_DESIGN |

Temuan 2, 3, dan 4 tidak memerlukan keputusan: template asli memang tidak konsisten karena diketik manual lintas kepengurusan, dan menstandarkan keluaran justru memperbaikinya tanpa mengubah struktur. Temuan **1 mengubah koordinat**, sehingga diangkat sebagai ADR.

---

## 6. Konstanta untuk exporter (T-090)

```ts
export const RAB_MAP = {
  RAB: {
    kolom: { no: 2, jenisBarang: 3, jumlah: 4, hargaSatuan: 5, total: 6 },   // B C D E F
    lebar: { A: 5.77, B: 8.77, C: 30.44, D: 26.77, E: 17.11, F: 16.33, I: 21.11, J: 25.11 },
    headerKolom: ['NO', 'Jenis Barang', 'Jumlah', 'Harga satuan', 'Total '], // "Total " berspasi
    mergeHeaderDivisi: 'B:F',
    mergeSubSection: 'B:F',
    mergeBarisTotal: 'B:E',
    ringkasan: { kolomNo: 8, kolomDivisi: 9, kolomBiaya: 10, barisHeader: 3, mergeTotal: 'H:I' },
  },
  RAB_AKTUAL: {
    // Kolom item identik dengan sheet RAB (ADR-019)
    ringkasan: { kolomNo: 8, kolomDivisi: 9, kolomBiaya: 10, barisHeader: 2, mergeTotal: 'H:I' },
  },
  PEMASUKAN: {
    sumberDana: { barisHeader: 3, kolomNo: 2, kolomKeterangan: 3, kolomSaldo: 4, mergeTotal: 'B:C' },
    peserta: { barisJudul: 9, mergeJudul: 'C:E', barisHeader: 11, barisAwal: 12, kapasitas: 156,
               kolom: { no: 2, nama: 3, bayar: 4, tanggal: 5, jumlah: 6 } },
  },
  PENGELUARAN: {
    barisHeader: 3,
    kolom: { no: 3, tanggal: 4, uraian: 5, divisi: 6, pengeluaran: 7, saldo: 8 },  // C D E F G H
    mergeTotal: 'C:G',
  },
  RUPIAH: '"Rp"#,##0',
} as const;
```

## 7. Daftar periksa untuk T-090

- [ ] Header divisi dan sub-section di-merge **B:F**, baris TOTAL di-merge **B:E**
- [ ] Header kolom `F` bernilai `"Total "` **dengan spasi di belakang**
- [ ] Ringkasan RAB mulai baris 3, ringkasan RAB AKTUAL mulai baris **2**
- [ ] Kolom `Jumlah` diisi `jumlah_teks` (teks asli), bukan angka — INV-26
- [ ] Formula hidup, bukan nilai statis: `=D{r}*E{r}`, `=SUM(...)`, saldo `=H{n-1}-G{n}`
- [ ] `scripts/diff-excel.ts` melaporkan **nol** selisih struktur terhadap template ini
