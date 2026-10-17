/*
 * Автосохранение одной секции (PLAN_FRONTEND_MINIAPP.md, раздел 3.3, пункты 2–5).
 *
 * Главное правило (пункт 4): у секции в полёте максимум один `PUT`. Пока запрос идёт, новые правки копятся, и после
 * ответа уходит следующий — иначе более поздний ответ на более старый запрос затёр бы свежие данные.
 *
 * Отправляется только то, что менялось (`dirty`): вход на шаг без правок не должен слать запрос.
 * Триггеры: debounce после изменения, уход с шага (`flush`), сворачивание приложения (`visibilitychange: hidden`).
 * `flush` дожидается завершения отправки, чтобы уход с шага не оборвал запрос на полуслове.
 *
 * `409 REPORT_NOT_EDITABLE` и `404 REPORT_NOT_FOUND` — отчёт больше не правится этим клиентом: черновик сбрасывается,
 * отчёт перечитывается, экран становится только для чтения (правила 5–6). Прочие ошибки — «Ошибка» в индикаторе;
 * автоповторов нет, подборщик поправит, и правка уйдёт снова.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { inspectorApi } from '@/api/inspector';
import type { SectionKey, UpdateSectionRequest } from '@/api/types';
import { buildSectionRequest, sectionFingerprint, type SectionBlockers } from './sectionSave';
import type { SectionDraft } from './draft';

export const AUTOSAVE_DELAY_MS = 1500;

/** Что видит подборщик в индикаторе сохранения. */
export type SaveState = 'saving' | 'saved' | 'local' | 'error';

export interface UseSectionAutosaveResult {
  state: SaveState;
  /** Почему секция пока не на сервере: нет итога, нет оценок, не хватает комментария. */
  blockers: SectionBlockers;
  /** Отправить сейчас и дождаться: уход с шага, кнопка «Далее». */
  flush: () => Promise<void>;
}

/** Снимок секции, готовый к отправке: тело запроса уже собрано, дальше черновик меняться может. */
interface PendingSave {
  sectionId: string;
  request: UpdateSectionRequest;
  /** Отпечаток отправляемого состояния: по нему решается, можно ли снимать `dirty` после ответа. */
  fingerprint: string;
}

export interface SectionAutosaveOptions {
  editable: boolean;
  /** Ключи пунктов в порядке справочника: в таком порядке пункты уходят в запрос (`order_no` на бэкенде). */
  orderedKeys: readonly string[];
  markSaved: (sectionKey: SectionKey) => void;
  discard: (reportId: string) => void;
  /** Перечитать отчёт: статус изменился, экран должен стать только для чтения. */
  refetchReport: () => void;
}

const NO_BLOCKERS: SectionBlockers = { needsSummary: false, noRatedItems: false, missingComment: [] };

export function useSectionAutosave(
  reportId: string,
  sectionKey: SectionKey,
  section: SectionDraft | undefined,
  options: SectionAutosaveOptions,
): UseSectionAutosaveResult {
  const [state, setState] = useState<SaveState>('saved');

  const pendingRef = useRef<PendingSave | null>(null);
  /** Идущая отправка. Пока она не `null`, второй `PUT` этой секции не стартует: новые правки ждут в `pendingRef`. */
  const drainRef = useRef<Promise<void> | null>(null);
  /** После `409`/`404` отчёт этому клиенту править нельзя: больше ничего не отправляем, даже при уходе с экрана. */
  const stoppedRef = useRef(false);

  const built = section ? buildSectionRequest(section, options.orderedKeys) : null;
  const blockers = built?.blockers ?? NO_BLOCKERS;
  const fingerprint = section ? sectionFingerprint(section) : undefined;

  // Свежие значения для колбэков, переживающих рендер (таймер, `visibilitychange`, размонтирование)
  const latest = useRef({ reportId, sectionKey, section, options });
  latest.current = { reportId, sectionKey, section, options };

  /**
   * Отправляет накопленное, пока очередь не опустеет. Если отправка уже идёт, возвращает её же: вызвавший
   * (например, уход с шага) дождётся её завершения, а второго запроса не будет.
   */
  const drain = useCallback((): Promise<void> => {
    if (drainRef.current) {
      return drainRef.current;
    }
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    // Присваиваем до запуска тела: иначе синхронный выход из цикла очистил бы ссылку раньше, чем она записана
    drainRef.current = done;

    void (async () => {
      try {
        for (;;) {
          const pending = pendingRef.current;
          if (pending === null) {
            return;
          }
          pendingRef.current = null;
          setState('saving');

          try {
            await inspectorApi.updateSection(latest.current.reportId, pending.sectionId, pending.request);
          } catch (error) {
            if (error instanceof ApiError && (error.errorCode === 'REPORT_NOT_EDITABLE' || error.errorCode === 'REPORT_NOT_FOUND')) {
              // Отчёт перестал быть доступным для правок: очередь сбрасываем, серверное состояние перечитываем
              stoppedRef.current = true;
              pendingRef.current = null;
              latest.current.options.discard(latest.current.reportId);
              latest.current.options.refetchReport();
              return;
            }
            setState('error');
            return;
          }

          // `dirty` снимаем, только если с момента отправки ничего не изменилось: иначе новые правки ушли бы «в чистые»
          const { section: current, sectionKey: currentKey, options: currentOptions } = latest.current;
          if (current && sectionFingerprint(current) === pending.fingerprint) {
            currentOptions.markSaved(currentKey);
            setState('saved');
          }
          // Изменилось — цикл не прерываем: debounce уже поставил (или поставит) в очередь новое состояние
        }
      } finally {
        drainRef.current = null;
        finish();
      }
    })();

    return done;
  }, []);

  /** Ставит в очередь текущее состояние секции, если есть что отправлять и оно готово к отправке. */
  const enqueueCurrent = useCallback((): boolean => {
    const { section: current, options: currentOptions } = latest.current;
    if (stoppedRef.current || !current || !current.dirty) {
      return false;
    }
    const request = buildSectionRequest(current, currentOptions.orderedKeys).request;
    if (request === null) {
      setState('local');
      return false;
    }
    pendingRef.current = { sectionId: current.sectionId, request, fingerprint: sectionFingerprint(current) };
    return true;
  }, []);

  // Debounce после изменения. Без правок ничего не делаем; пока секция не готова — только «На устройстве»
  useEffect(() => {
    if (!options.editable || !section || !section.dirty) {
      return;
    }
    if (built?.request === null) {
      setState('local');
      return;
    }
    setState('saving');
    const timer = setTimeout(() => {
      if (enqueueCurrent()) {
        void drain();
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // Зависим от отпечатка содержимого, а не от объекта секции: флаг `dirty` и время сохранения таймер не перезапускают
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, options.editable, enqueueCurrent, drain]);

  const flush = useCallback(async () => {
    if (!latest.current.options.editable) {
      return;
    }
    enqueueCurrent();
    // Если запрос уже идёт, `drain` вернёт его же: уход с шага дожидается и его, и накопленного после него
    await drain();
  }, [drain, enqueueCurrent]);

  // Сворачивание Mini App: несохранённое должно уйти, а не потеряться
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flush();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flush]);

  return { state, blockers, flush };
}
