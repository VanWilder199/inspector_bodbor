import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/* Меню действий в строке таблицы и в шапке (профиль админа, выход). */

function DropdownMenu(props: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-control bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-border outline-none',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

type DropdownMenuItemProps = ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  /** Разрушающее действие (бан, удаление): красный текст. */
  destructive?: boolean;
};

function DropdownMenuItem({ className, destructive, ...props }: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-body outline-none select-none',
        'data-[highlighted]:bg-secondary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
        destructive && 'text-destructive',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" className={cn('px-3 py-2 text-caption text-muted-foreground', className)} {...props} />;
}

function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />;
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger };
