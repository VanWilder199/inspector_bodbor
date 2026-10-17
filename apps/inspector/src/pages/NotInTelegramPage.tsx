/** Экран для запуска вне Telegram (в проде). Без initData все запросы к `/inspector/**` всё равно получили бы 401. */
export function NotInTelegramPage() {
  return (
    <main style={{ padding: 16 }}>
      <h1>Откройте в Telegram</h1>
      <p>Это приложение работает только внутри Telegram. Откройте бота и нажмите «Открыть приложение».</p>
    </main>
  );
}
