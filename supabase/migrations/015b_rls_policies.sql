-- 015b_rls_policies — Row Level Security untuk seluruh tabel domain.
--
-- Terjemahan Permission Matrix PRD §5.1 menjadi policy. Setiap blok menyebut
-- baris matriks yang diterjemahkannya.
--
-- ===========================================================================
-- TIGA HAL YANG WAJIB DIPAHAMI SEBELUM MENYUNTING BERKAS INI
-- ===========================================================================
--
-- 1. RLS TIDAK BERLAKU BAGI KONEKSI MIGRASI DAN TEST.
--    Role `postgres` di Supabase memiliki BYPASSRLS — diperiksa langsung:
--    rolsuper=false, rolbypassrls=true. Bahkan FORCE ROW LEVEL SECURITY tidak
--    menghentikannya. Artinya seluruh berkas test yang ada akan tetap HIJAU
--    walau policy di sini salah total.
--    Test yang benar-benar menguji RLS wajib memakai `SET LOCAL ROLE
--    authenticated` (lihat T-039).
--
-- 2. TANPA GRANT, POLICY ADALAH KODE MATI.
--    RLS baru diperiksa SETELAH hak tabel biasa lolos. Sebelum migrasi ini,
--    role `authenticated` tidak punya hak apa pun atas tabel public — sebuah
--    policy sesempurna apa pun tidak akan pernah dievaluasi. Blok GRANT di
--    bawah karena itu bukan pelengkap, melainkan syarat.
--
-- 3. FUNGSI DOMAIN BUKAN SECURITY DEFINER, DAN ITU DISENGAJA.
--    setujui_proker() menulis proker_lock; alokasi_nomor_surat() menulis
--    surat_counter. Keduanya berjalan dengan hak PEMANGGIL, sehingga policy
--    pada kedua tabel itulah yang menentukan siapa boleh menyetujui.
--    Menjadikan fungsinya SECURITY DEFINER akan membuat siapa pun yang dapat
--    memanggilnya menjadi approver — persis eskalasi hak yang dicegah INV-05.
--    Jadi: JANGAN menambahkan SECURITY DEFINER pada fungsi domain.
--
-- Sumber: PRD §5.1 Permission Matrix · SYSTEM_DESIGN §5.3 · INV-01..INV-05, INV-08, INV-29, INV-30

-- ===========================================================================
-- BAGIAN 1 — HAK TABEL
-- ===========================================================================
-- anon (belum login) tidak memperoleh apa pun. Seluruh sistem ini internal
-- kepengurusan; tidak ada halaman publik yang membaca database.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Tabel pelacak migrasi bukan tabel domain dan tidak ada urusannya dengan
-- pengguna aplikasi.
REVOKE ALL ON _migrasi FROM authenticated;

-- audit_log tetap append-only bagi siapa pun (INV-06). Trigger di migrasi 013
-- sudah menolak UPDATE/DELETE, tetapi hak yang tidak pernah diberikan lebih
-- baik daripada hak yang ditolak belakangan.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_log FROM authenticated;

-- proker_lock dan surat_counter hanya boleh disentuh lewat fungsi domain.
-- Haknya tetap diberikan karena fungsi berjalan dengan hak pemanggil, tetapi
-- policy di Bagian 4 yang membatasi siapa pemanggilnya.

-- ===========================================================================
-- BAGIAN 2 — PREDIKAT PENDUKUNG
-- ===========================================================================
-- Dipisah supaya policy tetap terbaca sebagai kalimat, bukan sebagai JOIN.
-- Semuanya SECURITY DEFINER dengan search_path terkunci, alasannya sama
-- dengan helper di 015a.

-- Periode yang sedang berjalan. NULL bila belum ada periode aktif — dalam
-- keadaan itu seluruh policy tulis berbasis periode menutup dengan sendirinya.
CREATE OR REPLACE FUNCTION periode_aktif() RETURNS UUID AS $$
  SELECT id FROM periode WHERE status = 'AKTIF' LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Divisi tempat pengguna bertugas PADA PERIODE AKTIF.
--
-- my_divisi() di 015a sengaja tidak menyaring periode supaya mode arsip tetap
-- terbaca. Untuk MENULIS, penyaringan itu wajib: tanpa ini mantan panitia
-- 2025/2026 masih dapat menyunting RAB acara yang sudah diarsipkan (INV-08).
CREATE OR REPLACE FUNCTION my_divisi_aktif() RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(dm.divisi_id), ARRAY[]::UUID[])
  FROM divisi_member dm
  JOIN divisi d      ON d.id = dm.divisi_id
  JOIN kepanitiaan k ON k.id = d.kepanitiaan_id
  JOIN proker p      ON p.id = k.proker_id
  WHERE dm.user_id = auth.uid() AND p.periode_id = periode_aktif();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Boleh mengelola sesuatu milik sebuah departemen.
-- Menerjemahkan tanda * pada Permission Matrix: "terbatas pada departemen
-- sendiri". BPH tidak pernah termasuk (INV-03).
CREATE OR REPLACE FUNCTION kelola_dept(p_dept UUID) RETURNS BOOLEAN AS $$
  SELECT has_role('ADMIN','KETUA','WAKIL')
      OR (p_dept IS NOT NULL AND p_dept = ANY(my_departemen()));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- RAB sebuah divisi masih boleh diubah. Setelah DIKUNCI atau DISETUJUI,
-- perubahan ditolak di level RLS, bukan sekadar disembunyikan di UI (INV-29).
CREATE OR REPLACE FUNCTION rab_terbuka(p_divisi UUID) RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT rm.status IN ('DRAFT','DIAJUKAN')
       FROM divisi d
       JOIN rab_meta rm ON rm.kepanitiaan_id = d.kepanitiaan_id
      WHERE d.id = p_divisi),
    true   -- rab_meta belum dibuat: RAB masih tahap paling awal
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ===========================================================================
-- BAGIAN 3 — AKTIFKAN RLS PADA SELURUH TABEL
-- ===========================================================================
-- Dijalankan sebagai loop atas seluruh tabel di schema public, bukan sebagai
-- daftar manual. Daftar manual akan tertinggal begitu ada tabel baru, dan
-- tabel yang terlewat adalah tabel yang terbuka penuh.
--
-- Tabel tanpa policy menjadi TIDAK DAPAT DIAKSES sama sekali oleh pengguna
-- biasa. Itu perilaku yang benar: menutup lebih dulu, membuka satu per satu.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_migrasi'   -- pelacak migrasi, bukan tabel domain
    ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ===========================================================================
-- BAGIAN 4 — POLICY
-- ===========================================================================
-- Penamaan: <tabel>_<operasi>. Setiap tabel memperoleh empat policy terpisah
-- agar hak baca tidak pernah tercampur dengan hak tulis karena kelalaian.
--
-- Pola yang berulang:
--   SELECT  seluruh pengurus, karena transparansi antar-departemen adalah
--           tujuan sistem ini (PRD §1). Yang dibatasi adalah TULIS.
--   INSERT/UPDATE/DELETE  selalu menyebut role secara eksplisit.
--
-- BPH tidak muncul pada satu pun policy tulis di bawah (INV-03).

-- ---------------------------------------------------------------------------
-- REFERENSI SISTEM
-- Matriks: "Periode Kepengurusan" Admin CRUD, lainnya R
-- ---------------------------------------------------------------------------

CREATE POLICY periode_select ON periode FOR SELECT USING (true);
CREATE POLICY periode_insert ON periode FOR INSERT WITH CHECK (has_role('ADMIN'));
CREATE POLICY periode_update ON periode FOR UPDATE USING (has_role('ADMIN'));
CREATE POLICY periode_delete ON periode FOR DELETE USING (has_role('ADMIN'));

-- Matriks: "Departemen" Admin/Ketua/Wakil CRUD, Kadept RU departemennya
CREATE POLICY departemen_select ON departemen FOR SELECT USING (true);
CREATE POLICY departemen_insert ON departemen FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL'));
CREATE POLICY departemen_update ON departemen FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL') OR id = ANY(my_departemen()));
CREATE POLICY departemen_delete ON departemen FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL'));

-- app_config: hanya Admin. Berisi kode administrasi surat dan tetapan lain
-- yang salah ketiknya merusak seluruh penomoran.
CREATE POLICY app_config_select ON app_config FOR SELECT USING (true);
CREATE POLICY app_config_insert ON app_config FOR INSERT WITH CHECK (has_role('ADMIN'));
CREATE POLICY app_config_update ON app_config FOR UPDATE USING (has_role('ADMIN'));
CREATE POLICY app_config_delete ON app_config FOR DELETE USING (has_role('ADMIN'));

-- Matriks: "Peminjaman Ruangan" Admin/Sekum CRUD — master ruangannya ikut
CREATE POLICY ruangan_select ON ruangan FOR SELECT USING (true);
CREATE POLICY ruangan_insert ON ruangan FOR INSERT WITH CHECK (has_role('ADMIN','SEKUM'));
CREATE POLICY ruangan_update ON ruangan FOR UPDATE USING (has_role('ADMIN','SEKUM'));
CREATE POLICY ruangan_delete ON ruangan FOR DELETE USING (has_role('ADMIN','SEKUM'));

-- Template surat: Admin dan Sekum, karena Sekum pemilik proses persuratan
CREATE POLICY surat_template_select ON surat_template FOR SELECT USING (true);
CREATE POLICY surat_template_insert ON surat_template FOR INSERT
  WITH CHECK (has_role('ADMIN','SEKUM'));
CREATE POLICY surat_template_update ON surat_template FOR UPDATE
  USING (has_role('ADMIN','SEKUM'));
CREATE POLICY surat_template_delete ON surat_template FOR DELETE
  USING (has_role('ADMIN','SEKUM'));

-- Tanda tangan: hanya pemiliknya sendiri dan Admin. Tanda tangan orang lain
-- tidak boleh dibaca, apalagi diunggah, oleh siapa pun.
CREATE POLICY signature_select ON signature FOR SELECT
  USING (user_id = auth.uid() OR has_role('ADMIN'));
CREATE POLICY signature_insert ON signature FOR INSERT
  WITH CHECK (user_id = auth.uid() OR has_role('ADMIN'));
CREATE POLICY signature_update ON signature FOR UPDATE
  USING (user_id = auth.uid() OR has_role('ADMIN'));
CREATE POLICY signature_delete ON signature FOR DELETE
  USING (user_id = auth.uid() OR has_role('ADMIN'));

-- ---------------------------------------------------------------------------
-- IDENTITAS DAN PERAN
-- Matriks: "User & Role" Admin CRUD, lainnya R
-- ---------------------------------------------------------------------------

CREATE POLICY app_user_select ON app_user FOR SELECT USING (true);
CREATE POLICY app_user_insert ON app_user FOR INSERT WITH CHECK (has_role('ADMIN'));
-- Pengguna boleh menyunting profilnya sendiri (nomor HP, avatar).
CREATE POLICY app_user_update ON app_user FOR UPDATE
  USING (has_role('ADMIN') OR id = auth.uid());
CREATE POLICY app_user_delete ON app_user FOR DELETE USING (has_role('ADMIN'));

-- user_role menentukan hak semua orang. Hanya Admin, tanpa pengecualian:
-- membiarkan pengguna menyunting barisnya sendiri berarti membiarkannya
-- mengangkat dirinya menjadi Ketua (INV-02).
CREATE POLICY user_role_select ON user_role FOR SELECT USING (true);
CREATE POLICY user_role_insert ON user_role FOR INSERT WITH CHECK (has_role('ADMIN'));
CREATE POLICY user_role_update ON user_role FOR UPDATE USING (has_role('ADMIN'));
CREATE POLICY user_role_delete ON user_role FOR DELETE USING (has_role('ADMIN'));

CREATE POLICY invitation_select ON invitation FOR SELECT USING (has_role('ADMIN'));
CREATE POLICY invitation_insert ON invitation FOR INSERT WITH CHECK (has_role('ADMIN'));
CREATE POLICY invitation_update ON invitation FOR UPDATE USING (has_role('ADMIN'));
CREATE POLICY invitation_delete ON invitation FOR DELETE USING (has_role('ADMIN'));

-- Matriks: "Data Pengurus" Admin/Sekum CRUD, lainnya R
CREATE POLICY pengurus_select ON pengurus FOR SELECT USING (true);
CREATE POLICY pengurus_insert ON pengurus FOR INSERT WITH CHECK (has_role('ADMIN','SEKUM'));
CREATE POLICY pengurus_update ON pengurus FOR UPDATE USING (has_role('ADMIN','SEKUM'));
CREATE POLICY pengurus_delete ON pengurus FOR DELETE USING (has_role('ADMIN','SEKUM'));

-- ---------------------------------------------------------------------------
-- PROKER DAN KALENDER
-- Matriks: "Proker — buat" Admin/Ketua/Wakil CRU, Kadept CRU departemennya
--          "Proker — approve" HANYA Ketua/Wakil
--          "Proker — hapus"   Admin/Ketua/Wakil
-- ---------------------------------------------------------------------------

-- Baca terbuka: seluruh pengurus melihat seluruh proker. Itu memang tujuannya
-- — kalender bersama tidak berguna kalau separuh isinya tersembunyi.
CREATE POLICY proker_select ON proker FOR SELECT USING (true);

CREATE POLICY proker_insert ON proker FOR INSERT
  WITH CHECK (kelola_dept(departemen_id) AND periode_id = periode_aktif());

CREATE POLICY proker_update ON proker FOR UPDATE
  USING (kelola_dept(departemen_id) AND periode_id = periode_aktif());

CREATE POLICY proker_delete ON proker FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL'));

-- =========================================================================
-- INI TITIK PENEGAKAN INV-05.
--
-- proker_lock hanya diisi oleh setujui_proker(), dan fungsi itu berjalan
-- dengan hak PEMANGGIL. Jadi policy inilah yang menentukan siapa yang dapat
-- menyetujui proker: Ketua atau Wakil, satu cukup (PRD §5.2).
--
-- Sekum, Bendum, Kadept, Anggota, dan BPH tidak dapat menyetujui apa pun
-- walau mereka memanggil fungsinya langsung.
--
-- Cron harian memanggil lepas_kunci_selesai() lewat koneksi service yang
-- ber-BYPASSRLS, sehingga tidak terhalang policy DELETE di bawah.
-- =========================================================================
CREATE POLICY proker_lock_select ON proker_lock FOR SELECT USING (true);
CREATE POLICY proker_lock_insert ON proker_lock FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL'));
CREATE POLICY proker_lock_update ON proker_lock FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL'));
CREATE POLICY proker_lock_delete ON proker_lock FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL'));

-- ---------------------------------------------------------------------------
-- GANTT
-- Matriks: "Gantt Chart" Admin/Ketua/Wakil CRUD, Kadept CRU*, Anggota RU*
-- Anak-anaknya mengikuti hak kepanitiaan tempat chart itu bernaung.
-- ---------------------------------------------------------------------------

CREATE POLICY gantt_chart_select ON gantt_chart FOR SELECT USING (true);
CREATE POLICY gantt_chart_insert ON gantt_chart FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT')
              OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY gantt_chart_update ON gantt_chart FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT')
         OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY gantt_chart_delete ON gantt_chart FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL'));

CREATE POLICY gantt_group_select ON gantt_group FOR SELECT USING (true);
CREATE POLICY gantt_group_insert ON gantt_group FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gantt_chart c WHERE c.id = chart_id
                        AND (has_role('ADMIN','KETUA','WAKIL','KADEPT')
                             OR c.kepanitiaan_id = ANY(my_kepanitiaan()))));
CREATE POLICY gantt_group_update ON gantt_group FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gantt_chart c WHERE c.id = chart_id
                   AND (has_role('ADMIN','KETUA','WAKIL','KADEPT')
                        OR c.kepanitiaan_id = ANY(my_kepanitiaan()))));
CREATE POLICY gantt_group_delete ON gantt_group FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT'));

CREATE POLICY gantt_task_select ON gantt_task FOR SELECT USING (true);
CREATE POLICY gantt_task_insert ON gantt_task FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA'));
CREATE POLICY gantt_task_update ON gantt_task FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA'));
CREATE POLICY gantt_task_delete ON gantt_task FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT'));

CREATE POLICY gantt_dependency_select ON gantt_dependency FOR SELECT USING (true);
CREATE POLICY gantt_dependency_insert ON gantt_dependency FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA'));
CREATE POLICY gantt_dependency_update ON gantt_dependency FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA'));
CREATE POLICY gantt_dependency_delete ON gantt_dependency FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT'));

-- ---------------------------------------------------------------------------
-- KANBAN DAN KENDALA
-- Matriks: "Kanban & Checklist" Admin CRUD, Kadept CRUD*, Anggota CRU*
--          "Kendala Departemen" Admin CRUD, Ketua/Wakil CRU, Kadept CRUD*,
--          Anggota CRU*
-- ---------------------------------------------------------------------------

CREATE POLICY kanban_card_select ON kanban_card FOR SELECT USING (true);
CREATE POLICY kanban_card_insert ON kanban_card FOR INSERT
  WITH CHECK (kelola_dept(departemen_id) OR has_role('ANGGOTA'));
CREATE POLICY kanban_card_update ON kanban_card FOR UPDATE
  USING (kelola_dept(departemen_id) OR has_role('ANGGOTA'));
-- Anggota TIDAK boleh menghapus kartu (matriks: CRU, tanpa D).
CREATE POLICY kanban_card_delete ON kanban_card FOR DELETE
  USING (has_role('ADMIN') OR (has_role('KADEPT') AND departemen_id = ANY(my_departemen())));

CREATE POLICY checklist_item_select ON checklist_item FOR SELECT USING (true);
CREATE POLICY checklist_item_insert ON checklist_item FOR INSERT
  WITH CHECK (has_role('ADMIN','KADEPT','ANGGOTA'));
CREATE POLICY checklist_item_update ON checklist_item FOR UPDATE
  USING (has_role('ADMIN','KADEPT','ANGGOTA'));
CREATE POLICY checklist_item_delete ON checklist_item FOR DELETE
  USING (has_role('ADMIN','KADEPT'));

CREATE POLICY kendala_select ON kendala FOR SELECT USING (true);
CREATE POLICY kendala_insert ON kendala FOR INSERT
  WITH CHECK (kelola_dept(departemen_id) OR has_role('ANGGOTA'));
CREATE POLICY kendala_update ON kendala FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL')
         OR kelola_dept(departemen_id) OR has_role('ANGGOTA'));
CREATE POLICY kendala_delete ON kendala FOR DELETE
  USING (has_role('ADMIN') OR (has_role('KADEPT') AND departemen_id = ANY(my_departemen())));

CREATE POLICY kendala_reply_select ON kendala_reply FOR SELECT USING (true);
CREATE POLICY kendala_reply_insert ON kendala_reply FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT','ANGGOTA'));
-- Balasan hanya dapat disunting penulisnya sendiri.
CREATE POLICY kendala_reply_update ON kendala_reply FOR UPDATE
  USING (penulis_id = auth.uid() OR has_role('ADMIN'));
CREATE POLICY kendala_reply_delete ON kendala_reply FOR DELETE
  USING (penulis_id = auth.uid() OR has_role('ADMIN'));

-- ---------------------------------------------------------------------------
-- SURAT
-- Matriks: "Surat — buat draft" Admin/Ketua/Wakil/Sekum/Bendum C, Kadept C*
--          "Surat — approve & generate" HANYA Ketua/Wakil/Sekum
--          "Surat — arsip" Admin/Sekum RUD, lainnya R, Anggota tidak sama sekali
-- ---------------------------------------------------------------------------

-- Anggota tidak punya urusan dengan persuratan (matriks: baris surat, kolom
-- Anggota bertanda '—').
CREATE POLICY surat_select ON surat FOR SELECT
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM','KADEPT','BPH'));

CREATE POLICY surat_insert ON surat FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM','KADEPT')
              AND periode_id = periode_aktif());

-- Approval surat mengubah baris ini (status, nomor). Ketua, Wakil, atau Sekum
-- — satu cukup (PRD §5.2). Pembuat draft tetap boleh menyunting miliknya
-- sendiri selama belum bernomor.
CREATE POLICY surat_update ON surat FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM')
         OR (dibuat_oleh = auth.uid() AND nomor_urut IS NULL));

CREATE POLICY surat_delete ON surat FOR DELETE
  USING (has_role('ADMIN','SEKUM'));

-- =========================================================================
-- INI TITIK PENEGAKAN INV-05 UNTUK SURAT.
--
-- surat_counter hanya dinaikkan oleh alokasi_nomor_surat(), yang berjalan
-- dengan hak pemanggil. Policy ini yang menentukan siapa boleh menerbitkan
-- nomor: Ketua, Wakil, atau Sekum.
--
-- Tidak ada policy DELETE sama sekali — nomor yang sudah dialokasikan tidak
-- pernah dikembalikan, dan counter tidak pernah mundur (INV-16).
-- =========================================================================
CREATE POLICY surat_counter_select ON surat_counter FOR SELECT USING (true);
CREATE POLICY surat_counter_insert ON surat_counter FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','SEKUM'));
CREATE POLICY surat_counter_update ON surat_counter FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM'));

CREATE POLICY surat_signer_select ON surat_signer FOR SELECT
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM','KADEPT','BPH'));
CREATE POLICY surat_signer_insert ON surat_signer FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','SEKUM'));
CREATE POLICY surat_signer_update ON surat_signer FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM'));
CREATE POLICY surat_signer_delete ON surat_signer FOR DELETE
  USING (has_role('ADMIN','SEKUM'));

CREATE POLICY dokumen_select ON dokumen FOR SELECT USING (true);
CREATE POLICY dokumen_insert ON dokumen FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM','KADEPT'));
CREATE POLICY dokumen_update ON dokumen FOR UPDATE
  USING (has_role('ADMIN','SEKUM'));
CREATE POLICY dokumen_delete ON dokumen FOR DELETE
  USING (has_role('ADMIN','SEKUM'));

-- ---------------------------------------------------------------------------
-- KEPANITIAAN
-- Matriks: "Kepanitiaan — bentuk" Admin/Ketua/Wakil C, Kadept C*
--          "Kepanitiaan — kelola" Admin CRUD, Ketua/Wakil RU, Kadept RU*,
--          Anggota R*
-- ---------------------------------------------------------------------------

CREATE POLICY kepanitiaan_select ON kepanitiaan FOR SELECT USING (true);
CREATE POLICY kepanitiaan_insert ON kepanitiaan FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM proker p
                       WHERE p.id = proker_id AND kelola_dept(p.departemen_id)));
CREATE POLICY kepanitiaan_update ON kepanitiaan FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL')
         OR EXISTS (SELECT 1 FROM proker p
                     WHERE p.id = proker_id AND kelola_dept(p.departemen_id))
         OR ketua_pelaksana = auth.uid());
CREATE POLICY kepanitiaan_delete ON kepanitiaan FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL'));

CREATE POLICY divisi_select ON divisi FOR SELECT USING (true);
CREATE POLICY divisi_insert ON divisi FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT')
              OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY divisi_update ON divisi FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT')
         OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY divisi_delete ON divisi FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT'));

CREATE POLICY divisi_member_select ON divisi_member FOR SELECT USING (true);
CREATE POLICY divisi_member_insert ON divisi_member FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT')
              OR EXISTS (SELECT 1 FROM divisi d WHERE d.id = divisi_id
                           AND d.kepanitiaan_id = ANY(my_kepanitiaan())));
CREATE POLICY divisi_member_update ON divisi_member FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT'));
CREATE POLICY divisi_member_delete ON divisi_member FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT'));

CREATE POLICY job_desk_select ON job_desk FOR SELECT USING (true);
CREATE POLICY job_desk_insert ON job_desk FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT')
              OR divisi_id = ANY(my_divisi_aktif()));
CREATE POLICY job_desk_update ON job_desk FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT')
         OR divisi_id = ANY(my_divisi_aktif()));
CREATE POLICY job_desk_delete ON job_desk FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT'));

-- ---------------------------------------------------------------------------
-- RAB DAN KEUANGAN
-- Matriks: "RAB — input" Admin CRUD, Bendum RU, Anggota C** (divisinya saja),
--          Kadept R*
--          "RAB — kunci/finalisasi" Admin/Ketua/Wakil U, Bendum U
--
-- Dua invariant bertemu di sini:
--   INV-30  lintas divisi: BACA boleh, TULIS tidak
--   INV-29  RAB terkunci menolak perubahan di level RLS, bukan hanya di UI
-- ---------------------------------------------------------------------------

CREATE POLICY rab_meta_select ON rab_meta FOR SELECT USING (true);
CREATE POLICY rab_meta_insert ON rab_meta FOR INSERT
  WITH CHECK (has_role('ADMIN','BENDUM') OR kepanitiaan_id = ANY(my_kepanitiaan()));
-- Mengunci dan membuka kunci RAB: Admin, Ketua, Wakil, Bendum.
CREATE POLICY rab_meta_update ON rab_meta FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','BENDUM'));
CREATE POLICY rab_meta_delete ON rab_meta FOR DELETE USING (has_role('ADMIN'));

-- BACA lintas divisi dalam satu kepanitiaan (INV-30).
CREATE POLICY rab_section_select ON rab_section FOR SELECT
  USING (is_pimpinan()
         OR EXISTS (SELECT 1 FROM divisi d WHERE d.id = divisi_id
                      AND d.kepanitiaan_id = ANY(my_kepanitiaan())));
CREATE POLICY rab_section_insert ON rab_section FOR INSERT
  WITH CHECK ((has_role('ADMIN','BENDUM') OR divisi_id = ANY(my_divisi_aktif()))
              AND rab_terbuka(divisi_id));
CREATE POLICY rab_section_update ON rab_section FOR UPDATE
  USING ((has_role('ADMIN','BENDUM') OR divisi_id = ANY(my_divisi_aktif()))
         AND rab_terbuka(divisi_id));
CREATE POLICY rab_section_delete ON rab_section FOR DELETE
  USING ((has_role('ADMIN','BENDUM') OR divisi_id = ANY(my_divisi_aktif()))
         AND rab_terbuka(divisi_id));

CREATE POLICY rab_item_select ON rab_item FOR SELECT
  USING (is_pimpinan()
         OR EXISTS (SELECT 1 FROM rab_section s
                    JOIN divisi d ON d.id = s.divisi_id
                    WHERE s.id = section_id AND d.kepanitiaan_id = ANY(my_kepanitiaan())));

CREATE POLICY rab_item_insert ON rab_item FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM rab_section s WHERE s.id = section_id
                        AND (has_role('ADMIN','BENDUM') OR s.divisi_id = ANY(my_divisi_aktif()))
                        AND rab_terbuka(s.divisi_id)));
CREATE POLICY rab_item_update ON rab_item FOR UPDATE
  USING (EXISTS (SELECT 1 FROM rab_section s WHERE s.id = section_id
                   AND (has_role('ADMIN','BENDUM') OR s.divisi_id = ANY(my_divisi_aktif()))
                   AND rab_terbuka(s.divisi_id)));
CREATE POLICY rab_item_delete ON rab_item FOR DELETE
  USING (EXISTS (SELECT 1 FROM rab_section s WHERE s.id = section_id
                   AND (has_role('ADMIN','BENDUM') OR s.divisi_id = ANY(my_divisi_aktif()))
                   AND rab_terbuka(s.divisi_id)));

CREATE POLICY pemasukan_select ON pemasukan FOR SELECT USING (true);
CREATE POLICY pemasukan_insert ON pemasukan FOR INSERT
  WITH CHECK (has_role('ADMIN','BENDUM') OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY pemasukan_update ON pemasukan FOR UPDATE
  USING (has_role('ADMIN','BENDUM') OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY pemasukan_delete ON pemasukan FOR DELETE
  USING (has_role('ADMIN','BENDUM'));

CREATE POLICY peserta_select ON peserta FOR SELECT USING (true);
CREATE POLICY peserta_insert ON peserta FOR INSERT
  WITH CHECK (has_role('ADMIN','BENDUM') OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY peserta_update ON peserta FOR UPDATE
  USING (has_role('ADMIN','BENDUM') OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY peserta_delete ON peserta FOR DELETE
  USING (has_role('ADMIN','BENDUM'));

-- ---------------------------------------------------------------------------
-- NOTA
-- Matriks: "Nota — upload" Admin C, Kadept C*, Anggota C** (divisinya saja)
--          "Nota — verifikasi" Admin U, Bendum U
-- ---------------------------------------------------------------------------

CREATE POLICY image_select ON image FOR SELECT USING (true);
CREATE POLICY image_insert ON image FOR INSERT WITH CHECK (uploader_id = auth.uid());
CREATE POLICY image_update ON image FOR UPDATE
  USING (uploader_id = auth.uid() OR has_role('ADMIN'));
CREATE POLICY image_delete ON image FOR DELETE
  USING (uploader_id = auth.uid() OR has_role('ADMIN'));

-- Baca lintas divisi dalam satu kepanitiaan; unggah hanya divisi sendiri.
CREATE POLICY nota_select ON nota FOR SELECT
  USING (is_pimpinan()
         OR EXISTS (SELECT 1 FROM divisi d WHERE d.id = divisi_id
                      AND d.kepanitiaan_id = ANY(my_kepanitiaan())));
CREATE POLICY nota_insert ON nota FOR INSERT
  WITH CHECK (has_role('ADMIN') OR divisi_id = ANY(my_divisi_aktif()));

-- Verifikasi nota mengubah baris ini. Hanya Admin dan Bendum — Ketua dan
-- Wakil pun tidak, sesuai matriks (baris "Nota — verifikasi" kolom Ketua = R).
-- Pengunggah masih boleh memperbaiki notanya sendiri selama belum diverifikasi.
CREATE POLICY nota_update ON nota FOR UPDATE
  USING (has_role('ADMIN','BENDUM')
         OR (uploader_id = auth.uid() AND status = 'MENUNGGU_VERIFIKASI'));
CREATE POLICY nota_delete ON nota FOR DELETE
  USING (has_role('ADMIN','BENDUM')
         OR (uploader_id = auth.uid() AND status = 'MENUNGGU_VERIFIKASI'));

CREATE POLICY nota_alokasi_select ON nota_alokasi FOR SELECT
  USING (EXISTS (SELECT 1 FROM nota n WHERE n.id = nota_id));
CREATE POLICY nota_alokasi_insert ON nota_alokasi FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM nota n WHERE n.id = nota_id
                        AND (has_role('ADMIN','BENDUM')
                             OR n.divisi_id = ANY(my_divisi_aktif()))));
CREATE POLICY nota_alokasi_update ON nota_alokasi FOR UPDATE
  USING (EXISTS (SELECT 1 FROM nota n WHERE n.id = nota_id
                   AND (has_role('ADMIN','BENDUM')
                        OR n.divisi_id = ANY(my_divisi_aktif()))));
CREATE POLICY nota_alokasi_delete ON nota_alokasi FOR DELETE
  USING (EXISTS (SELECT 1 FROM nota n WHERE n.id = nota_id
                   AND (has_role('ADMIN','BENDUM')
                        OR n.divisi_id = ANY(my_divisi_aktif()))));

-- ---------------------------------------------------------------------------
-- DOKUMEN ACARA
-- Matriks: "LPJ — generate" Admin C, Bendum C, lainnya R
-- Proposal, TOR, dan Rundown mengikuti hak kepanitiaannya.
-- ---------------------------------------------------------------------------

CREATE POLICY proposal_select ON proposal FOR SELECT USING (true);
CREATE POLICY proposal_insert ON proposal FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT')
              OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY proposal_update ON proposal FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT')
         OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY proposal_delete ON proposal FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL'));

CREATE POLICY tor_select ON tor FOR SELECT USING (true);
CREATE POLICY tor_insert ON tor FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT')
              OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY tor_update ON tor FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT')
         OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY tor_delete ON tor FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL'));

CREATE POLICY rundown_select ON rundown FOR SELECT USING (true);
CREATE POLICY rundown_insert ON rundown FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','KADEPT')
              OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY rundown_update ON rundown FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT')
         OR kepanitiaan_id = ANY(my_kepanitiaan()));
CREATE POLICY rundown_delete ON rundown FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT'));

CREATE POLICY lpj_select ON lpj FOR SELECT USING (true);
CREATE POLICY lpj_insert ON lpj FOR INSERT WITH CHECK (has_role('ADMIN','BENDUM'));
CREATE POLICY lpj_update ON lpj FOR UPDATE USING (has_role('ADMIN','BENDUM'));
CREATE POLICY lpj_delete ON lpj FOR DELETE USING (has_role('ADMIN'));

-- ---------------------------------------------------------------------------
-- KESEKRETARIATAN
-- Matriks: "Notulensi" Admin CRUD, Ketua/Wakil CRU, Sekum CRUD, Kadept CRU*,
--          Anggota R*
--          "Peminjaman Ruangan" Admin/Sekum CRUD, Kadept C*
-- ---------------------------------------------------------------------------

CREATE POLICY notulensi_select ON notulensi FOR SELECT USING (true);
CREATE POLICY notulensi_insert ON notulensi FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','SEKUM') OR kelola_dept(departemen_id));
CREATE POLICY notulensi_update ON notulensi FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM') OR kelola_dept(departemen_id));
-- Ketua dan Wakil tidak menghapus notulensi (matriks: CRU, tanpa D).
CREATE POLICY notulensi_delete ON notulensi FOR DELETE
  USING (has_role('ADMIN','SEKUM')
         OR (has_role('KADEPT') AND departemen_id = ANY(my_departemen())));

CREATE POLICY notulensi_attendance_select ON notulensi_attendance FOR SELECT USING (true);
CREATE POLICY notulensi_attendance_insert ON notulensi_attendance FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','SEKUM','KADEPT'));
CREATE POLICY notulensi_attendance_update ON notulensi_attendance FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM','KADEPT'));
CREATE POLICY notulensi_attendance_delete ON notulensi_attendance FOR DELETE
  USING (has_role('ADMIN','SEKUM','KADEPT'));

CREATE POLICY action_item_select ON action_item FOR SELECT USING (true);
CREATE POLICY action_item_insert ON action_item FOR INSERT
  WITH CHECK (has_role('ADMIN','KETUA','WAKIL','SEKUM','KADEPT'));
CREATE POLICY action_item_update ON action_item FOR UPDATE
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM','KADEPT') OR pic_id = auth.uid());
CREATE POLICY action_item_delete ON action_item FOR DELETE
  USING (has_role('ADMIN','SEKUM','KADEPT'));

CREATE POLICY booking_ruangan_select ON booking_ruangan FOR SELECT USING (true);
CREATE POLICY booking_ruangan_insert ON booking_ruangan FOR INSERT
  WITH CHECK (has_role('ADMIN','SEKUM','KADEPT') AND periode_id = periode_aktif());
CREATE POLICY booking_ruangan_update ON booking_ruangan FOR UPDATE
  USING (has_role('ADMIN','SEKUM'));
CREATE POLICY booking_ruangan_delete ON booking_ruangan FOR DELETE
  USING (has_role('ADMIN','SEKUM'));

-- ---------------------------------------------------------------------------
-- AUDIT DAN BACKUP
-- Matriks: "Audit Log" semua R kecuali Anggota (—), Kadept R*, BPH R
--          "Backup & Restore" Admin CRUD, Ketua R, BPH R
-- ---------------------------------------------------------------------------

-- BPH justru DIBERI hak baca di sini — memang itu perannya sebagai pengawas
-- (PRD §4.4). Yang tidak pernah ia peroleh adalah hak tulis, di mana pun.
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (has_role('ADMIN','KETUA','WAKIL','SEKUM','BENDUM','KADEPT','BPH'));

-- Sengaja TIDAK ada policy INSERT, UPDATE, maupun DELETE pada audit_log.
-- Barisnya hanya ditulis trigger fn_audit() yang SECURITY DEFINER, sehingga
-- tidak melewati policy sama sekali. Tanpa policy tulis, tidak ada jalan bagi
-- pengguna untuk menyisipkan atau memalsukan jejak (INV-06).

CREATE POLICY backup_select ON backup FOR SELECT
  USING (has_role('ADMIN','KETUA','BPH'));
CREATE POLICY backup_insert ON backup FOR INSERT WITH CHECK (has_role('ADMIN'));
CREATE POLICY backup_update ON backup FOR UPDATE USING (has_role('ADMIN'));
CREATE POLICY backup_delete ON backup FOR DELETE USING (has_role('ADMIN'));
