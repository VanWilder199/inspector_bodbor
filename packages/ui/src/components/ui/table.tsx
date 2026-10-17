import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/*
 * Простая таблица для списков админки. Без сортировки и пагинации — это решение плана
 * (PLAN_FRONTEND_ADMIN.md): фильтры и поиск на клиенте, DataGrid/TanStack Table не нужны.
 */

function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom text-body', className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
}

function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return <tfoot data-slot="table-footer" className={cn('border-t border-border font-semibold', className)} {...props} />;
}

function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b border-border transition-colors hover:bg-muted/60 data-[state=selected]:bg-muted', className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn('h-11 px-3 text-left align-middle text-caption font-semibold whitespace-nowrap text-muted-foreground', className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('px-3 py-3 align-middle', className)} {...props} />;
}

function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption data-slot="table-caption" className={cn('mt-3 text-caption text-muted-foreground', className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
