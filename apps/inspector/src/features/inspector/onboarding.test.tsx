import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { db, mockControl } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const REPORT_ID = '5b0c7f0e-1d2a-4a47-9a33-6f0e4b3e9d21';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

/**
 * Гейт отработал: экран загрузки исчез, и на его месте экран назначения (или редирект уже выполнен).
 * Заголовков первого уровня может быть несколько: telegram-ui рисует `Section header` как `<h1>`.
 */
async function settled() {
  await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'Загрузка' })).not.toBeInTheDocument());
  await screen.findAllByRole('heading', { level: 1 });
}

describe('bootstrap: «/» ведёт на экран по статусу подборщика', () => {
  it.each([
    [null, '/register', 'Регистрация'],
    ['pending', '/pending', 'Заявка на проверке'],
    ['verified', '/reports', 'Мои отчёты'],
    ['banned', '/banned', 'Аккаунт заблокирован'],
  ] as const)('подборщик %s → %s', async (status, path, title) => {
    mockControl.setInspector(status);
    const { router } = renderApp('/');

    expect(await heading(title)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it('пока профиль грузится, виден экран загрузки', () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Загрузка' })).toBeInTheDocument();
  });
});

describe('гейт роутов: прямая ссылка и startapp не открывают мастер', () => {
  const DEEP_LINKS = ['/reports/new', `/reports/${REPORT_ID}`, `/reports/${REPORT_ID}/review`, '/demand'];
  const REDIRECTS = [
    [null, '/register'],
    ['pending', '/pending'],
    ['banned', '/banned'],
  ] as const;

  it.each(DEEP_LINKS.flatMap((link) => REDIRECTS.map(([status, path]) => [link, status, path] as const)))(
    'ссылка %s у подборщика %s уводит на %s',
    async (link, status, path) => {
      mockControl.setInspector(status);
      const { router } = renderApp(link);

      await settled();
      expect(router.state.location.pathname).toBe(path);
    },
  );

  it.each(DEEP_LINKS)('подтверждённый подборщик открывает %s', async (link) => {
    const { router } = renderApp(link);

    await settled();
    expect(router.state.location.pathname).toBe(link);
  });

  it.each([
    ['/register', 'verified', '/reports'],
    ['/register', 'pending', '/pending'],
    ['/pending', 'verified', '/reports'],
    ['/banned', 'verified', '/reports'],
    ['/pending', null, '/register'],
  ] as const)('экран %s у подборщика %s уводит на %s', async (start, status, path) => {
    mockControl.setInspector(status);
    const { router } = renderApp(start);

    await settled();
    expect(router.state.location.pathname).toBe(path);
  });
});

describe('ошибка загрузки профиля', () => {
  it('500 показывает «Повторить», а не отправляет на регистрацию; повтор грузит профиль', async () => {
    mockControl.fail('GET /inspector/', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    renderApp('/');

    expect(await heading('Не удалось загрузить профиль')).toBeInTheDocument();
    expect(screen.getByText('Что-то пошло не так, повторите')).toBeInTheDocument();

    mockControl.clear();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await heading('Мои отчёты')).toBeInTheDocument();
  });

  it('404 без errorCode (путь без слеша) — это ошибка, а не «не зарегистрирован»', async () => {
    mockControl.failOnce('GET /inspector/', { kind: 'spring', status: 404, detail: 'No static resource inspector.' });
    const { router } = renderApp('/');

    expect(await heading('Не удалось загрузить профиль')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('/pending', () => {
  it('«Проверить статус» перечитывает профиль и после подтверждения открывает /reports', async () => {
    mockControl.setInspector('pending');
    const { router } = renderApp('/pending');
    await heading('Заявка на проверке');

    mockControl.setInspector('verified');
    fireEvent.click(screen.getByRole('button', { name: 'Проверить статус' }));

    expect(await heading('Мои отчёты')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/reports');
  });
});

describe('/banned', () => {
  it('экран без действий', async () => {
    mockControl.setInspector('banned');
    renderApp('/banned');

    await heading('Аккаунт заблокирован');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(/сообщении от бота/)).toBeInTheDocument();
  });
});

describe('/profile', () => {
  it.each(['pending', 'verified', 'banned'] as const)('показывает данные подборщика со статусом %s', async (status) => {
    mockControl.setInspector(status);
    renderApp('/profile');

    await heading('Профиль');
    const inspector = db.inspector!;
    expect(screen.getByText(inspector.fullName)).toBeInTheDocument();
    expect(screen.getByText(inspector.phone)).toBeInTheDocument();
    expect(screen.getByText(inspector.email)).toBeInTheDocument();
    expect(screen.getByText({ pending: 'На проверке', verified: 'Подтверждён', banned: 'Заблокирован' }[status])).toBeInTheDocument();
  });

  it('незарегистрированного отправляет на регистрацию', async () => {
    mockControl.setInspector(null);
    const { router } = renderApp('/profile');

    await heading('Регистрация');
    expect(router.state.location.pathname).toBe('/register');
  });
});

describe('кеш профиля', () => {
  it('экран загрузки на «/» и гейт /reports делят один запрос профиля', async () => {
    const requests: string[] = [];
    server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));

    renderApp('/');
    await heading('Мои отчёты');

    expect(requests.filter((request) => request === 'GET /api/inspector/')).toHaveLength(1);
  });
});
