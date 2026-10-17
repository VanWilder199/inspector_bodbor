import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isIndexedDBAvailable, loadTasks, saveTasks } from './uploadQueuePersistence';
import { checkUploadQuota, hydrateUploadQueue, requestPersistentStorage, useUploadQueue } from './uploadQueue';
import { DRAFT_REPORT_ID } from '@/mocks/fixtures/ids';

function resetQueue() {
  useUploadQueue.setState({ tasks: [], quotaError: null });
}

describe('uploadQueuePersistence: деградация без IndexedDB', () => {
  it('в happy-dom нет IndexedDB — персистентность выключена', () => {
    expect(isIndexedDBAvailable()).toBe(false);
  });

  it('saveTasks/loadTasks без IDB — безопасный no-op', async () => {
    await expect(saveTasks([])).resolves.toBeUndefined();
    await expect(loadTasks()).resolves.toEqual([]);
  });
});

describe('checkUploadQuota', () => {
  const originalEstimate = navigator.storage?.estimate;

  beforeEach(() => {
    resetQueue();
  });

  afterEach(() => {
    // восстановить estimate, если замокали
    Object.defineProperty(navigator, 'storage', {
      value: originalEstimate ? { estimate: originalEstimate.bind(navigator.storage) } : undefined,
      configurable: true,
    });
  });

  it('в пределах 95% — ошибки нет', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ usage: 100, quota: 1000 }) } });
    await expect(checkUploadQuota()).resolves.toBeNull();
  });

  it('переполнено (>95%) — возвращает текст ошибки', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ usage: 990, quota: 1000 }) } });
    await expect(checkUploadQuota()).resolves.toMatch(/переполнено/);
  });

  it('без navigator.storage — ошибки нет', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: undefined });
    await expect(checkUploadQuota()).resolves.toBeNull();
  });
});

describe('hydrateUploadQueue', () => {
  it('пустая очередь в IDB — стор не трогается', async () => {
    resetQueue();
    await hydrateUploadQueue();
    expect(useUploadQueue.getState().tasks).toEqual([]);
  });

  it('requestPersistentStorage не падает, когда storage.persist недоступен', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: undefined });
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
  });
});

// Маркер, что отчёт из фикстур используется для будущих тестов восстановления
void DRAFT_REPORT_ID;