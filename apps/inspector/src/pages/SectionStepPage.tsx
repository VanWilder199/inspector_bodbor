/*
 * Шаг секции осмотра (PLAN_FRONTEND_MINIAPP.md, сценарий E, раздел 1.2): инструкция, чеклист пунктов и итог секции.
 *
 * Экран разделён на «править» и «читать»: у отчёта на модерации или в продаже шаги открываются только на чтение,
 * и тогда ни полей, ни `MainButton` быть не должно. Вызывать хуки условно нельзя, поэтому решает внешний компонент.
 *
 * Справочник пунктов временный, на клиенте (`catalog/checklist.ts`): эндпоинта справочника на бэкенде нет (BE-5).
 * Порядок пунктов берём из справочника, а не из ответа сервера: в `ReportDto` порядок `items` не гарантирован,
 * а секция уходит в `PUT` полной заменой — значит порядок должен быть стабильным.
 */

import { Button, Cell, List, Section, Spinner, Text, Textarea, Title } from '@telegram-apps/telegram-ui';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { SECTION_LABELS, STATUS_LABELS } from '@podbor/ui';
import type { ItemStatus, SectionKey } from '@/api/types';
import { StatusScreen } from '@/components/StatusScreen';
import { isSectionKey, orderedSectionItems, sectionInstruction } from '@/catalog/checklist';
import { useReportDraft } from '@/features/reports/reportDraftStore';
import { useSectionAutosave, type SaveState } from '@/features/reports/useSectionAutosave';
import type { ReportContext } from '@/features/reports/ReportLayout';
import { nextStepPath } from '@/features/reports/wizardSteps';
import { useAppActivated } from '@/telegram/useAppActivated';
import { useHaptic } from '@/telegram/useHaptic';
import { useMainButton } from '@/telegram/useMainButton';

const HINT_COLOR = 'var(--tgui--hint_color)';
const ERROR_COLOR = 'var(--tgui--destructive_text_color)';
const STATUSES: readonly ItemStatus[] = ['OK', 'WARN', 'BAD'];

const SAVE_LABELS: Record<SaveState, string> = {
  saving: 'Сохранение…',
  saved: 'Сохранено',
  local: 'Сохранено на устройстве',
  error: 'Не удалось сохранить. Проверьте связь',
};

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <Text role="status" style={{ display: 'block', margin: '4px 0 12px', color: state === 'error' ? ERROR_COLOR : HINT_COLOR }}>
      {SAVE_LABELS[state]}
    </Text>
  );
}

/**
 * Пункт чеклиста: оценка OK/WARN/BAD и комментарий. Комментарий обязателен на `WARN`/`BAD` — так требует задача,
 * бэкенд этого не проверяет (раздел 2.6). Пока такой комментарий пуст, секция на сервер не уходит (`sectionSave.ts`).
 */
function ItemRow({
  label,
  status,
  comment,
  showCommentError,
  onChange,
  onComment,
}: {
  label: string;
  status: ItemStatus | undefined;
  comment: string | undefined;
  showCommentError: boolean;
  onChange: (status: ItemStatus) => void;
  onComment: (comment: string) => void;
}) {
  const needsComment = status === 'WARN' || status === 'BAD';
  return (
    <Cell multiline subtitle={showCommentError ? <span style={{ color: ERROR_COLOR }}>Напишите комментарий к замечанию</span> : undefined}>
      <div style={{ padding: '4px 0' }}>
        <Text weight="2">{label}</Text>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
          {STATUSES.map((value) => (
            <Button
              key={value}
              size="s"
              mode={status === value ? 'filled' : 'bezeled'}
              aria-pressed={status === value}
              aria-label={`${label}: ${STATUS_LABELS[value]}`}
              onClick={() => onChange(value)}
            >
              {STATUS_LABELS[value]}
            </Button>
          ))}
        </div>
        {needsComment && (
          <Textarea
            aria-label={`${label}: комментарий`}
            placeholder="Что именно не так"
            value={comment ?? ''}
            onChange={(event) => onComment(event.target.value)}
          />
        )}
      </div>
    </Cell>
  );
}

/** Редактируемая секция: автосохранение, `MainButton` «Далее», кнопки выбора оценки. */
function EditableSection({ reportId, sectionKey }: { reportId: string; sectionKey: SectionKey }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { editable, refetch } = useOutletContext<ReportContext>();
  const draft = useReportDraft((state) => state.draft);
  const setItem = useReportDraft((state) => state.setItem);
  const setSummary = useReportDraft((state) => state.setSummary);
  const markSaved = useReportDraft((state) => state.markSaved);
  const discard = useReportDraft((state) => state.discard);
  const haptic = useHaptic();

  const section = draft?.sections[sectionKey];
  const items = useMemo(() => orderedSectionItems(sectionKey, section?.items ?? {}), [sectionKey, section]);
  const orderedKeys = useMemo(() => items.map((item) => item.itemKey), [items]);
  const { state, blockers, flush } = useSectionAutosave(reportId, sectionKey, section, {
    editable,
    orderedKeys,
    markSaved,
    discard,
    refetchReport: refetch,
  });

  // Вибро-отклик на смену индикатора: «сохранено» и «ошибку» подборщик чувствует, не глядя на экран
  const previousState = useRef(state);
  useEffect(() => {
    if (previousState.current !== state) {
      if (state === 'saved') haptic.success();
      if (state === 'error') haptic.error();
      previousState.current = state;
    }
  }, [state, haptic]);

  // Возврат в приложение после сворачивания: несохранённое должно уйти
  useAppActivated(() => void flush());

  // Уход с шага любым способом (BackButton ведёт по адресу, минуя наш обработчик) запускает отправку
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  useMainButton('Далее', () => {
    void flush().then(() => {
      const next = nextStepPath(pathname);
      navigate(next ? `/reports/${reportId}/${next}` : `/reports/${reportId}`);
    });
  });

  const showCommentErrors = state === 'local' && blockers.missingComment.length > 0;

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        {SECTION_LABELS[sectionKey]}
      </Title>
      <SaveIndicator state={state} />
      <Text style={{ display: 'block', marginBottom: 12 }}>{sectionInstruction(sectionKey)}</Text>

      <List>
        <Section header="Пункты осмотра">
          {items.map((item) => (
            <ItemRow
              key={item.itemKey}
              label={item.label}
              status={section?.items[item.itemKey]?.status}
              comment={section?.items[item.itemKey]?.comment}
              showCommentError={showCommentErrors && blockers.missingComment.includes(item.itemKey)}
              onChange={(value) => {
                haptic.selection();
                setItem(sectionKey, item.itemKey, { status: value });
              }}
              onComment={(comment) => setItem(sectionKey, item.itemKey, { comment })}
            />
          ))}
        </Section>

        <Section header="Итог секции" footer="Без итога секцию нельзя сохранить на сервере — правки останутся на устройстве.">
          <Textarea aria-label="Итог секции" placeholder="Коротко: что в порядке, что нет" value={section?.summary ?? ''} onChange={(event) => setSummary(sectionKey, event.target.value)} />
        </Section>
      </List>

      <Text style={{ display: 'block', marginTop: 12, color: HINT_COLOR }}>
        {blockers.noRatedItems ? 'Отметьте хотя бы один пункт — на сервер уходят только оценённые пункты.' : 'Изменения сохраняются автоматически.'}
      </Text>
    </main>
  );
}

/** Секция отчёта, который править нельзя: те же данные, но без полей и без основной кнопки. */
function ReadOnlySection({ sectionKey }: { sectionKey: SectionKey }) {
  const draft = useReportDraft((state) => state.draft);
  const section = draft?.sections[sectionKey];
  const items = useMemo(() => orderedSectionItems(sectionKey, section?.items ?? {}), [sectionKey, section]);

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        {SECTION_LABELS[sectionKey]}
      </Title>
      <Text style={{ display: 'block', marginBottom: 12, color: HINT_COLOR }}>
        Отчёт сейчас только для чтения: правки недоступны.
      </Text>
      <List>
        <Section header="Пункты осмотра">
          {items.map((item) => {
            const itemDraft = section?.items[item.itemKey];
            return <Cell key={item.itemKey} after={itemDraft?.status ? STATUS_LABELS[itemDraft.status] : '—'} subtitle={itemDraft?.comment ?? undefined} multiline>{item.label}</Cell>;
          })}
        </Section>
        {section?.summary ? (
          <Section header="Итог секции">
            <Cell multiline>{section.summary}</Cell>
          </Section>
        ) : null}
      </List>
    </main>
  );
}

export function SectionStepPage() {
  const { id = '', sectionKey = '' } = useParams();
  const { report, draft, editable } = useOutletContext<ReportContext>();

  if (!isSectionKey(sectionKey) || !report.sections.some((section) => section.sectionKey === sectionKey)) {
    return <StatusScreen title="Секция не найдена" description="Такого раздела в отчёте нет. Вернитесь к списку шагов." />;
  }
  if (!draft) {
    // Черновик собирается из ответа сервера в эффекте `useReport`: между ответом и сборкой проходит один рендер
    return (
      <main style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Spinner size="l" />
      </main>
    );
  }
  return editable ? <EditableSection reportId={id} sectionKey={sectionKey} /> : <ReadOnlySection sectionKey={sectionKey} />;
}
