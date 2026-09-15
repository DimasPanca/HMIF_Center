export const KOLOM_KANBAN = [
  { kode: 'TODO', label: 'To Do' },
  { kode: 'IN_PROGRESS', label: 'In Progress' },
  { kode: 'REVIEW', label: 'Review' },
  { kode: 'DONE', label: 'Done' },
] as const;

export type KolomKanban = (typeof KOLOM_KANBAN)[number]['kode'];
export type PrioritasKanban = 'RENDAH' | 'SEDANG' | 'TINGGI' | 'KRITIS';

export interface KartuKanban {
  id: string;
  departemen_id: string;
  proker_id: string | null;
  proker_nama: string | null;
  judul: string;
  deskripsi: string | null;
  kolom: KolomKanban;
  prioritas: PrioritasKanban;
  assignee_id: string | null;
  assignee_nama: string | null;
  avatar_path: string | null;
  deadline: string | null;
  urutan: number;
  checklist_selesai: number;
  checklist_total: number;
}
