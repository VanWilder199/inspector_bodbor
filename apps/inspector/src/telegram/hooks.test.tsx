import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSdkMock, sdkMock } from '@/test/telegramSdkMock';
import { requestNotificationsAccess } from './writeAccess';
import { isBackButtonVisible, useBackButton } from './useBackButton';
import { useClosingConfirmation } from './useClosingConfirmation';
import { useHaptic } from './useHaptic';
import { useMainButton } from './useMainButton';
import { useVerticalSwipeLock } from './useVerticalSwipeLock';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

beforeEach(() => {
  resetSdkMock();
  window.history.replaceState(null, '');
});

describe('useMainButton', () => {
  it('показывает кнопку с текстом и состоянием', () => {
    const { rerender } = renderHook((props: { loading: boolean }) => useMainButton('Далее', vi.fn(), { enabled: false, loading: props.loading }), {
      initialProps: { loading: false },
    });
    expect(sdkMock.mainButton.setParams.ifAvailable).toHaveBeenLastCalledWith({
      text: 'Далее',
      isVisible: true,
      isEnabled: false,
      isLoaderVisible: false,
    });

    rerender({ loading: true });
    expect(sdkMock.mainButton.setParams.ifAvailable).toHaveBeenLastCalledWith(expect.objectContaining({ isLoaderVisible: true }));
  });

  it('вызывает актуальный обработчик и не переподписывается при смене обработчика', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook((props: { onClick: () => void }) => useMainButton('Далее', props.onClick), {
      initialProps: { onClick: first },
    });
    rerender({ onClick: second });

    expect(sdkMock.mainButton.onClick).toHaveBeenCalledTimes(1);
    const subscribed = sdkMock.mainButton.onClick.mock.calls[0]![0] as () => void;
    subscribed();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('при уходе с экрана снимает обработчик и прячет кнопку', () => {
    const off = vi.fn();
    sdkMock.mainButton.onClick.mockReturnValueOnce(off);
    const { unmount } = renderHook(() => useMainButton('Далее', vi.fn()));

    unmount();

    expect(off).toHaveBeenCalledTimes(1);
    expect(sdkMock.mainButton.setParams.ifAvailable).toHaveBeenLastCalledWith({ isVisible: false, isLoaderVisible: false });
  });

  it('на старом клиенте, где кнопки нет, не подписывается и не падает', () => {
    sdkMock.mainButton.onClick.isAvailable.mockReturnValue(false);

    expect(() => renderHook(() => useMainButton('Далее', vi.fn())).unmount()).not.toThrow();
    expect(sdkMock.mainButton.onClick).not.toHaveBeenCalled();
  });
});

describe('isBackButtonVisible', () => {
  it.each(['/', '/register', '/pending', '/banned', '/reports', '/reports/', '/demand', '/profile', '/session-expired', '/not-in-telegram'])(
    'на корневом экране %s кнопки нет',
    (path) => {
      expect(isBackButtonVisible(path)).toBe(false);
    },
  );

  it.each(['/reports/new', '/reports/123', '/reports/123/paint', '/reports/123/section/EXTERIOR', '/uploads'])('на вложенном экране %s кнопка есть', (path) => {
    expect(isBackButtonVisible(path)).toBe(true);
  });
});

describe('useBackButton', () => {
  function renderAt(entries: string[], initialIndex = entries.length - 1) {
    let pathname = '';
    function Probe() {
      pathname = useLocation().pathname;
      return null;
    }
    function Harness() {
      useBackButton();
      return <Probe />;
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
        {children}
      </MemoryRouter>
    );
    const view = render(<Harness />, { wrapper });
    return { ...view, getPathname: () => pathname };
  }

  it('показывается на вложенном экране и прячется при уходе', () => {
    const { unmount } = renderAt(['/reports/123']);
    expect(sdkMock.backButton.show).toHaveBeenCalledTimes(1);

    unmount();
    expect(sdkMock.backButton.hide.ifAvailable).toHaveBeenCalled();
  });

  it('не показывается на корневом табе', () => {
    renderAt(['/reports']);
    expect(sdkMock.backButton.show).not.toHaveBeenCalled();
  });

  it('ведёт на предыдущий экран, если в истории он есть', () => {
    window.history.replaceState({ idx: 1 }, '');
    const { getPathname } = renderAt(['/reports', '/reports/123']);
    const click = sdkMock.backButton.onClick.mock.calls[0]![0] as () => void;

    act(() => click());

    expect(getPathname()).toBe('/reports');
  });

  it('при запуске по прямой ссылке без истории ведёт на корень', () => {
    const { getPathname } = renderAt(['/reports/123']);
    const click = sdkMock.backButton.onClick.mock.calls[0]![0] as () => void;

    act(() => click());

    expect(getPathname()).toBe('/');
  });
});

describe('useClosingConfirmation', () => {
  it('включает подтверждение и выключает его при уходе', () => {
    const { unmount } = renderHook(() => useClosingConfirmation(true));
    expect(sdkMock.closingBehavior.enableConfirmation.ifAvailable).toHaveBeenCalledTimes(1);

    unmount();
    expect(sdkMock.closingBehavior.disableConfirmation.ifAvailable).toHaveBeenCalledTimes(1);
  });

  it('при enabled = false ничего не делает', () => {
    renderHook(() => useClosingConfirmation(false)).unmount();
    expect(sdkMock.closingBehavior.enableConfirmation.ifAvailable).not.toHaveBeenCalled();
    expect(sdkMock.closingBehavior.disableConfirmation.ifAvailable).not.toHaveBeenCalled();
  });

  it('не выключает подтверждение, пока его требует второй источник', () => {
    const draft = renderHook(() => useClosingConfirmation(true));
    const uploads = renderHook(() => useClosingConfirmation(true));

    draft.unmount();
    expect(sdkMock.closingBehavior.disableConfirmation.ifAvailable).not.toHaveBeenCalled();

    uploads.unmount();
    expect(sdkMock.closingBehavior.disableConfirmation.ifAvailable).toHaveBeenCalledTimes(1);
  });
});

describe('useVerticalSwipeLock', () => {
  it('отключает вертикальный свайп на экране и возвращает при уходе', () => {
    const { unmount } = renderHook(() => useVerticalSwipeLock());
    expect(sdkMock.swipeBehavior.disableVertical).toHaveBeenCalledTimes(1);

    unmount();
    expect(sdkMock.swipeBehavior.enableVertical.ifAvailable).toHaveBeenCalledTimes(1);
  });

  it('на клиенте без swipeBehavior ничего не делает', () => {
    sdkMock.swipeBehavior.disableVertical.isAvailable.mockReturnValue(false);

    renderHook(() => useVerticalSwipeLock()).unmount();

    expect(sdkMock.swipeBehavior.disableVertical).not.toHaveBeenCalled();
    expect(sdkMock.swipeBehavior.enableVertical.ifAvailable).not.toHaveBeenCalled();
  });
});

describe('useHaptic', () => {
  it('сопоставляет события с вибро-откликом Telegram', () => {
    const { result } = renderHook(() => useHaptic());

    result.current.success();
    result.current.error();
    result.current.selection();

    expect(sdkMock.hapticFeedback.notificationOccurred.ifAvailable).toHaveBeenNthCalledWith(1, 'success');
    expect(sdkMock.hapticFeedback.notificationOccurred.ifAvailable).toHaveBeenNthCalledWith(2, 'error');
    expect(sdkMock.hapticFeedback.selectionChanged.ifAvailable).toHaveBeenCalledTimes(1);
  });
});

describe('requestNotificationsAccess', () => {
  it('возвращает true, когда пользователь разрешил', async () => {
    expect(await requestNotificationsAccess()).toBe(true);
  });

  it('возвращает false, когда пользователь отказал', async () => {
    sdkMock.requestWriteAccess.mockResolvedValueOnce('cancelled');
    expect(await requestNotificationsAccess()).toBe(false);
  });

  it('возвращает false на клиенте без поддержки', async () => {
    sdkMock.requestWriteAccess.isAvailable.mockReturnValue(false);
    expect(await requestNotificationsAccess()).toBe(false);
    expect(sdkMock.requestWriteAccess).not.toHaveBeenCalled();
  });
});
