import { hapticFeedback } from '@telegram-apps/sdk-react';

/** Вибро-отклик Telegram. Если клиент его не поддерживает, вызовы молча ничего не делают. */
const haptic = {
  /** Сохранено, отправлено. */
  success: () => {
    hapticFeedback.notificationOccurred.ifAvailable('success');
  },
  /** Ошибка. */
  error: () => {
    hapticFeedback.notificationOccurred.ifAvailable('error');
  },
  /** Выбор значения (OK / WARN / BAD). */
  selection: () => {
    hapticFeedback.selectionChanged.ifAvailable();
  },
};

export function useHaptic() {
  return haptic;
}
