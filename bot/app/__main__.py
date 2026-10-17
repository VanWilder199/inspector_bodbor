import asyncio
import logging
from typing import Optional

from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from app.config import Settings
from app.handlers import fallback, new_report, start

logger = logging.getLogger(__name__)

COMMANDS = [
    BotCommand(command="start", description="Открыть приложение"),
    BotCommand(command="new_report", description="Создать отчёт"),
    BotCommand(command="help", description="Как это работает"),
]

MENU_BUTTON_TEXT = "Отчёты"


def build_bot(settings: Settings) -> Bot:
    session: Optional[AiohttpSession] = None
    if settings.telegram_test_env:
        # В тестовом окружении Telegram методы вызываются как /bot<token>/test/<method>
        session = AiohttpSession(
            api=TelegramAPIServer(
                base="https://api.telegram.org/bot{token}/test/{method}",
                file="https://api.telegram.org/file/bot{token}/test/{path}",
            )
        )
    return Bot(token=settings.telegram_bot_token, session=session)


async def on_startup(bot: Bot, settings: Settings) -> None:
    # Menu Button выставляем при каждом старте, а не разово в BotFather: URL меняется между окружениями
    await bot.set_my_commands(COMMANDS)
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text=MENU_BUTTON_TEXT, web_app=WebAppInfo(url=settings.miniapp_url))
    )
    logger.info("Бот запущен, Mini App: %s (тестовое окружение: %s)", settings.miniapp_url, settings.telegram_test_env)


async def main() -> None:
    settings = Settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    bot = build_bot(settings)
    # Бот тонкий: состояния нет, FSM отключён. settings прокидывается в хендлеры по имени параметра
    dp = Dispatcher(disable_fsm=True, settings=settings)
    dp.startup.register(on_startup)
    dp.include_router(start.router)
    dp.include_router(new_report.router)
    dp.include_router(fallback.router)  # последним: ловит всё, что не разобрали остальные

    # Long polling: вебхук не нужен. На один токен должен быть запущен ровно один экземпляр бота
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
