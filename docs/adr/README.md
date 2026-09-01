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
| — | *Belum ada. Diisi oleh T-002.* | — | — |
