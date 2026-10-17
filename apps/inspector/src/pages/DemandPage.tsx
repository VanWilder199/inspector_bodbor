import { Placeholder, Title } from '@telegram-apps/telegram-ui';

/** Спрос: ждёт `GET /inspector/demand` (BE-15 / B-28). Полноценный экран — MINI-20, запросов к несуществующему эндпоинту здесь нет. */
export function DemandPage() {
  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Спрос
      </Title>
      <Placeholder header="Скоро" description="Здесь появятся автомобили, на отчёты по которым ждут покупатели." />
    </main>
  );
}
