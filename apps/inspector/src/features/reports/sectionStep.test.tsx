import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_REPORT_ID, REVISION_REPORT_ID } from '@/mocks/fixtures/ids';
import { db, mockConfig, mockControl } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { resetSdkMock } from '@/test/telegramSdkMock';
import { readDraft } from './draft';
import { AUTOSAVE_DELAY_MS } from './useSectionAutosave';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

const SECTION_URL = `/reports/${DRAFT_REPORT_ID}/section/EXTERIOR`;
const SUMMARY = 'Итог секции';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const summaryField = () => screen.getByLabelText(SUMMARY);
const ratingButton = (item: string, status: string) => screen.getByRole('button', { name: `${item}: ${status}` });

interface PutCall {
  url: string;
  body: { summary: string; items: { itemKey: string; status: string; comment: string | null }[] };
}

/** Тела всех `PUT` секций за тест. Читаем клон: сам запрос после этого уходит в хендлер как обычно. */
function trackSectionPuts(): PutCall[] {
  const calls: PutCall[] = [];
  server.events.on('request:start', async ({ request }) => {
    if (request.method !== 'PUT' || !/\/sections\/[^/]+$/.test(new URL(request.url).pathname)) {
      return;
    }
    calls.push({ url: new URL(request.url).pathname, body: (await request.clone().json()) as PutCall['body'] });
  });
  return calls;
}

async function openSection(path = SECTION_URL) {
  const result = renderApp(path);
  await heading('Кузов');
  return result;
}

/** Прокручивает debounce автосохранения. */
async function passDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 50);
  });
}

beforeEach(() => {
  resetSdkMock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('шаг секции: экран', () => {
  it('показывает пункты секции в порядке справочника, а не в порядке ответа сервера', async () => {
    // Сервер вернул пункты вперемешку: порядок `items` в ответе не гарантирован (раздел 2.5)
    const exterior = db.reports[REVISION_REPORT_ID]!.sections.find((section) => section.sectionKey === 'EXTERIOR')!;
    exterior.items = [...exterior.items].reverse();
    await openSection(`/reports/${REVISION_REPORT_ID}/section/EXTERIOR`);

    const labels = screen.getAllByText(/^(Геометрия кузова|Вмятины|Ржавчина|Пороги|Днище|Зазоры|Стёкла|Уплотнители)$/).map((node) => node.textContent);

    expect(labels).toEqual(['Геометрия кузова', 'Вмятины', 'Ржавчина', 'Пороги', 'Днище', 'Зазоры', 'Стёкла', 'Уплотнители']);
  });

  it('подставляет уже сохранённые на сервере оценки и итог', async () => {
    await openSection(`/reports/${REVISION_REPORT_ID}/section/EXTERIOR`);

    expect(summaryField()).toHaveValue('Кузов в хорошем состоянии, ржавчина на пороге');
    expect(ratingButton('Ржавчина', 'Проблема')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Ржавчина: комментарий')).toHaveValue('Левый порог, сквозная');
  });

  it('неизвестный ключ секции в адресе не роняет экран', async () => {
    renderApp(`/reports/${DRAFT_REPORT_ID}/section/NOPE`);

    expect(await heading('Секция не найдена')).toBeInTheDocument();
  });
});

describe('автосохранение: что уходит на сервер', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('без итога секции PUT не уходит, индикатор показывает «Сохранено на устройстве»', async () => {
    const puts = trackSectionPuts();
    await openSection();

    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    await passDebounce();

    expect(puts).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Сохранено на устройстве');
    // Правка при этом не потеряна: она лежит в локальном черновике
    expect(readDraft(DRAFT_REPORT_ID)?.sections.EXTERIOR.items.geometry).toEqual({ status: 'OK' });
  });

  it('с итогом, но без оценённых пунктов PUT не уходит: пустой items на бэкенде даёт 500', async () => {
    const puts = trackSectionPuts();
    await openSection();

    fireEvent.change(summaryField(), { target: { value: 'Кузов в порядке' } });
    await passDebounce();

    expect(puts).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Сохранено на устройстве');
  });

  it('на BAD без комментария PUT не уходит; после комментария уходит', async () => {
    const puts = trackSectionPuts();
    await openSection();

    fireEvent.change(summaryField(), { target: { value: 'Ржавчина' } });
    fireEvent.click(ratingButton('Ржавчина', 'Проблема'));
    await passDebounce();
    expect(puts).toEqual([]);
    expect(screen.getByText('Напишите комментарий к замечанию')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Ржавчина: комментарий'), { target: { value: 'Левый порог' } });
    await passDebounce();

    expect(puts).toHaveLength(1);
    expect(puts[0]!.body.items).toEqual([{ itemKey: 'rust', status: 'BAD', comment: 'Левый порог' }]);
  });

  it('при изменении одного пункта уходит PUT со всеми оценёнными пунктами секции (replace-all)', async () => {
    const puts = trackSectionPuts();
    await openSection();
    fireEvent.change(summaryField(), { target: { value: 'Кузов в порядке' } });
    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    fireEvent.click(ratingButton('Пороги', 'Норма'));
    await passDebounce();
    expect(puts).toHaveLength(1);

    // Меняем один пункт — на сервер должен уйти полный список, а не только он
    fireEvent.click(ratingButton('Пороги', 'Замечание'));
    fireEvent.change(screen.getByLabelText('Пороги: комментарий'), { target: { value: 'Мелкая коррозия' } });
    await passDebounce();

    expect(puts).toHaveLength(2);
    expect(puts[1]!.body).toEqual({
      summary: 'Кузов в порядке',
      items: [
        { itemKey: 'geometry', status: 'OK', comment: null },
        { itemKey: 'sills', status: 'WARN', comment: 'Мелкая коррозия' },
      ],
    });
  });

  it('sectionId в адресе запроса — из ответа сервера', async () => {
    const puts = trackSectionPuts();
    await openSection();
    const exterior = db.reports[DRAFT_REPORT_ID]!.sections.find((section) => section.sectionKey === 'EXTERIOR')!;

    fireEvent.change(summaryField(), { target: { value: 'Итог' } });
    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    await passDebounce();

    expect(puts[0]!.url).toBe(`/api/inspector/reports/${DRAFT_REPORT_ID}/sections/${exterior.id}`);
  });

  it('успех: индикатор «Сохранено», на сервере состояние совпадает, dirty снят', async () => {
    await openSection();

    fireEvent.change(summaryField(), { target: { value: 'Кузов в порядке' } });
    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    await passDebounce();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Сохранено'));
    const exterior = db.reports[DRAFT_REPORT_ID]!.sections.find((section) => section.sectionKey === 'EXTERIOR')!;
    expect(exterior.summary).toBe('Кузов в порядке');
    expect(exterior.items).toEqual([{ itemKey: 'geometry', status: 'OK', comment: null }]);
    expect(readDraft(DRAFT_REPORT_ID)?.sections.EXTERIOR.dirty).toBe(false);
  });

  it('быстрые правки склеиваются: debounce не даёт отдельного PUT на каждое нажатие', async () => {
    const puts = trackSectionPuts();
    await openSection();
    fireEvent.change(summaryField(), { target: { value: 'Итог' } });

    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    fireEvent.click(ratingButton('Вмятины', 'Норма'));
    fireEvent.click(ratingButton('Зазоры', 'Норма'));
    await passDebounce();

    expect(puts).toHaveLength(1);
    expect(puts[0]!.body.items.map((item) => item.itemKey)).toEqual(['geometry', 'dents', 'gaps']);
  });
});

describe('автосохранение: один запрос в полёте', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('правка во время запроса не создаёт параллельный PUT: последнее состояние уходит следующим', async () => {
    const puts = trackSectionPuts();
    let inFlight = 0;
    let maxInFlight = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT' && /\/sections\//.test(request.url)) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
      }
    });
    server.events.on('response:mocked', ({ request }) => {
      if (request.method === 'PUT' && /\/sections\//.test(request.url)) {
        inFlight -= 1;
      }
    });
    mockConfig.latencyMs = 400;

    await openSection();
    fireEvent.change(summaryField(), { target: { value: 'Первый итог' } });
    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    await passDebounce();
    expect(puts).toHaveLength(1);

    // Первый запрос ещё идёт (задержка 400 мс): подборщик продолжает править
    fireEvent.change(summaryField(), { target: { value: 'Финальный итог' } });
    await passDebounce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(maxInFlight).toBe(1);
    // Last write wins: на сервере осталось последнее состояние, а не результат более старого запроса
    const exterior = db.reports[DRAFT_REPORT_ID]!.sections.find((section) => section.sectionKey === 'EXTERIOR')!;
    expect(exterior.summary).toBe('Финальный итог');
    expect(puts[1]!.body.summary).toBe('Финальный итог');
  });

  it('если во время запроса данные изменились, dirty не снимается — правка не считается сохранённой', async () => {
    mockConfig.latencyMs = 400;
    await openSection();
    fireEvent.change(summaryField(), { target: { value: 'Первый итог' } });
    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    await passDebounce();

    fireEvent.change(summaryField(), { target: { value: 'Правка в полёте' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(readDraft(DRAFT_REPORT_ID)?.sections.EXTERIOR.dirty).toBe(true);
  });
});

describe('автосохранение: ошибки', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('409 REPORT_NOT_EDITABLE сбрасывает черновик и переводит экран в режим чтения', async () => {
    await openSection();
    mockControl.failOnce('PUT /inspector/reports/:reportId/sections/:sectionId', { kind: 'app', status: 409, errorCode: 'REPORT_NOT_EDITABLE' });
    // Пока подборщик правил, отчёт ушёл на модерацию с другого устройства
    db.reports[DRAFT_REPORT_ID]!.status = 'pending_review';

    fireEvent.change(summaryField(), { target: { value: 'Итог' } });
    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    await passDebounce();

    await waitFor(() => expect(screen.getByText(/только для чтения/)).toBeInTheDocument());
    expect(screen.queryByLabelText(SUMMARY)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(`podbor:draft:${DRAFT_REPORT_ID}`)).toBeNull();
  });

  it('сетевая ошибка: индикатор «Ошибка», правка остаётся в черновике и не теряется', async () => {
    await openSection();
    mockControl.failOnce('PUT /inspector/reports/:reportId/sections/:sectionId', { kind: 'network' });

    fireEvent.change(summaryField(), { target: { value: 'Итог' } });
    fireEvent.click(ratingButton('Геометрия кузова', 'Норма'));
    await passDebounce();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Не удалось сохранить'));
    expect(readDraft(DRAFT_REPORT_ID)?.sections.EXTERIOR.dirty).toBe(true);
    expect(readDraft(DRAFT_REPORT_ID)?.sections.EXTERIOR.summary).toBe('Итог');
  });
});

describe('отчёт только для чтения', () => {
  it('на модерации шаг секции показывает данные без полей ввода и без кнопок оценки', async () => {
    db.reports[REVISION_REPORT_ID]!.status = 'pending_review';
    renderApp(`/reports/${REVISION_REPORT_ID}/section/EXTERIOR`);

    expect(await heading('Кузов')).toBeInTheDocument();
    expect(screen.getByText(/только для чтения/)).toBeInTheDocument();
    expect(screen.queryByLabelText(SUMMARY)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ржавчина:/ })).not.toBeInTheDocument();
    expect(screen.getByText('Кузов в хорошем состоянии, ржавчина на пороге')).toBeInTheDocument();
  });
});
