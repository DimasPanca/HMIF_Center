# UAT_HASIL — Hasil uji penerimaan pengguna (T-116)

> **Status: BELUM DILAKSANAKAN.** Sesi UAT bersama pengurus belum terjadwal.
> Berkas ini diisi fasilitator **setelah** sesi nyata — siapa, kapan, skenario
> mana lulus/gagal, dan seluruh temuannya. Jangan mengisinya dari pengujian
> otomatis; gladi otomatis di bagian akhir hanya bukti kesiapan, bukan UAT.

Skenario: [UAT_SKENARIO.md](UAT_SKENARIO.md) · Panduan peserta: [docs/panduan/](../panduan/)

## 1. Sesi onboarding pengurus

| | |
|---|---|
| **Jadwal** | _belum ditetapkan — diisi pemilik produk_ |
| **Tempat / media** | |
| **Fasilitator** | |
| **Peserta hadir** | |
| **Materi** | Demo Beranda & Master Gantt; pembagian panduan per peran; tanya-jawab |
| **Catatan** | |

## 2. Sesi UAT

| | |
|---|---|
| **Tanggal** | |
| **Lingkungan** | (staging/produksi, URL, commit/versi) |
| **Fasilitator / pencatat** | |

### Peserta

| Peran | Nama | Skenario |
|---|---|---|
| Ketua Umum | | UAT-02, UAT-09 |
| Sekretaris Umum | | UAT-03, UAT-07 |
| Bendahara Umum | | UAT-04 |
| Kadept #1 | | UAT-01, UAT-08 |
| Kadept #2 | | UAT-01 |
| Anggota | | UAT-05 |
| Admin | | UAT-06 |
| BPH | | UAT-10 |

### Hasil per skenario

Nilai: **Lulus** · **Lulus dengan catatan** · **Gagal**. Kolom *Dibantu*
= fasilitator harus menunjukkan langkah (lihat UAT_SKENARIO "Cara menjalankan").

| Skenario | Peserta | Hasil | Dibantu? | Waktu | Temuan (ID) |
|---|---|---|---|---|---|
| UAT-01 (Kadept #1) | | | | | |
| UAT-01 (Kadept #2) | | | | | |
| UAT-02 | | | | | |
| UAT-03 | | | | | |
| UAT-04 | | | | | |
| UAT-05 | | | | | |
| UAT-06 | | | | | |
| UAT-07 | | | | | |
| UAT-08 | | | | | |
| UAT-09 | | | | | |
| UAT-10 | | | | | |

### Temuan

Klasifikasi: **Blocker** (alur tak selesai/data salah) · **Perbaikan**
(selesai tetapi membingungkan/berisiko) · **Catatan** (kosmetik/saran).

| ID | Skenario | Klasifikasi | Uraian | Tindak lanjut | Status |
|---|---|---|---|---|---|
| | | | | | |

### Kesimpulan

- [ ] Ketua, Sekum, Bendum, dan 2 Kadept menyelesaikan alur end-to-end tanpa bantuan
- [ ] Seluruh temuan tercatat dan diklasifikasikan
- [ ] Tidak ada blocker terbuka → **UAT lulus**

---

## Lampiran — Gladi otomatis sebelum UAT (bukan UAT)

Gate e2e yang memetakan skenario UAT (UAT_SKENARIO "Pemetaan ke gate
otomatis") dijalankan 2026-10-19 oleh agent di stack Supabase lokal + `next dev`,
1 worker, proyek desktop (1366×768) dan ponsel (Pixel 7):

```
npx playwright test wizard-proker-1-3 wizard-proker-4-6 kalender-ketersediaan \
  approval-proker peminjaman-ruangan surat-form surat-approval verifikasi-nota \
  lpj-generate upload-nota rab-lock undangan --workers=1
→ 131 passed · 3 failed · 5 skipped · 5 did not run (14,2 menit)
```

| Skenario | Gate | Jalan 1 | Jalan ulang |
|---|---|---|---|
| UAT-01 | wizard-proker-1-3, wizard-proker-4-6 | lulus | — |
| UAT-01 | kalender-ketersediaan | 1 gagal (ponsel: "menggeser bulan…" — kalender belum memanggil API saat diukur) | lulus 1/1 |
| UAT-02 | approval-proker | lulus | — |
| UAT-03 | peminjaman-ruangan | 1 gagal (`kalender-booking` tidak tampil dalam 60 dtk) | spec penuh lulus |
| UAT-03 | surat-form | lulus | — |
| UAT-03 | surat-approval | 1 gagal (tombol unduh DOCX belum tampil) | spec penuh lulus (bersama peminjaman-ruangan 10/10) |
| UAT-04 | verifikasi-nota, rab-lock, lpj-generate | lulus | — |
| UAT-05 | upload-nota (termasuk ponsel 375 px) | lulus | — |
| UAT-06 | undangan | lulus | — |

"did not run" = tes mode serial sesudah tes yang gagal di berkas yang sama;
"skipped" = skip terdokumentasi di gate masing-masing.

Ketiga kegagalan jalan 1 lulus pada jalan ulang tanpa perubahan kode — pola
"dev server dingin di bawah beban" yang tercatat di HANDOFF §4 no. 6. Yang
**tidak** dicakup gladi ini dan hanya dapat dinilai manusia: keterbacaan
panduan, kejelasan pesan, dan apakah peserta menyelesaikan alur tanpa bantuan.
