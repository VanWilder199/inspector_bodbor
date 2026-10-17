import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/*
 * Многострочный вариант Input: тот же фон и фокус, шрифт не меньше 16px (iOS зумит при фокусе).
 * Для сообщений об ошибке и подсказок используйте FieldMessage из input.tsx.
 */
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-28 w-full min-w-0 resize-y rounded-control bg-input px-4 py-3.5 text-body text-foreground outline-none transition placeholder:text-muted-foreground',
        'focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:ring-2 aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
