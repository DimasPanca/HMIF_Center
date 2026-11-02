import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { pilihKonteks, SkemaChatDhana, tanpaEmDash } from '@/lib/dhana/prompt';
import { cari, indeksBagian, type DokumenGuide } from '@/lib/guide/cari';
import { slug, uraiMarkdown } from '@/lib/guide/markdown';

const md = `# Judul

Pembuka **tebal**.

## 1. Mengunggah nota

1. Buka **Acara Saya → Upload Nota**.
2. Pilih foto:
   - Ambil foto, atau
   - Pilih dari galeri.

| Menu | Isi |
|---|---|
| Beranda | Panel |

> Catatan penting.

![Login di ponsel](img/login-ponsel.png)

## 1. Mengunggah nota
Duplikat judul.`;

describe('uraiMarkdown (ADR-060)', () => {
  const blok = uraiMarkdown(md);

  it('mengenali judul, daftar bertingkat, tabel, kutipan, gambar', () => {
    expect(blok.map((b) => b.jenis)).toEqual(['judul', 'paragraf', 'judul', 'daftar', 'tabel', 'kutipan', 'gambar', 'judul', 'paragraf']);
    const daftar = blok[3]!;
    expect(daftar.jenis === 'daftar' && daftar.berurut).toBe(true);
    expect(daftar.jenis === 'daftar' && daftar.butir[1]!.anak).toEqual(['Ambil foto, atau', 'Pilih dari galeri.']);
  });

  it('jangkar unik untuk judul kembar', () => {
    const id = blok.filter((b) => b.jenis === 'judul').map((b) => (b.jenis === 'judul' ? b.id : ''));
    expect(id).toEqual(['judul', '1-mengunggah-nota', '1-mengunggah-nota-2']);
    expect(slug('Tanda **Lihat saja** — ADR!')).toBe('tanda-lihat-saja-adr');
  });
});

describe('pencarian Guide', () => {
  const dok: DokumenGuide[] = [
    { id: 'anggota', judul: 'Panduan Anggota', ringkas: '', blok: uraiMarkdown('## 3. Mengunggah nota belanja dari ponsel\nBuka Upload Nota, ambil foto nota.\n## 4. Kanban\nKartu tugas.') },
    { id: 'umum', judul: 'Panduan Umum', ringkas: '', blok: uraiMarkdown('## 1. Tentang HMIF Center\nKabinet Vardhana.\n## 10. Dhana — asisten HMIF Center\nYour Knowledge Companion.') },
  ];
  const indeks = indeksBagian(dok);

  it('semua kata wajib cocok; judul diutamakan; sinonim "hp" → ponsel', () => {
    const h = cari(indeks, 'cara upload nota dari hp');
    expect(h[0]).toMatchObject({ dokId: 'anggota', id: '3-mengunggah-nota-belanja-dari-ponsel' });
    expect(cari(indeks, 'nota kabinet')).toEqual([]);
  });

  it('konteks Dhana: bagian relevan; tabel birokrasi hanya untuk soal persetujuan; aturan hanya bila relevan', () => {
    const birokrasi = indeksBagian([
      { id: 'umum', judul: 'Panduan Umum', ringkas: '', blok: uraiMarkdown('## 8a. Alur persetujuan (birokrasi)\nSurat disetujui Ketua, Wakil, atau Sekum.') },
    ]);
    const aturan = indeksBagian([
      { id: 'aturan-02', judul: 'ART HMIF', ringkas: '', blok: uraiMarkdown('### Pasal 14 - Status HMIF\nMasa jabatan pengurus paling lama 2 periode.') },
    ]);
    const semua = [...indeks, ...birokrasi];

    const nota = pilihKonteks(semua, [{ peran: 'pengguna', teks: 'Bagaimana upload nota dari HP?' }], aturan);
    expect(nota.map((b) => b.id)).toContain('3-mengunggah-nota-belanja-dari-ponsel');
    expect(nota.map((b) => b.dokId)).not.toContain('aturan-02');

    const sk = pilihKonteks(semua, [{ peran: 'pengguna', teks: 'Surat saya menunggu persetujuan siapa?' }], aturan);
    expect(sk[0]!.id).toBe('8a-alur-persetujuan-birokrasi');

    const masa = pilihKonteks(semua, [{ peran: 'pengguna', teks: 'Berapa lama masa jabatan pengurus HMIF?' }], aturan);
    expect(masa.map((b) => b.dokId)).toContain('aturan-02');
  });

  it('em dash dibuang dari teks', () => {
    expect(tanpaEmDash('Buka menu — lalu isi.')).toBe('Buka menu, lalu isi.');
  });

  it('skema chat menolak pesan terakhir bukan dari pengguna dan pertanyaan terlalu panjang', () => {
    expect(SkemaChatDhana.safeParse({ pesan: [{ peran: 'dhana', teks: 'hai' }] }).success).toBe(false);
    expect(SkemaChatDhana.safeParse({ pesan: [{ peran: 'pengguna', teks: 'x'.repeat(1501) }] }).success).toBe(false);
    expect(SkemaChatDhana.safeParse({ pesan: [{ peran: 'pengguna', teks: 'Halo Dhana' }] }).success).toBe(true);
  });
});

describe('isi panduan nyata', () => {
  it('semua berkas docs/panduan terurai tanpa galat dan Panduan Umum memuat Dhana & Kabinet Vardhana', () => {
    const folder = path.resolve(__dirname, '../../../docs/panduan');
    const berkas = fs.readdirSync(folder).filter((f) => f.endsWith('.md'));
    expect(berkas).toContain('umum.md');
    for (const f of berkas) expect(uraiMarkdown(fs.readFileSync(path.join(folder, f), 'utf8')).length).toBeGreaterThan(5);
    const umum = fs.readFileSync(path.join(folder, 'umum.md'), 'utf8');
    expect(umum).toContain('Kabinet Vardhana (2026–2027)');
    expect(umum).toContain('## 10. Dhana — asisten HMIF Center');
    expect(umum).toContain('## 1. Tentang HMIF Center');
  });
});
