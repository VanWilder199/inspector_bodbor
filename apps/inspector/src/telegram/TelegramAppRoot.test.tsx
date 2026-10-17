import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSdkMock, sdkMock } from '@/test/telegramSdkMock';
import { TelegramAppRoot } from './TelegramAppRoot';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);
// Настоящий AppRoot кладёт тему в хешированные имена классов; нам важно, какие appearance и platform ему передали
vi.mock('@telegram-apps/telegram-ui', () => ({
  AppRoot: ({ appearance, platform, children }: { appearance?: string; platform?: string; children?: ReactNode }) => (
    <div data-testid="app-root" data-appearance={appearance} data-platform={platform}>
      {children}
    </div>
  ),
}));

beforeEach(() => {
  resetSdkMock();
});

describe('TelegramAppRoot', () => {
  it('берёт светлую тему, когда miniApp.isDark = false', () => {
    render(
      <TelegramAppRoot platform="base">
        <span>внутри</span>
      </TelegramAppRoot>,
    );

    const root = screen.getByTestId('app-root');
    expect(root).toHaveAttribute('data-appearance', 'light');
    expect(root).toHaveAttribute('data-platform', 'base');
    expect(screen.getByText('внутри')).toBeInTheDocument();
  });

  it('берёт тёмную тему, когда miniApp.isDark = true, и платформу из launch params', () => {
    sdkMock.miniApp.isDark.mockReturnValue(true);

    render(
      <TelegramAppRoot platform="ios">
        <span>внутри</span>
      </TelegramAppRoot>,
    );

    const root = screen.getByTestId('app-root');
    expect(root).toHaveAttribute('data-appearance', 'dark');
    expect(root).toHaveAttribute('data-platform', 'ios');
  });
});
