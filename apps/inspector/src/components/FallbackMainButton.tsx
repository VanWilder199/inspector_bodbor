import { mainButton } from '@telegram-apps/sdk-react';
import { Button } from '@telegram-apps/telegram-ui';

interface FallbackMainButtonProps {
  text: string;
  enabled?: boolean;
  loading?: boolean;
}

/**
 * Обычная кнопка отправки формы на случай, когда настоящей MainButton Telegram нет:
 * dev-сборка в браузере с мок-окружением (кнопки Telegram там не рисуются) и старые клиенты без поддержки.
 * В боевой сборке внутри Telegram не показывается: основная кнопка шага там одна — MainButton (раздел 3.2 плана).
 * Кнопка типа `submit`, поэтому ставится внутрь `<form>`: нажатие отправляет форму так же, как Enter в поле.
 */
export function FallbackMainButton({ text, enabled = true, loading = false }: FallbackMainButtonProps) {
  if (!import.meta.env.DEV && mainButton.onClick.isAvailable()) {
    return null;
  }
  return (
    <Button type="submit" size="l" stretched disabled={!enabled} loading={loading}>
      {text}
    </Button>
  );
}
