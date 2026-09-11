-- 020_realtime — publikasikan proker & proker_lock ke `supabase_realtime`.
--
-- ==========================================================================
-- LANGKAH YANG PALING SERING TERLEWAT (SYSTEM_DESIGN §13 · T-076 kontrak #1)
-- ==========================================================================
-- Tanpa tabel masuk publication `supabase_realtime`, klien tak pernah menerima
-- satu perubahan pun: Master Gantt diam-diam berhenti hidup, tanpa error, dan
-- penyebabnya nyaris mustahil ditebak dari sisi UI. Karena itu langkah ini
-- dibuat sebagai migrasi TERSENDIRI — tercatat di `_migrasi` dan dapat
-- diverifikasi lewat query `pg_publication_tables`.
--
-- Kanal `proker:{periode_id}` (SYSTEM_DESIGN §13.1) menyiarkan INSERT/UPDATE/
-- DELETE kedua tabel ini ke Master Gantt dan kalender ketersediaan.
--
-- REPLICA IDENTITY FULL: realtime Supabase menghormati RLS: baris diperiksa
-- terhadap policy sebelum dikirim, dan untuk UPDATE/DELETE penilaian itu butuh
-- kolom baris lama — tanpa FULL hanya primary key yang tersedia dan sebagian
-- perubahan tak pernah sampai ke pelanggan yang berhak.
--
-- Idempoten: publication mungkin sudah disediakan Supabase dan tabel mungkin
-- sudah menjadi anggota — hanya yang belum ada yang ditambahkan.
--
-- Sumber: docs/ai/tasks/P3-proker-gantt.md T-076 · SYSTEM_DESIGN §13 · PRD §8.3

ALTER TABLE public.proker      REPLICA IDENTITY FULL;
ALTER TABLE public.proker_lock REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'proker'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proker;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'proker_lock'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proker_lock;
  END IF;
END $$;
