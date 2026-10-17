import { useState } from 'react';
import { PANEL_LABELS } from './catalog';
import { maxThicknessByPanel, PAINT_LEVEL_LABELS, paintLevel, type PaintLevel } from './status';
import type { PaintMeasurement } from './types';

const LEVEL_FILL: Record<PaintLevel, string> = {
  factory: 'var(--color-paint-factory)',
  repaint: 'var(--color-paint-repaint)',
  putty: 'var(--color-paint-putty)',
  none: 'var(--color-paint-none)',
};

/* Вид сверху, нос машины вверху. Коды панелей совпадают с seed `paint_panel` (V007). */
const PANELS: { code: string; x: number; y: number; w: number; h: number; rx?: number; label?: boolean }[] = [
  { code: 'FRONT_BUMPER', x: 40, y: 6, w: 120, h: 24, rx: 12, label: true },
  { code: 'HOOD', x: 46, y: 34, w: 108, h: 80, rx: 6, label: true },
  { code: 'FENDER_FL', x: 14, y: 40, w: 28, h: 72, rx: 6, label: true },
  { code: 'FENDER_FR', x: 158, y: 40, w: 28, h: 72, rx: 6, label: true },
  { code: 'DOOR_FL', x: 14, y: 118, w: 28, h: 78, rx: 4, label: true },
  { code: 'DOOR_FR', x: 158, y: 118, w: 28, h: 78, rx: 4, label: true },
  { code: 'DOOR_RL', x: 14, y: 200, w: 28, h: 78, rx: 4, label: true },
  { code: 'DOOR_RR', x: 158, y: 200, w: 28, h: 78, rx: 4, label: true },
  { code: 'SILL_L', x: 2, y: 118, w: 9, h: 160, rx: 3 },
  { code: 'SILL_R', x: 189, y: 118, w: 9, h: 160, rx: 3 },
  { code: 'ROOF', x: 50, y: 146, w: 100, h: 112, rx: 10, label: true },
  { code: 'FENDER_RL', x: 14, y: 284, w: 28, h: 72, rx: 6, label: true },
  { code: 'FENDER_RR', x: 158, y: 284, w: 28, h: 72, rx: 6, label: true },
  { code: 'TRUNK', x: 46, y: 290, w: 108, h: 66, rx: 6, label: true },
  { code: 'REAR_BUMPER', x: 40, y: 360, w: 120, h: 24, rx: 12, label: true },
];

interface PaintDiagramProps {
  measurements: PaintMeasurement[];
}

export function PaintDiagram({ measurements }: PaintDiagramProps) {
  const byPanel = maxThicknessByPanel(measurements);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedMeasurements = measurements.filter((m) => m.panelCode === selected);

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-bold tracking-wide text-ink-muted uppercase">Толщина ЛКП</h2>

      <div className="flex gap-4">
        <svg viewBox="0 0 200 390" className="w-1/2 max-w-[220px] shrink-0" role="img" aria-label="Схема кузова с толщиной ЛКП">
          {/* стёкла — не окрашиваются, просто ориентир */}
          <rect x={52} y={118} width={96} height={24} rx={6} fill="var(--color-line)" />
          <rect x={52} y={262} width={96} height={24} rx={6} fill="var(--color-line)" />
          {PANELS.map((p) => {
            const thickness = byPanel.get(p.code);
            const isSelected = selected === p.code;
            return (
              <g key={p.code} onClick={() => setSelected(isSelected ? null : p.code)} className="cursor-pointer">
                <rect
                  x={p.x}
                  y={p.y}
                  width={p.w}
                  height={p.h}
                  rx={p.rx}
                  fill={LEVEL_FILL[paintLevel(thickness)]}
                  stroke={isSelected ? 'var(--color-ink)' : 'white'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                >
                  <title>{PANEL_LABELS[p.code] ?? p.code}</title>
                </rect>
                {p.label && thickness !== undefined && (
                  <text
                    x={p.x + p.w / 2}
                    y={p.y + p.h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none fill-ink font-semibold"
                    fontSize={p.w < 40 ? 10 : 13}
                  >
                    {thickness}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
          <ul className="space-y-1.5 text-xs text-ink">
            {(['factory', 'repaint', 'putty', 'none'] as const).map((level) => (
              <li key={level} className="flex items-center gap-2">
                <span className="size-3.5 shrink-0 rounded" style={{ background: LEVEL_FILL[level] }} />
                {PAINT_LEVEL_LABELS[level]}
              </li>
            ))}
          </ul>

          <div className="rounded-xl bg-canvas p-3 text-sm">
            {selected ? (
              <>
                <p className="font-semibold text-ink">{PANEL_LABELS[selected] ?? selected}</p>
                {selectedMeasurements.length === 0 ? (
                  <p className="text-ink-muted">Замер не проводился</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {selectedMeasurements.map((m) => (
                      <li key={m.id}>
                        <span className="font-semibold">{m.thicknessUm} мкм</span>
                        {m.spot && <span className="text-ink-muted"> · {m.spot}</span>}
                        {m.note && <span className="block text-ink-muted">{m.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-ink-muted">Нажмите на деталь, чтобы увидеть замеры</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
