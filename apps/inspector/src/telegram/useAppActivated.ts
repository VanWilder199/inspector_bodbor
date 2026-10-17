import { on } from '@telegram-apps/sdk-react';
import { useEffect, useRef } from 'react';

/**
 * Mini App снова стал активным (развернули из свёрнутого состояния, вернулись из другого Mini App).
 * В Bot API это событие `visibility_changed` с `is_visible: true` (с версии 8.0, раздел 3.2 плана называет его `activated`).
 * На старых клиентах событие просто не приходит: страховкой остаётся перезапрос TanStack Query при возврате на вкладку.
 */
export function useAppActivated(onActivated: () => void): void {
  const callbackRef = useRef(onActivated);
  useEffect(() => {
    callbackRef.current = onActivated;
  });

  useEffect(() => {
    try {
      return on('visibility_changed', ({ is_visible: isVisible }) => {
        if (isVisible) {
          callbackRef.current();
        }
      });
    } catch {
      // вне Telegram подписаться не на что
      return undefined;
    }
  }, []);
}
