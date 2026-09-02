# LANE `ui` — ANTARMUKA & DESIGN SYSTEM

**Agent: Codex** · Branch `lane/ui` · Direktori `J:\Software\Web_Project\HMIF_Center_UI`

> Baca [PARALLEL_PROTOCOL.md](../PARALLEL_PROTOCOL.md) sekali di awal sesi, lalu [AGENT_RULES.md](../AGENT_RULES.md).
> Berkas ini hanya menambahkan hal yang khusus untuk lane `ui`.

---

## Perintah harian

```bash
npx tsx scripts/lane.ts status ui          # task berikutnya
npx tsx scripts/lane.ts claim  ui T-0XX    # ambil
npx tsx scripts/lane.ts guard  ui          # WAJIB sebelum commit
npx tsx scripts/lane.ts done   ui T-0XX    # tutup
```

> Skrip di `scripts/` milik lane `data`. Lane ini **boleh menjalankannya**, tetapi **tidak boleh mengubahnya**.

---

## Yang lane ini kuasai

```
app/**                 layout, globals.css, halaman
components/**          seluruh komponen, termasuk components/ui/
lib/utils/**           format tanggal, rupiah, romawi, slug
lib/theme.ts           toggle tema
lib/gantt/**           tipe, geometri, transform
lib/shortcuts.ts       pintasan keyboard
tailwind.config.ts · postcss.config.mjs · components.json
```

## Yang lane ini TIDAK BOLEH sentuh

```
supabase/**    prisma/**    lib/db/**    lib/storage/**    lib/images/**
scripts/**     package.json    package-lock.json    next.config.ts
eslint.config.mjs    vitest.config.ts    playwright.config.ts
```

**Tidak pernah menjalankan `npm install`, `npm run db:*`, atau menyentuh database.**

Butuh dependency baru? **Berhenti dan lapor.** Lane `data` yang memasangnya di sync point berikutnya.

---

## Urutan task

Seluruh task di bawah **tidak bergantung pada database** — lane ini tidak akan pernah terblokir menunggu kredensial.

| Urutan | Task | Judul | Berkas utama |
|:---:|---|---|---|
| 1 | **T-012** | Token warna | `app/globals.css` |
| 2 | **T-013** | Konfigurasi Tailwind & tipografi | `tailwind.config.ts`, `app/layout.tsx` |
| 3 | **T-014** | Tema light/dark tanpa flash | `lib/theme.ts`, `components/shared/ThemeToggle.tsx` |
| 4 | **T-015** | Utilitas format lokal Indonesia | `lib/utils/*.ts` + test |
| 5 | **T-016** | Komponen dasar A — kontrol form | `components/ui/{button,input,select,checkbox,textarea,label}.tsx` |
| 6 | **T-017** | Komponen dasar B — penyajian data | `components/ui/{badge,status-pill,avatar,card,table}.tsx` |
| 7 | **T-018** | Komponen dasar C — umpan balik | `components/ui/{toast,skeleton,empty-state,dialog,tooltip,confirm-dialog}.tsx` |
| 8 | **T-072** | Mesin geometri Gantt | `lib/gantt/{types,geometry,transform}.ts` |
| 9 | **T-073** | Komponen Gantt SVG | `components/gantt/*.tsx` |
| 10 | **T-074** | Virtualisasi & performa Gantt | `lib/gantt/use-virtual-rows.ts` |
| 11 | **T-078** | Editor Gantt & 4 level lainnya | `components/gantt/GanttEditor.tsx` |

`T-015` sengaja ditaruh setelah tema: ia tidak bergantung pada T-013/T-014, jadi boleh dikerjakan lebih awal bila diinginkan. `T-072` **wajib** setelah T-015.

---

## Dua hal yang harus diputuskan di T-012

### 1. Konflik penanda dark mode

`shadcn init` (dijalankan pada T-009) menulis di `app/globals.css`:

```css
@custom-variant dark (&:is(.dark *));
```

Sedangkan **DESIGN_SYSTEM §2.3** menetapkan penanda tema berupa atribut:

```css
[data-theme="dark"] { ... }
```

Keduanya tidak bisa dipakai bersamaan tanpa membingungkan. **DESIGN_SYSTEM yang menang** (hierarki AGENT_RULES §0: dokumen produk di atas kode yang sudah ada). Sesuaikan `@custom-variant` menjadi:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

Tulis keputusan ini sebagai **ADR-040**.

### 2. Verifikasi sebelum T-010 selesai

Bila `npm run verify` belum ada (lane `data` masih mengerjakan T-010), pakai:

```bash
npx tsc --noEmit && npx eslint .
```

Setelah sync **S1**, barulah `npm run verify` tersedia.

---

## Aturan khusus lane `ui`

| # | Aturan |
|:-:|---|
| 1 | **Tidak ada nilai hex mentah di komponen.** Semua warna lewat token (AGENT_RULES K-05) |
| 2 | Tinggi tombol dan input **34 px**, baris tabel **36 px**, radius **6 px** (K-14) |
| 3 | Animasi hanya 120 ms dan 180 ms. Dilarang transisi > 250 ms, parallax, spinner terus-menerus (K-13) |
| 4 | Status **tidak pernah** hanya lewat warna — selalu ada teks atau ikon (K-15, INV) |
| 5 | Default adalah **React Server Component**. `"use client"` hanya bila butuh state/efek/event (K-06) |
| 6 | Bahasa antarmuka **Indonesia**. Format lewat `lib/utils/*`, tidak pernah inline (K-01, K-12) |
| 7 | ADR baru memakai rentang **ADR-040 … ADR-059** |
| 8 | Jangan buat berkas `.gitkeep` — lane `data` yang menyusun kerangka folder di T-011 |

## Sync point lane ini

| Sync | Berhenti setelah | Lapor ke manusia |
|:---:|---|---|
| **S1** | T-015 | Token, tipografi, tema, utilitas format siap |
| **S2** | T-018 | Seluruh komponen dasar siap |
| **S3** | T-078 | Gantt siap; evaluasi gerbang **G1** bersama lane `data` |
