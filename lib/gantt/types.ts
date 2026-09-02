export interface GanttViewModel {
  groups: GanttGroupVM[];
  timeline: TimelineVM;
  today: Date;
}

export interface GanttGroupVM {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  collapsed: boolean;
  bars: GanttBarVM[];
  tasks: GanttTaskVM[];
}

export interface GanttTaskVM {
  id: string;
  label: string;
  start: Date;
  end: Date;
  hariHStart?: Date;
  hariHEnd?: Date;
  progress: number;
  color: string;
  assigneeName?: string;
  parentId?: string;
  meta: { prokerId?: string; departemen?: string; status?: string };
}

export interface TimelineVM {
  start: Date;
  end: Date;
  scale: 'week' | 'month' | 'quarter';
  columns: { label: string; sublabel?: string; x: number; width: number }[];
  pxPerDay: number;
}

/** Bar agregat yang merangkum rentang seluruh task dalam satu grup. */
export interface GanttBarVM {
  id: string;
  start: Date;
  end: Date;
  progress: number;
  color: string;
}
