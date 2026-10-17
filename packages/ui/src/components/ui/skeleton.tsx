import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('rounded-xl bg-muted motion-safe:animate-pulse', className)} {...props} />;
}

export { Skeleton };
