import { itemLabel, SECTION_LABELS } from './catalog';
import { MediaGallery, type MediaOptions } from './MediaGallery';
import { countByStatus, sortBySeverity, worstStatus } from './status';
import { StatusIcon } from './StatusIcon';
import type { ReportSection } from './types';

interface SectionDetailProps extends MediaOptions {
  section: ReportSection;
  open: boolean;
  onToggle: () => void;
}

export function SectionDetail({ section, open, onToggle, onMediaError, openOriginal }: SectionDetailProps) {
  const status = worstStatus(section.items);
  const counts = countByStatus(section.items);

  return (
    <section id={`section-${section.id}`} className="scroll-mt-4 overflow-hidden rounded-2xl bg-surface shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open}>
        <StatusIcon status={status} />
        <span className="flex-1">
          <span className="block font-bold text-ink">{SECTION_LABELS[section.sectionKey]}</span>
          <span className="block text-xs text-ink-muted">
            {counts.OK} в норме
            {counts.WARN > 0 && ` · ${counts.WARN} замеч.`}
            {counts.BAD > 0 && ` · ${counts.BAD} пробл.`}
          </span>
        </span>
        <svg viewBox="0 0 20 20" className={`size-5 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4 border-t border-line p-4">
          {section.summary && <p className="text-sm leading-relaxed text-ink">{section.summary}</p>}

          <ul className="divide-y divide-line">
            {sortBySeverity(section.items).map((item) => (
              <li key={item.itemKey} className="flex gap-3 py-2.5">
                <StatusIcon status={item.status} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{itemLabel(item.itemKey)}</p>
                  {item.comment && <p className="text-sm text-ink-muted">{item.comment}</p>}
                </div>
              </li>
            ))}
          </ul>

          <MediaGallery media={section.media} onMediaError={onMediaError} openOriginal={openOriginal} />
        </div>
      )}
    </section>
  );
}
