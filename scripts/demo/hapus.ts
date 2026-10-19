/**
 * Pembersihan data demo (`npx tsx scripts/seed-demo.ts --hapus`).
 *
 * Data demo dikenali dari PEMBUATNYA: seluruh baris yang dibuat pengguna
 * `*@demo.hmif.test` dihapus (beserta turunannya lewat FK CASCADE dan berkas
 * storage-nya). Akun demo sendiri DINONAKTIFKAN, bukan dihapus: `audit_log`
 * append-only (INV-06) dan merujuk pelakunya, sehingga baris `app_user` yang
 * pernah bertindak tidak boleh hilang. Menjalankan seeder lagi mengaktifkannya
 * kembali.
 */

import { DOMAIN_DEMO, ok, peringatan, type Sql } from './konfig';

export async function hapusDemo(sql: Sql): Promise<void> {
  const { storage } = await import('@/lib/storage');
  const pola = `%@${DOMAIN_DEMO}`;
  const demo = (await sql<{ id: string }[]>`SELECT id::text FROM app_user WHERE email LIKE ${pola}`).map((r) => r.id);
  if (demo.length === 0) {
    ok('tidak ada akun demo — tidak ada yang dibersihkan');
    return;
  }

  // 1. Kumpulkan kunci berkas SEBELUM barisnya hilang.
  const kunci = new Set<string>();
  const tambah = (rows: Array<Record<string, string | null>>) => {
    for (const r of rows) for (const v of Object.values(r)) if (v) kunci.add(v);
  };
  tambah(await sql`SELECT master_path, preview_path, thumbnail_path, original_path FROM image WHERE uploader_id = ANY(${demo}::uuid[])`);
  tambah(await sql`
    SELECT d.storage_key FROM dokumen d
    WHERE d.generated_by = ANY(${demo}::uuid[])
       OR d.surat_id IN (SELECT id FROM surat WHERE dibuat_oleh = ANY(${demo}::uuid[]))
       OR d.kepanitiaan_id IN (SELECT k.id FROM kepanitiaan k JOIN proker p ON p.id = k.proker_id WHERE p.dibuat_oleh = ANY(${demo}::uuid[]))`);
  tambah(await sql`SELECT storage_key FROM kendala_lampiran WHERE diunggah_oleh = ANY(${demo}::uuid[])`);
  tambah(await sql`SELECT storage_key FROM notulensi_lampiran WHERE diunggah_oleh = ANY(${demo}::uuid[])`);
  tambah(await sql`SELECT storage_key FROM signature WHERE user_id = ANY(${demo}::uuid[])`);
  const backup = await sql<{ id: string }[]>`SELECT id::text FROM backup WHERE dibuat_oleh = ANY(${demo}::uuid[])`;
  for (const b of backup) {
    try {
      for (const o of await storage.list(`backup/${b.id}/`)) kunci.add(o.key);
    } catch {
      /* bundel tidak ada */
    }
  }

  // 2. Hapus baris, anak dulu. Banyak turunan ikut lewat ON DELETE CASCADE.
  const hitung: Record<string, number> = {};
  const hapus = async (nama: string, q: Promise<{ count: number }>) => {
    hitung[nama] = (await q).count;
  };

  await hapus('surat', sql`DELETE FROM surat WHERE dibuat_oleh = ANY(${demo}::uuid[])`);
  await hapus('booking', sql`DELETE FROM booking_ruangan WHERE dibuat_oleh = ANY(${demo}::uuid[])`);
  await hapus('kendala', sql`DELETE FROM kendala WHERE dibuat_oleh = ANY(${demo}::uuid[])`);
  await hapus('kanban', sql`DELETE FROM kanban_card WHERE created_by = ANY(${demo}::uuid[])`);
  await hapus('notulensi', sql`DELETE FROM notulensi WHERE notulis_id = ANY(${demo}::uuid[]) OR pemimpin_id = ANY(${demo}::uuid[])`);
  await hapus('checklist_template', sql`DELETE FROM checklist_template WHERE dibuat_oleh = ANY(${demo}::uuid[])`);
  await hapus(
    'gantt departemen',
    sql`DELETE FROM gantt_chart WHERE scope = 'DEPARTEMEN' AND EXISTS (
          SELECT 1 FROM gantt_task t WHERE t.chart_id = gantt_chart.id AND t.nama = ANY(${[
            'Persiapan LKMM-PD', 'Kajian mingguan (siklus 1)', 'Persiapan SYNCHRONIZE 2026', 'Penjajakan sponsor tahap 2',
            'Konten SYNCHRONIZE (teaser & rilis)', 'Rebranding akun media sosial',
          ]}::text[]))`,
  );
  // LPJ & dokumen acara menempel pada kepanitiaan → ikut terhapus bersama proker.
  await hapus('proker', sql`DELETE FROM proker WHERE dibuat_oleh = ANY(${demo}::uuid[])`);
  await hapus('image', sql`DELETE FROM image WHERE uploader_id = ANY(${demo}::uuid[])`);
  await hapus('ruangan', sql`DELETE FROM ruangan WHERE catatan LIKE ${'%⁣⁣'}`);
  await hapus('backup', sql`DELETE FROM backup WHERE dibuat_oleh = ANY(${demo}::uuid[])`);
  await hapus('pengurus', sql`DELETE FROM pengurus WHERE user_id = ANY(${demo}::uuid[]) OR nim BETWEEN '7737230100' AND '7737230111'`);
  await hapus('signature', sql`DELETE FROM signature WHERE user_id = ANY(${demo}::uuid[])`);
  await hapus('proker_draft', sql`DELETE FROM proker_draft WHERE user_id = ANY(${demo}::uuid[])`);

  // 3. Berkas storage.
  let berkas = 0;
  for (const k of kunci) {
    try {
      await storage.delete(k);
      berkas++;
    } catch {
      /* sudah tidak ada */
    }
  }

  // 4. Akun: nonaktif, bukan hapus (audit append-only).
  await sql`UPDATE app_user SET is_active = false WHERE id = ANY(${demo}::uuid[])`;

  const ringkas = Object.entries(hitung)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  ok(`dihapus: ${ringkas || 'tidak ada baris'}; ${berkas} berkas storage`);
  ok(`${demo.length} akun demo dinonaktifkan (jalankan seeder lagi untuk mengaktifkannya)`);
  peringatan('Audit log tidak dihapus (append-only) — riwayat aktivitas demo tetap tercatat.');
}
