import { itemLabel, SECTION_LABELS } from './catalog';
import { StatusIcon } from './StatusIcon';
import type { ReportSection } from './types';

interface StopFactorsProps {
  sections: ReportSection[];
  onSelectSection: (sectionId: string) => void;
}

/*
 * `ReportViewDto.stopFactors` содержит только itemKey — без секции и комментария.
 * Поэтому собираем стоп-факторы из самих секций: так видно, где проблема и что сказал подборщик.
 */
export function StopFactors({ sections, onSelectSection }: StopFactorsProps) {
  const factors = sections.flatMap((section) =>
    section.items.filter((item) => item.status === 'BAD').map((item) => ({ section, item })),
  );

  if (factors.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-ok/30 bg-ok-soft p-4">
        <StatusIcon status="OK" />
        <p className="font-semibold text-ok">Стоп-факторов не найдено</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-bad/30 bg-bad-soft p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-bad uppercase">
        <StatusIcon status="BAD" size="sm" />
        Стоп-факторы · {factors.length}
      </h2>
      <ul className="space-y-2">
        {factors.map(({ section, item }) => (
          <li key={`${section.id}-${item.itemKey}`}>
            <button
              type="button"
              onClick={() => onSelectSection(section.id)}
              className="w-full rounded-xl bg-surface p-3 text-left shadow-sm transition active:scale-[0.99]"
            >
              <span className="block text-xs text-ink-muted">{SECTION_LABELS[section.sectionKey]}</span>
              <span className="block font-semibold text-ink">{itemLabel(item.itemKey)}</span>
              {item.comment && <span className="mt-0.5 block text-sm text-ink-muted">{item.comment}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
