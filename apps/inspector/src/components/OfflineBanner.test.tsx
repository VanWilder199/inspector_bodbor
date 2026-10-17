import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from './OfflineBanner';
import { useNetworkState } from '@/network/networkStore';

beforeEach(() => {
  useNetworkState.setState({ state: 'online' });
});

describe('OfflineBanner', () => {
  it('в online не рендерится', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offline: «Нет соединения»', () => {
    useNetworkState.getState().setInterfaceOffline();
    render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('Нет соединения');
  });

  it('degraded: «Сервер недоступен»', () => {
    useNetworkState.getState().setDegraded();
    render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('Сервер недоступен');
  });
});