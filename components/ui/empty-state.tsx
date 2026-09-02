import * as React from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyStateProps = Omit<React.ComponentProps<'section'>, 'title'> & {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactElement<ButtonProps, typeof Button>;
};

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  'aria-label': ariaLabel,
  ...props
}: EmptyStateProps) {
  const primaryAction = React.cloneElement(action, { variant: 'primary' });

  return (
    <section
      {...props}
      data-slot="empty-state"
      aria-label={ariaLabel ?? title}
      className={cn(
        'flex w-full flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center text-tertiary [&_svg]:size-10 [&_svg]:stroke-[1.5]"
      >
        {icon}
      </span>
      <div className="mt-4 max-w-md">
        <h3 className="text-[16px] leading-6 font-semibold text-primary">{title}</h3>
        <p className="mt-1 text-[13px] leading-[18px] text-secondary">{description}</p>
      </div>
      <div className="mt-4 flex max-w-full justify-center">{primaryAction}</div>
    </section>
  );
}

export { EmptyState };
export type { EmptyStateProps };
