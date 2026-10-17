import { useEffect, useState } from 'react';

/**
 * Есть ли сеть. `navigator.onLine` — только подсказка (он говорит «есть интерфейс», а не «сервер доступен»),
 * поэтому он используется лишь для того, чтобы заранее погасить кнопку, а не как признак ошибки: настоящий
 * признак — сетевая ошибка от самого запроса (PLAN_FRONTEND_MINIAPP.md, раздел 3.6).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const turnOn = () => setOnline(true);
    const turnOff = () => setOnline(false);
    window.addEventListener('online', turnOn);
    window.addEventListener('offline', turnOff);
    return () => {
      window.removeEventListener('online', turnOn);
      window.removeEventListener('offline', turnOff);
    };
  }, []);

  return online;
}
