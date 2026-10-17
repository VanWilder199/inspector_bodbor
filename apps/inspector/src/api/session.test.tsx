import { act, render, screen } from '@testing-library/react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInitDataExpired, SESSION_WARNING_MS, sessionPhase, setApiSession } from '@/api/session';
import { SessionExpiryBanner } from '@/components/SessionExpiryBanner';
import { initDataExpiresAt } from '@/telegram/launchParams';

const MINUTE = 60 * 1000;

/** Компоненты telegram-ui без `AppRoot` падают, поэтому баннер рендерим внутри него, как в приложении. */
function renderBanner() {
  return render(
    <AppRoot platform="base">
      <SessionExpiryBanner />
    </AppRoot>,
  );
}

describe('sessionPhase', () => {
  const expiresAt = new Date('2026-10-14T12:00:00Z');
  const at = (msBeforeExpiry: number) => expiresAt.getTime() - msBeforeExpiry;

  it('запас больше 10 минут → active', () => {
    expect(sessionPhase(expiresAt, at(SESSION_WARNING_MS + 1))).toBe('active');
  });

  it('ровно за 10 минут до конца и позже → expiring', () => {
    expect(sessionPhase(expiresAt, at(SESSION_WARNING_MS))).toBe('expiring');
    expect(sessionPhase(expiresAt, at(1))).toBe('expiring');
  });

  it('в момент конца и после него → expired', () => {
    expect(sessionPhase(expiresAt, at(0))).toBe('expired');
    expect(sessionPhase(expiresAt, at(-MINUTE))).toBe('expired');
  });

  it('срок неизвестен → active: не пугаем пользователя без причины', () => {
    expect(sessionPhase(undefined)).toBe('active');
  });

  it('сессия живёт 24 часа от auth_date, баннер — за 10 минут до конца', () => {
    const authDate = new Date('2026-10-13T12:00:00Z');
    const expires = initDataExpiresAt(authDate);
    expect(expires.toISOString()).toBe('2026-10-14T12:00:00.000Z');
    expect(sessionPhase(expires, authDate.getTime() + 24 * 60 * MINUTE - 11 * MINUTE)).toBe('active');
    expect(sessionPhase(expires, authDate.getTime() + 24 * 60 * MINUTE - 9 * MINUTE)).toBe('expiring');
  });
});

describe('isInitDataExpired', () => {
  it('сравнивает «сейчас» со сроком из setApiSession', () => {
    const expiresAt = new Date('2026-10-14T12:00:00Z');
    setApiSession({ rawInitData: 'x', expiresAt });
    expect(isInitDataExpired(expiresAt.getTime() - 1)).toBe(false);
    expect(isInitDataExpired(expiresAt.getTime())).toBe(true);
  });

  it('срок неизвестен → не истёк', () => {
    setApiSession({ rawInitData: 'x' });
    expect(isInitDataExpired()).toBe(false);
  });
});

describe('SessionExpiryBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('появляется за 10 минут до конца сессии и меняет текст после её конца', () => {
    // до конца 10 минут и 1 секунда: баннера ещё нет
    setApiSession({ rawInitData: 'x', expiresAt: new Date(Date.now() + SESSION_WARNING_MS + 1000) });
    renderBanner();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Сессия скоро истечёт');

    act(() => {
      vi.advanceTimersByTime(SESSION_WARNING_MS);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Сессия истекла');
  });

  it('если до конца меньше 10 минут уже при открытии, баннер виден сразу', () => {
    setApiSession({ rawInitData: 'x', expiresAt: new Date(Date.now() + 5 * MINUTE) });
    renderBanner();
    expect(screen.getByRole('status')).toHaveTextContent('Сессия скоро истечёт');
  });

  it('без срока сессии (вне Telegram, мок) баннера нет', () => {
    setApiSession({ rawInitData: 'x' });
    renderBanner();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('после сна устройства фазу пересчитывает событие visibilitychange', () => {
    setApiSession({ rawInitData: 'x', expiresAt: new Date(Date.now() + 2 * SESSION_WARNING_MS) });
    renderBanner();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // часы ушли вперёд, а таймер не сработал (устройство спало)
    vi.setSystemTime(new Date(Date.now() + 2 * SESSION_WARNING_MS + MINUTE));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Сессия истекла');
  });
});
