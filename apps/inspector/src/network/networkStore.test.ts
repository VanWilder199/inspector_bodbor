import { beforeEach, describe, expect, it } from 'vitest';
import { useNetworkState } from './networkStore';

beforeEach(() => {
  // Сброс к online для изоляции тестов
  useNetworkState.setState({ state: 'online' });
});

describe('networkStore', () => {
  it('по умолчанию online', () => {
    expect(useNetworkState.getState().state).toBe('online');
  });

  it('offline-событие интерфейса → offline', () => {
    useNetworkState.getState().setInterfaceOffline();
    expect(useNetworkState.getState().state).toBe('offline');
  });

  it('сетевая ошибка запроса из online → degraded', () => {
    useNetworkState.getState().setDegraded();
    expect(useNetworkState.getState().state).toBe('degraded');
  });

  it('сетевая ошибка из offline не понижает degraded (остаётся offline)', () => {
    useNetworkState.getState().setInterfaceOffline();
    useNetworkState.getState().setDegraded();
    expect(useNetworkState.getState().state).toBe('offline');
  });

  it('успешный запрос → online', () => {
    useNetworkState.getState().setDegraded();
    useNetworkState.getState().setOnline();
    expect(useNetworkState.getState().state).toBe('online');
  });
});