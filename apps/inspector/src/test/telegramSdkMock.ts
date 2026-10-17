/*
 * Подмена `@telegram-apps/sdk-react` для тестов: живого Telegram в тестах нет.
 * Подключение в тесте: vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);
 * тот же объект `sdkMock` импортируется в тест, чтобы проверять вызовы с типами.
 */
import { vi } from 'vitest';

type Mock = ReturnType<typeof vi.fn>;

/** Функция SDK с `isAvailable()` и `ifAvailable()`, как у обёрток `wrapSafe` из @telegram-apps/sdk. */
export type SafeFn = Mock & {
  isAvailable: Mock;
  ifAvailable: Mock;
};

function safeFn(impl?: (...args: any[]) => unknown): SafeFn {
  const fn = vi.fn(impl) as unknown as SafeFn;
  fn.isAvailable = vi.fn(() => true);
  fn.ifAvailable = vi.fn();
  return fn;
}

export const sdkMock = {
  mainButton: { onClick: safeFn(() => vi.fn()), setParams: safeFn() },
  backButton: { onClick: safeFn(() => vi.fn()), show: safeFn(), hide: safeFn() },
  closingBehavior: { enableConfirmation: safeFn(), disableConfirmation: safeFn() },
  swipeBehavior: { disableVertical: safeFn(), enableVertical: safeFn() },
  hapticFeedback: { notificationOccurred: safeFn(), selectionChanged: safeFn() },
  miniApp: { isDark: vi.fn(() => false) },
  requestWriteAccess: safeFn(async () => 'allowed'),
  useSignal: (signal: () => unknown) => signal(),
  on: vi.fn((event: string, listener: (payload: any) => void) => {
    const set = sdkListeners.get(event) ?? new Set();
    set.add(listener);
    sdkListeners.set(event, set);
    return () => set.delete(listener);
  }),
};

/** Подписчики на события Telegram (`on`): тест «присылает» событие через `emitSdkEvent`. */
const sdkListeners = new Map<string, Set<(payload: any) => void>>();

export function emitSdkEvent(event: string, payload: unknown): void {
  sdkListeners.get(event)?.forEach((listener) => listener(payload));
}

/** Сбросить вызовы и вернуть «всё доступно». */
export function resetSdkMock(): void {
  vi.clearAllMocks();
  sdkListeners.clear();
  const safe: SafeFn[] = [
    sdkMock.mainButton.onClick,
    sdkMock.mainButton.setParams,
    sdkMock.backButton.onClick,
    sdkMock.backButton.show,
    sdkMock.backButton.hide,
    sdkMock.closingBehavior.enableConfirmation,
    sdkMock.closingBehavior.disableConfirmation,
    sdkMock.swipeBehavior.disableVertical,
    sdkMock.swipeBehavior.enableVertical,
    sdkMock.hapticFeedback.notificationOccurred,
    sdkMock.hapticFeedback.selectionChanged,
    sdkMock.requestWriteAccess,
  ];
  for (const fn of safe) {
    fn.isAvailable.mockReturnValue(true);
  }
  sdkMock.miniApp.isDark.mockReturnValue(false);
}
