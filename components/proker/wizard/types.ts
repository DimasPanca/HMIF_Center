import type { WizardDraft } from '@/lib/proker/wizard-state';

export type PatchWizard = {
  [K in keyof WizardDraft]?: WizardDraft[K] | null;
};

export interface OpsiPilihan {
  id: string;
  nama: string;
}

export interface KonflikWizard {
  proker_id: string;
  nama_proker: string;
  nama_departemen: string;
  mulai: string;
  selesai: string;
}
