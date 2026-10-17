import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_REPORT_ID, FOREIGN_REPORT_ID, REVISION_REPORT_ID, uuid } from '@/mocks/fixtures/ids';
import { db, resetMocks } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { addToReportsIndex } from './reportsIndex';

const GOLF = 'https://cars.av.by/volkswagen/golf/223344556';
const PASSAT = 'https://cars.av.by/volkswagen/passat/112233445';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

beforeEach(() => {
  window.localStorage.clear();
  resetMocks();
});

describe('/reports/:id: хаб отчёта', () => {
  it('показывает шаги осмотра и подпись машины из ссылки в индексе', async () => {
    addToReportsIndex({ reportId: REVISION_REPORT_ID, avbyUrl: GOLF });
    renderApp(`/reports/${REVISION_REPORT_ID}`);

    expect(await heading('Volkswagen Golf')).toBeInTheDocument();
    expect(screen.getByText('Отчёт вернули на доработку')).toBeInTheDocument();
    // Первый шаг мастера, шаг секции ЛКП и последний — «Проверка и отправка»
    expect(screen.getByText('Обязательные фото')).toBeInTheDocument();
    expect(screen.getByText('Замеры ЛКП')).toBeInTheDocument();
    expect(screen.getByText('Кузов')).toBeInTheDocument();
    expect(screen.getByText('Проверка и отправка')).toBeInTheDocument();
  });

  it('без ссылки в индексе показывает «Автомобиль»', async () => {
    renderApp(`/reports/${REVISION_REPORT_ID}`);
    expect(await heading('Автомобиль')).toBeInTheDocument();
  });

  it('отчёт на модерации — только для чтения: вместо шагов показывается превью отчёта', async () => {
    const pendingId = uuid(301);
    db.reports[pendingId] = { ...db.reports[DRAFT_REPORT_ID]!, id: pendingId, status: 'pending_review' };
    addToReportsIndex({ reportId: pendingId, avbyUrl: PASSAT });
    renderApp(`/reports/${pendingId}`);

    // Заголовок машины встречается дважды: шапка хаба и шапка `ReportView` (оба — `<h1>`)
    expect(await screen.findAllByRole('heading', { level: 1, name: 'Volkswagen Passat' })).toHaveLength(2);
    expect(screen.getByText(/только чтение/)).toBeInTheDocument();
    // Редактировать нечего — списка шагов нет, отчёт показан целиком через ReportView из @podbor/ui
    expect(screen.queryByText('Шаги осмотра')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Продолжить' })).not.toBeInTheDocument();
  });

  it('удалённый отчёт показывает экран «Отчёт удалён» и чистит черновик', async () => {
    db.deleted.add(REVISION_REPORT_ID);
    renderApp(`/reports/${REVISION_REPORT_ID}`);

    expect(await heading('Отчёт удалён')).toBeInTheDocument();
    expect(window.localStorage.getItem(`podbor:draft:${REVISION_REPORT_ID}`)).toBeNull();
  });

  it('чужой отчёт показывает «Это не ваш отчёт»', async () => {
    renderApp(`/reports/${FOREIGN_REPORT_ID}`);
    expect(await heading('Это не ваш отчёт')).toBeInTheDocument();
  });

  it('переход на шаг открывает экран шага, а не остаётся на хабе', async () => {
    addToReportsIndex({ reportId: REVISION_REPORT_ID, avbyUrl: GOLF });
    renderApp(`/reports/${REVISION_REPORT_ID}`);
    expect(await heading('Volkswagen Golf')).toBeInTheDocument();

    screen.getByText('Замеры ЛКП').click();
    expect(await heading('Замеры ЛКП')).toBeInTheDocument();
    expect(screen.getByText(/Шаг в разработке/)).toBeInTheDocument();
  });

  it('не мои отчёты: чужой отчёт недоступен и по прямому адресу шага', async () => {
    renderApp(`/reports/${FOREIGN_REPORT_ID}/section/EXTERIOR`);
    expect(await heading('Это не ваш отчёт')).toBeInTheDocument();
  });

  it('прямой заход на шаг грузит отчёт тем же лоадером хаба (не 404 и не пустой экран)', async () => {
    addToReportsIndex({ reportId: REVISION_REPORT_ID, avbyUrl: PASSAT });
    renderApp(`/reports/${REVISION_REPORT_ID}/section/ENGINE`);
    await waitFor(() => expect(screen.queryByText('Загрузка')).not.toBeInTheDocument());
    // Экран секции (MINI-09): заголовок — название секции, а не заглушка «Секция осмотра»
    expect(await heading('Двигатель')).toBeInTheDocument();
  });
});
