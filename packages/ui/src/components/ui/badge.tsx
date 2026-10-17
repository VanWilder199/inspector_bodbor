import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/* Пилюля статуса. Всегда с текстом, не только цветом. */
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap [&_svg]:size-3.5', {
  variants: {
    tone: {
      neutral: 'bg-secondary text-secondary-foreground',
      ok: 'bg-ok-soft text-ok',
      warn: 'bg-warn-soft text-warn',
      bad: 'bg-bad-soft text-bad',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
