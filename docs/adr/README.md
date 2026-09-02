# Architecture Decision Record (ADR)

Setiap keputusan yang mengikat implementasi dicatat di sini sebagai satu berkas.
ADR **tidak dihapus** dan **tidak diedit isinya** setelah berstatus Diterima — bila keputusan berubah, buat ADR baru yang menyatakan ADR lama sebagai *Digantikan*.

## Format nama berkas

```
ADR-NNN-judul-kebab-case.md
```

`NNN` = nomor urut tiga digit, tidak pernah dipakai ulang.

## Struktur isi

Setiap ADR wajib memuat empat bagian ini, dengan urutan tetap:

```markdown
# ADR-NNN — Judul

| | |
|---|---|
| **Status** | Diterima · Usulan · Digantikan oleh ADR-NNN |
| **Tanggal** | YYYY-MM-DD |
| **Task terkait** | T-0XX, T-0YY |

## Konteks
Kenapa keputusan ini perlu diambil. Sumber ambiguitas: dokumen mana yang
bertentangan, atau pertanyaan terbuka mana yang belum terjawab.

## Keputusan
Satu pernyataan tegas. Bukan diskusi, bukan daftar opsi.

## Konsekuensi implementasi
Apa yang harus dilakukan dan apa yang dilarang sebagai akibat keputusan ini.
Untuk keputusan yang menyangkut skema database, sertakan SQL final.
```

## Aturan status

| Status | Arti |
|---|---|
| **Diterima** | Mengikat. Agent wajib mengikutinya tanpa menanyakan ulang. |
| **Usulan** | Ditemukan agent, menunggu keputusan pemilik produk. **Memblokir** task yang bergantung padanya. |
| **Digantikan oleh ADR-NNN** | Tidak berlaku lagi. Isi tetap disimpan sebagai jejak. |

## Kapan agent membuat ADR baru

Sesuai [AGENT_RULES.md](../ai/AGENT_RULES.md) §0 dan §1:

1. Menemukan pertentangan antar-dokumen produk yang belum tercatat di AI_EXECUTION_PLAN §2.
2. Kenyataan teknis di lapangan berbeda dari asumsi dokumen (mis. API pihak ketiga berubah).
3. Butuh dependency di luar SYSTEM_DESIGN §2.

Dalam ketiga kasus itu: tulis ADR berstatus **Usulan**, tandai task `BLOCKED`, lapor ke manusia. **Jangan** memilih implementasi sendiri.

---

## Indeks

| ADR | Judul | Status | Task terkait |
|---|---|---|---|
| [ADR-001](ADR-001-kode-administrasi-surat.md) | Kode administrasi surat | Diterima | T-028, T-032, T-034, T-054 |
| [ADR-002](ADR-002-kode-surat-aspirasi.md) | Kode Surat Aspirasi | Diterima | T-006, T-054, T-055 |
| [ADR-003](ADR-003-counter-surat-periode-baru.md) | Counter surat periode baru | Diterima | T-022, T-034, T-050 |
| [ADR-004](ADR-004-penandatangan-surat.md) | Penandatangan surat | Diterima | T-006, T-055, T-061 |
| [ADR-005](ADR-005-urutan-migration.md) | Urutan migration | Diterima | T-024, T-025 |
| [ADR-006](ADR-006-pengeluaran-di-luar-rab.md) | Pengeluaran di luar RAB | Diterima | T-027, T-101, T-103, T-104 |
| [ADR-007](ADR-007-total-alokasi-nota.md) | Total alokasi nota | Diterima | T-027, T-101, T-102 |
| [ADR-008](ADR-008-durasi-persiapan-proker.md) | Durasi persiapan proker | Diterima | T-023, T-032, T-042 |
| [ADR-009](ADR-009-strategi-cron.md) | Strategi cron | Diterima | T-079, T-111 |
| [ADR-010](ADR-010-strategi-pdf.md) | Strategi PDF | Diterima | T-003, T-054, T-062 |
| [ADR-011](ADR-011-privasi-turunan-nota.md) | Privasi turunan nota | Diterima | T-044, T-098, T-102 |
| [ADR-012](ADR-012-pengurus-tanpa-akun.md) | Pengurus tanpa akun | Diterima | T-030, T-064, T-107 |
| [ADR-013](ADR-013-divisi-acara.md) | Divisi acara | Diterima | T-008, T-042, T-069 |
| [ADR-014](ADR-014-batas-upload-nota.md) | Batas upload nota | Diterima | T-003, T-097, T-098 |
| [ADR-015](ADR-015-approval-lpj.md) | Approval LPJ | Diterima | T-021, T-031, T-105 |
| [ADR-016](ADR-016-retensi-backup.md) | Retensi backup | Diterima | T-110, T-111 |
| [ADR-017](ADR-017-haluan-kerja-pasca-mvp.md) | Haluan Kerja pasca-MVP | Diterima | T-051, T-109 |
| [ADR-018](ADR-018-penamaan-kunci-supabase.md) | Penamaan environment variable kunci Supabase | Diterima | T-003, T-004, T-009, T-044, T-045 |
| [ADR-019](ADR-019-koordinat-rab-aktual.md) | Koordinat sheet RAB AKTUAL | **Usulan** | T-007, T-090, T-103 |

Seluruh ADR di atas berstatus **Diterima** dan mengikat. ADR-005, ADR-006, dan ADR-008 memuat SQL final yang wajib dipakai apa adanya oleh berkas migrasi.
