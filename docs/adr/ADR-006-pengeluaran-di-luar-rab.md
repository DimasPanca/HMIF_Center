# ADR-006 — Pengeluaran di luar RAB

| | |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-01 |
| **Sumber** | AI_EXECUTION_PLAN.md §2 Keputusan Terkunci |
| **Task terkait** | T-027, T-101, T-103, T-104 |

## Konteks

SYSTEM_DESIGN §4.7 mendefinisikan `nota_alokasi.rab_item_id` sebagai `NOT NULL`.

PRD F-12.2 mewajibkan LPJ melaporkan **"Nota tanpa item RAB — pengeluaran di luar rencana (ditandai sebagai temuan)"**, dan fungsi `analisisLpj` pada SYSTEM_DESIGN §11.5 memfilter `n.alokasi.filter(a => !a.rabItemId)`.

Dengan kolom `NOT NULL`, filter itu **selalu mengembalikan array kosong**. Fitur temuan LPJ tidak akan pernah berfungsi, dan pengeluaran nyata di luar rencana tidak punya tempat untuk dicatat.

## Keputusan

`rab_item_id` menjadi **NULLABLE**, dengan kolom baru `uraian_luar_rab TEXT`.

Setiap baris alokasi wajib mengisi **salah satu** dari keduanya: terkait item RAB, atau merupakan pengeluaran di luar RAB yang diberi uraian.

## Konsekuensi implementasi

- Editor alokasi nota menyediakan opsi "Pengeluaran di luar RAB" yang meminta uraian (T-101).
- Sheet PENGELUARAN memuat alokasi luar RAB; RAB AKTUAL per item **tidak** (T-103).
- `analisisLpj` mengambil baris ber-`rab_item_id IS NULL` sebagai `diLuarRab` dan menampilkannya sebagai temuan (T-104).
- UNIQUE `(nota_id, rab_item_id)` menjadi unique **parsial**, karena beberapa baris NULL harus tetap diizinkan dalam satu nota.

### SQL final

```sql
-- Tabel nota_alokasi (ADR-006)
rab_item_id     UUID REFERENCES rab_item(id),   -- NULLABLE: pengeluaran di luar RAB
uraian_luar_rab TEXT,

CONSTRAINT nota_alokasi_target_wajib CHECK (
  rab_item_id IS NOT NULL OR uraian_luar_rab IS NOT NULL
);

-- UNIQUE parsial: banyak baris luar-RAB (NULL) boleh ada dalam satu nota
CREATE UNIQUE INDEX nota_alokasi_item_unik
  ON nota_alokasi (nota_id, rab_item_id)
  WHERE rab_item_id IS NOT NULL;
```
