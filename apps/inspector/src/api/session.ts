/*
 * Что клиент API знает о сессии Telegram: сырая строка initData и момент, когда бэкенд перестанет её принимать.
 * Заполняется один раз в `main.tsx` после `initTelegram()`.
 */

/** За сколько до конца сессии показывается баннер (PLAN_FRONTEND_MINIAPP.md, раздел 3.1). */
export const SESSION_WARNING_MS = 10 * 60 * 1000;

let rawInitData: string | undefined;
let expiresAt: Date | undefined;

export function setApiSession(session: { rawInitData?: string; expiresAt?: Date }): void {
  rawInitData = session.rawInitData;
  expiresAt = session.expiresAt;
}

/** Строка для заголовка `X-Telegram-Data`: ровно та, что дал SDK, без перекодирования. */
export function getRawInitData(): string | undefined {
  return rawInitData;
}

export function getSessionExpiresAt(): Date | undefined {
  return expiresAt;
}

export type SessionPhase = 'active' | 'expiring' | 'expired';

/** `active` — запас больше 10 минут (или `authDate` неизвестен), `expiring` — меньше 10 минут, `expired` — срок вышел. */
export function sessionPhase(at: Date | undefined, now: number = Date.now()): SessionPhase {
  if (!at) return 'active';
  const left = at.getTime() - now;
  if (left <= 0) return 'expired';
  return left <= SESSION_WARNING_MS ? 'expiring' : 'active';
}

/**
 * Для очереди загрузок и автосохранения: после этого момента новые запросы не стартуют (раздел 3.1).
 * Время клиента может расходиться с серверным, поэтому 401 остаётся главным сигналом, а это — подсказка.
 */
export function isInitDataExpired(now: number = Date.now()): boolean {
  return sessionPhase(expiresAt, now) === 'expired';
}
