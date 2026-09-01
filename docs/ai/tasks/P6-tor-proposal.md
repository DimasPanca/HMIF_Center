# FASE 6 — TOR & Proposal (T-094 … T-096)

**Deliverable fase:** TOR dan Proposal ter-generate dari data yang sudah ada di sistem — anggaran dari RAB, kepanitiaan dari data panitia, rundown dari satu sumber — bukan diketik ulang.
**Prinsip fase ini:** satu data, satu tempat. Data yang sudah ada di modul lain **tidak boleh** diinput ulang.

---

### T-094 · Editor TOR
**Fase** 6 · **Butuh** T-084, T-090 · **Baca** PRD F-10.1 (14 bagian) · SYSTEM_DESIGN §4.10

**Buat:** `app/(dashboard)/acara/[id]/tor/page.tsx` · `components/tor/{TorEditor,BagianRepeatable,RundownEditor,ParameterKelulusan}.tsx` · `app/api/tor/[kepanitiaanId]/route.ts` · `lib/tor/schema.ts`
**Ubah:** —

**Kontrak:**
1. **14 bagian** persis PRD F-10.1, dengan tipe input yang tepat:
   1 Nama · 2 Tema · 3 Gambaran Umum (teks kaya) · 4 Tujuan (daftar berulang) · 5 Bentuk Acara (teks kaya + sub-bagian berulang) · 6 Waktu & Tempat (**repeatable**: sesi, hari/tanggal, waktu, tempat) · 7 Sasaran Peserta (+ estimasi jumlah, jumlah kelompok) · 8 Kondisi Pelaksanaan (repeatable) · 9 Parameter Kelulusan (repeatable: kriteria, bobot %, KKM) · 10 Rangkaian Acara (repeatable per sesi) · 11 Susunan Acara/Rundown (tabel) · 12 **Anggaran (otomatis dari RAB)** · 13 Penutup · 14 Penandatangan.
2. Bagian 12 **read-only**, ditarik dari RAB (ringkasan per divisi + total). Ada tautan "Ubah di RAB", bukan field editable.
3. Rundown disimpan di tabel `rundown` — **satu sumber** yang juga dipakai Proposal dan Surat Undangan (T-096, T-058).
4. Total bobot Parameter Kelulusan divalidasi = 100%; selisih ditampilkan sebagai peringatan inline.
5. Auto-save 10 detik; data disimpan sebagai JSONB di `tor.data` mengikuti skema Zod `lib/tor/schema.ts`.
6. Progres pengisian ditampilkan sebagai "9 dari 14 bagian terisi".

**Verifikasi:**
```bash
npm run test:e2e -- tor-editor
```

**Selesai bila:**
- [ ] Bagian Anggaran terisi otomatis dari RAB dan tidak dapat diketik manual
- [ ] Bobot parameter kelulusan yang tidak berjumlah 100% ditandai
- [ ] Rundown yang diubah di TOR ikut berubah di data acara

**Jangan:** jangan menduplikasi rundown ke dalam `tor.data`. Simpan referensinya saja.

---

### T-095 · Generator dokumen TOR
**Fase** 6 · **Butuh** T-094, T-061 · **Baca** SYSTEM_DESIGN §8 · `docs/ai/TEMPLATE_MAPPING.md`

**Buat:** `lib/tor/generate.ts` · `app/api/tor/[kepanitiaanId]/generate/route.ts`
**Ubah:** —

**Kontrak:**
1. Memakai `DocumentEngine` (T-061) dengan `templates/tor.docx`.
2. Loop yang wajib bekerja: `{#tujuan}`, `{#waktu_tempat}`, `{#kondisi}`, `{#parameter}`, `{#rangkaian}`, `{#rundown}`, `{#anggaran_divisi}`.
3. Anggaran **selalu ditarik ulang dari RAB saat generate**, bukan dari snapshot lama — perubahan RAB langsung tercermin.
4. Penandatangan: Ketua Pelaksana + Ketua Himpunan, memakai TTD tersimpan (T-049) dan stempel.
5. Hasil disimpan sebagai baris `dokumen` (jenis `TOR`) dan dapat diunduh ulang.
6. Bila ada bagian wajib yang belum terisi, generate ditolak dengan daftar bagian yang kurang — bukan menghasilkan dokumen bolong.

**Verifikasi:**
```bash
npm run test -- tor-generate
```

**Selesai bila:**
- [ ] Output mengikuti struktur `TOR_KT1_2025.docx`
- [ ] Rundown yang sama tampil konsisten di TOR dan Surat Undangan
- [ ] Mengubah RAB lalu generate ulang mengubah angka di TOR

**Jangan:** jangan menyalin angka RAB ke `tor.data` saat generate.

---

### T-096 · Editor & generator Proposal
**Fase** 6 · **Butuh** T-095 · **Baca** PRD F-10.2 (8 bagian)

**Buat:** `app/(dashboard)/acara/[id]/proposal/page.tsx` · `components/proposal/ProposalEditor.tsx` · `lib/proposal/{schema,prefill,generate}.ts` · `app/api/proposal/[kepanitiaanId]/{route.ts,generate/route.ts}`
**Ubah:** —

**Kontrak:**
1. **8 bagian** persis PRD F-10.2: Halaman Sampul · Lembar Pengesahan · Pendahuluan (latar belakang, landasan, asas, tujuan) · Realisasi Kegiatan · Susunan Kepanitiaan · Anggaran · Penutup · Lampiran.
2. `prefill.ts` mengisi otomatis dari TOR yang sudah ada; target **≥ 60% field terisi** setelah TOR lengkap. Ukur dan tampilkan persentasenya di UI.
3. Susunan kepanitiaan ditarik dari data `kepanitiaan`/`divisi`/`divisi_member` — **tidak diketik**.
4. Anggaran ditarik dari RAB — tidak diketik.
5. Lampiran: susunan acara (rundown) dan rincian RAB.
6. Output DOCX (dan PDF bila `PDF_ENABLED`), memakai `templates/proposal.docx`.
7. Field hasil prefill ditandai visual ("diisi otomatis dari TOR") dan tetap dapat diedit.

**Verifikasi:**
```bash
npm run test:e2e -- proposal
```

**Selesai bila:**
- [ ] Membuat Proposal setelah TOR mengisi otomatis ≥ 60% field (persentase ditampilkan dan diverifikasi)
- [ ] Perubahan RAB tercermin pada Proposal saat di-generate ulang
- [ ] Susunan kepanitiaan cocok dengan data panitia yang sebenarnya

**Jangan:** jangan menyediakan field manual untuk susunan kepanitiaan dan anggaran.
