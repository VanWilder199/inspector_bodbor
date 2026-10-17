import type { RouteObject } from 'react-router';
import { RootLayout } from '@/components/RootLayout';
import { TabsLayout } from '@/components/TabsLayout';
import { WizardLayout } from '@/components/WizardLayout';
import { InspectorGate } from '@/features/inspector/InspectorGate';
import { ReportLayout } from '@/features/reports/ReportLayout';
import { BannedPage } from '@/pages/BannedPage';
import { ConclusionStepPage } from '@/pages/ConclusionStepPage';
import { CreateReportPage } from '@/pages/CreateReportPage';
import { DemandPage } from '@/pages/DemandPage';
import { DoneStepPage } from '@/pages/DoneStepPage';
import { NotInTelegramPage } from '@/pages/NotInTelegramPage';
import { PendingPage } from '@/pages/PendingPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ReportHubPage } from '@/pages/ReportHubPage';
import { ReportStepPage } from '@/pages/ReportStepPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ReviewStepPage } from '@/pages/ReviewStepPage';
import { SectionStepPage } from '@/pages/SectionStepPage';
import { StartStepPage } from '@/pages/StartStepPage';
import { StubPage } from '@/pages/StubPage';
import { VideoStepPage } from '@/pages/VideoStepPage';

/** Карта роутов Mini App (PLAN_FRONTEND_MINIAPP.md, раздел 1.2): путь и заголовок заглушки. */
export const STUB_ROUTES = [
  { path: '/', title: 'Загрузка' },
  { path: '/register', title: 'Регистрация' },
  { path: '/pending', title: 'Заявка на проверке' },
  { path: '/banned', title: 'Аккаунт заблокирован' },
  { path: '/reports', title: 'Мои отчёты' },
  { path: '/reports/new', title: 'Новый отчёт' },
  { path: '/reports/:id', title: 'Отчёт' },
  { path: '/reports/:id/start', title: 'Обязательные фото' },
  { path: '/reports/:id/section/:sectionKey', title: 'Секция осмотра' },
  { path: '/reports/:id/paint', title: 'Замеры ЛКП' },
  { path: '/reports/:id/video', title: 'Видео обхода' },
  { path: '/reports/:id/conclusion', title: 'Заключение и цена' },
  { path: '/reports/:id/review', title: 'Проверка и отправка' },
  { path: '/reports/:id/done', title: 'Отправлено на модерацию' },
  { path: '/demand', title: 'Спрос' },
  { path: '/profile', title: 'Профиль' },
  { path: '/uploads', title: 'Очередь загрузок' },
  { path: '/session-expired', title: 'Сессия устарела' },
  { path: '/not-in-telegram', title: 'Откройте в Telegram' },
] as const;

/** Экраны мастера отчёта: на них отключается вертикальный свайп Telegram (раздел 3.2 плана). */
const WIZARD_PATHS: ReadonlySet<string> = new Set([
  '/reports/:id/start',
  '/reports/:id/section/:sectionKey',
  '/reports/:id/paint',
  '/reports/:id/video',
  '/reports/:id/conclusion',
  '/reports/:id/review',
]);

/** Шаги мастера с их заголовками: хаб (`/reports/:id`) открывает их как вложенные роуты (MINI-08). */
const WIZARD_STEP_TITLES: Record<string, string> = {
  start: 'Обязательные фото',
  paint: 'Замеры ЛКП',
  video: 'Видео обхода',
  conclusion: 'Заключение и цена',
  review: 'Проверка и отправка',
};

/** Экраны с настоящей логикой (MINI-05…MINI-09): ниже они собираются руками, а не из заглушек. */
const IMPLEMENTED_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/register',
  '/pending',
  '/banned',
  '/profile',
  '/reports',
  '/reports/new',
  '/reports/:id/section/:sectionKey',
  '/demand',
]);

/** Экраны, которым профиль подборщика не нужен: на них нет запросов к API, гейт не ставится. */
const OPEN_PATHS: ReadonlySet<string> = new Set(['/session-expired', '/not-in-telegram']);

function toRoute(path: string, title: string): RouteObject {
  const element = path === '/not-in-telegram' ? <NotInTelegramPage /> : <StubPage title={title} />;
  return { path, element };
}

const pendingStubs = STUB_ROUTES.filter(({ path }) => !IMPLEMENTED_PATHS.has(path));
const openStubs = pendingStubs.filter(({ path }) => OPEN_PATHS.has(path));
/** Всё остальное — экраны отчётов, спроса и очереди: только для `verified`. */
const verifiedStubs = pendingStubs.filter(({ path }) => !OPEN_PATHS.has(path));

/**
 * Пути-параметры для шагов мастера: `/reports/:id/start` → `start`, `/reports/:id/section/:sectionKey` → `section`.
 * Хаб открывает их как вложенные роуты, чтобы `useParams().id` и загрузка отчёта были общими с хабом.
 */
function wizardStepRoute(wizardPath: string): RouteObject {
  const relative = wizardPath.replace('/reports/:id/', '');
  if (relative === 'section/:sectionKey') {
    return { path: relative, element: <SectionStepPage /> };
  }
  if (relative === 'start') {
    return { path: relative, element: <StartStepPage /> };
  }
  if (relative === 'conclusion') {
    return { path: relative, element: <ConclusionStepPage /> };
  }
  if (relative === 'video') {
    return { path: relative, element: <VideoStepPage /> };
  }
  if (relative === 'review') {
    return { path: relative, element: <ReviewStepPage /> };
  }
  const title = WIZARD_STEP_TITLES[relative] ?? 'Шаг';
  return { path: relative, element: <ReportStepPage title={title} /> };
}

const wizardStepPaths = [...WIZARD_PATHS];

/*
 * Роуты в объектной форме (data router), как в админке. Роутер — именно BrowserRouter-типа, не HashRouter:
 * Telegram передаёт launch params во фрагменте URL (#tgWebAppData=...), и HashRouter перезапишет его раньше, чем SDK прочитает.
 *
 * Доступ по статусу подборщика (сценарии A–C плана, 1.1) решает `InspectorGate` на роуте, а не экран: прямая ссылка и `startapp`
 * (main.tsx превращает его в путь до создания роутера) проходят через тот же гейт. Чужой статус он уводит на «свой» экран.
 */
export const appRoutes: RouteObject[] = [
  {
    // Лейаут без пути: управляет BackButton для всех экранов, адреса от него не меняются
    element: <RootLayout />,
    children: [
      // Bootstrap: гейт, который не пускает никого, — всегда уводит на экран по статусу
      { path: '/', element: <InspectorGate allow={[]} /> },
      { element: <InspectorGate allow={['unregistered']} />, children: [{ path: '/register', element: <RegisterPage /> }] },
      { element: <InspectorGate allow={['pending']} />, children: [{ path: '/pending', element: <PendingPage /> }] },
      { element: <InspectorGate allow={['banned']} />, children: [{ path: '/banned', element: <BannedPage /> }] },
      // Профиль виден всем зарегистрированным, в том числе `pending` и `banned`; таб-бар у него только у `verified`
      {
        element: <InspectorGate allow={['pending', 'verified', 'banned']} />,
        children: [{ element: <TabsLayout />, children: [{ path: '/profile', element: <ProfilePage /> }] }],
      },
      {
        element: <InspectorGate allow={['verified']} />,
        children: [
          // Корневые табы: «Отчёты» и «Спрос» (профиль — выше, у него другой набор допустимых статусов)
          {
            element: <TabsLayout />,
            children: [
              { path: '/reports', element: <ReportsPage /> },
              { path: '/demand', element: <DemandPage /> },
            ],
          },
          // Создание отчёта — форма, а не шаг мастера: свайп вниз здесь не мешает, поэтому WizardLayout не нужен
          { path: '/reports/new', element: <CreateReportPage /> },
          // Хаб отчёта и его шаги: один маршрут-родитель с `WizardLayout` (свайп вниз не сворачивает Mini App)
          // и `ReportLayout` (общая загрузка отчёта и черновик для хаба и шагов, MINI-08).
          {
            path: '/reports/:id',
            element: <WizardLayout />,
            children: [
              {
                element: <ReportLayout />,
                children: [{ index: true, element: <ReportHubPage /> }, ...wizardStepPaths.map(wizardStepRoute)],
              },
            ],
          },
          // «Отправлено на модерацию» — вне мастера: это экран-итог, свайп здесь не трогаем
          { path: '/reports/:id/done', element: <DoneStepPage /> },
          // Остальное из «verified» — заглушки: очередь загрузок и т.п. («done» живёт под хабом отчёта)
          ...verifiedStubs
            .filter(({ path }) => !WIZARD_PATHS.has(path) && path !== '/reports/:id' && path !== '/reports/:id/done')
            .map(({ path, title }) => toRoute(path, title)),
        ],
      },
      ...openStubs.map(({ path, title }) => toRoute(path, title)),
      // Песочница компонентов — только в dev-сборке; lazy, чтобы она не попадала в основной бандл и тесты
      ...(import.meta.env.DEV
        ? [{ path: '/test', lazy: async () => ({ Component: (await import('@/pages/TestPage')).TestPage }) }]
        : []),
    ],
  },
];
