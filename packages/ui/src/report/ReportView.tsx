import { useState } from 'react';
import { MediaGallery, type MediaOptions } from './MediaGallery';
import { PaintDiagram } from './PaintDiagram';
import { SectionDetail } from './SectionDetail';
import { SectionGrid } from './SectionGrid';
import { countByStatus, formatPrice } from './status';
import { StopFactors } from './StopFactors';
import type { ReportHeader, ReportViewData } from './types';

interface ReportViewProps extends MediaOptions {
  report: ReportViewData;
  header?: ReportHeader;
  /** Цена нужна в превью у подборщика и в модерации, покупателю после оплаты — нет. */
  showPrice?: boolean;
}

/**
 * Отчёт целиком. Один компонент на три приложения: превью у подборщика,
 * модерация у админа, просмотр у покупателя.
 */
export function ReportView({ report, header, showPrice = false, onMediaError, openOriginal }: ReportViewProps) {
  const sections = [...report.sections].sort((a, b) => a.orderNo - b.orderNo);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const totals = countByStatus(sections.flatMap((s) => s.items));

  const toggle = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const focusSection = (id: string) => {
    setOpenSections((prev) => new Set(prev).add(id));
    requestAnimationFrame(() => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth' }));
  };

  return (
    <article className="mx-auto max-w-xl space-y-4 px-4 py-5">
      <header className="space-y-1">
        {header && (
          <>
            <h1 className="text-2xl leading-tight font-bold text-ink">{header.carTitle}</h1>
            {header.carSubtitle && <p className="text-ink-muted">{header.carSubtitle}</p>}
            {(header.inspectorName || header.inspectedAt) && (
              <p className="text-sm text-ink-muted">
                {header.inspectorName && <>Подборщик: {header.inspectorName}</>}
                {header.inspectorName && header.inspectedAt && ' · '}
                {header.inspectedAt}
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm">
          <span className="font-semibold text-ok">✓ {totals.OK} в норме</span>
          <span className="font-semibold text-warn">! {totals.WARN} замечаний</span>
          <span className="font-semibold text-bad">✕ {totals.BAD} проблем</span>
          {showPrice && report.priceByn !== null && (
            <span className="ml-auto rounded-full bg-ink px-3 py-1 font-bold text-white">{formatPrice(report.priceByn)}</span>
          )}
        </div>
      </header>

      <StopFactors sections={sections} onSelectSection={focusSection} />

      <SectionGrid sections={sections} onSelectSection={focusSection} />

      {report.paintMeasurements.length > 0 && <PaintDiagram measurements={report.paintMeasurements} />}

      {report.globalMedia.length > 0 && (
        <section className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Видео и общие фото</h2>
          <MediaGallery media={report.globalMedia} onMediaError={onMediaError} openOriginal={openOriginal} />
        </section>
      )}

      {report.conclusionText && (
        <section className="rounded-2xl border-l-4 border-brand bg-surface p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-ink-muted uppercase">Заключение подборщика</h2>
          <p className="leading-relaxed whitespace-pre-line text-ink">{report.conclusionText}</p>
        </section>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Подробно по секциям</h2>
        {sections.map((section) => (
          <SectionDetail
            key={section.id}
            section={section}
            open={openSections.has(section.id)}
            onToggle={() => toggle(section.id)}
            onMediaError={onMediaError}
            openOriginal={openOriginal}
          />
        ))}
      </div>
    </article>
  );
}
