/*
 * Экран проверки и отправки (PLAN_FRONTEND_MINIAPP.md, раздел 1.1 сценарий G, задача MINI-17).
 *
 * Перед `submit` — обязательный порядок: flush всех грязных сохранений → дождаться пустой очереди загрузок →
 * перечитать `GET` отчёта → построить чек-лист по серверным данным (не по локальному черновику). Так подборщик видит
 * ровно то, что уйдёт на модерацию, и чек-лист не расходится с `409 REPORT_INCOMPLETE`.
 *
 * Повтор `submit` при сетевой ошибке безопасен: второй вызов после успешного даёт `409 REPORT_NOT_EDITABLE`,
 * который после перечитывания статуса трактуется как успех.
 */

import { Button, Cell, List, Section, Spinner, Text, Title } from '@telegram-apps/telegram-ui';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import { ApiError } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import { ReportView } from '@podbor/ui';
import type { ReportContext } from '@/features/reports/ReportLayout';
import { useReportDraft } from '@/features/reports/reportDraftStore';
import { toReportHeader, toReportViewData } from '@/features/reports/reportViewData';
import { buildReviewChecklist } from '@/features/reports/reviewChecklist';
import { avbyUrlOf } from '@/features/reports/useReport';
import { useInspector } from '@/features/inspector/useInspector';
import { useHasPendingUploads } from '@/media/uploadQueue';
import { useMainButton } from '@/telegram/useMainButton';

const HINT_COLOR = 'var(--tgui--hint_color)';
const GOOD_COLOR = 'var(--tgui--positive_text_color)';

export function ReviewStepPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { report, editable, refetch } = useOutletContext<ReportContext>();
  const draft = useReportDraft((state) => state.draft);
  const hasPendingUploads = useHasPendingUploads();
  const { data: inspector } = useInspector();

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Перед показом — flush черновиков и ожидание пустой очереди, затем перечитывание отчёта
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready || !editable) return;
    const prepare = async () => {
      setRefreshing(true);
      try {
        // ожидаем, пока очередь загрузок опустеет (не более разумного времени)
        let waited = 0;
        while (hasPendingUploads && waited < 10_000) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          waited += 250;
        }
        await refetch();
        setReady(true);
      } finally {
        setRefreshing(false);
      }
    };
    void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  const freshReport = useMemo(() => report, [report, ready]);

  const checklist = useMemo(() => (freshReport ? buildReviewChecklist(freshReport) : null), [freshReport]);
  const preview = freshReport
    ? { data: toReportViewData(freshReport, draft), header: toReportHeader(avbyUrlOf(id), inspector?.fullName) }
    : null;

  const canSubmit = editable && ready && checklist?.ready && !hasPendingUploads;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await inspectorApi.submit(id);
      navigate(`/reports/${id}/done`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.errorCode === 'REPORT_NOT_EDITABLE') {
        // Повтор после успешного submit: отчёт уже на модерации — это успех
        await refetch();
        navigate(`/reports/${id}/done`, { replace: true });
        return;
      }
      setError(e instanceof Error ? e.message : 'Не удалось отправить отчёт');
    }
  };

  useMainButton('Отправить на модерацию', submit, { enabled: canSubmit });

  if (!editable) {
    return (
      <main style={{ padding: 16 }}>
        <Title level="2" weight="2" Component="h1">
          Проверка и отправка
        </Title>
        <Text style={{ display: 'block', color: HINT_COLOR }}>Отчёт уже отправлен или доступен только для чтения.</Text>
      </main>
    );
  }

  if (refreshing || !checklist || !preview) {
    return (
      <main style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spinner size="l" />
      </main>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Проверка и отправка
      </Title>

      {hasPendingUploads && (
        <Text style={{ display: 'block', color: HINT_COLOR }}>Дождитесь окончания загрузок — отправка станет доступна.</Text>
      )}
      {error && <Text style={{ display: 'block', color: 'var(--tgui--destructive_text_color)' }}>{error}</Text>}

      <List>
        <Section header="Готовность">
          {checklist.items.map((item) => (
            <Cell key={item.key} after={item.done ? '✓' : '—'} subtitle={item.detail} multiline>
              <Text style={{ color: item.done ? GOOD_COLOR : undefined }}>{item.label}</Text>
            </Cell>
          ))}
          {checklist.warnings.map((item) => (
            <Cell key={item.key} after="!" subtitle={item.detail} multiline>
              {item.label}
            </Cell>
          ))}
        </Section>
      </List>

      <Text style={{ display: 'block', marginTop: 12, color: HINT_COLOR }}>Превью отчёта:</Text>
      <div style={{ marginTop: 8 }}>
        <ReportView report={preview.data} header={preview.header} showPrice />
      </div>

      <div style={{ padding: '12px 0' }}>
        <Button size="m" stretched disabled={!canSubmit} onClick={() => void submit()}>
          Отправить на модерацию
        </Button>
      </div>
    </main>
  );
}