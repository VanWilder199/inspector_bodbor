import { closingBehavior } from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

// Подтверждение закрытия нужно нескольким независимым источникам сразу (черновик и очередь загрузок).
// Счётчик не даёт одному из них выключить подтверждение, пока второй ещё его требует.
let holders = 0;

/**
 * Включает подтверждение закрытия Mini App, пока `enabled` равен `true`
 * (есть несохранённые черновики или идёт загрузка файлов, PLAN_FRONTEND_MINIAPP.md, раздел 3.2).
 */
export function useClosingConfirmation(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    holders += 1;
    closingBehavior.enableConfirmation.ifAvailable();
    return () => {
      holders -= 1;
      if (holders === 0) {
        closingBehavior.disableConfirmation.ifAvailable();
      }
    };
  }, [enabled]);
}
