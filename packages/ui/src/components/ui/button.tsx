import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 font-semibold whitespace-nowrap transition select-none outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:brightness-105',
        secondary: 'bg-secondary text-secondary-foreground hover:brightness-95',
        ghost: 'text-primary hover:bg-secondary',
      },
      size: {
        lg: 'h-14 rounded-control px-6 text-body [&_svg]:size-5',
        md: 'h-11 rounded-control px-4 text-body [&_svg]:size-5',
        sm: 'h-9 rounded-xl px-3 text-sm [&_svg]:size-4',
        icon: 'size-11 rounded-full [&_svg]:size-5',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Спиннер вместо содержимого; ширина кнопки не меняется. */
    loading?: boolean;
  };

function Button({ className, variant, size, block, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';

  if (asChild) {
    return (
      <Comp data-slot="button" className={cn(buttonVariants({ variant, size, block, className }))} {...props}>
        {children}
      </Comp>
    );
  }

  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>{children}</span>
      {loading && <Loader2 className="absolute animate-spin" aria-hidden />}
    </button>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
