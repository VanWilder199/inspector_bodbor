import {
  backButton,
  closingBehavior,
  init,
  mainButton,
  miniApp,
  retrieveLaunchParams,
  retrieveRawInitData,
  swipeBehavior,
  themeParams,
  viewport,
} from '@telegram-apps/sdk-react';
import { initDataExpiresAt, toUiPlatform, type UiPlatform } from './launchParams';

/** Что приложение узнаёт о запуске в Telegram. Строится один раз до первого рендера. */
export interface TelegramEnv {
  /** Сырая строка initData для заголовка `X-Telegram-Data` (MINI-03). Её нельзя пересобирать: подпись сломается. */
  rawInitData: string | undefined;
  /** Параметр `startapp` прямой ссылки; в роут он превращается в `startParamToPath`. */
  startParam: string | undefined;
  /** Платформа для `AppRoot` из telegram-ui. */
  platform: UiPlatform;
  /** Когда Telegram подписал initData. */
  authDate: Date | undefined;
  /** Когда бэкенд перестанет принимать initData (`authDate` + 24 ч). */
  expiresAt: Date | undefined;
}

/**
 * Инициализация SDK (PLAN_FRONTEND_MINIAPP.md, раздел 3.1). Вызывать только внутри Telegram (или с мок-окружением в dev)
 * и строго до первого рендера роутера.
 *
 * Каждый вызов идёт через `ifAvailable`: старые клиенты Telegram поддерживают не все компоненты.
 * Там, где у компонента есть синхронный `mountSync` (тема, Mini App), берём его: тема нужна уже на первом кадре,
 * а асинхронный `mount` отдал бы его с задержкой и мигающими цветами.
 */
export function initTelegram(): TelegramEnv {
  init();

  const launchParams = retrieveLaunchParams(true);
  const rawInitData = retrieveRawInitData();
  const authDate = launchParams.tgWebAppData?.authDate;

  themeParams.mountSync.ifAvailable();
  // Выставляет --tg-theme-* на :root и следит за сменой темы: цвета меняются без перезагрузки
  themeParams.bindCssVars.ifAvailable();

  miniApp.mountSync.ifAvailable();
  miniApp.setHeaderColor.ifAvailable('bg_color');

  backButton.mount.ifAvailable();
  mainButton.mount.ifAvailable();
  closingBehavior.mount.ifAvailable();
  swipeBehavior.mount.ifAvailable();

  // viewport монтируется асинхронно (клиент присылает размеры), раскрываем на всю высоту, когда он готов
  if (viewport.mount.isAvailable()) {
    viewport
      .mount()
      .then(() => viewport.expand.ifAvailable())
      .catch(() => {
        // клиент не ответил на запрос размеров: приложение работает и без раскрытия
      });
  }

  // Скрывает заставку загрузки Telegram; вызывать после монтирования компонентов
  miniApp.ready.ifAvailable();

  return {
    rawInitData,
    startParam: launchParams.tgWebAppStartParam,
    platform: toUiPlatform(launchParams.tgWebAppPlatform),
    authDate,
    expiresAt: authDate ? initDataExpiresAt(authDate) : undefined,
  };
}
