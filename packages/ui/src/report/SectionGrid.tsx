import { SECTION_LABELS } from './catalog';
import { countByStatus, worstStatus } from './status';
import { STATUS_STYLES, StatusIcon } from './StatusIcon';
import type { ReportSection } from './types';

interface SectionGridProps {
  sections: ReportSection[];
  onSelectSection: (sectionId: string) => void;
}

export function SectionGrid({ sections, onSelectSection }: SectionGridProps) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold tracking-wide text-ink-muted uppercase">Сводка по секциям</h2>
      <ul className="grid grid-cols-2 gap-2">
        {[...sections]
          .sort((a, b) => a.orderNo - b.orderNo)
          .map((section) => {
            const status = worstStatus(section.items);
            const counts = countByStatus(section.items);
            const issues = counts.WARN + counts.BAD;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => onSelectSection(section.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border-l-4 bg-surface p-3 text-left shadow-sm transition active:scale-[0.98] ${
                    status ? STATUS_STYLES[status].border : 'border-line'
                  }`}
                >
                  <StatusIcon status={status} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{SECTION_LABELS[section.sectionKey]}</span>
                    <span className="block text-xs text-ink-muted">
                      {section.items.length === 0 ? 'нет данных' : issues === 0 ? 'всё в норме' : `замечаний: ${issues}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
