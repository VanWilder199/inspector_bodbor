import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/renderApp';
import { resetSdkMock, sdkMock } from '@/test/telegramSdkMock';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

beforeEach(() => {
  resetSdkMock();
});

async function renderAt(path: string) {
  renderApp(path);
  // Роуты лежат под гейтом: сначала «Загрузка», потом сам экран (или редирект на экран по статусу)
  await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'Загрузка' })).not.toBeInTheDocument());
  // Заголовков первого уровня может быть несколько: telegram-ui рисует `Section header` как `<h1>`
  await screen.findAllByRole('heading', { level: 1 });
}

describe('интеграция роутов с Telegram', () => {
  it.each(['/reports/123/start', '/reports/123/section/EXTERIOR', '/reports/123/paint', '/reports/123/video', '/reports/123/conclusion', '/reports/123/review'])(
    'на экране мастера %s вертикальный свайп отключён',
    async (path) => {
      await renderAt(path);
      expect(sdkMock.swipeBehavior.disableVertical).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['/', '/reports', '/reports/new', '/reports/123/done', '/profile'])('на экране %s свайп не трогаем', async (path) => {
    await renderAt(path);
    expect(sdkMock.swipeBehavior.disableVertical).not.toHaveBeenCalled();
  });

  it('BackButton показывается на вложенном экране', async () => {
    await renderAt('/reports/123');
    expect(sdkMock.backButton.show).toHaveBeenCalledTimes(1);
  });

  it('BackButton скрыт на корневом табе', async () => {
    await renderAt('/reports');
    expect(sdkMock.backButton.show).not.toHaveBeenCalled();
  });
});
