import { Button, Cell, List, Section, Text, Title } from '@telegram-apps/telegram-ui';
import { useRef, useState } from 'react';
import { DRAFT_REPORT_ID } from '@/mocks/fixtures/ids';
import { getUploadErrorMessage, type UploadStage, uploadMedia } from './upload';

/*
 * Проверка одной загрузки глазами: страница попадает в сборку только в dev (`TestPage`) и рассчитана на режим моков
 * (`npm run dev:mocks -w @podbor/inspector`) — в нём «S3» и presigned-ссылки эмулирует MSW.
 *
 * Проверка на настоящем MinIO или hoster.by отличается только адресом: нужно поменять `S3_ENDPOINT`/`S3_PUBLIC_ENDPOINT`
 * на бэкенде и разрешить CORS бакета для origin Mini App (раздел 2.9 плана, BE-17). Код конвейера при этом не меняется.
 */

const STAGE_LABELS: Record<UploadStage, string> = {
  presign: 'Получаем ссылку на загрузку…',
  put: 'Загружаем файл в хранилище…',
  confirm: 'Подтверждаем загрузку…',
  verify: 'Проверяем, дошёл ли файл…',
};

/** Первый черновик из моков: отчёт и 7 секций уже есть, создавать новый не нужно. */
const REPORT_ID = DRAFT_REPORT_ID;

export function MediaUploadCheck() {
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File, contentType: 'image/jpeg' | 'video/mp4') => {
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const uploaded = await uploadMedia({
        reportId: REPORT_ID,
        // Глобальное медиа: фото секции проверяется так же, но попадает в `sections[].media`
        sectionId: null,
        blob: file,
        contentType,
        onProgress: setProgress,
        onStage: setStage,
      });
      setResult(`${uploaded.s3Key} (${uploaded.kind}, confirm через ${uploaded.confirmedVia})`);
    } catch (e) {
      setError(getUploadErrorMessage(e));
    } finally {
      setStage(null);
      setProgress(null);
      if (photoInput.current) photoInput.current.value = '';
      if (videoInput.current) videoInput.current.value = '';
    }
  };

  const pick = (ref: typeof photoInput) => ref.current?.click();

  return (
    <List>
      <Section header="Медиа (MINI-10)" footer={`Отчёт ${REPORT_ID}: после загрузки файл виден в globalMedia отчёта`}>
        <Cell subtitle={stage ? STAGE_LABELS[stage] : 'Выберите файл — он уйдёт в хранилище напрямую'}>
          {progress === null ? 'Загрузка файла' : `Отправлено ${Math.round(progress * 100)}%`}
        </Cell>
        <div style={{ display: 'flex', gap: 8, padding: 12 }}>
          <Button size="m" disabled={progress !== null} onClick={() => pick(photoInput)}>
            Фото
          </Button>
          <Button size="m" disabled={progress !== null} onClick={() => pick(videoInput)}>
            Видео
          </Button>
        </div>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file, 'image/jpeg');
          }}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file, 'video/mp4');
          }}
        />
      </Section>

      {result && (
        <Section header="Загружено">
          <Title level="3">{result}</Title>
        </Section>
      )}
      {error && (
        <Section header="Ошибка">
          <Text>{error}</Text>
        </Section>
      )}
    </List>
  );
}
