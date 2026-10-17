import { Button, Cell, List, Section, Title } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router';
import { homePathFor, STATUS_LABELS, stateOf } from '@/features/inspector/inspectorState';
import { useInspector } from '@/features/inspector/useInspector';

/**
 * Профиль подборщика (`InspectorDto`). Редактировать его нельзя: эндпоинта нет. Гейт гарантирует, что подборщик зарегистрирован.
 * У подтверждённого выход отсюда — таб-бар. У `pending` и `banned` его нет, поэтому им остаётся кнопка на экран статуса.
 */
export function ProfilePage() {
  const { data: inspector } = useInspector();
  const navigate = useNavigate();
  const state = stateOf(inspector ?? null);

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Профиль
      </Title>
      {inspector && (
        <List>
          <Section>
            <Cell subhead="ФИО">{inspector.fullName}</Cell>
            <Cell subhead="Телефон">{inspector.phone}</Cell>
            <Cell subhead="Email">{inspector.email}</Cell>
            <Cell subhead="Статус">{STATUS_LABELS[inspector.status]}</Cell>
          </Section>
        </List>
      )}
      {state !== 'verified' && state !== 'unregistered' && (
        <Button size="m" mode="bezeled" stretched style={{ marginTop: 16 }} onClick={() => navigate(homePathFor(state), { replace: true })}>
          К статусу аккаунта
        </Button>
      )}
    </main>
  );
}
