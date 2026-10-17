import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/* Вкладки-«сегменты»: фильтры по статусу в списках подборщиков и выплат. */

function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-4', className)} {...props} />;
}

function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-control bg-secondary p-1', className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold whitespace-nowrap text-muted-foreground outline-none transition',
        'hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-card data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('outline-none', className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
