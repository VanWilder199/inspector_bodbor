import { backButton } from '@telegram-apps/sdk-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { previousStepPath, stepPathFromPathname, WIZARD_STEP_PATHS } from '@/features/reports/wizardSteps';

/**
 * Экраны без «назад»: корневые табы (`/reports`, `/demand`, `/profile`, `/pending`) из плана (раздел 3.2)
 * и экраны, с которых вести некуда: bootstrap, регистрация, бан, истёкшая сессия, «откройте в Telegram».
 */
const NO_BACK_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/register',
  '/pending',
  '/banned',
  '/reports',
  '/demand',
  '/profile',
  '/session-expired',
  '/not-in-telegram',
]);

/** Куда вести «назад», когда в истории приложения предыдущего экрана нет (запуск по прямой ссылке). */
const FALLBACK_PATH = '/';

export function isBackButtonVisible(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return !NO_BACK_PATHS.has(normalized);
}

/** Есть ли в истории этого приложения экран, на который можно вернуться (`idx` кладёт сам react-router). */
function hasPreviousEntry(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return (state?.idx ?? 0) > 0;
}

/**
 * Показывает BackButton Telegram везде, кроме корневых экранов, и ведёт на шаг назад.
 * Вызывается один раз в корневом лейауте. В мастере отчёта «назад» ведёт на предыдущий шаг, а не по истории браузера
 * (раздел 3.2): подборщик на шаге секции, вернувшись по истории, попал бы на предыдущую секцию, но не на хаб отчёта,
 * если пришёл прямой ссылкой. Шаг назад считается по адресу (`wizardSteps.ts`).
 */
export function useBackButton(): void {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const visible = isBackButtonVisible(pathname);

  useEffect(() => {
    if (!visible || !backButton.show.isAvailable()) {
      return;
    }
    backButton.show();
    return () => {
      backButton.hide.ifAvailable();
    };
  }, [visible]);

  useEffect(() => {
    if (!backButton.onClick.isAvailable()) {
      return;
    }
    return backButton.onClick(() => {
      // Мастер: предыдущий шаг, а с первого шага — на хаб отчёта. Перехватываем только настоящие шаги мастера:
      // на самом хабе и на форме создания отчёта «назад» обычный, по истории
      const stepPath = stepPathFromPathname(pathname);
      if (stepPath && WIZARD_STEP_PATHS.includes(stepPath)) {
        const reportId = /^\/reports\/([^/]+)/.exec(pathname)?.[1] ?? '';
        const previous = previousStepPath(pathname);
        navigate(previous ? `/reports/${reportId}/${previous}` : `/reports/${reportId}`, { replace: true });
        return;
      }
      if (hasPreviousEntry()) {
        navigate(-1);
      } else {
        navigate(FALLBACK_PATH, { replace: true });
      }
    });
  }, [navigate, pathname]);
}
