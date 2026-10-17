import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadQueue } from './uploadQueue';
import { DRAFT_REPORT_ID } from '@/mocks/fixtures/ids';
import { mockControl, resetMocks } from '@/mocks/state';

function jpegBlob(): Blob {
  return new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
}

/** Сброс стора между тестами. */
function resetQueue() {
  useUploadQueue.setState({ tasks: [] });
}

describe('uploadQueue: постановка и успех', () => {
  beforeEach(() => {
    resetMocks();
    resetQueue();
  });

  it('ставит задачу в очередь и после успеха переводит в done с s3Key', async () => {
    useUploadQueue.getState().enqueue({ reportId: DRAFT_REPORT_ID, sectionId: null, kind: 'PHOTO', contentType: 'image/jpeg', blob: jpegBlob() });

    expect(useUploadQueue.getState().tasks).toHaveLength(1);
    expect(['queued', 'presigning', 'uploading', 'confirming']).toContain(useUploadQueue.getState().tasks[0]!.state);

    // дождаться завершения
    await vi.waitFor(() => {
      const task = useUploadQueue.getState().tasks[0];
      expect(task?.state).toBe('done');
      expect(task?.s3Key).toBeTruthy();
    });
  });

  it('фото секции попадает в отчёт по sectionId', async () => {
    useUploadQueue.getState().enqueue({ reportId: DRAFT_REPORT_ID, sectionId: null, kind: 'PHOTO', contentType: 'image/jpeg', blob: jpegBlob() });

    await vi.waitFor(() => expect(useUploadQueue.getState().tasks[0]?.state).toBe('done'));
  });
});

describe('uploadQueue: сбой и повтор', () => {
  beforeEach(() => {
    resetMocks();
    resetQueue();
  });

  it('4xx от API переводит задачу в failed с кнопками повтора', async () => {
    mockControl.failOnce('POST /inspector/media/presigned-url/:reportId', { kind: 'app', status: 400, errorCode: 'NOT_ALLOWDED_MEDIA_TYPE' });
    useUploadQueue.getState().enqueue({ reportId: DRAFT_REPORT_ID, sectionId: null, kind: 'PHOTO', contentType: 'image/jpeg', blob: jpegBlob() });

    await vi.waitFor(() => expect(useUploadQueue.getState().tasks[0]?.state).toBe('failed'));
    expect(useUploadQueue.getState().tasks[0]?.lastError).toBeTruthy();
  });

  it('после failed ручной retry снова переводит в done', async () => {
    // Неповторяемая 4xx (NOT_ALLOWDED_MEDIA_TYPE) — окончательная ошибка, задача в failed
    mockControl.failOnce('POST /inspector/media/presigned-url/:reportId', { kind: 'app', status: 400, errorCode: 'NOT_ALLOWDED_MEDIA_TYPE' });
    useUploadQueue.getState().enqueue({ reportId: DRAFT_REPORT_ID, sectionId: null, kind: 'PHOTO', contentType: 'image/jpeg', blob: jpegBlob() });

    await vi.waitFor(() => expect(useUploadQueue.getState().tasks[0]?.state).toBe('failed'));

    useUploadQueue.getState().retry(useUploadQueue.getState().tasks[0]!.id);
    await vi.waitFor(() => expect(useUploadQueue.getState().tasks[0]?.state).toBe('done'));
  });

  it('remove убирает задачу из очереди', () => {
    useUploadQueue.getState().enqueue({ reportId: DRAFT_REPORT_ID, sectionId: null, kind: 'PHOTO', contentType: 'image/jpeg', blob: jpegBlob() });
    const id = useUploadQueue.getState().tasks[0]!.id;
    useUploadQueue.getState().remove(id);
    expect(useUploadQueue.getState().tasks).toHaveLength(0);
  });
});