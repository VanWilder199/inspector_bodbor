import { QueryClientProvider } from '@tanstack/react-query';
import { isTMA } from '@telegram-apps/sdk-react';
import '@telegram-apps/telegram-ui/dist/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api/queryClient';
import { setupQueryPersist } from './api/queryPersist';
import { setApiSession } from './api/session';
import { NotInTelegramPage } from './pages/NotInTelegramPage';
import { initTelegram } from './telegram/init';
import { resolveInitialPath } from './telegram/launchParams';
import { TelegramAppRoot } from './telegram/TelegramAppRoot';
import './index.css';

const queryClient = createQueryClient();
// Кеш профиля и открытых отчётов переживает закрытие Mini App (MINI-21)
setupQueryPersist(queryClient);

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!);

  // 'complete' — не просто «есть launch params», а настоящий ответ клиента Telegram: после перезагрузки вкладки
  // в dev launch params остаются в sessionStorage, а мок postMessage уже потерян
  let inTelegram = await isTMA('complete');
  if (!inTelegram && import.meta.env.DEV) {
    // Мок-окружение только в dev. Под `import.meta.env.DEV` Vite вырезает этот импорт из prod-сборки целиком
    const { installMockTelegramEnv } = await import('./telegram/mock');
    installMockTelegramEnv();
    inTelegram = true;
  }

  if (!inTelegram) {
    root.render(
      <StrictMode>
        <TelegramAppRoot platform="base">
          <NotInTelegramPage />
        </TelegramAppRoot>
      </StrictMode>,
    );
    return;
  }

  const env = initTelegram();
  // Клиент API берёт отсюда initData для заголовка `X-Telegram-Data`, баннер сессии — срок его жизни
  setApiSession({ rawInitData: env.rawInitData, expiresAt: env.expiresAt });

  // Брошенные чистые черновики (старше 30 дней) — на старте; грязные не трогаются никогда (раздел 3.3, п. 8)
  const { pruneStaleDrafts } = await import('./features/reports/draft');
  pruneStaleDrafts();

  // Очередь загрузок: восстановить недогруженные файлы из IndexedDB и продолжить докачку (MINI-23)
  const { hydrateUploadQueue } = await import('./media/uploadQueue');
  void hydrateUploadQueue();

  // Моки API (MSW) — только в dev и только с флагом (`npm run dev:mocks`): под `import.meta.env.DEV` Vite вырезает
  // этот импорт из prod-сборки целиком. Запускаем до первого рендера: первые запросы уже должны идти через моки
  if (import.meta.env.DEV && import.meta.env.VITE_API_MOCKS === '1') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  // `startapp` превращается в начальный роут до создания роутера; адрес переписывается без записи в историю
  const initialPath = resolveInitialPath(window.location.pathname, env.startParam);
  if (initialPath) {
    window.history.replaceState(window.history.state, '', initialPath + window.location.search + window.location.hash);
  }

  // App создаёт роутер при загрузке модуля, поэтому его импортируем только после того, как адрес выставлен
  const { default: App } = await import('./App');
  root.render(
    <StrictMode>
      <TelegramAppRoot platform={env.platform}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </TelegramAppRoot>
    </StrictMode>,
  );
}

void bootstrap();
