# ADR-008 — Durasi persiapan proker

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-023, T-032, T-042 |

## Konteks

Aturan "durasi persiapan minimal 15 hari, maksimal 45 hari" (PRD F-5.2 R2) muncul di dua tempat yang saling bertentangan:

1. Sebagai `CHECK` constraint `durasi_persiapan_15_45` pada tabel `proker` (SYSTEM_DESIGN §4.3).
2. Sebagai key `durasi_persiapan_min` dan `durasi_persiapan_max` di `app_config` yang dapat diubah Admin (SYSTEM_DESIGN §4.11).

Akibatnya: Admin mengubah nilai di `app_config`, aplikasi menerima input baru, lalu **database tetap menolaknya**. Kegagalan yang membingungkan dan sulit dilacak.

## Keputusan

**CHECK constraint yang menang.** Rentang 15–45 hari adalah aturan keras organisasi pada MVP, bukan konfigurasi.

Key `durasi_persiapan_min` dan `durasi_persiapan_max` **tidak dibuat** di `app_config`.

## Konsekuensi implementasi

- `app_config` berisi tepat **lima** key: `kode_administrasi`, `kode_kegiatan_default`, `kota_default`, `deadline_warning_hari`, `deadline_critical_hari` (T-032, T-042).
- Validasi di wizard proker memakai konstanta yang sama dengan constraint, dan pesan errornya menyebut angka aktual: "Persiapan 12 hari — minimal 15 hari" (T-068).
- Bila organisasi kelak ingin rentang ini dapat dikonfigurasi, perubahannya adalah migrasi yang mengganti CHECK dengan trigger pembaca config — dicatat sebagai ADR baru, bukan tambalan.

### SQL final

```sql
-- Tabel proker (ADR-008): aturan keras, bukan configurable
CONSTRAINT durasi_persiapan_15_45 CHECK (
  kategori <> 'TERJADWAL' OR
  (tanggal_hari_h_mulai - tanggal_mulai_persiapan) BETWEEN 15 AND 45
);

-- app_config TIDAK memuat durasi_persiapan_min / durasi_persiapan_max
```
