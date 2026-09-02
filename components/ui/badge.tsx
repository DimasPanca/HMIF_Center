import * as React from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-[20px] max-w-full shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap rounded-[4px] px-[8px] text-[11px] leading-none font-medium tracking-[0.02em] text-[var(--text-primary)] [&_[data-slot=badge-icon]]:size-3 [&_[data-slot=badge-icon]]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--neutral-subtle)] [&_[data-slot=badge-icon]]:text-[var(--neutral)]',
        warning: 'bg-[var(--warning-subtle)] [&_[data-slot=badge-icon]]:text-[var(--warning)]',
        success: 'bg-[var(--success-subtle)] [&_[data-slot=badge-icon]]:text-[var(--success)]',
        info: 'bg-[var(--info-subtle)] [&_[data-slot=badge-icon]]:text-[var(--info)]',
        danger: 'bg-[var(--danger-subtle)] [&_[data-slot=badge-icon]]:text-[var(--danger)]',
        primary: 'bg-[var(--primary-subtle)] [&_[data-slot=badge-icon]]:text-[var(--primary)]',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

type BadgeTone = 'neutral' | 'warning' | 'success' | 'info' | 'danger' | 'primary';

type BadgeProps = React.ComponentProps<'span'> & {
  tone?: BadgeTone;
};

function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
export type { BadgeProps, BadgeTone };
