/*
 * Слушатель событий интерфейса (online/offline) для networkStore (MINI-21).
 * Отдельно от стора, чтобы монтировать один раз в корне приложения.
 */

import { useEffect, useRef } from 'react';
import { useNetworkState } from './networkStore';

export function useNetworkInterface() {
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const onOnline = () => useNetworkState.getState().setOnline();
    const onOffline = () => useNetworkState.getState().setInterfaceOffline();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // Начальное состояние — по текущему navigator.onLine
    if (!navigator.onLine) useNetworkState.getState().setInterfaceOffline();
    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
}