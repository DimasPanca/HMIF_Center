import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';

type InlineAlertProps = Omit<React.ComponentProps<'div'>, 'title'> & {
  variant?: 'konflik';
  title?: string;
  detail: React.ReactNode;
  suggestion?: React.ReactNode;
};

function InlineAlert({
  variant = 'konflik',
  title = 'Tanggal bentrok dengan proker lain',
  detail,
  suggestion = 'Pilih tanggal di luar rentang tersebut untuk melanjutkan.',
  className,
  ...props
}: InlineAlertProps) {
  return (
    <div
      {...props}
      data-slot="inline-alert"
      data-variant={variant}
      role="alert"
      aria-atomic="true"
      className={cn(
        'rounded-sm border-l-[3px] border-l-[var(--danger)] bg-[var(--danger-subtle)] p-3 text-primary',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-[18px] shrink-0 text-[var(--danger)]"
          strokeWidth={2}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] leading-5 font-semibold">{title}</h3>
          <div className="mt-2 border-t border-[var(--danger)] pt-2 text-[13px] leading-[18px]">
            {detail}
          </div>
          <p className="mt-2 text-[13px] leading-[18px] text-secondary">{suggestion}</p>
        </div>
      </div>
    </div>
  );
}

export { InlineAlert };
export type { InlineAlertProps };
