/*
 * Шаг «Видео обхода» (PLAN_FRONTEND_MINIAPP.md, раздел 2.8 и 3.5, задача MINI-14).
 *
 * Одно глобальное видео, которое засчитывает `submit` (правило 3: `section_id IS NULL`, `kind='VIDEO'`,
 * `status IN ('pending','ready')`). Видео, привязанное к секции, бэкенд не засчитает — поэтому загружаем строго
 * с `sectionId = null` и `kind = 'VIDEO'`.
 *
 * `.MOV` с iPhone бэкенд пока отклоняет (принимает только `video/mp4`): подсказываем выбрать «Наиболее совместимый»
 * формат камеры (BE-10 должен разрешить `video/quicktime`). Перекодировка в браузере не рассматривается (ffmpeg.wasm —
 * десятки секунд и сотни МБ на минуту видео). Докачка после обрыва невозможна до BE-20 (multipart) — видео грузится
 * заново целиком, показываем процент и предупреждаем не закрывать приложение (Wake Lock, если доступен).
 */

import { Button, Cell, List, Section, Text, Title } from '@telegram-apps/telegram-ui';
import { useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import type { ReportContext } from '@/features/reports/ReportLayout';
import { nextStepPath } from '@/features/reports/wizardSteps';
import { useUploadQueue, checkUploadQuota } from '@/media/uploadQueue';
import { UPLOAD_STATE_LABELS, hasPendingWork } from '@/media/uploadQueueRules';
import { VIDEO_LENGTH_HINT, checkVideoFile } from '@/media/videoCheck';
import { useMainButton } from '@/telegram/useMainButton';

const HINT_COLOR = 'var(--tgui--hint_color)';
const WARN_COLOR = 'var(--tgui--destructive_text_color)';

const FORMAT_HINT = 'iPhone: Камера → Форматы → «Наиболее совместимый», затем снимите видео заново';

export function VideoStepPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { editable } = useOutletContext<ReportContext>();
  const enqueue = useUploadQueue((state) => state.enqueue);
  const tasks = useUploadQueue((state) => state.tasks);
  const videoInput = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Последняя задача-видео этого отчёта: её прогресс и статус показывает экран (заменённое видео остаётся в БД до BE-12)
  const myVideos = tasks.filter((task) => task.reportId === id && task.kind === 'VIDEO');
  const latestVideo = myVideos[myVideos.length - 1];

  const pick = () => {
    if (!editable) return;
    setError(null);
    setWarning(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.capture = 'environment';
    videoInput.current = input;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const check = checkVideoFile(file);
      if (!check.ok) {
        setError(check.message);
        return;
      }
      if (check.warning) setWarning(check.warning);
      void checkUploadQuota().then((quotaError) => {
        if (quotaError) {
          setError(quotaError);
          return;
        }
        enqueue({ reportId: id, sectionId: null, kind: 'VIDEO', contentType: check.contentType, blob: file });
      });
    };
    input.click();
  };

  useMainButton('Далее', () => {
    const next = nextStepPath(`/reports/${id}/video`);
    navigate(next ? `/reports/${id}/${next}` : `/reports/${id}`);
  });

  const uploading = latestVideo !== undefined && hasPendingWork([latestVideo]);
  const done = latestVideo?.state === 'done';
  const failed = latestVideo?.state === 'failed';
  const stateLabel = latestVideo ? UPLOAD_STATE_LABELS[latestVideo.state] : 'Видео';

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Видео обхода
      </Title>
      <Text style={{ display: 'block', marginBottom: 12, color: HINT_COLOR }}>{VIDEO_LENGTH_HINT}</Text>
      <Text style={{ display: 'block', marginBottom: 12, color: HINT_COLOR }}>{FORMAT_HINT}</Text>

      {error && <Text style={{ display: 'block', color: WARN_COLOR }}>{error}</Text>}
      {warning && <Text style={{ display: 'block', color: WARN_COLOR }}>{warning}</Text>}

      <List>
        <Section header="Видео">
          <Cell
            after={
              <Button size="m" disabled={!editable || uploading} onClick={pick}>
                {done ? 'Заменить видео' : 'Снять видео'}
              </Button>
            }
            subtitle={
              uploading
                ? `Загружается… ${Math.round((latestVideo?.progress ?? 0) * 100)}%`
                : done
                  ? 'Видео загружено, обработка может занять время'
                  : failed
                    ? `Ошибка: ${latestVideo?.lastError ?? 'неизвестно'}`
                    : 'Видео ещё не добавлено'
            }
          >
            {stateLabel}
          </Cell>
        </Section>
      </List>

      {uploading && (
        <Text style={{ display: 'block', marginTop: 12, color: HINT_COLOR }}>
          Не закрывайте приложение, пока идёт загрузка видео — после обрыва придётся начинать заново.
        </Text>
      )}
    </main>
  );
}