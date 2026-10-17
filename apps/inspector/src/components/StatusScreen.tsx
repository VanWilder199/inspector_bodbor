import { Spinner, Text, Title } from '@telegram-apps/telegram-ui';
import type { ReactNode } from 'react';

interface StatusScreenProps {
  title: string;
  description?: ReactNode;
  /** Кнопка или другое действие под текстом. */
  action?: ReactNode;
  /** Крутилка над заголовком (экран загрузки). */
  loading?: boolean;
}

/** Экран на всю страницу с заголовком и пояснением: загрузка, ошибка, «заявка на проверке», «аккаунт заблокирован». */
export function StatusScreen({ title, description, action, loading = false }: StatusScreenProps) {
  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        textAlign: 'center',
      }}
    >
      {loading && <Spinner size="l" />}
      <Title level="2" weight="2" Component="h1">
        {title}
      </Title>
      {description && <Text>{description}</Text>}
      {action}
    </main>
  );
}
