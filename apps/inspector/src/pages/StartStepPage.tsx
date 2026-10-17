/*
 * Стартовый экран мастера — обязательные фото (PLAN_FRONTEND_MINIAPP.md, раздел 1.2, задача MINI-13).
 *
 * Четыре слота: одометр, VIN-табличка, подборщик у машины, документы. Это глобальные фото (`sectionId = null`)
 * с локальным тегом в `localMediaTags`. До BE-11 бэкенд их не отличает от обычных глобальных фото, поэтому слот
 * «заполнен» — только по локальному тегу на этом устройстве (и в превью они попадут в общую галерею, а не в слоты).
 *
 * Перед каждой загрузкой — подтверждение «Загрузить это фото?»: удалить медиа нельзя (BE-12 не реализован), и это
 * единственная защита от ошибочного снимка. Миниатюра может не совпадать с полным фото (S-22/B-97) — принятый риск.
 */

import { Button, Cell, List, Section, Text, Title } from '@telegram-apps/telegram-ui';
import { useEffect } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import type { MediaTag } from '@/features/reports/draft';
import { MANDATORY_TAGS } from '@/features/reports/draft';
import type { ReportContext } from '@/features/reports/ReportLayout';
import { useReportDraft } from '@/features/reports/reportDraftStore';
import { nextStepPath } from '@/features/reports/wizardSteps';
import { usePhotoUpload } from '@/features/reports/usePhotoUpload';
import { useUploadQueue } from '@/media/uploadQueue';
import { useMainButton } from '@/telegram/useMainButton';

const HINT_COLOR = 'var(--tgui--hint_color)';
const TAG_LABELS: Record<MediaTag, string> = {
  ODOMETER: 'Одометр',
  VIN_PLATE: 'VIN-табличка',
  INSPECTOR_WITH_CAR: 'Подборщик у машины',
  DOCUMENTS: 'Документы',
};

export function StartStepPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { editable } = useOutletContext<ReportContext>();
  const draft = useReportDraft((state) => state.draft);
  const setMediaTag = useReportDraft((state) => state.setMediaTag);
  const tasks = useUploadQueue((state) => state.tasks);
  const { pending, processing, error, openPicker, confirm, cancel } = usePhotoUpload();

  // Когда задача с тегом доходит до done, у неё есть s3Key — пишем тег в localMediaTags (переживает перезапуск).
  // До появления s3Key тега нет: localMediaTags ключуется по ключу в S3 (раздел 3.3).
  useEffect(() => {
    for (const task of tasks) {
      if (task.state === 'done' && task.s3Key && task.tag) {
        setMediaTag(task.s3Key, task.tag);
      }
    }
  }, [tasks, setMediaTag]);

  const filledTags = new Set(Object.values(draft?.localMediaTags ?? {}));

  const pick = (tag: MediaTag) => {
    if (!editable) return;
    openPicker({ reportId: id, sectionId: null, kind: 'PHOTO', tag }, 'environment');
  };

  useMainButton(
    'Далее',
    () => {
      const next = nextStepPath(`/reports/${id}/start`);
      navigate(next ? `/reports/${id}/${next}` : `/reports/${id}`);
    },
    // Основную кнопку не блокируем: обязательность фото — только предупреждение до BE-11
  );

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Обязательные фото
      </Title>
      <Text style={{ display: 'block', marginBottom: 12, color: HINT_COLOR }}>
        Сфотографируйте одометр, VIN-табличку, себя у машины и документы. Фото хранятся на этом устройстве.
      </Text>

      {error && <Text style={{ display: 'block', color: 'var(--tgui--destructive_text_color)' }}>{error}</Text>}

      <List>
        <Section header="Слоты">
          {MANDATORY_TAGS.map((tag) => {
            const filled = filledTags.has(tag);
            return (
              <Cell
                key={tag}
                after={
                  <Button size="s" mode="bezeled" disabled={!editable} onClick={() => pick(tag)}>
                    {filled ? 'Заменю' : 'Снять'}
                  </Button>
                }
                subtitle={filled ? 'Заполнено' : 'Не снято'}
              >
                {TAG_LABELS[tag]}
              </Cell>
            );
          })}
        </Section>
      </List>

      {processing && <Text style={{ display: 'block', marginTop: 12, color: HINT_COLOR }}>Обработка фото…</Text>}

      {pending && (
        <Section header="Загрузить это фото?">
          <Cell
            after={
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="s" onClick={() => void confirm({ reportId: id, sectionId: null, kind: 'PHOTO', tag: pending.tag })}>
                  Загрузить
                </Button>
                <Button size="s" mode="bezeled" onClick={cancel}>
                  Отмена
                </Button>
              </div>
            }
          >
            Превью {pending.file.name}
          </Cell>
        </Section>
      )}
    </main>
  );
}