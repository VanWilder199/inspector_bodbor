/*
 * Системный баннер оффлайна (MINI-21). Показывается на уровне приложения (не только в очереди загрузок, как MINI-11).
 * Различает: нет интерфейса (offline) и интерфейс есть, но сервер недоступен (degraded). В обоих случаях сообщает,
 * что правки и загрузки копятся локально и уйдут автоматически при появлении сети.
 */

import { useNetworkState } from '@/network/networkStore';
import { useHasPendingUploads } from '@/media/uploadQueue';

const BANNER_BG = 'var(--tgui--bg_color)';
const TEXT_COLOR = 'var(--tgui--text_color)';
const BADGE_COLOR = 'var(--tgui--destructive_text_color)';

export function OfflineBanner() {
  const state = useNetworkState((store) => store.state);
  const hasPendingUploads = useHasPendingUploads();

  if (state === 'online') return null;

  const offline = state === 'offline';
  const title = offline ? 'Нет соединения' : 'Сервер недоступен';
  const detail = hasPendingUploads
    ? 'Загрузки поставлены на паузу и продолжат сами.'
    : 'Изменения сохраняются на устройстве и уйдут автоматически.';

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        padding: '8px 16px',
        background: BANNER_BG,
        borderBottom: '1px solid var(--tgui--separator_common)',
      }}
    >
      <span style={{ fontWeight: 600, color: BADGE_COLOR }}>{title}. </span>
      <span style={{ color: TEXT_COLOR }}>{detail}</span>
    </div>
  );
}