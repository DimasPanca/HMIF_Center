import * as React from 'react';

import { cn } from '@/lib/utils';

type CardProps = React.ComponentProps<'div'> & {
  interactive?: boolean;
};

function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      {...props}
      data-slot="card"
      data-interactive={interactive ? '' : undefined}
      className={cn(
        'rounded-md border border-default bg-panel p-4 text-primary shadow-none',
        interactive &&
          'transition-[border-color] duration-fast ease-out hover:border-strong focus-within:border-strong motion-reduce:transition-none',
        className,
      )}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="card-header"
      className={cn('grid gap-1 border-b border-subtle pb-4', className)}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      {...props}
      data-slot="card-title"
      className={cn('text-[16px] leading-6 font-semibold text-primary', className)}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      {...props}
      data-slot="card-description"
      className={cn('text-[13px] leading-[18px] text-secondary', className)}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div {...props} data-slot="card-content" className={cn('pt-4', className)} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="card-footer"
      className={cn('mt-4 flex items-center justify-end border-t border-subtle pt-4', className)}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
export type { CardProps };
