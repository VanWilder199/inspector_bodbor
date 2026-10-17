import { mainButton } from '@telegram-apps/sdk-react';
import { useEffect, useRef } from 'react';

interface MainButtonOptions {
  /** Кнопка нажимается. По умолчанию `true`. */
  enabled?: boolean;
  /** Показывать лоадер на кнопке (идёт запрос). По умолчанию `false`. */
  loading?: boolean;
}

/**
 * Единственная основная кнопка шага (PLAN_FRONTEND_MINIAPP.md, раздел 3.2).
 * Показывается, пока экран смонтирован; при уходе с экрана обработчик снимается, а кнопка прячется,
 * поэтому двойных срабатываний не бывает. На экранах только для чтения хук просто не вызывают.
 *
 * Обработчик читается из ref: смена `onClick` между рендерами не пересоздаёт подписку.
 */
export function useMainButton(text: string, onClick: () => void, { enabled = true, loading = false }: MainButtonOptions = {}): void {
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  });

  useEffect(() => {
    if (!mainButton.onClick.isAvailable()) {
      return;
    }
    const off = mainButton.onClick(() => onClickRef.current());
    return () => {
      off();
      mainButton.setParams.ifAvailable({ isVisible: false, isLoaderVisible: false });
    };
  }, []);

  useEffect(() => {
    mainButton.setParams.ifAvailable({ text, isVisible: true, isEnabled: enabled, isLoaderVisible: loading });
  }, [text, enabled, loading]);
}
