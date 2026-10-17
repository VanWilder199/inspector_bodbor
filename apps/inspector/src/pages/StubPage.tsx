import { useLocation, useParams } from 'react-router';

interface StubPageProps {
  title: string;
}

/** Заглушка экрана: реальная логика придёт в MINI-02 и следующих задачах. */
export function StubPage({ title }: StubPageProps) {
  const { pathname } = useLocation();
  const params = useParams();

  return (
    <main style={{ padding: 16 }}>
      <h1>{title}</h1>
      <p>Экран в разработке: {pathname}</p>
      {Object.keys(params).length > 0 && <pre>{JSON.stringify(params)}</pre>}
    </main>
  );
}
