import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '@/api/session';
import { db, mockConfig, mockControl } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { emitSdkEvent, resetSdkMock, sdkMock } from '@/test/telegramSdkMock';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

// Номер и почта собраны из кусков: в тестах нет настоящих данных
const PHONE_DIGITS = ['29', '123', '45', '67'].join('');
const PHONE = `+375${PHONE_DIGITS}`;
const EMAIL = ['ivan', 'example.by'].join('@');

const SUBMIT = 'Зарегистрироваться';
const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });

/** Все запросы к API за тест: `МЕТОД /путь`. */
function trackRequests(): string[] {
  const requests: string[] = [];
  server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));
  return requests;
}

async function openRegister() {
  mockControl.setInspector(null);
  const result = renderApp('/register');
  await heading('Регистрация');
  return result;
}

function fillValid() {
  type('ФИО', 'Иван Петров');
  type('Телефон', PHONE_DIGITS);
  type('Email', EMAIL);
}

beforeEach(() => {
  resetSdkMock();
});

describe('регистрация', () => {
  it('ФИО предзаполняется из initData, в телефоне стоит код страны', async () => {
    const user = encodeURIComponent(JSON.stringify({ id: 42, first_name: 'Иван', last_name: 'Петров' }));
    setApiSession({ rawInitData: `user=${user}&auth_date=1700000000&hash=mock` });
    await openRegister();

    expect(field('ФИО')).toHaveValue('Иван Петров');
    expect(field('Телефон')).toHaveValue('+375');
    expect(field('Email')).toHaveValue('');
  });

  it('пустая форма: ошибки у полей, запроса на регистрацию нет (email обязателен на фронте)', async () => {
    const requests = trackRequests();
    await openRegister();

    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));

    expect(await screen.findByText('Укажите ФИО')).toBeInTheDocument();
    expect(screen.getByText('Укажите телефон: +375 и 9 цифр')).toBeInTheDocument();
    expect(screen.getByText('Укажите email')).toBeInTheDocument();
    expect(requests.filter((request) => request.startsWith('POST'))).toEqual([]);
    expect(db.inspector).toBeNull();
  });

  it('некорректный email не отправляется', async () => {
    await openRegister();
    fillValid();
    type('Email', 'abc');

    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));

    expect(await screen.findByText('Некорректный email')).toBeInTheDocument();
    expect(db.inspector).toBeNull();
  });

  it('успех: профиль в кеше, открывается /pending без повторного GET, запрошено разрешение писать в личку', async () => {
    const requests = trackRequests();
    const { router } = await openRegister();
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));

    expect(await heading('Заявка на проверке')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/pending');
    expect(db.inspector).toMatchObject({ status: 'pending', fullName: 'Иван Петров', phone: PHONE, email: EMAIL });
    // один GET при открытии /register и один POST: повторного чтения профиля после регистрации нет
    expect(requests).toEqual(['GET /api/inspector/', 'POST /api/inspector/register']);
    expect(sdkMock.requestWriteAccess).toHaveBeenCalledTimes(1);
  });

  it('409 INSPECTOR_ALREADY_REGISTERED — успех: профиль перечитывается, разрешение не запрашивается', async () => {
    const requests = trackRequests();
    const { router } = await openRegister();
    fillValid();
    // пока форма открыта, подборщик уже зарегистрирован (например, повтор после обрыва сети)
    mockControl.setInspector('pending');

    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));

    expect(await heading('Заявка на проверке')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/pending');
    expect(requests).toEqual(['GET /api/inspector/', 'POST /api/inspector/register', 'GET /api/inspector/']);
    expect(sdkMock.requestWriteAccess).not.toHaveBeenCalled();
  });

  it('ошибки @Valid с сервера показываются у полей', async () => {
    mockControl.failOnce('POST /inspector/register', {
      kind: 'validation',
      errors: ['email: must be a well-formed email address', 'fullName: must not be blank'],
    });
    const { router } = await openRegister();
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));

    expect(await screen.findByText('Проверьте email')).toBeInTheDocument();
    expect(screen.getByText('Проверьте ФИО')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/register');
  });

  it('500: общее сообщение над кнопкой, после повтора регистрация проходит', async () => {
    mockControl.failOnce('POST /inspector/register', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    await openRegister();
    fillValid();

    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Что-то пошло не так, повторите');

    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(await heading('Заявка на проверке')).toBeInTheDocument();
  });

  it('на время запроса кнопка заблокирована, повторные нажатия второй запрос не создают', async () => {
    mockConfig.latencyMs = 80;
    const requests = trackRequests();
    await openRegister();
    fillValid();

    const button = screen.getByRole('button', { name: SUBMIT });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    fireEvent.submit(screen.getByRole('form', { name: 'Регистрация подборщика' }));

    expect(await heading('Заявка на проверке')).toBeInTheDocument();
    expect(requests.filter((request) => request === 'POST /api/inspector/register')).toHaveLength(1);
  });
});

describe('MainButton Telegram', () => {
  it('показывает «Зарегистрироваться» и отправляет форму по нажатию', async () => {
    await openRegister();
    expect(sdkMock.mainButton.setParams.ifAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ text: SUBMIT, isVisible: true, isEnabled: true, isLoaderVisible: false }),
    );
    fillValid();

    const onMainButtonClick = sdkMock.mainButton.onClick.mock.calls[0]![0] as () => void;
    await act(async () => onMainButtonClick());

    expect(await heading('Заявка на проверке')).toBeInTheDocument();
    expect(db.inspector?.status).toBe('pending');
  });
});

describe('/pending: возврат в приложение', () => {
  it('visibility_changed с is_visible: true перечитывает профиль, скрытие — нет', async () => {
    const requests = trackRequests();
    mockControl.setInspector('pending');
    const { router } = renderApp('/pending');
    await heading('Заявка на проверке');
    mockControl.setInspector('verified');

    // Mini App свернули: перечитывать нечего
    await act(async () => emitSdkEvent('visibility_changed', { is_visible: false }));
    expect(requests).toEqual(['GET /api/inspector/']);
    expect(router.state.location.pathname).toBe('/pending');

    // Развернули: статус перечитан, подтверждённый подборщик попадает на /reports
    await act(async () => emitSdkEvent('visibility_changed', { is_visible: true }));
    expect(await heading('Мои отчёты')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/reports');
  });
});
