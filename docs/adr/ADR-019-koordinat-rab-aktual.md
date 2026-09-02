# ADR-019 — Koordinat sheet RAB AKTUAL

| | |
|---|---|
| **Status** | **Usulan** — menunggu keputusan pemilik produk |
| **Tanggal** | 2026-09-02 |
| **Ditemukan oleh** | T-007 saat membedah `Template/RAB_Template.xlsx` |
| **Memblokir** | T-090 (export Excel), T-103 (RAB aktual otomatis) |
| **Task terkait** | T-007, T-090, T-103 |

## Konteks

SYSTEM_DESIGN §11.3 menuliskan koordinat sheet RAB AKTUAL sebagai:

> `buildSheetRabAktual(wb, data);   // kolom C:G, ringkasan J:L`

Pembedahan berkas template yang sebenarnya menunjukkan angka yang berbeda:

| | SYSTEM_DESIGN §11.3 | `RAB_Template.xlsx` |
|---|:---:|:---:|
| Kolom item | C:G | **B:F** |
| Kolom ringkasan | J:L | **H:J** |

Kolom yang benar-benar terpakai pada sheet `RAB AKTUAL` adalah `B, C, D, E, F, H, I, J` — persis sama dengan sheet `RAB`. Tidak ada satu pun sel terisi di kolom `G`, `K`, atau `L`.

Bukti (keluaran `scripts/inspect-rab-template.ts`):

```
===== SHEET: RAB AKTUAL (80 baris) =====
kolom terpakai: B, C, D, E, F, H, I, J
merge total: 21
  r2  | B:DIVISI KOMSUMSI …(B2:F2) | H:NO. | I:DIVISI | J:BESARAN BIAYA
  r3  | B:NO | C:Jenis Barang | D:Jumlah | E:Harga satuan | F:Total
  r12 | H:TOTAL | I:TOTAL | J:=SUM(J3:J11)
```

Gerbang **G4** mensyaratkan hasil export identik struktur dengan template asli. Memakai koordinat SYSTEM_DESIGN berarti exporter menghasilkan sheet yang bergeser satu kolom dan tidak akan pernah lolos gerbang.

Satu-satunya perbedaan nyata antara `RAB` dan `RAB AKTUAL` adalah **posisi vertikal blok ringkasan**: header di baris 3 pada `RAB`, baris 2 pada `RAB AKTUAL`.

## Keputusan yang diusulkan

Exporter mengikuti **koordinat berkas template**, bukan angka pada SYSTEM_DESIGN §11.3:

- Kolom item `RAB AKTUAL` = **B:F**, identik dengan sheet `RAB`
- Kolom ringkasan = **H:J**
- Header ringkasan pada baris **2** (data 3–11, TOTAL baris 12, merge `H12:I12`)

Angka pada SYSTEM_DESIGN §11.3 dianggap keliru tulis, bukan desain yang disengaja.

## Alasan usulan ini layak diterima

Berkas template adalah **bukti fisik** yang bisa diperiksa siapa pun, sedangkan SYSTEM_DESIGN adalah dokumen turunan yang ditulis dari pembacaan template itu. Ketika keduanya berbeda soal isi berkas, berkasnya yang benar.

Selain itu, RAB Aktual memang dirancang untuk dibaca **berdampingan** dengan RAB agar rencana dan realisasi mudah dibandingkan baris per baris. Struktur kolom yang identik adalah konsekuensi wajar dari tujuan itu.

## Konsekuensi bila diterima

- `docs/ai/RAB_CELL_MAP.md` §2 dan §6 menjadi sumber konstanta; SYSTEM_DESIGN §11.3 tidak dipakai untuk koordinat.
- `RAB_MAP.RAB_AKTUAL` memakai `barisHeader: 2`, sementara `RAB_MAP.RAB` memakai `barisHeader: 3`. Perbedaan satu baris ini nyata dan harus dipertahankan.
- SYSTEM_DESIGN §11.3 **tidak diedit** — ADR ini yang berlaku, sesuai hierarki AGENT_RULES §0.

## Yang dibutuhkan dari pemilik produk

Konfirmasi satu kalimat bahwa exporter boleh mengikuti struktur berkas template. Tidak ada pilihan lain yang masuk akal secara teknis; ADR ini dibuat karena AGENT_RULES §0 melarang agent memutuskan sendiri saat menemukan pertentangan antar-sumber.

**Tidak memblokir pekerjaan sekarang** — T-090 baru dikerjakan pada fase P5.
