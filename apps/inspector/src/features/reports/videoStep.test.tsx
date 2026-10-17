import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_REPORT_ID } from '@/mocks/fixtures/ids';
import { db, resetMocks } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { resetSdkMock } from '@/test/telegramSdkMock';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

const URL = `/reports/${DRAFT_REPORT_ID}/video`;
const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

beforeEach(() => {
  resetSdkMock();
  resetMocks();
});

describe('видео обхода: экран', () => {
  it('показывает заголовок и подсказки про длину и формат iPhone', async () => {
    renderApp(URL);
    await heading('Видео обхода');

    expect(screen.getByText(/не длиннее 3 минут/)).toBeInTheDocument();
    expect(screen.getByText(/Наиболее совместимый/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Снять видео' })).toBeInTheDocument();
  });

  it('на модерации кнопка съёмки отключена', async () => {
    db.reports[DRAFT_REPORT_ID]!.status = 'pending_review';
    renderApp(URL);
    await heading('Видео обхода');

    expect(screen.getByRole('button', { name: 'Снять видео' })).toBeDisabled();
  });
});