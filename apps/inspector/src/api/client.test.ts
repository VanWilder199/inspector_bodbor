import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, INIT_DATA_HEADER, parseFieldErrors, parseFieldPath, setUnauthorizedHandler } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import { setApiSession } from '@/api/session';
import { DRAFT_REPORT_ID, FOREIGN_REPORT_ID, uuid } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';
import { server } from '@/test/server';

async function catchApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('Ожидалась ошибка ApiError, но запрос завершился успешно');
}

/** Пути всех запросов, ушедших на мок-бэкенд. */
function recordRequests(): string[] {
  const paths: string[] = [];
  server.events.on('request:start', ({ request }) => {
    const { pathname } = new URL(request.url);
    paths.push(`${request.method} ${pathname}`);
  });
  return paths;
}

describe('заголовок X-Telegram-Data', () => {
  // Строка из реального initData: проценты и `&` внутри. Её нельзя перекодировать, иначе сломается подпись
  const RAW = 'query_id=AAH&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22%D0%98%D0%B2%D0%B0%D0%BD%22%7D&auth_date=1700000000&hash=abcdef';

  it('передаёт сырую строку initData без изменений', async () => {
    setApiSession({ rawInitData: RAW });
    server.use(http.get('/api/test/echo', ({ request }) => HttpResponse.json({ header: request.headers.get(INIT_DATA_HEADER) })));

    const { header } = await apiFetch<{ header: string }>('/test/echo');
    expect(header).toBe(RAW);
  });

  it('есть и у запросов с телом', async () => {
    setApiSession({ rawInitData: RAW });
    server.use(http.put('/api/test/echo', ({ request }) => HttpResponse.json({ header: request.headers.get(INIT_DATA_HEADER) })));

    const { header } = await apiFetch<{ header: string }>('/test/echo', { method: 'PUT', body: '{}' });
    expect(header).toBe(RAW);
  });

  it('без initData заголовка нет, и бэкенд отвечает 401', async () => {
    setApiSession({});
    const err = await catchApiError(inspectorApi.me());
    expect(err.status).toBe(401);
    expect(err.errorCode).toBeUndefined();
  });
});

describe('пути и поля запросов', () => {
  it('GET /inspector/ уходит со слешем на конце', async () => {
    const paths = recordRequests();
    await inspectorApi.me();
    expect(paths).toEqual(['GET /api/inspector/']);
  });

  it('без слеша бэкенд отвечает 404 без errorCode (поэтому слеш обязателен)', async () => {
    const err = await catchApiError(apiFetch('/inspector'));
    expect(err.status).toBe(404);
    expect(err.errorCode).toBeUndefined();
  });

  it('confirm-upload отправляет поле s3key (строчная k), а не s3Key', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/inspector/media/confirm-upload/:reportId', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await inspectorApi.confirmUpload(DRAFT_REPORT_ID, { sectionId: null, s3key: 'reports/x/y.jpg', kind: 'PHOTO' });
    expect(Object.keys(body)).toContain('s3key');
    expect(Object.keys(body)).not.toContain('s3Key');
  });

  it('204 без тела → undefined', async () => {
    server.use(http.post('/api/test/no-content', () => new HttpResponse(null, { status: 204 })));
    await expect(apiFetch('/test/no-content', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('200 с невалидным JSON → ApiError, а не необработанный SyntaxError', async () => {
    server.use(http.get('/api/test/broken', () => new HttpResponse('{oops', { status: 200 })));
    const err = await catchApiError(apiFetch('/test/broken'));
    expect(err.status).toBe(200);
    expect(err.errorCode).toBeUndefined();
  });
});

describe('форма A: ProblemDetail с errorCode', () => {
  it('отдаёт status, errorCode и detail', async () => {
    const err = await catchApiError(inspectorApi.getReport(uuid(999)));
    expect(err.status).toBe(404);
    expect(err.errorCode).toBe('REPORT_NOT_FOUND');
    expect(err.detail).toBe('Report not found');
    expect(err.kind).toBe('http');
    expect(err.fieldErrors).toBeUndefined();
  });

  it('чужой отчёт → 403 REPORT_ACCESS_DENIED', async () => {
    const err = await catchApiError(inspectorApi.getReport(FOREIGN_REPORT_ID));
    expect(err.status).toBe(403);
    expect(err.errorCode).toBe('REPORT_ACCESS_DENIED');
  });
});

describe("форма A': ошибка валидации", () => {
  it('errors ["поле: сообщение"] → fieldErrors по пути поля, пункт секции — items[0].status', async () => {
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    const section = report.sections[0];
    const err = await catchApiError(
      inspectorApi.updateSection(DRAFT_REPORT_ID, section!.id, { summary: ' ', items: [{ itemKey: 'rust', status: null as never }] }),
    );
    expect(err.status).toBe(400);
    expect(err.errorCode).toBe('BAD_REQUEST');
    expect(err.fieldErrors).toEqual({
      summary: 'must not be blank',
      'items[0].status': 'must not be null',
    });
  });

  it('регистрация с пустыми полями → ошибки по каждому полю', async () => {
    mockControl.setInspector(null);
    const err = await catchApiError(inspectorApi.register({ fullName: '', phone: null as never, email: 'не-почта' }));
    expect(err.errorCode).toBe('BAD_REQUEST');
    expect(Object.keys(err.fieldErrors ?? {}).sort()).toEqual(['email', 'fullName', 'phone']);
  });
});

describe('форма B: ошибки Spring MVC без errorCode', () => {
  it('битый UUID в пути → 400 без errorCode', async () => {
    const err = await catchApiError(inspectorApi.getReport('not-a-uuid'));
    expect(err.status).toBe(400);
    expect(err.errorCode).toBeUndefined();
    expect(err.detail).toContain('not-a-uuid');
  });

  it('неизвестное значение enum → 400 без errorCode', async () => {
    const report = await inspectorApi.getReport(DRAFT_REPORT_ID);
    const err = await catchApiError(
      inspectorApi.updateSection(DRAFT_REPORT_ID, report.sections[0]!.id, { summary: 'ок', items: [{ itemKey: 'rust', status: 'GOOD' as never }] }),
    );
    expect(err.status).toBe(400);
    expect(err.errorCode).toBeUndefined();
    expect(err.fieldErrors).toBeUndefined();
  });

  it('500 INTERNAL_SERVER_ERROR (регистрация без email)', async () => {
    mockControl.setInspector(null);
    const err = await catchApiError(inspectorApi.register({ fullName: 'Иван', phone: '+375291111111' } as never));
    expect(err.status).toBe(500);
    expect(err.errorCode).toBe('INTERNAL_SERVER_ERROR');
  });

  it('ответ прокси не в JSON (HTML 502) → ApiError без errorCode', async () => {
    server.use(http.get('/api/test/html', () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })));
    const err = await catchApiError(apiFetch('/test/html'));
    expect(err.status).toBe(502);
    expect(err.errorCode).toBeUndefined();
    expect(err.detail).toBe('Unknown error');
  });
});

describe('форма C: 401 без errorCode', () => {
  it.each([
    ['JSON Spring Boot', false],
    ['пустое тело', true],
  ])('401 (%s) → ApiError и вызов обработчика ровно один раз', async (_name, empty) => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockControl.failOnce('GET /inspector/', { kind: 'security', status: 401, empty });
    const paths = recordRequests();

    const err = await catchApiError(inspectorApi.me());
    expect(err.status).toBe(401);
    expect(err.errorCode).toBeUndefined();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(paths).toHaveLength(1); // повторов нет
  });

  it('401 с errorCode (после BE-2) — тоже конец сессии', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockControl.failOnce('GET /inspector/', { kind: 'app', status: 401, errorCode: 'TELEGRAM_AUTH_EXPIRED' });

    const err = await catchApiError(inspectorApi.me());
    expect(err.errorCode).toBe('TELEGRAM_AUTH_EXPIRED');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('другие ошибки обработчик не трогают', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    await catchApiError(inspectorApi.getReport(uuid(999)));
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('сеть, таймаут, повторы', () => {
  it('обрыв соединения → ApiError status 0, kind network', async () => {
    mockControl.failOnce('GET /inspector/', { kind: 'network' });
    const err = await catchApiError(inspectorApi.me());
    expect(err.status).toBe(0);
    expect(err.kind).toBe('network');
  });

  it('нет ответа дольше таймаута → ApiError status 0, kind timeout', async () => {
    mockControl.fail('GET /inspector/', { kind: 'hang' });
    const err = await catchApiError(apiFetch('/inspector/', { timeoutMs: 50 }));
    expect(err.status).toBe(0);
    expect(err.kind).toBe('timeout');
  });

  it('отмену запроса снаружи пробрасываем как есть, это не ApiError', async () => {
    mockControl.fail('GET /inspector/', { kind: 'hang' });
    const controller = new AbortController();
    const promise = apiFetch('/inspector/', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('таймаут по умолчанию 15 с, для создания отчёта 30 с', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await inspectorApi.me();
    expect(setTimeoutSpy.mock.calls.map(([, ms]) => ms)).toContain(15_000);

    setTimeoutSpy.mockClear();
    await inspectorApi.createReport('https://cars.av.by/volkswagen/passat/112233445');
    expect(setTimeoutSpy.mock.calls.map(([, ms]) => ms)).toContain(30_000);
    setTimeoutSpy.mockRestore();
  });

  it('POST /inspector/reports после ошибки не повторяется автоматически (иначе дубль черновика)', async () => {
    mockControl.fail('POST /inspector/reports', { kind: 'app', status: 502, errorCode: 'PARSER_ERROR' });
    const paths = recordRequests();

    const err = await catchApiError(inspectorApi.createReport('https://cars.av.by/volkswagen/passat/112233445'));
    expect(err.errorCode).toBe('PARSER_ERROR');
    expect(paths).toEqual(['POST /api/inspector/reports']);
  });
});

describe('parseFieldErrors / parseFieldPath', () => {
  it('строки без двоеточия попадают в _form, не-строки пропускаются', () => {
    expect(parseFieldErrors(['общая ошибка', 'summary: must not be blank', 42])).toEqual({
      _form: 'общая ошибка',
      summary: 'must not be blank',
    });
  });

  it('не массив или пустой массив → undefined', () => {
    expect(parseFieldErrors(undefined)).toBeUndefined();
    expect(parseFieldErrors('x')).toBeUndefined();
    expect(parseFieldErrors([])).toBeUndefined();
  });

  it('путь с индексом раскладывается по сегментам', () => {
    expect(parseFieldPath('summary')).toEqual(['summary']);
    expect(parseFieldPath('items[0].status')).toEqual(['items', 0, 'status']);
    expect(parseFieldPath('measurements[12].panelCode')).toEqual(['measurements', 12, 'panelCode']);
  });
});
