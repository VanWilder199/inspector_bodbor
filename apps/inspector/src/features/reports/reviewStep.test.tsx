import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_REPORT_ID, REVISION_REPORT_ID } from '@/mocks/fixtures/ids';
import { db, resetMocks } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { resetSdkMock } from '@/test/telegramSdkMock';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

/** Доводит отчёт до полной готовности к submit по всем 7 секциям + видео + заключение + цена. */
function makeComplete(reportId: string) {
  const report = db.reports[reportId]!;
  report.sections = report.sections.map((section) =>
    section.summary === '' && section.items.length === 0
      ? { ...section, summary: 'Итог', items: [{ itemKey: 'geometry', status: 'OK', comment: null }] }
      : section,
  );
  report.globalMedia = [{ id: 'v', kind: 'VIDEO', s3Key: 'k', status: 'pending', orderNo: 0 }];
  report.conclusionText = report.conclusionText ?? 'Рекомендую';
  report.priceByn = report.priceByn ?? 100;
}

beforeEach(() => {
  resetSdkMock();
  resetMocks();
});

describe('проверка и отправка', () => {
  it('неполный черновик — отправка недоступна, видны незаполненные пункты', async () => {
    renderApp(`/reports/${DRAFT_REPORT_ID}/review`);
    await heading('Проверка и отправка');

    // секции пустые → блокеры видны
    expect(await screen.findAllByText(/Секция/)).not.toHaveLength(0);
    const submit = screen.queryByRole('button', { name: 'Отправить на модерацию' });
    if (submit) expect(submit).toBeDisabled();
  });

  it('полный отчёт на доработке — отправка доступна', async () => {
    makeComplete(REVISION_REPORT_ID);
    renderApp(`/reports/${REVISION_REPORT_ID}/review`);
    await heading('Проверка и отправка');

    const submit = await screen.findByRole('button', { name: 'Отправить на модерацию' });
    // Заполненный отчёт на доработке готов к повторной отправке
    expect(submit).not.toBeDisabled();
  });

  it('отправка переводит отчёт в pending_review и ведёт на экран «Отправлено»', async () => {
    makeComplete(REVISION_REPORT_ID);
    renderApp(`/reports/${REVISION_REPORT_ID}/review`);
    await heading('Проверка и отправка');

    const submit = await screen.findByRole('button', { name: 'Отправить на модерацию' });
    submit.click();

    expect(await screen.findByText('Отправлено на модерацию')).toBeInTheDocument();
    expect(db.reports[REVISION_REPORT_ID]!.status).toBe('pending_review');
  });
});