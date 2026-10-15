/**
 * channels — nama kanal realtime & kunci query, satu sumber kebenaran.
 *
 * SYSTEM_DESIGN §13.1 menetapkan pola nama kanal. Menuliskannya di satu tempat
 * mencegah penerbit dan pelanggan menyimpang satu huruf — kesalahan yang tak
 * memunculkan error, hanya kanal yang diam. Modul murni (tanpa dependensi
 * runtime) supaya aman diimpor server maupun klien.
 *
 * Sumber: SYSTEM_DESIGN §13.1 · docs/ai/tasks/P3-proker-gantt.md T-076
 */

/** Kanal Master Gantt & kalender ketersediaan — perubahan proker & proker_lock. */
export function kanalProker(periodeId: string): string {
  return `proker:${periodeId}`;
}

/** Kanal editor Gantt yang sedang terbuka — perubahan gantt_task. */
export function kanalGantt(chartId: string): string {
  return `gantt:${chartId}`;
}

/** Kanal board Kanban satu departemen — perubahan kanban_card. */
export function kanalKanban(departemenId: string): string {
  return `kanban:${departemenId}`;
}

/** Kanal badge notifikasi approval satu pengguna. */
export function kanalApproval(userId: string): string {
  return `approval:${userId}`;
}

/** Kanal antrian verifikasi nota satu kepanitiaan. */
export function kanalNota(kepanitiaanId: string): string {
  return `nota:${kepanitiaanId}`;
}

/**
 * Tabel yang disiarkan pada kanal proker (migrasi 020_realtime.sql). Pelanggan
 * berlangganan postgres_changes untuk masing-masing tabel ini.
 */
export const TABEL_KANAL_PROKER = ['proker', 'proker_lock'] as const;

/** Sinyal progres per proker tanpa payload kartu (migrasi 025). */
export const TABEL_SINYAL_PROGRES = 'proker_progress_signal' as const;

/** Kunci React Query Master Gantt — target invalidasi hook realtime. */
export function kunciMasterGantt(periodeId: string): readonly [string, string] {
  return ['master-gantt', periodeId] as const;
}

/** Kanal pemantau kendala Kritis di dashboard pimpinan (T-082 #4). */
export function kanalKendalaKritis(periodeId: string): string {
  return `kendala-kritis:${periodeId}`;
}
