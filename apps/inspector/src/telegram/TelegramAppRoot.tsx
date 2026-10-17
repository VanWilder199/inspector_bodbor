import { miniApp, useSignal } from '@telegram-apps/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import type { ReactNode } from 'react';
import type { UiPlatform } from './launchParams';

interface TelegramAppRootProps {
  platform: UiPlatform;
  children: ReactNode;
}

/**
 * `AppRoot` из telegram-ui с темой Telegram: светлая или тёмная берётся из `miniApp.isDark` и меняется на лету,
 * платформа (ios / base) — из launch params. Сами цвета приходят через `--tg-theme-*` (`themeParams.bindCssVars` в `initTelegram`).
 */
export function TelegramAppRoot({ platform, children }: TelegramAppRootProps) {
  const isDark = useSignal(miniApp.isDark);
  return (
    <AppRoot appearance={isDark ? 'dark' : 'light'} platform={platform}>
      {children}
    </AppRoot>
  );
}
