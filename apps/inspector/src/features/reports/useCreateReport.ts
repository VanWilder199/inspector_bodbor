import { useMutation } from '@tanstack/react-query';
import { inspectorApi } from '@/api/inspector';
import { addToReportsIndex } from './reportsIndex';

/**
 * Создание отчёта по ссылке av.by. `avbyUrl` — уже нормализованная ссылка (`avbyUrl.ts`), её же кладём в локальный индекс:
 * так подпись карточки в «Моих отчётах» совпадёт с той строкой, которую знает бэкенд.
 *
 * Автоматических повторов нет и быть не может: каждый вызов `POST /inspector/reports` создаёт новый черновик (раздел 2.4),
 * поэтому повтор решает экран — и только после того, как подборщик проверил список отчётов.
 */
export function useCreateReport() {
  return useMutation({
    mutationFn: async (avbyUrl: string): Promise<string> => {
      const { reportId } = await inspectorApi.createReport(avbyUrl);
      addToReportsIndex({ reportId, avbyUrl });
      return reportId;
    },
  });
}
