# FASE 8 — Kesekretariatan (T-106 … T-109)

**Deliverable fase:** notulensi terarsip dan dapat dicari, data pengurus terpusat (sumber auto-fill Surat Aktif Organisasi), peminjaman ruangan tercatat.
**Dapat dikerjakan paralel dengan P7.** PRD §11 R1 menandai fase ini sebagai kandidat pertama untuk digeser bila waktu habis.

---

### T-106 · Notulensi rapat
**Fase** 8 · **Butuh** T-051, T-080, T-061 · **Baca** PRD M13 · USER_FLOW §9.2

**Buat:** `app/(dashboard)/sekretariat/notulensi/page.tsx` · `.../notulensi/baru/page.tsx` · `.../notulensi/[id]/page.tsx` · `components/notulensi/{NotulensiEditor,DaftarHadir,PoinKeputusan,ActionItemList}.tsx` · `app/api/notulensi/{route.ts,[id]/route.ts,[id]/generate/route.ts}`
**Ubah:** —

**Kontrak:**
1. Metadata: judul rapat, tanggal, waktu mulai–selesai, tempat, pemimpin rapat, notulis.
2. Editor TipTap: heading, daftar, tabel, checklist, blok kutipan. Output disanitasi sebelum disimpan dan sebelum dirender.
3. **Daftar hadir** dibangun dari daftar pengurus periode aktif, dengan status **Hadir / Izin / Sakit / Alfa** dan ringkasan jumlah tiap status.
4. **Poin keputusan** sebagai daftar terpisah (bukan bagian isi bebas), agar bisa dirujuk dan dicari.
5. **Action item**: tugas, PIC, deadline — dengan tombol **"Jadikan kartu Kanban"** yang membuat kartu di departemen yang tepat dan menyimpan `kanban_card_id`.
6. Generate DOCX memakai `templates/notulensi.docx`.
7. Arsip dengan pencarian teks penuh pada judul dan isi.

**Verifikasi:**
```bash
npm run test:e2e -- notulensi
```

**Selesai bila:**
- [ ] Action item yang dikonversi muncul sebagai kartu di Kanban departemen yang tepat
- [ ] Daftar hadir menampilkan ringkasan yang cocok dengan status per orang
- [ ] Pencarian menemukan notulensi berdasarkan isi, bukan hanya judul

**Jangan:** jangan menyimpan daftar hadir sebagai teks bebas di dalam isi notulensi.

---

### T-107 · Data pengurus
**Fase** 8 · **Butuh** T-048 · **Baca** PRD F-14.1 · USER_FLOW §9.1

**Buat:** `app/(dashboard)/sekretariat/pengurus/page.tsx` · `components/pengurus/{PengurusTable,ImportPengurusDialog,PilihUntukSurat}.tsx` · `app/api/pengurus/{route.ts,[id]/route.ts,import/route.ts,export/route.ts}`
**Ubah:** `app/(dashboard)/surat/massal/page.tsx`

**Kontrak:**
1. Field: nama lengkap, NIM, jabatan, departemen, angkatan, periode, status keaktifan.
2. Import massal CSV/XLSX memakai `parse-tabel.ts` (T-048): pemetaan kolom → pratinjau → laporan hasil.
3. NIM duplikat dalam periode yang sama ditandai dan **dapat dilewati** per baris.
4. Data pengurus menjadi sumber **auto-fill Surat Keterangan Aktif Organisasi** (T-064): pilih banyak pengurus → generate massal.
5. Export daftar pengurus ke Excel.
6. Baris pengurus boleh tidak punya akun (`user_id` NULL, ADR-012); baris yang punya akun ditautkan.

**Verifikasi:**
```bash
npm run test:e2e -- data-pengurus
```

**Selesai bila:**
- [ ] Import 100 baris menampilkan pratinjau valid/peringatan/error sebelum menyimpan
- [ ] Memilih 30 pengurus menghasilkan 30 Surat Aktif Organisasi dengan 30 nomor berbeda
- [ ] Baris tanpa akun tetap dapat dipakai untuk generate surat

**Jangan:** jangan membuat akun otomatis dari data pengurus yang diimpor.

---

### T-108 · Peminjaman ruangan
**Fase** 8 · **Butuh** T-107, T-058 · **Baca** PRD F-14.2 · USER_FLOW §9.3

**Buat:** `app/(dashboard)/sekretariat/ruangan/page.tsx` · `components/ruangan/{DaftarRuangan,FormPeminjaman,KalenderBooking,PeringatanBentrok}.tsx` · `app/api/ruangan/{route.ts,booking/route.ts}`
**Ubah:** —

**Kontrak:**
1. Daftar ruangan **dikelola sendiri oleh Sekretaris** (form input bebas): nama, lokasi, kapasitas, instansi pengelola, catatan.
2. Form peminjaman: ruangan, kegiatan, hari & tanggal, waktu, jumlah peserta, keperluan.
3. **Kalender booking** menampilkan jadwal yang sudah tercatat.
4. Bentrok jadwal menghasilkan **peringatan, bukan blokir** (PRD F-14.2) — keputusan final ada di Dekanat. Peringatan menampilkan detail booking yang bertabrakan dan tetap dapat dilanjutkan.
5. Tombol "Buat Surat Peminjaman Ruangan" membuka form surat kode `05` varian `PEMINJAMAN_RUANGAN` dengan field terisi otomatis dari booking, dan menautkan `booking_ruangan.surat_id` setelah surat terbit.

**Verifikasi:**
```bash
npm run test:e2e -- peminjaman-ruangan
```

**Selesai bila:**
- [ ] Booking bentrok menampilkan peringatan berisi detail jadwal lain dan tetap bisa disimpan
- [ ] Surat peminjaman terisi otomatis dari data booking
- [ ] Setelah surat terbit, booking menampilkan nomor suratnya

**Jangan:** jangan menambahkan constraint anti-bentrok pada booking ruangan (T-030 sudah memutuskan ini).

---

### T-109 · Bersihkan menu Haluan Kerja
**Fase** 8 · **Butuh** T-051 · **Baca** ADR-017 · USER_FLOW §1.1

**Buat:** `docs/ai/BACKLOG.md` (bagian M17)
**Ubah:** `components/layout/Sidebar.tsx`

**Kontrak:**
1. Pastikan menu **Haluan Kerja** tidak ada di sidebar maupun command palette (ADR-017).
2. Catat di `BACKLOG.md` sebagai **M17 — Haluan Kerja Departemen (pasca-MVP)**, sertakan: template yang tersedia (`Template Haluan Kerja Dasar Departemen.docx`, `Template LPJ_Departemen.docx`), perkiraan cakupan, dan alasan penundaan.
3. Template terkait **tetap disimpan** di `Template/` — jangan dihapus.
4. Bila ada tautan mati ke rute Haluan Kerja di kode mana pun, hapus tautannya.

**Verifikasi:**
```bash
grep -rin "haluan" app components lib || echo "bersih"
```

**Selesai bila:**
- [ ] Tidak ada rujukan Haluan Kerja di `app/`, `components/`, `lib/`
- [ ] Backlog M17 tercatat lengkap dengan alasan penundaan
- [ ] Berkas template masih ada di `Template/`

**Jangan:** jangan menghapus berkas template dari repositori.
