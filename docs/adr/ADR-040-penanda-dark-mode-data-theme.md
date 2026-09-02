# ADR-040 — Penanda dark mode berbasis `data-theme`

| | |
|---|---|
| **Status** | **Diterima** |
| **Tanggal** | 2026-09-02 |
| **Ditemukan oleh** | T-012 saat memasang token warna |
| **Task terkait** | T-012, T-014 |

## Konteks

Inisialisasi shadcn menghasilkan varian dark mode berbasis kelas `.dark`:

```css
@custom-variant dark (&:is(.dark *));
```

DESIGN_SYSTEM §2.3 menetapkan `[data-theme="dark"]` sebagai penanda tema. Dua
penanda yang berbeda akan membuat token CSS dan varian Tailwind tidak selalu
aktif pada saat yang sama.

## Keputusan

HMIF Center memakai atribut `data-theme` sebagai satu-satunya penanda tema.
Varian dark Tailwind ditetapkan sebagai:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

Selector ini mencakup elemen root yang membawa atribut serta seluruh elemen di
dalamnya. Kelas `.dark` tidak digunakan.

## Konsekuensi

- Token dark mode dan utility `dark:*` aktif melalui penanda yang sama.
- Implementasi tema T-014 harus menulis `data-theme="light"` atau
  `data-theme="dark"` pada elemen `<html>`.
- Integrasi komponen baru tidak boleh memperkenalkan kembali kelas `.dark`.
