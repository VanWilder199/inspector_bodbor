import { Tabbar } from '@telegram-apps/telegram-ui';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { stateOf } from '@/features/inspector/inspectorState';
import { useInspector } from '@/features/inspector/useInspector';
import { DemandTabIcon, ProfileTabIcon, ReportsTabIcon } from './tabIcons';

const TABS = [
  { path: '/reports', text: 'Отчёты', Icon: ReportsTabIcon },
  { path: '/demand', text: 'Спрос', Icon: DemandTabIcon },
  { path: '/profile', text: 'Профиль', Icon: ProfileTabIcon },
] as const;

/** Место под таб-баром (он закреплён внизу и иначе перекрыл бы конец списка) и под «чёлку» iPhone. */
const TABBAR_SPACE = 'calc(72px + env(safe-area-inset-bottom))';

/**
 * Лейаут корневых табов: «Отчёты», «Спрос», «Профиль». Таб-бар только у подтверждённого подборщика: остальным вкладки «Отчёты» и
 * «Спрос» недоступны (гейт отправит обратно), а профиль у `pending` и `banned` открывается без навигации. В мастере и на экранах статусов
 * этого лейаута нет. BackButton на табах скрыт в `useBackButton`.
 */
export function TabsLayout() {
  const { data } = useInspector();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const showTabs = stateOf(data ?? null) === 'verified';

  return (
    <>
      <div style={showTabs ? { paddingBottom: TABBAR_SPACE } : undefined}>
        <Outlet />
      </div>
      {showTabs && (
        <Tabbar>
          {TABS.map(({ path, text, Icon }) => (
            // replace: переключение вкладок не копит историю, «назад» с корневого таба вести некуда
            <Tabbar.Item key={path} text={text} selected={pathname === path} onClick={() => navigate(path, { replace: true })}>
              <Icon />
            </Tabbar.Item>
          ))}
        </Tabbar>
      )}
    </>
  );
}
