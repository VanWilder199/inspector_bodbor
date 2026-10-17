import { requestWriteAccess } from '@telegram-apps/sdk-react';

/**
 * Просит у пользователя разрешение, чтобы бот мог писать ему первым.
 *
 * Нужно после регистрации: если Mini App открыт по прямой ссылке без `/start`, бот не может начать диалог,
 * и `sendMessage` бэкенда получит `403 Forbidden: bot can't initiate conversation`. Сам вызов делает MINI-05;
 * здесь только безопасная обёртка. Возвращает `true`, если разрешение получено.
 */
export async function requestNotificationsAccess(): Promise<boolean> {
  if (!requestWriteAccess.isAvailable()) {
    return false;
  }
  try {
    return (await requestWriteAccess()) === 'allowed';
  } catch {
    return false;
  }
}
