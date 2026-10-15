import type { BadgeTone } from '@/components/ui/badge';
import type { Prioritas, StatusKendala } from '@/lib/kendala/skema';

export function tonePrioritas(p: Prioritas): BadgeTone {
  return p === 'KRITIS' || p === 'TINGGI' ? 'danger' : p === 'SEDANG' ? 'warning' : 'neutral';
}

export function toneStatus(s: StatusKendala): BadgeTone {
  return s === 'SELESAI' ? 'success' : s === 'SEDANG_DITANGANI' ? 'info' : 'warning';
}
