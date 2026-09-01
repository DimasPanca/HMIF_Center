# ADR-005 — Urutan migration

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-024, T-025 |

## Konteks

Lampiran SYSTEM_DESIGN "Urutan Migrasi Database" menempatkan `005_gantt.sql` sebelum `006_kepanitiaan.sql`.

Namun `gantt_chart` mendeklarasikan foreign key ke `divisi` dan `kepanitiaan`, dan kedua tabel itu baru dibuat pada `006_kepanitiaan.sql`. Menjalankan urutan tersebut dari database kosong **gagal dengan error foreign key** — cacat yang baru terlihat saat migrasi pertama dijalankan.

## Keputusan

**Tukar urutan.** Kepanitiaan dan divisi dibuat lebih dulu:

| Berkas | Isi |
|---|---|
| `005_kepanitiaan.sql` | kepanitiaan, divisi, divisi_member, job_desk |
| `006_gantt.sql` | gantt_chart, gantt_group, gantt_task, gantt_dependency |

## Konsekuensi implementasi

- `npm run db:reset` dari database kosong lolos tanpa error foreign key.
- `gantt_chart` memiliki FK valid ke `divisi` dan `kepanitiaan` sejak dibuat.
- Urutan pada Lampiran SYSTEM_DESIGN **tidak dipakai**; urutan final ada di AI_EXECUTION_PLAN §4.
- Agent dilarang "mengembalikan" urutan ke versi SYSTEM_DESIGN saat melihat perbedaan.

### SQL final

```sql
-- Urutan berkas migrasi yang mengikat (bukan versi SYSTEM_DESIGN Lampiran)
-- 004_proker.sql
-- 005_kepanitiaan.sql   <- kepanitiaan, divisi, divisi_member, job_desk
-- 006_gantt.sql         <- gantt_chart (FK ke divisi & kepanitiaan sudah valid)
-- 007_rab.sql
```
