import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '@/routes';

/**
 * Рисует все роуты приложения с адреса `path`. Компоненты telegram-ui без `AppRoot` не работают (контекст платформы),
 * поэтому он стоит снаружи, как в `main.tsx`. Повторов запросов нет: ошибка видна сразу, а не после backoff.
 */
export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <AppRoot appearance="light" platform="base">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppRoot>,
  );
  return { router, queryClient };
}
