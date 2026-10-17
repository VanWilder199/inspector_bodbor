import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_REPORT_ID } from '@/mocks/fixtures/ids';
import { db, resetMocks } from '@/mocks/state';
import { renderApp } from '@/test/renderApp';
import { resetSdkMock } from '@/test/telegramSdkMock';
import { readDraft } from './draft';

vi.mock('@telegram-apps/sdk-react', async () => (await import('@/test/telegramSdkMock')).sdkMock);

const URL = `/reports/${DRAFT_REPORT_ID}/conclusion`;
const TEXT = 'Заключение';
const PRICE = 'Цена, BYN';
const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const textField = () => screen.getByLabelText(TEXT) as HTMLTextAreaElement;
const priceField = () => screen.getByLabelText(PRICE) as HTMLTextAreaElement;

beforeEach(() => {
  resetSdkMock();
  resetMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('заключение: экран', () => {
  it('подставляет сохранённые на сервере заключение и цену (копейки → BYN)', async () => {
    db.reports[DRAFT_REPORT_ID]!.conclusionText = 'Рекомендую к покупке';
    db.reports[DRAFT_REPORT_ID]!.priceByn = 5000;

    renderApp(URL);

    expect(await heading('Заключение и цена')).toBeInTheDocument();
    expect(textField()).toHaveValue('Рекомендую к покупке');
    expect(priceField()).toHaveValue('50,00');
  });

  it('на модерации — режим чтения без полей', async () => {
    db.reports[DRAFT_REPORT_ID]!.status = 'pending_review';

    renderApp(URL);

    expect(await screen.findByText(/только для чтения/)).toBeInTheDocument();
    expect(screen.queryByLabelText(TEXT)).not.toBeInTheDocument();
  });
});

describe('заключение: валидация и сохранение', () => {
  it('цена ниже 1 BYN показывает ошибку и на сервер не уходит', async () => {
    renderApp(URL);
    await heading('Заключение и цена');

    fireEvent.change(textField(), { target: { value: 'Хорошая машина' } });
    fireEvent.change(priceField(), { target: { value: '0,50' } });

    expect(await screen.findByText(/Цена не может быть меньше 1 BYN/)).toBeInTheDocument();
    // не сохраняется, пока цена не в диапазоне
    expect(db.reports[DRAFT_REPORT_ID]!.conclusionText).toBeNull();
  });

  it('заключение без цены остаётся на устройстве (dirty), не уходит на сервер', async () => {
    renderApp(URL);
    await heading('Заключение и цена');

    fireEvent.change(textField(), { target: { value: 'Только текст' } });

    await waitFor(() => {
      expect(readDraft(DRAFT_REPORT_ID)?.conclusion.conclusionText).toBe('Только текст');
    });
    expect(db.reports[DRAFT_REPORT_ID]!.conclusionText).toBeNull();
  });

  it('«50» и «49,90» отправляются как копейки 5000 и 4990', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp(URL);
    await heading('Заключение и цена');

    fireEvent.change(textField(), { target: { value: 'Итог' } });
    fireEvent.change(priceField(), { target: { value: '49,90' } });

    await vi.advanceTimersByTimeAsync(1600);
    await waitFor(() => expect(db.reports[DRAFT_REPORT_ID]!.priceByn).toBe(4990));
    expect(db.reports[DRAFT_REPORT_ID]!.conclusionText).toBe('Итог');
  });
});