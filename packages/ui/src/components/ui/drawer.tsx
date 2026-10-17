import type { ComponentProps } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '../../lib/utils';

/* Bottom sheet на vaul: на мобильном вместо модалок (PLAN_FRONTEND_DESIGN.md, принцип 5). */

function Drawer(props: ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger(props: ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerClose(props: ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerContent({ className, children, ...props }: ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay data-slot="drawer-overlay" className="fixed inset-0 z-50 bg-black/40" />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[480px] flex-col rounded-t-card bg-card',
          'pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] outline-none',
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

function DrawerHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="drawer-header" className={cn('flex flex-col gap-1 px-4 pt-4 pb-2', className)} {...props} />;
}

function DrawerFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="drawer-footer" className={cn('mt-auto flex flex-col gap-2 px-4 pt-4', className)} {...props} />;
}

function DrawerTitle({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn('text-heading font-semibold text-foreground', className)} {...props} />;
}

function DrawerDescription({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn('text-body text-muted-foreground', className)} {...props} />;
}

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger };
