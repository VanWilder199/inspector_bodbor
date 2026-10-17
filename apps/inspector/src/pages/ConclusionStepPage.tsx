/*
 * Шаг «Заключение и цена» (PLAN_FRONTEND_MINIAPP.md, раздел 2.8, задача MINI-16).
 *
 * Два поля — итоговое заключение и цена в BYN — сохраняются на сервер только когда заполнены оба: на бэкенде оба
 * обязательны (`@NotBlank`, `@NotNull`), частичное сохранение не поддерживается до BE-14. Пока одно из полей пусто,
 * правка остаётся в черновике со статусом «Сохранено на устройстве» (это не ошибка).
 *
 * `priceByn` в контракте — в копейках; конвертация в обе стороны живёт в одном месте (`price.ts`).
 */

import { Button, Cell, List, Section, Text, Textarea, Title } from '@telegram-apps/telegram-ui';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { inspectorApi } from '@/api/inspector';
import type { ReportContext } from '@/features/reports/ReportLayout';
import { useReportDraft } from '@/features/reports/reportDraftStore';
import { nextStepPath } from '@/features/reports/wizardSteps';
import { bynToKopecks, kopecksToByn, priceError } from '@/features/reports/price';
import { useMainButton } from '@/telegram/useMainButton';

const HINT_COLOR = 'var(--tgui--hint_color)';
const ERROR_COLOR = 'var(--tgui--destructive_text_color)';

/** Справочная подсказка-шаблон: плюсы, минусы, рекомендация. */
const CONCLUSION_HINT = 'Что понравилось, что смущает, кому и за сколько стоит покупать';

type SaveState = 'saved' | 'local' | 'saving' | 'error';

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

export function ConclusionStepPage() {
  const { id = '' } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { report, editable } = useOutletContext<ReportContext>();
  const draft = useReportDraft((state) => state.draft);
  const setConclusion = useReportDraft((state) => state.setConclusion);
  const markSaved = useReportDraft((state) => state.markSaved);

  const conclusion = draft?.conclusion;
  const [state, setState] = useState<SaveState>('saved');

  // Начальные значения из черновика (он уже слит с сервером): копейки → BYN для показа
  const initialText = conclusion?.conclusionText ?? report.conclusionText ?? '';
  const initialPrice = conclusion?.priceByn ?? report.priceByn;
  const [text, setText] = useState(initialText);
  const [priceInput, setPriceInput] = useState(initialPrice === null ? '' : kopecksToByn(initialPrice));

  // Следим за черновиком извне: после перечитывания отчёта (например, 409) поля должны обновиться
  useEffect(() => {
    setText(initialText);
    setPriceInput(initialPrice === null ? '' : kopecksToByn(initialPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.reportId, initialText, initialPrice]);

  const priceKopecks = bynToKopecks(priceInput);
  const bothFilled = text.trim() !== '' && priceKopecks !== null && priceError(priceInput) === null;
  const hasContent = text.trim() !== '' || priceInput.trim() !== '';

  // Грязная правка: пишем в черновик сразу (переживает закрытие), но на сервер — только когда оба поля заполнены
  useEffect(() => {
    if (hasContent && conclusion?.dirty !== true) {
      setConclusion({ conclusionText: text, priceByn: priceKopecks ?? undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, priceInput]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = async () => {
    if (!bothFilled) return;
    setState('saving');
    try {
      await inspectorApi.updateConclusion(id, { conclusionText: text.trim(), priceByn: priceKopecks! });
      markSaved();
      setState('saved');
    } catch {
      setState('error');
    }
  };

  // Автосохранение с debounce, только когда оба поля заполнены
  useEffect(() => {
    if (!editable || !bothFilled) return;
    setState('saving');
    debounceRef.current = setTimeout(() => void send(), 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, priceInput, bothFilled, editable]);

  const flush = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    return send();
  };

  useMainButton('Далее', () => {
    void flush().then(() => {
      const next = nextStepPath(pathname);
      navigate(next ? `/reports/${id}/${next}` : `/reports/${id}`);
    });
  });

  const priceErr = priceError(priceInput);
  const showPriceError = priceInput.trim() !== '' && priceErr !== null;
  const priceErrorText = priceErr === 'min' ? `Цена не может быть меньше ${1} BYN` : priceErr === 'max' ? 'Цена слишком большая' : null;

  // Чтение: заключение и цена без полей
  if (!editable) {
    return (
      <main style={{ padding: 16 }}>
        <Title level="2" weight="2" Component="h1">
          Заключение и цена
        </Title>
        <Text style={{ display: 'block', marginBottom: 12, color: HINT_COLOR }}>Отчёт сейчас только для чтения.</Text>
        <List>
          <Section header="Заключение">{report.conclusionText ? <Cell multiline>{report.conclusionText}</Cell> : <Cell>Не заполнено</Cell>}</Section>
          <Section header="Цена">
            <Cell>{report.priceByn === null ? 'Не указана' : `${kopecksToByn(report.priceByn)} BYN`}</Cell>
          </Section>
        </List>
      </main>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Заключение и цена
      </Title>
      <SaveIndicator state={state} />

      <List>
        <Section header="Заключение" footer={CONCLUSION_HINT}>
          <Textarea aria-label="Заключение" placeholder="Напишите итог осмотра" value={text} onChange={(e) => setText(e.target.value)} />
        </Section>
        <Section header="Цена, BYN" footer="Минимум 1 BYN. «50» или «49,90»">
          <Textarea
            aria-label="Цена, BYN"
            placeholder="Например, 50"
            inputMode="decimal"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
          {showPriceError && priceErrorText && (
            <Text style={{ display: 'block', color: ERROR_COLOR }}>{priceErrorText}</Text>
          )}
        </Section>
      </List>

      <Text style={{ display: 'block', marginTop: 12, color: HINT_COLOR }}>
        {bothFilled ? 'Изменения сохраняются автоматически.' : 'Заключение сохранится на сервере, когда будут заполнены и текст, и цена.'}
      </Text>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button size="m" mode="bezeled" onClick={() => void flush()}>
          Сохранить
        </Button>
      </div>
    </main>
  );
}