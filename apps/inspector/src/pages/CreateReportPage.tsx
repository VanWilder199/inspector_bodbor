import { Button, Cell, Input, List, Section, Text, Title } from '@telegram-apps/telegram-ui';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { getErrorMessage } from '@/api/errors';
import { FallbackMainButton } from '@/components/FallbackMainButton';
import { carTitleFromAvbyUrl } from '@/features/reports/carTitle';
import { readReportsIndex } from '@/features/reports/reportsIndex';
import { useCreateReport } from '@/features/reports/useCreateReport';
import { useOnline } from '@/features/reports/useOnline';
import { AVBY_URL_PROBLEM_MESSAGES, normalizeAvbyUrl } from '@/features/reports/avbyUrl';
import { useHaptic } from '@/telegram/useHaptic';
import { useMainButton } from '@/telegram/useMainButton';

const SUBMIT_TEXT = 'Создать отчёт';
const LOADING_TEXT = 'Загружаем объявление с av.by…';
const ERROR_COLOR = 'var(--tgui--destructive_text_color)';
const HINT_COLOR = 'var(--tgui--hint_color)';

/** Текст у поля при отказе в нормализации. `empty` показывается только после попытки создать отчёт. */
function validationText(problem: string | undefined): string | undefined {
  if (!problem || problem === 'empty') {
    return undefined;
  }
  return AVBY_URL_PROBLEM_MESSAGES[problem as keyof typeof AVBY_URL_PROBLEM_MESSAGES];
}

/** Первое, что подборщик видит в поле: ссылка от бота (`?url=` из BOT-02) или последняя созданная с этого устройства. */
function initialInput(searchParams: URLSearchParams): { value: string; fromBot: boolean } {
  const fromBot = searchParams.get('url');
  if (fromBot) {
    return { value: fromBot, fromBot: true };
  }
  const last = readReportsIndex()[0];
  return { value: last ? last.avbyUrl : '', fromBot: false };
}

/**
 * Создание отчёта по ссылке av.by (сценарий D плана, раздел 2.4).
 *
 * Ссылку присылает бот кнопкой `…/reports/new?url=…` (BOT-02), но проверка и нормализация те же, что при вводе руками:
 * результат от бота ничем не довереннее буфера обмена. Парсер на бэкенде синхронный (до 10 с), поэтому на время запроса
 * текст кнопки меняется, а сама кнопка блокируется от повторного нажатия.
 */
export function CreateReportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const online = useOnline();
  const haptic = useHaptic();
  const createReport = useCreateReport();

  const [{ value: initialValue, fromBot }] = useState(() => initialInput(searchParams));
  const [input, setInput] = useState(initialValue);
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string>();
  /** Отчёт мог создаться: `POST` не повторяем, поэтому предлагаем проверить список, а не «Повторить». */
  const [uncertain, setUncertain] = useState(false);
  const [canPaste, setCanPaste] = useState(false);

  const result = normalizeAvbyUrl(input);
  const validationMessage = touched ? validationText(result.ok ? undefined : result.problem) : undefined;

  /**
   * Мягкая подсказка, а не запрет: бэкенд дубли разрешает (BE-19), и создать второй отчёт по той же машине — законное
   * решение подборщика. При ошибке отправки подсказку не показываем, чтобы она не спорила с текстом ошибки.
   */
  const duplicate = result.ok ? readReportsIndex().find((entry) => entry.avbyUrl === result.url) : undefined;
  const showDuplicate = duplicate !== undefined && !formError && !uncertain;

  // «Вставить» показываем только там, где буфер доступен и чтение не запрещено политикой разрешений:
  // в Telegram на iOS кнопки не будет вовсе, и подборщик не упрётся в неё молча
  useEffect(() => {
    let cancelled = false;
    void navigator.permissions
      ?.query({ name: 'clipboard-read' as PermissionName })
      .then((status) => {
        if (!cancelled) {
          setCanPaste(status.state !== 'denied');
        }
      })
      .catch(() => {
        // клиент не умеет спрашивать про буфер: кнопку не показываем
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        setTouched(true);
        setFormError(undefined);
      }
    } catch {
      // разрешение не дано или буфер пуст: молча оставляем поле как есть
    }
  }

  async function submit() {
    setTouched(true);
    setUncertain(false);
    if (createReport.isPending) {
      return;
    }
    const checked = normalizeAvbyUrl(input);
    if (!checked.ok) {
      setFormError(checked.problem === 'empty' ? AVBY_URL_PROBLEM_MESSAGES.empty : undefined);
      return;
    }
    setFormError(undefined);
    try {
      const reportId = await createReport.mutateAsync(checked.url);
      haptic.success();
      // replace: BackButton с хаба отчёта должен вести в список, а не возвращать на форму с уже использованной ссылкой
      navigate(`/reports/${reportId}`, { replace: true });
    } catch (error) {
      haptic.error();
      if (error instanceof ApiError && error.kind === 'http') {
        setFormError(getErrorMessage(error));
        return;
      }
      // Сеть или таймаут: черновик на сервере мог быть создан, а его `reportId` остался неизвестен
      // (локальный индекс пополняется только ответом). Автоповтор запрещён — отправляем проверять список.
      setUncertain(true);
    }
  }

  const pending = createReport.isPending;
  useMainButton(pending ? LOADING_TEXT : SUBMIT_TEXT, () => void submit(), { enabled: online && !pending, loading: pending });

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Новый отчёт
      </Title>
      <Text style={{ display: 'block', margin: '8px 0 12px' }}>
        Вставьте ссылку на объявление с av.by. Мы подготовим отчёт, а вы заполните его при осмотре.
      </Text>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
        aria-label="Новый отчёт"
      >
        <List>
          <Section header="Ссылка на объявление" footer={validationMessage ? <Section.Footer style={{ color: ERROR_COLOR }}>{validationMessage}</Section.Footer> : undefined}>
            <Input
              aria-label="Ссылка на объявление av.by"
              inputMode="url"
              placeholder="https://cars.av.by/…"
              status={validationMessage ? 'error' : 'default'}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setUncertain(false);
                setFormError(undefined);
              }}
              onBlur={() => setTouched(true)}
            />
          </Section>

          {canPaste && (
            <Section>
              <Cell Component="label" onClick={() => void pasteFromClipboard()} subtitle="Скопируйте ссылку в браузере и нажмите здесь">
                Вставить из буфера
              </Cell>
            </Section>
          )}
        </List>

        {fromBot && (
          <Text style={{ display: 'block', margin: '12px 16px', color: HINT_COLOR }}>Ссылка пришла от бота — проверьте, что объявление то самое.</Text>
        )}

        {!online && (
          <Text role="alert" style={{ display: 'block', margin: '12px 16px', color: HINT_COLOR }}>
            Нет связи с интернетом. Создание отчёта требует сети — подключитесь и попробуйте снова.
          </Text>
        )}

        {formError && (
          <Text role="alert" style={{ display: 'block', margin: '12px 16px', color: ERROR_COLOR }}>
            {formError}
          </Text>
        )}

        {uncertain && (
          <div style={{ margin: '12px 16px' }}>
            <Text role="alert" style={{ display: 'block', color: ERROR_COLOR }}>
              Не удалось дождаться ответа. Отчёт мог быть создан — проверьте список, прежде чем повторять.
            </Text>
            <Button size="m" mode="bezeled" stretched style={{ marginTop: 8 }} onClick={() => navigate('/reports')}>
              Проверить мои отчёты
            </Button>
          </div>
        )}

        {showDuplicate && duplicate && (
          <Text style={{ display: 'block', margin: '12px 16px', color: HINT_COLOR }}>
            У вас уже есть отчёт по этой ссылке —{' '}
            <Link to={`/reports/${duplicate.reportId}`}>{carTitleFromAvbyUrl(duplicate.avbyUrl)}</Link>. Можно создать ещё один.
          </Text>
        )}

        <div style={{ padding: '12px 16px' }}>
          <FallbackMainButton text={pending ? LOADING_TEXT : SUBMIT_TEXT} enabled={online && !pending} loading={pending} />
        </div>
      </form>
    </main>
  );
}
