import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InspectorStatus } from '@/api/types';
import { DRAFT_REPORT_ID } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { STUB_ROUTES } from './routes';

/** Подставляем конкретные значения вместо параметров роута. `:id` — реальный отчёт из сидов мок-бэкенда: хаб и шаги грузят его. */
function toUrl(path: string): string {
  return path.replace(':id', DRAFT_REPORT_ID).replace(':sectionKey', 'EXTERIOR');
}

/** Экраны онбординга открываются только в «своём» состоянии подборщика, остальные — у подтверждённого. */
const INSPECTOR_FOR_PATH: Record<string, InspectorStatus | null> = {
  '/register': null,
  '/pending': 'pending',
  '/banned': 'banned',
};

/**
 * Экраны с настоящей логикой открывают не заглушку, а свой экран: у них другой заголовок первого уровня.
 * Мини-приложение подставляет сюда свой, когда экран перестаёт быть заглушкой.
 */
const HEADING_OVERRIDE: Record<string, string> = {
  '/reports/new': 'Новый отчёт',
  // Хаб отчёта: заголовок — подпись машины (из ссылки в индексе её нет, поэтому «Автомобиль»)
  '/reports/:id': 'Автомобиль',
  '/reports/:id/start': 'Обязательные фото',
  // Шаг секции (MINI-09): заголовок — название секции; тест подставляет EXTERIOR
  '/reports/:id/section/:sectionKey': 'Кузов',
  '/reports/:id/paint': 'Замеры ЛКП',
  '/reports/:id/video': 'Видео обхода',
  '/reports/:id/conclusion': 'Заключение и цена',
  '/reports/:id/review': 'Проверка и отправка',
};

const heading = (path: string, title: string) => HEADING_OVERRIDE[path] ?? title;

describe('карта роутов Mini App', () => {
  it('содержит все 19 путей из плана', () => {
    expect(STUB_ROUTES).toHaveLength(19);
  });

  // `/` — bootstrap: он всегда перенаправляет, его проверяет онбординг (onboarding.test.tsx)
  it.each(STUB_ROUTES.filter(({ path }) => path !== '/'))('$path рендерит экран «$title»', async ({ path, title }) => {
    const inspector = path in INSPECTOR_FOR_PATH ? INSPECTOR_FOR_PATH[path] : 'verified';
    mockControl.setInspector(inspector as InspectorStatus | null);
    renderApp(toUrl(path));

    // Для /reports/new важно, что статический путь выигрывает у /reports/:id
    expect(await screen.findByRole('heading', { level: 1, name: heading(path, title) })).toBeInTheDocument();
  });
});
