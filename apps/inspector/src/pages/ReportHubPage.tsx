import { Cell, List, Section, Title } from '@telegram-apps/telegram-ui';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import { ReportView } from '@podbor/ui';
import { FallbackMainButton } from '@/components/FallbackMainButton';
import { carTitleFromAvbyUrl } from '@/features/reports/carTitle';
import { REPORT_STATUS_LABELS } from '@/features/reports/reportStatus';
import type { ReportContext } from '@/features/reports/ReportLayout';
import { toReportHeader, toReportViewData } from '@/features/reports/reportViewData';
import { nextIncompleteStep, stepProgress, wizardSteps } from '@/features/reports/wizardSteps';
import { avbyUrlOf } from '@/features/reports/useReport';
import { useInspector } from '@/features/inspector/useInspector';
import { useMainButton } from '@/telegram/useMainButton';

const CONTINUE_TEXT = 'Продолжить';
const HINT_COLOR = 'var(--tgui--hint_color)';
const PROGRESS_LABELS = { empty: 'Не начато', partial: 'Начато', done: 'Готово' } as const;

function RevisionBanner() {
  return (
    <Section header="Отчёт вернули на доработку" footer="Причина правок придёт в сообщении от бота: через API она пока недоступна.">
      <p style={{ margin: 0 }}>Исправьте замечания и отправьте отчёт снова.</p>
    </Section>
  );
}

/**
 * Хаб редактируемого отчёта (`draft` / `revision_required`, раздел 2.8): шапка со статусом, список шагов
 * с прогрессом и кнопка «Продолжить». Отчёт и черновик приходят из `ReportLayout` — переход на шаг и обратно
 * не перезагружает их заново.
 */
function EditableHub({ report, draft }: { report: ReportContext['report']; draft: ReportContext['draft'] }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const nextStep = nextIncompleteStep(report, draft);

  useMainButton(CONTINUE_TEXT, () => navigate(`/reports/${id}/${nextStep.path}`));

  return (
    <>
      <h2 style={{ margin: '16px 0 8px', fontSize: 15, color: HINT_COLOR }}>Шаги осмотра</h2>
      <List>
        <Section>
          {wizardSteps(report).map((step) => {
            const progress = stepProgress(step, report, draft);
            return (
              <Cell key={step.key} subtitle={progress.detail} after={PROGRESS_LABELS[progress.state]} onClick={() => navigate(`/reports/${id}/${step.path}`)}>
                {step.title}
              </Cell>
            );
          })}
        </Section>
      </List>
      <div style={{ padding: '12px 0' }}>
        <FallbackMainButton text={CONTINUE_TEXT} enabled />
      </div>
    </>
  );
}

/**
 * Хаб отчёта (сценарий E плана, раздел 1.2). Редактируемый отчёт показывает шаги и кнопку «Продолжить»;
 * нередактируемый (на модерации, опубликован) — отчёт целиком через общий `ReportView`, кнопка скрыта (раздел 3.2).
 */
export function ReportHubPage() {
  const { id = '' } = useParams();
  const { report, draft, editable } = useOutletContext<ReportContext>();
  const { data: inspector } = useInspector();
  const avbyUrl = avbyUrlOf(id);
  const title = avbyUrl ? carTitleFromAvbyUrl(avbyUrl) : 'Автомобиль';

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        {title}
      </Title>
      <p style={{ margin: '4px 0 16px', color: HINT_COLOR }}>
        {REPORT_STATUS_LABELS[report.status]}
        {editable ? '' : ' · только чтение'}
      </p>

      {report.status === 'revision_required' && <RevisionBanner />}

      {editable ? (
        <EditableHub report={report} draft={draft} />
      ) : (
        <ReportView report={toReportViewData(report, draft)} header={toReportHeader(avbyUrl, inspector?.fullName)} showPrice />
      )}
    </main>
  );
}
