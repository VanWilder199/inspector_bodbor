import { useEffect, useState } from 'react';
import { getSessionExpiresAt, SESSION_WARNING_MS, sessionPhase, type SessionPhase } from '@/api/session';

/**
 * Фаза сессии для баннера: `active` → `expiring` (за 10 минут до конца) → `expired`.
 * Таймер ставится ровно на ближайшую смену фазы, а не опрашивает каждую секунду.
 */
export function useSessionPhase(): SessionPhase {
  const [phase, setPhase] = useState<SessionPhase>(() => sessionPhase(getSessionExpiresAt()));

  useEffect(() => {
    const expiresAt = getSessionExpiresAt();
    if (!expiresAt) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      const now = Date.now();
      const current = sessionPhase(expiresAt, now);
      setPhase(current);
      if (current === 'expired') return;
      const nextChange = current === 'active' ? expiresAt.getTime() - SESSION_WARNING_MS : expiresAt.getTime();
      timer = setTimeout(check, nextChange - now);
    };
    check();
    // Свёрнутый Mini App мог проспать таймер (сон устройства): при возвращении фазу пересчитываем
    document.addEventListener('visibilitychange', check);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return phase;
}
