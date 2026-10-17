import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReportStatus } from '@/api/types';
import { DRAFT_REPORT_ID, FOREIGN_REPORT_ID, REVISION_REPORT_ID, uuid } from '@/mocks/fixtures/ids';
import { db, mockControl } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { addToReportsIndex, readReportsIndex } from './reportsIndex';

const PASSAT = 'https://cars.av.by/volkswagen/passat/112233445';
const GOLF = 'https://cars.av.by/volkswagen/golf/223344556';
const OCTAVIA = 'https://cars.av.by/skoda/octavia/334455667';
const A6 = 'https://cars.av.by/audi/a6/445566778';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const tab = (name: string) => screen.getByRole('button', { name });

/** Подпись статуса в строке списка. Те же слова есть у фильтров-кнопок («На модерации»), поэтому кнопки отбрасываем. */
const statusLabels = (text: string) => screen.queryAllByText(text).filter((element) => !element.closest('button'));

/** Свой отчёт нужного статуса в мок-бэкенде (в сидах есть только черновик и «на доработке»). */
function addOwnReport(n: number, status: ReportStatus): string {
  const id = uuid(n);
  db.reports[id] = { ...db.reports[DRAFT_REPORT_ID]!, id, status };
  return id;
}

/** Кладёт отчёты в индекс в том порядке, в каком они перечислены: последний окажется первым в списке. */
function indexReports(...entries: Array<[reportId: string, avbyUrl: string]>) {
  entries.forEach(([reportId, avbyUrl], position) => {
    addToReportsIndex({ reportId, avbyUrl, createdAt: new Date(Date.UTC(2026, 9, 1 + position)).toISOString() });
  });
}

describe('/reports: список по локальному индексу', () => {
  it('без отчётов показывает подсказку «Создайте первый отчёт»', async () => {
    renderApp('/reports');

    expect(await heading('Мои отчёты')).toBeInTheDocument();
    expect(screen.getByText('Создайте первый отчёт')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Черновики' })).not.toBeInTheDocument();
  });

  it('показывает отчёты со статусом с сервера и подписью машины из ссылки', async () => {
    const pendingReview = addOwnReport(201, 'pending_review');
    const published = addOwnReport(202, 'published');
    indexReports([DRAFT_REPORT_ID, PASSAT], [REVISION_REPORT_ID, GOLF], [pendingReview, OCTAVIA], [published, A6]);
    renderApp('/reports');

    expect(await screen.findByText('Volkswagen Passat')).toBeInTheDocument();
    for (const title of ['Volkswagen Golf', 'Skoda Octavia', 'Audi A6']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    await waitFor(() => {
      expect(statusLabels('Черновик')).toHaveLength(1);
      expect(statusLabels('На доработке')).toHaveLength(1);
      expect(statusLabels('На модерации')).toHaveLength(1);
      expect(statusLabels('Опубликован')).toHaveLength(1);
    });
  });

  it('фильтры оставляют отчёты только нужного статуса', async () => {
    const published = addOwnReport(202, 'published');
    indexReports([DRAFT_REPORT_ID, PASSAT], [REVISION_REPORT_ID, GOLF], [published, A6]);
    renderApp('/reports');
    await waitFor(() => expect(statusLabels('Опубликован')).toHaveLength(1));

    fireEvent.click(tab('Черновики'));
    expect(screen.getByText('Volkswagen Passat')).toBeInTheDocument();
    expect(screen.queryByText('Volkswagen Golf')).not.toBeInTheDocument();
    expect(screen.queryByText('Audi A6')).not.toBeInTheDocument();

    fireEvent.click(tab('Опубликованные'));
    expect(screen.getByText('Audi A6')).toBeInTheDocument();
    expect(screen.queryByText('Volkswagen Passat')).not.toBeInTheDocument();

    fireEvent.click(tab('На модерации'));
    expect(screen.getByText('Нет отчётов с таким статусом')).toBeInTheDocument();

    fireEvent.click(tab('Все'));
    expect(screen.getByText('Volkswagen Golf')).toBeInTheDocument();
  });

  it('отчёт, удалённый модератором, остаётся в этом визите с пометкой «Удалён», а из индекса убирается сразу', async () => {
    indexReports([REVISION_REPORT_ID, GOLF], [DRAFT_REPORT_ID, PASSAT]);
    mockControl.deleteReport(DRAFT_REPORT_ID);
    renderApp('/reports');

    expect(await screen.findByText('Удалён')).toBeInTheDocument();
    expect(screen.getByText('Volkswagen Passat')).toBeInTheDocument();
    await waitFor(() => expect(readReportsIndex().map((entry) => entry.reportId)).toEqual([REVISION_REPORT_ID]));

    // следующее открытие экрана: удалённого отчёта в списке уже нет
    cleanup();
    renderApp('/reports');
    expect(await screen.findByText('Volkswagen Golf')).toBeInTheDocument();
    expect(screen.queryByText('Volkswagen Passat')).not.toBeInTheDocument();
  });

  it('удалённый отчёт не открывается по нажатию', async () => {
    indexReports([DRAFT_REPORT_ID, PASSAT]);
    mockControl.deleteReport(DRAFT_REPORT_ID);
    const { router } = renderApp('/reports');
    await screen.findByText('Удалён');

    fireEvent.click(screen.getByText('Volkswagen Passat'));
    expect(router.state.location.pathname).toBe('/reports');
  });

  it('чужой отчёт (403) тоже убирается из индекса', async () => {
    indexReports([FOREIGN_REPORT_ID, OCTAVIA], [DRAFT_REPORT_ID, PASSAT]);
    renderApp('/reports');

    await waitFor(() => expect(readReportsIndex().map((entry) => entry.reportId)).toEqual([DRAFT_REPORT_ID]));
  });

  it('сетевая ошибка не удаляет отчёт из индекса; «Повторить» перечитывает статус', async () => {
    indexReports([DRAFT_REPORT_ID, PASSAT]);
    mockControl.fail('GET /inspector/reports/:reportId', { kind: 'network' });
    renderApp('/reports');

    expect(await screen.findByText('Не удалось загрузить статус')).toBeInTheDocument();
    expect(readReportsIndex()).toHaveLength(1);

    mockControl.clear('GET /inspector/reports/:reportId');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку статусов' }));

    await waitFor(() => expect(statusLabels('Черновик')).toHaveLength(1));
    expect(screen.queryByText('Не удалось загрузить статус')).not.toBeInTheDocument();
  });

  it('404 без errorCode (не «отчёт не найден») не удаляет запись из индекса', async () => {
    indexReports([DRAFT_REPORT_ID, PASSAT]);
    mockControl.fail('GET /inspector/reports/:reportId', { kind: 'spring', status: 404, detail: 'No static resource.' });
    renderApp('/reports');

    expect(await screen.findByText('Не удалось загрузить статус')).toBeInTheDocument();
    expect(readReportsIndex()).toHaveLength(1);
  });

  it('нажатие на отчёт открывает его, «Новый отчёт» ведёт на создание', async () => {
    indexReports([DRAFT_REPORT_ID, PASSAT]);
    const { router } = renderApp('/reports');

    fireEvent.click(await screen.findByText('Volkswagen Passat'));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/reports/${DRAFT_REPORT_ID}`));

    await router.navigate('/reports');
    fireEvent.click(await screen.findByRole('button', { name: 'Новый отчёт' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reports/new'));
  });
});

describe('таб-бар', () => {
  it('переключает «Отчёты», «Спрос» и «Профиль» без запросов за данными спроса', async () => {
    const requests: string[] = [];
    server.events.on('request:start', ({ request }) => requests.push(new URL(request.url).pathname));
    const { router } = renderApp('/reports');
    await heading('Мои отчёты');

    fireEvent.click(tab('Спрос'));
    expect(await heading('Спрос')).toBeInTheDocument();
    expect(screen.getByText('Скоро')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/demand');

    fireEvent.click(tab('Профиль'));
    expect(await heading('Профиль')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/profile');

    fireEvent.click(tab('Отчёты'));
    expect(await heading('Мои отчёты')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/reports');

    expect(requests.filter((path) => path.includes('demand'))).toEqual([]);
  });

  it('переключение вкладок не добавляет записей в историю', async () => {
    const { router } = renderApp('/reports');
    await heading('Мои отчёты');

    fireEvent.click(tab('Спрос'));
    await heading('Спрос');

    expect(router.state.historyAction).toBe('REPLACE');
  });

  it.each(['/reports/new', `/reports/${DRAFT_REPORT_ID}`, '/uploads'])('на экране %s таб-бара нет', async (path) => {
    renderApp(path);
    await screen.findAllByRole('heading', { level: 1 });

    expect(screen.queryByRole('button', { name: 'Спрос' })).not.toBeInTheDocument();
  });

  it.each([
    ['pending', '/pending'],
    ['banned', '/banned'],
  ] as const)('у подборщика %s на профиле таб-бара нет, а «К статусу аккаунта» ведёт на %s', async (status, path) => {
    mockControl.setInspector(status);
    const { router } = renderApp('/profile');
    await heading('Профиль');

    expect(screen.queryByRole('button', { name: 'Спрос' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'К статусу аккаунта' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(path));
  });

  it('у подтверждённого на профиле кнопки «К статусу аккаунта» нет', async () => {
    renderApp('/profile');
    await heading('Профиль');

    expect(tab('Спрос')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'К статусу аккаунта' })).not.toBeInTheDocument();
  });
});
