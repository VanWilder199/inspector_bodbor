import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockConfig, mockControl } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { resetSdkMock } from '@/test/telegramSdkMock';
import { readReportsIndex } from './reportsIndex';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

const LISTING = 'https://cars.av.by/volkswagen/passat/112233445';
const SUBMIT = 'Создать отчёт';
const FIELD = 'Ссылка на объявление av.by';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const field = () => screen.getByLabelText(FIELD);
const submitButton = () => screen.getByRole('button', { name: SUBMIT });

/** Тела POST-запросов на создание отчёта: нужны, чтобы проверить, что на сервер ушла нормализованная ссылка. */
function trackCreateBodies(): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  server.events.on('request:start', async ({ request }) => {
    if (request.method !== 'POST' || !new URL(request.url).pathname.endsWith('/inspector/reports')) {
      return;
    }
    try {
      bodies.push((await request.clone().json()) as Record<string, unknown>);
    } catch {
      bodies.push({});
    }
  });
  return bodies;
}

/** Все запросы к API за тест: `МЕТОД /путь`. */
function trackRequests(): string[] {
  const requests: string[] = [];
  server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));
  return requests;
}

async function openScreen(path = '/reports/new') {
  const result = renderApp(path);
  await heading('Новый отчёт');
  return result;
}

function typeLink(value: string) {
  fireEvent.change(field(), { target: { value } });
  // Уход с поля: до него подсказка о неверной ссылке не показывается, чтобы не ругаться на недопечатанный текст
  fireEvent.blur(field());
}

beforeEach(() => {
  resetSdkMock();
});

describe('/reports/new: ссылка от бота и ввод руками', () => {
  it('ссылка из ?url= подставляется в поле, но отчёт сам не создаётся', async () => {
    const requests = trackRequests();
    await openScreen(`/reports/new?url=${encodeURIComponent(LISTING)}`);

    await waitFor(() => expect(field()).toHaveValue(LISTING));
    expect(requests.filter((request) => request.startsWith('POST'))).toEqual([]);
    expect(screen.getByText(/Ссылка пришла от бота/)).toBeInTheDocument();
  });

  it('ссылка от бота проверяется так же, как ввод руками: чужой домен не отправляется', async () => {
    const requests = trackRequests();
    await openScreen(`/reports/new?url=${encodeURIComponent('https://onliner.by/vw/passat/1')}`);

    fireEvent.click(submitButton());

    expect(await screen.findByText('Нужна ссылка на объявление с av.by')).toBeInTheDocument();
    expect(requests.filter((request) => request.startsWith('POST'))).toEqual([]);
  });

  it('ссылка не на av.by не отправляется, ошибка видна до запроса к серверу', async () => {
    const requests = trackRequests();
    await openScreen();
    typeLink('https://onliner.by/volkswagen/passat/1');

    expect(screen.getByText('Нужна ссылка на объявление с av.by')).toBeInTheDocument();
    fireEvent.click(submitButton());
    expect(requests.filter((request) => request.startsWith('POST'))).toEqual([]);
  });

  it('пустое поле: подсказка появляется после нажатия, запроса нет', async () => {
    const requests = trackRequests();
    await openScreen();

    fireEvent.click(submitButton());

    expect(await screen.findByText('Вставьте ссылку на объявление av.by')).toBeInTheDocument();
    expect(requests.filter((request) => request.startsWith('POST'))).toEqual([]);
  });
});

describe('/reports/new: успешное создание', () => {
  it.each([
    [`${LISTING}?utm_source=tg#photos`, 'query и фрагмент'],
    [`${LISTING}/`, 'завершающий слеш'],
    ['https://CARS.AV.BY/volkswagen/passat/112233445', 'регистр хоста'],
    ['cars.av.by/volkswagen/passat/112233445', 'отсутствие схемы'],
  ])('на сервер уходит нормализованная ссылка (%s)', async (input) => {
    const bodies = trackCreateBodies();
    await openScreen();
    typeLink(input);

    fireEvent.click(submitButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ avbyUrl: LISTING });
  });

  it('после успеха reportId попадает в локальный индекс, открывается хаб отчёта', async () => {
    const { router } = await openScreen();
    typeLink(LISTING);

    fireEvent.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/reports\/[0-9a-f-]{36}$/));
    const [entry] = readReportsIndex();
    expect(entry).toMatchObject({ avbyUrl: LISTING });
    expect(entry?.reportId).toBe(router.state.location.pathname.replace('/reports/', ''));
  });

  it('двойной тап не создаёт два отчёта: запрос ровно один', async () => {
    const requests = trackRequests();
    mockConfig.latencyMs = 30;
    await openScreen();
    typeLink(LISTING);

    const button = submitButton();
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(requests.filter((request) => request.startsWith('POST'))).toHaveLength(1));
    expect(readReportsIndex()).toHaveLength(1);
  });
});

describe('/reports/new: ошибки', () => {
  it.each([
    ['app', { kind: 'app', status: 404, errorCode: 'CAR_LISTING_NOT_FOUND' }, 'Объявление не найдено на av.by. Проверьте ссылку'],
    ['app', { kind: 'app', status: 502, errorCode: 'PARSER_ERROR' }, 'Не удалось прочитать объявление av.by. Повторите позже'],
    ['app', { kind: 'app', status: 403, errorCode: 'INSPECTOR_BANNED' }, 'Аккаунт заблокирован'],
    ['app', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' }, 'Что-то пошло не так, повторите'],
  ] as const)('%s %s → понятный текст, отчёт в индекс не попал', async (_kind, failure, text) => {
    mockControl.failOnce('POST /inspector/reports', failure);
    await openScreen();
    typeLink(LISTING);

    fireEvent.click(submitButton());

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(readReportsIndex()).toEqual([]);
    // Экран остался на месте: подборщик может исправить ссылку и попробовать снова
    expect(field()).toHaveValue(LISTING);
  });

  it('сетевая ошибка: POST не повторяется, вместо повтора предлагается проверить список отчётов', async () => {
    const requests = trackRequests();
    mockControl.failOnce('POST /inspector/reports', { kind: 'network' });
    const { router } = await openScreen();
    typeLink(LISTING);

    fireEvent.click(submitButton());

    expect(await screen.findByText(/Отчёт мог быть создан/)).toBeInTheDocument();
    // Ключевой запрет раздела 2.4: повтор создал бы второй черновик
    expect(requests.filter((request) => request.startsWith('POST'))).toHaveLength(1);
    expect(readReportsIndex()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Проверить мои отчёты' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reports'));
  });
});

describe('/reports/new: подсказка о дубле', () => {
  it('если ссылка уже есть в индексе, показывается подсказка, но создание не блокируется', async () => {
    const requests = trackRequests();
    const { router } = await openScreen();
    typeLink(LISTING);
    fireEvent.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/reports\//));

    // Возвращаемся на форму с той же ссылкой: бэкенд дубли разрешает (BE-19), значит это только совет
    const second = await openScreen();
    typeLink(LISTING);

    expect(await screen.findByText(/У вас уже есть отчёт по этой ссылке/)).toBeInTheDocument();
    fireEvent.click(submitButton());
    await waitFor(() => expect(second.router.state.location.pathname).toMatch(/^\/reports\/[0-9a-f-]{36}$/));
    expect(requests.filter((request) => request.startsWith('POST'))).toHaveLength(2);
  });
});
