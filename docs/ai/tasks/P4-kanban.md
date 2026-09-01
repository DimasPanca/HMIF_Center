# FASE 4 — Kanban, Checklist & Kendala (T-080 … T-083)

**Deliverable fase:** progres departemen terlihat dan terukur; kendala terdokumentasi, bukan hanya dibicarakan saat rapat.
**Dapat dikerjakan paralel dengan P5.**

---

### T-080 · Kanban board departemen
**Fase** 4 · **Butuh** T-051, T-029 · **Baca** PRD F-7.1 · USER_FLOW §8.1 · DESIGN_SYSTEM §9.4

**Buat:** `app/(dashboard)/departemen/[kode]/kanban/page.tsx` · `components/kanban/{KanbanBoard,KanbanKolom,KanbanCard,CardDialog}.tsx` · `app/api/kanban/{route.ts,[id]/route.ts}`
**Ubah:** —

**Kontrak:**
1. Empat kolom tetap: **To Do · In Progress · Review · Done**.
2. Kartu memuat: judul, avatar penanggung jawab, deadline dengan indikator (T-083), label prioritas, hitungan checklist (`3/8`).
3. Drag & drop memakai **dnd-kit** dan wajib dapat dioperasikan **dengan keyboard** (tab ke kartu, spasi untuk angkat, panah untuk pindah, spasi untuk jatuhkan).
4. **Optimistic update**: kartu berpindah seketika, dibatalkan bila server menolak, dengan toast penjelasan.
5. Progres proker dihitung otomatis `(kartu Done / total kartu) × 100` dan langsung tercermin di Master Gantt.
6. Filter: penanggung jawab, proker, prioritas, deadline.
7. Anggota hanya melihat Kanban departemennya sendiri; BPH melihat semua tetapi **tidak dapat menggeser kartu** (drag dinonaktifkan dan API menolak).

**Verifikasi:**
```bash
npm run test:e2e -- kanban
```

**Selesai bila:**
- [ ] Memindahkan kartu ke Done memperbarui persentase progres proker seketika
- [ ] Navigasi keyboard penuh berfungsi
- [ ] BPH gagal memindahkan kartu di UI **dan** di API

**Jangan:** jangan menambah kolom kelima atau kolom kustom.

---

### T-081 · Checklist
**Fase** 4 · **Butuh** T-080 · **Baca** PRD F-7.2

**Buat:** `components/kanban/{ChecklistPanel,ChecklistItem,TemplateChecklistDialog}.tsx` · `app/api/kanban/[id]/checklist/route.ts`
**Ubah:** —

**Kontrak:**
1. Checklist bersarang di dalam kartu; item punya teks, status centang, penanggung jawab opsional, deadline opsional.
2. Progres tampil sebagai `3/8` + bar tipis di kartu dan di panel detail.
3. **Template checklist** dapat disimpan dan dipakai ulang untuk proker sejenis (mis. "Persiapan Seminar").
4. Mencentang item memperbarui hitungan kartu dan progres proker secara optimistik.
5. Item dapat diurutkan ulang dengan drag (keyboard-accessible).

**Verifikasi:**
```bash
npm run test:e2e -- checklist
```

**Selesai bila:**
- [ ] Centang item langsung memperbarui `3/8` tanpa reload
- [ ] Template checklist dapat diterapkan ke kartu baru

**Jangan:** jangan menghitung progres proker dari checklist. Progres proker berasal dari kolom kartu (PRD F-7.1).

---

### T-082 · Kendala departemen
**Fase** 4 · **Butuh** T-080 · **Baca** PRD F-7.3 · USER_FLOW §8.2

**Buat:** `app/(dashboard)/departemen/[kode]/kendala/page.tsx` · `components/kendala/{KendalaList,KendalaDetail,ReplyThread,MentionInput}.tsx` · `app/api/kendala/{route.ts,[id]/route.ts,[id]/reply/route.ts}`
**Ubah:** —

**Kontrak:**
1. Field: judul, deskripsi, prioritas (Rendah/Sedang/Tinggi/Kritis), status (Terbuka/Sedang Ditangani/Selesai), assignee, proker terkait, lampiran.
2. Diskusi berulir (nested reply) hingga 3 tingkat; lebih dalam diratakan.
3. Mention `@nama` menampilkan daftar pengurus yang relevan; nama ter-mention disorot di teks.
4. Kendala **Kritis** muncul di dashboard Ketua/Wakil/BPH **< 3 detik** (lewat kanal realtime).
5. Menyelesaikan kendala wajib mengisi catatan penyelesaian.
6. Arsip kendala dapat dicari dengan teks penuh.

**Verifikasi:**
```bash
npm run test:e2e -- kendala
```

**Selesai bila:**
- [ ] Kendala Kritis muncul di dashboard Ketua < 3 detik
- [ ] Balasan berulir tampil dengan indentasi yang benar
- [ ] BPH dapat membaca seluruh kendala tetapi tidak dapat membalas atau mengubah

**Jangan:** jangan mengirim notifikasi email/WhatsApp (di luar cakupan MVP).

---

### T-083 · Sistem peringatan deadline
**Fase** 4 · **Butuh** T-080, T-079 · **Baca** PRD F-7.4 · DESIGN_SYSTEM §12.5

**Buat:** `lib/deadline.ts` · `components/shared/DeadlineBadge.tsx`
**Ubah:** `lib/cron/cek-deadline.ts` · `components/kanban/KanbanCard.tsx`

**Kontrak:**
1. Empat tingkat: **Normal** (> 7 hari, Steel Gray) · **Peringatan** (≤ 7 hari, Amber) · **Kritis** (≤ 3 hari, Coral) · **Terlambat** (lewat, merah tebal + ikon).
2. Ambang 7 dan 3 hari dibaca dari `app_config` (`deadline_warning_hari`, `deadline_critical_hari`).
3. Setiap tingkat menampilkan **teks** ("3 hari lagi", "Terlambat 2 hari") dan **ikon**, bukan hanya warna (K-15).
4. Perhitungan memakai zona `Asia/Jakarta` dan batas hari, bukan selisih jam.
5. Cron harian menyegarkan agregat deadline untuk dashboard.
6. Komponen dipakai ulang di Kanban, checklist, Gantt panel, dan dashboard.

**Verifikasi:**
```bash
npm run test -- deadline
```

**Selesai bila:**
- [ ] Empat tingkat diuji pada batas persis (hari ke-7, ke-3, hari-H, H+1)
- [ ] Status terbaca tanpa melihat warna (uji dengan mode grayscale)

**Jangan:** jangan memakai selisih milidetik. Deadline adalah tanggal, bukan waktu.
