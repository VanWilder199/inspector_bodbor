import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/*
 * Высота 56, фон --input, без рамки; рамка --ring в фокусе.
 * Размер шрифта не меньше 16px — иначе iOS зумит страницу при фокусе.
 */
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-14 w-full min-w-0 rounded-control bg-input px-4 text-body text-foreground outline-none transition placeholder:text-muted-foreground',
        'focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:ring-2 aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

/** Текст ошибки или подсказки под полем. */
function FieldMessage({ className, error, ...props }: ComponentProps<'p'> & { error?: boolean }) {
  return (
    <p
      data-slot="field-message"
      className={cn('mt-1.5 px-1 text-caption', error ? 'text-destructive' : 'text-muted-foreground', className)}
      {...props}
    />
  );
}

export { FieldMessage, Input };
