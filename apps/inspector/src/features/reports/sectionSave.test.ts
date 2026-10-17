import { describe, expect, it } from 'vitest';
import { buildSectionRequest, sectionFingerprint } from './sectionSave';
import type { SectionDraft } from './draft';

const SECTION_ID = '00000000-0000-4000-8000-000000002001';
const ORDER = ['geometry', 'dents', 'rust', 'sills'] as const;

function section(overrides: Partial<SectionDraft> = {}): SectionDraft {
  return { sectionId: SECTION_ID, summary: '', items: {}, dirty: true, ...overrides };
}

describe('buildSectionRequest: что вообще можно отправить', () => {
  it('без итога секции запрос не формируется: бэкенд требует summary в каждом запросе', () => {
    const result = buildSectionRequest(section({ summary: '', items: { geometry: { status: 'OK' } } }), ORDER);

    expect(result.request).toBeNull();
    expect(result.blockers.needsSummary).toBe(true);
  });

  it('итог из одних пробелов считается пустым', () => {
    const result = buildSectionRequest(section({ summary: '   ', items: { geometry: { status: 'OK' } } }), ORDER);

    expect(result.request).toBeNull();
    expect(result.blockers.needsSummary).toBe(true);
  });

  it('без оценённых пунктов запрос не формируется: пустой items даёт на бэкенде 500', () => {
    const result = buildSectionRequest(section({ summary: 'Кузов в порядке', items: {} }), ORDER);

    expect(result.request).toBeNull();
    expect(result.blockers.noRatedItems).toBe(true);
  });

  it('пункт без status не считается оценённым: уходит только то, что оценено', () => {
    const result = buildSectionRequest(section({ summary: 'Итог', items: { geometry: { comment: 'заметка без оценки' } } }), ORDER);

    expect(result.request).toBeNull();
    expect(result.blockers.noRatedItems).toBe(true);
  });

  it('на WARN и BAD без комментария секция целиком не уходит: запрос — полная замена', () => {
    const result = buildSectionRequest(
      section({ summary: 'Итог', items: { geometry: { status: 'OK' }, rust: { status: 'BAD' }, sills: { status: 'WARN', comment: '  ' } } }),
      ORDER,
    );

    expect(result.request).toBeNull();
    expect(result.blockers.missingComment).toEqual(['rust', 'sills']);
  });

  it('на OK комментарий не нужен', () => {
    const result = buildSectionRequest(section({ summary: 'Итог', items: { geometry: { status: 'OK' } } }), ORDER);

    expect(result.request).not.toBeNull();
    expect(result.blockers.missingComment).toEqual([]);
  });
});

describe('buildSectionRequest: тело запроса', () => {
  it('replace-all: в запросе все оценённые пункты секции, а не только последний изменённый', () => {
    const result = buildSectionRequest(
      section({
        summary: 'Ржавчина на пороге',
        items: { geometry: { status: 'OK' }, dents: { status: 'WARN', comment: 'Левая дверь' }, rust: { status: 'BAD', comment: 'Левый порог' } },
      }),
      ORDER,
    );

    expect(result.request).toEqual({
      summary: 'Ржавчина на пороге',
      items: [
        { itemKey: 'geometry', status: 'OK', comment: null },
        { itemKey: 'dents', status: 'WARN', comment: 'Левая дверь' },
        { itemKey: 'rust', status: 'BAD', comment: 'Левый порог' },
      ],
    });
  });

  it('пункты идут в порядке справочника, а не в порядке добавления в объект', () => {
    const result = buildSectionRequest(
      section({ summary: 'Итог', items: { sills: { status: 'OK' }, geometry: { status: 'OK' }, rust: { status: 'OK' } } }),
      ORDER,
    );

    expect(result.request?.items.map((item) => item.itemKey)).toEqual(['geometry', 'rust', 'sills']);
  });

  it('неоценённые пункты в запрос не попадают', () => {
    const result = buildSectionRequest(section({ summary: 'Итог', items: { geometry: { status: 'OK' }, dents: {}, rust: { comment: 'только текст' } } }), ORDER);

    expect(result.request?.items).toEqual([{ itemKey: 'geometry', status: 'OK', comment: null }]);
  });

  it('незнакомый ключ с сервера не теряется: он уходит после пунктов справочника', () => {
    const result = buildSectionRequest(section({ summary: 'Итог', items: { geometry: { status: 'OK' }, legacy_item: { status: 'OK' } } }), ORDER);

    expect(result.request?.items.map((item) => item.itemKey)).toEqual(['geometry', 'legacy_item']);
  });

  it('пустой комментарий уходит как null, а не как пустая строка', () => {
    const result = buildSectionRequest(section({ summary: 'Итог', items: { geometry: { status: 'OK', comment: '   ' } } }), ORDER);

    expect(result.request?.items[0]?.comment).toBeNull();
  });

  it('пустой список пунктов не формируется ни при каких входных данных', () => {
    const inputs: SectionDraft[] = [
      section({ summary: 'Итог', items: {} }),
      section({ summary: 'Итог', items: { geometry: {} } }),
      section({ summary: 'Итог', items: { geometry: { comment: 'x' } } }),
      section({ summary: '', items: {} }),
    ];

    for (const input of inputs) {
      const { request } = buildSectionRequest(input, ORDER);
      expect(request === null || request.items.length > 0).toBe(true);
    }
  });
});

describe('sectionFingerprint', () => {
  it('одинаков для одинакового содержимого и не зависит от dirty, времени сохранения и порядка ключей', () => {
    const first = section({ summary: 'Итог', items: { geometry: { status: 'OK' }, rust: { status: 'BAD', comment: 'x' } }, dirty: true });
    const second = section({
      summary: 'Итог',
      items: { rust: { status: 'BAD', comment: 'x' }, geometry: { status: 'OK' } },
      dirty: false,
      lastSavedAt: '2026-10-14T10:00:00.000Z',
    });

    expect(sectionFingerprint(first)).toBe(sectionFingerprint(second));
  });

  it('меняется при правке итога, оценки или комментария', () => {
    const base = section({ summary: 'Итог', items: { geometry: { status: 'OK' } } });
    const fingerprint = sectionFingerprint(base);

    expect(sectionFingerprint({ ...base, summary: 'Другой итог' })).not.toBe(fingerprint);
    expect(sectionFingerprint({ ...base, items: { geometry: { status: 'BAD' } } })).not.toBe(fingerprint);
    expect(sectionFingerprint({ ...base, items: { geometry: { status: 'OK', comment: 'новый' } } })).not.toBe(fingerprint);
  });

  it('неоценённый пункт отпечаток не меняет: на сервер он всё равно не уходит', () => {
    const base = section({ summary: 'Итог', items: { geometry: { status: 'OK' } } });
    const withDraftNote = { ...base, items: { ...base.items, dents: { comment: 'ещё думаю' } } };

    expect(sectionFingerprint(withDraftNote)).toBe(sectionFingerprint(base));
  });
});
