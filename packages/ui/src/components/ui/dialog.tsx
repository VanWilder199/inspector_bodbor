import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/*
 * Модалка для десктопной админки (подтверждения, причины отказа).
 * На мобильном в покупательских приложениях вместо неё используется Drawer.
 */

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** Крестик в углу. Для опасных действий его можно скрыть, оставив только явные кнопки. */
  showClose?: boolean;
};

function DialogContent({ className, children, showClose = true, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto',
          'rounded-card bg-card p-6 shadow-lg outline-none',
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            data-slot="dialog-close-icon"
            aria-label="Закрыть"
            className="absolute top-4 right-4 inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition hover:bg-secondary focus-visible:ring-4 focus-visible:ring-ring"
          >
            <X className="size-5" aria-hidden />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-1 pr-8', className)} {...props} />;
}

function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('text-heading font-semibold text-foreground', className)} {...props} />;
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-body text-muted-foreground', className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
