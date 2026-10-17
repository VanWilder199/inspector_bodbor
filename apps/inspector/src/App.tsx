import { createBrowserRouter, RouterProvider } from 'react-router';
import { setUnauthorizedHandler } from './api/client';
import { appRoutes } from './routes';

// Роутер создаётся один раз на модуль: `createBrowserRouter` сразу подписывается на popstate,
// и второй экземпляр (например, от двойного рендера StrictMode) обрабатывал бы переходы дважды.
const router = createBrowserRouter(appRoutes);

// Любой 401 от API — сессия Telegram невалидна: уводим на экран «сессия устарела».
// Повторного перехода нет, если мы уже там: параллельные запросы получат 401 пачкой.
setUnauthorizedHandler(() => {
  if (router.state.location.pathname !== '/session-expired') {
    void router.navigate('/session-expired', { replace: true });
  }
});

export default function App() {
  return <RouterProvider router={router} />;
}
