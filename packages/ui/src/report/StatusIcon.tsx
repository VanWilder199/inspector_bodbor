import { STATUS_LABELS } from './catalog';
import type { ItemStatus } from './types';

/* Полные имена классов — Tailwind находит их статическим сканированием исходников. */
export const STATUS_STYLES: Record<ItemStatus, { solid: string; soft: string; text: string; border: string }> = {
  OK: { solid: 'bg-ok', soft: 'bg-ok-soft', text: 'text-ok', border: 'border-ok' },
  WARN: { solid: 'bg-warn', soft: 'bg-warn-soft', text: 'text-warn', border: 'border-warn' },
  BAD: { solid: 'bg-bad', soft: 'bg-bad-soft', text: 'text-bad', border: 'border-bad' },
};

const ICON_PATHS: Record<ItemStatus, string> = {
  OK: 'M5 10.5l3.2 3.2L15 7',
  WARN: 'M10 5.5v5.5M10 14.2v.3',
  BAD: 'M6.5 6.5l7 7M13.5 6.5l-7 7',
};

interface StatusIconProps {
  status: ItemStatus | null;
  size?: 'sm' | 'md';
}

export function StatusIcon({ status, size = 'md' }: StatusIconProps) {
  const dimension = size === 'sm' ? 'size-5' : 'size-7';

  if (status === null) {
    return <span className={`${dimension} inline-block shrink-0 rounded-full bg-none-soft`} aria-label="Нет данных" />;
  }

  return (
    <span
      className={`${dimension} ${STATUS_STYLES[status].solid} inline-flex shrink-0 items-center justify-center rounded-full text-white`}
      role="img"
      aria-label={STATUS_LABELS[status]}
    >
      <svg viewBox="0 0 20 20" className="size-[70%]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON_PATHS[status]} />
      </svg>
    </span>
  );
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  const styles = STATUS_STYLES[status];
  return (
    <span className={`${styles.soft} ${styles.text} inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs font-semibold`}>
      <StatusIcon status={status} size="sm" />
      {STATUS_LABELS[status]}
    </span>
  );
}
