# ADR-001 — Kode administrasi surat

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-028, T-032, T-034, T-054 |

## Konteks

PRD §12 Q1 menandai pertanyaan ini sebagai terbuka. Arsip surat nyata HMIF memakai `UN43.3.7` (contoh: `05/379/UN43.3.7/KT2HMIF/VIII/2025`), sedangkan brief awal menyebut `UN43.3.3.7`.

Nilai ini muncul pada setiap nomor surat yang terbit. Bila salah, seluruh surat satu periode cacat dan tidak bisa diperbaiki tanpa membatalkan nomor — sementara nomor yang dibatalkan tidak boleh didaur ulang (INV-16).

## Keputusan

Gunakan **`UN43.3.7`** sebagai nilai awal.

Nilainya **tidak di-hardcode**. Ia dibaca dari `app_config.kode_administrasi`, sehingga Admin dapat mengubahnya untuk periode berikutnya tanpa perubahan kode.

## Konsekuensi implementasi

- Seed `app_config` mengisi key `kode_administrasi` dengan `UN43.3.7` (T-042).
- `alokasi_nomor_surat` membaca nilai dari `app_config`, dengan fallback `'UN43.3.7'` bila baris tidak ada (T-034).
- Form surat dan generator dokumen **dilarang** menuliskan nilai ini sebagai literal (AGENT_RULES §4 no.5).
- Bila Sekum kemudian menyatakan nilai yang benar adalah `UN43.3.3.7`, perbaikannya cukup satu baris `app_config` — tanpa migrasi dan tanpa perubahan kode.
