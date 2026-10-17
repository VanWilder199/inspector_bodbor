import { swipeBehavior } from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

/**
 * Отключает свайп вниз, пока экран смонтирован. Нужен на экранах мастера: иначе прокрутка списка пунктов
 * вниз сворачивает Mini App (PLAN_FRONTEND_MINIAPP.md, раздел 3.2). При уходе с экрана свайп возвращается.
 */
export function useVerticalSwipeLock(): void {
  useEffect(() => {
    if (!swipeBehavior.disableVertical.isAvailable()) {
      return;
    }
    swipeBehavior.disableVertical();
    return () => {
      swipeBehavior.enableVertical.ifAvailable();
    };
  }, []);
}
