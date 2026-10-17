import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';

/** Белая карточка r=24 на сером фоне. Без рамок и теней. */
function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('rounded-card bg-card p-4', className)} {...props} />;
}

type CardGroupProps = ComponentProps<'section'> & {
  /** Заголовок над карточкой, например «Отчёты · 2». */
  title?: ReactNode;
  /** Действие справа от заголовка. */
  action?: ReactNode;
};

/** Карточка со списком ячеек (Cell): разделители между ними тонкие и с отступом слева, как в банковских списках. */
function CardGroup({ title, action, className, children, ...props }: CardGroupProps) {
  return (
    <section data-slot="card-group" className={cn('space-y-2', className)} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between px-1">
          {title && <h2 className="text-heading font-semibold text-foreground">{title}</h2>}
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-card bg-card py-1 [&>[data-slot=cell]+[data-slot=cell]]:before:absolute [&>[data-slot=cell]+[data-slot=cell]]:before:inset-x-0 [&>[data-slot=cell]+[data-slot=cell]]:before:top-0 [&>[data-slot=cell]+[data-slot=cell]]:before:ml-[4.25rem] [&>[data-slot=cell]+[data-slot=cell]]:before:h-px [&>[data-slot=cell]+[data-slot=cell]]:before:bg-border">
        {children}
      </div>
    </section>
  );
}

export { Card, CardGroup };
