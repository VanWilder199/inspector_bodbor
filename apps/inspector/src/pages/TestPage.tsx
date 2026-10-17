import { ReportView } from '@podbor/ui';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { MediaUploadCheck } from '@/media/MediaUploadCheck';
import { mockHeader, mockReport } from '@/mocks/fixtures/report';

/*
 * Песочница каркаса (только dev): на одной странице компоненты telegram-ui и ReportView из @podbor/ui,
 * чтобы сразу видеть, что стили Tailwind и telegram-ui не мешают друг другу.
 */
export function TestPage() {
  return (
    <main>
      <List>
        <Section header="telegram-ui">
          <Cell subtitle="Компонент telegram-ui">Тест каркаса Mini App</Cell>
          <Button size="m" stretched>
            Кнопка telegram-ui
          </Button>
        </Section>
      </List>

      <MediaUploadCheck />

      <div className="p-4">
        <ReportView report={mockReport} header={mockHeader} showPrice />
      </div>
    </main>
  );
}
