import { ChevronRight } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';

type CellProps = Omit<ComponentProps<'div'>, 'title'> & {
  /** Иконка или аватар слева; оборачивается в кружок 40px, если это не CellIcon. */
  before?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Значение справа: сумма, бейдж. */
  after?: ReactNode;
  /** Шеврон справа — для строк, которые ведут на другой экран. */
  chevron?: boolean;
  /** Отрисовать как дочерний элемент (Link, button): вся строка кликабельна. */
  asChild?: boolean;
};

/**
 * Ячейка списка: иконка в кружке, заголовок и подзаголовок слева, значение справа.
 * С asChild ожидает единственный ребёнок-ссылку/кнопку без содержимого — содержимое строит сама:
 *   <Cell asChild title="…"><Link to="…" /></Cell>
 */
function Cell({ before, title, subtitle, after, chevron, asChild, className, children, ...props }: CellProps) {
  const content = (
    <>
      {before && <div className="shrink-0">{before}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-foreground">{title}</div>
        {subtitle && <div className="truncate text-caption text-muted-foreground">{subtitle}</div>}
      </div>
      {after && <div className="flex shrink-0 flex-col items-end gap-1 text-right">{after}</div>}
      {chevron && <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );

  const classes = cn(
    'relative flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left',
    asChild && 'cursor-pointer transition-colors outline-none hover:bg-secondary/60 focus-visible:bg-secondary active:bg-secondary',
    className,
  );

  if (asChild) {
    return (
      <Slot.Root data-slot="cell" className={classes} {...props}>
        {cloneWithContent(children, content)}
      </Slot.Root>
    );
  }

  return (
    <div data-slot="cell" className={classes} {...props}>
      {content}
    </div>
  );
}

/* Slot сливает пропсы с ребёнком, а содержимое ячейки подставляем внутрь ребёнка через Slottable. */
function cloneWithContent(child: ReactNode, content: ReactNode) {
  return <Slot.Slottable>{child && typeof child === 'object' && 'type' in child ? { ...child, props: { ...child.props as object, children: content } } : child}</Slot.Slottable>;
}

type CellIconProps = ComponentProps<'div'> & { tone?: 'neutral' | 'primary' | 'ok' | 'warn' | 'bad' };

const ICON_TONES: Record<NonNullable<CellIconProps['tone']>, string> = {
  neutral: 'bg-secondary text-foreground',
  primary: 'bg-primary/10 text-primary',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
};

/** Кружок 40px под иконку lucide или букву-аватар. */
function CellIcon({ tone = 'neutral', className, ...props }: CellIconProps) {
  return (
    <div
      data-slot="cell-icon"
      className={cn('flex size-10 items-center justify-center rounded-full text-body font-semibold [&_svg]:size-5', ICON_TONES[tone], className)}
      {...props}
    />
  );
}

export { Cell, CellIcon };
