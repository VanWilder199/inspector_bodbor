import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/api/client';
import { mockControl } from '@/mocks/state';

// App не рендерится, но тянет роуты, а те — SDK Telegram
vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

describe('401 от API → /session-expired', () => {
  it('любой 401 переводит роутер на экран «сессия устарела», запрос при этом падает ApiError', async () => {
    // импорт создаёт роутер и регистрирует обработчик 401 (setup.ts сбрасывает его после каждого теста)
    await import('@/App');
    expect(window.location.pathname).toBe('/');

    mockControl.failOnce('GET /inspector/', { kind: 'security', status: 401 });
    await expect(apiFetch('/inspector/')).rejects.toMatchObject({ status: 401 });

    await waitFor(() => expect(window.location.pathname).toBe('/session-expired'));
  });
});
