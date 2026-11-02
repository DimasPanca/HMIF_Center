---
name: hmif-design-linear
description: Arah visual HMIF Center v2 — gaya Linear yang disesuaikan dengan warna navy HMIF, tema terang & gelap mengikuti sistem. Pakai setiap kali membuat, merombak, atau merapikan tampilan apa pun di HMIF Center (halaman, komponen, beranda, sidebar, Guide, Dhana, panel admin).
---

# HMIF Center — gaya Linear (v2)

Keputusan pemilik 2026-11-02 (lihat `docs/ai/CHECKPOINT_REDESAIN.md` dan ADR terkait). Referensi
asli: `references/linear-DESIGN.md` (awesome-design-md, MIT). Dokumen itu menggambarkan situs
pemasaran Linear yang selalu gelap; **HMIF bukan situs pemasaran**, jadi ambil karakter dan
sistemnya, bukan warnanya mentah-mentah.

## Yang diambil dari Linear

- **Tenang dan padat tapi lega.** Hierarki dibawa oleh tangga permukaan (canvas → surface 1 → 2 → 3)
  dan garis 1px tipis — **tanpa bayangan** pada elemen diam. Bayangan hanya untuk yang benar-benar
  melayang (menu, dialog, panel Dhana).
- **Satu aksen.** Aksen dipakai hanya untuk: aksi utama, cincin fokus, tautan penting, penanda
  aktif. Bukan untuk latar kartu atau dekorasi.
- **Warna hanya untuk data & status** (sukses, peringatan, bahaya, info) — selalu disertai ikon
  atau teks, tidak warna saja.
- **Tipografi:** Inter (pengganti Linear Display/Text). Judul 600 dengan tracking negatif
  (≈ -0.02em di 24–28px, -0.01em di 18–20px); isi 400, 14–16px, leading 1.5. Angka `tabular-nums`.
  Mono hanya untuk kode/ID (mis. kode kegiatan, nomor surat).
- **Radius:** 6px chip/tag, 8px tombol & input, 12px kartu/panel, pill hanya untuk status.
- **Tombol:** kompak (34–36px, padding 8×14), satu tombol primer per area.
- **Spasi:** basis 4px; antar-blok 16–24px, antar-bagian 32–48px.

## Disesuaikan untuk HMIF

| Linear | HMIF v2 |
|---|---|
| Aksen lavender `#5e6ad2` | **Biru HMIF** (token `--primary` yang sudah ada di `app/globals.css`); jangan memasukkan ungu. |
| Selalu gelap | **Terang & gelap**, bawaan **ikut sistem** (`prefers-color-scheme`), tetap bisa diganti manual (ADR-040 `data-theme`). |
| Canvas `#010102` | Gelap: navy sangat gelap dari token HMIF; terang: abu sangat muda, kartu putih. |
| Screenshot produk sebagai protagonis | Data nyata pengguna (tugas, acara, Gantt) sebagai protagonis; tanpa angka karangan. |

## Aturan app-screen (dari Taste Skill, `design-taste-frontend/references/app-screens.md`)

- Panel tenang, label kecil dan panel berulang boleh di layar kerja; **tidak** boleh gradien, glow,
  ikon dalam kotak berwarna, grafik pelangi, angka pamer.
- HP: navigasi dilipat; tanpa geser ke samping, huruf tidak dikecilkan (ADR-037).
- Periksa di 3 lebar (1440, 768, 390) — pakai Playwright yang sudah ada atau `playwright-cli`.

## Audit

Setelah membangun, audit dengan skill `web-design-guidelines` (aturan Vercel) dan perbaiki temuan
yang relevan. Batasan proyek tetap berlaku: dokumen beku tidak diubah, perubahan arah visual
dicatat lewat ADR, `npm run verify` hijau sebelum commit.
