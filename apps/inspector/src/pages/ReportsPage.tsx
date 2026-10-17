import { Button, Cell, Chip, List, Placeholder, Section, Title } from '@telegram-apps/telegram-ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { REPORT_FILTERS, REPORT_STATUS_LABELS, type ReportFilter } from '@/features/reports/reportStatus';
import { useMyReports, type MyReportRow } from '@/features/reports/useMyReports';

function formatCreatedAt(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Подсказка под названием: что происходит с отчётом, если статус не показать. */
function describe(row: MyReportRow): string | undefined {
  if (row.status === 'deleted') return 'Удалён модератором. При следующем открытии пропадёт из списка';
  if (row.isError) return 'Не удалось загрузить статус';
  if (row.status === undefined) return 'Загрузка…';
  return undefined;
}

/**
 * «Мои отчёты» (сценарий I). Данные даёт `useMyReports`: сейчас это локальный индекс, позже серверный список (MINI-19).
 * Экран про источник не знает, поэтому при замене меняется только хук.
 */
export function ReportsPage() {
  const navigate = useNavigate();
  const { rows, retryFailed } = useMyReports();
  const [filter, setFilter] = useState<ReportFilter>('all');

  const visibleRows = rows.filter((row) => filter === 'all' || row.status === filter);

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Мои отчёты
      </Title>
      <Button size="l" stretched style={{ margin: '12px 0' }} onClick={() => navigate('/reports/new')}>
        Новый отчёт
      </Button>

      {rows.length === 0 ? (
        <Placeholder header="Создайте первый отчёт" description="Вставьте ссылку на объявление av.by, и приложение подготовит отчёт для осмотра." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
            {REPORT_FILTERS.map(({ key, label }) => (
              <Chip key={key} Component="button" type="button" mode={filter === key ? 'mono' : 'outline'} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label}
              </Chip>
            ))}
          </div>

          {rows.some((row) => row.isError) && (
            <Button size="m" mode="bezeled" stretched style={{ margin: '8px 0' }} onClick={retryFailed}>
              Повторить загрузку статусов
            </Button>
          )}

          {visibleRows.length === 0 ? (
            <Placeholder header="Нет отчётов с таким статусом" />
          ) : (
            <List>
              <Section>
                {visibleRows.map((row) => (
                  <Cell
                    key={row.id}
                    subtitle={formatCreatedAt(row.createdAt)}
                    description={describe(row)}
                    after={row.status ? REPORT_STATUS_LABELS[row.status] : undefined}
                    multiline
                    // Удалённый отчёт открывать некуда: сервер ответил бы 404
                    onClick={row.status === 'deleted' ? undefined : () => navigate(`/reports/${row.id}`)}
                  >
                    {row.title}
                  </Cell>
                ))}
              </Section>
            </List>
          )}
        </>
      )}
    </main>
  );
}
