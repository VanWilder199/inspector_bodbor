from unittest.mock import AsyncMock

from aiogram.types import MenuButtonWebApp

from app.__main__ import COMMANDS, MENU_BUTTON_TEXT, build_bot, on_startup

from tests.conftest import MINIAPP_URL


async def test_on_startup_sets_commands_and_menu_button(settings):
    bot = AsyncMock()

    await on_startup(bot, settings)

    bot.set_my_commands.assert_awaited_once_with(COMMANDS)
    assert [command.command for command in COMMANDS] == ["start", "new_report", "help"]
    menu_button = bot.set_chat_menu_button.await_args.kwargs["menu_button"]
    assert isinstance(menu_button, MenuButtonWebApp)
    assert menu_button.text == MENU_BUTTON_TEXT
    assert menu_button.web_app.url == MINIAPP_URL


async def test_production_bot_uses_default_api_server(settings):
    bot = build_bot(settings)
    try:
        assert "/test/" not in bot.session.api.base
    finally:
        await bot.session.close()


async def test_test_env_bot_calls_test_api_server(settings):
    settings.telegram_test_env = True

    bot = build_bot(settings)
    try:
        assert bot.session.api.base == "https://api.telegram.org/bot{token}/test/{method}"
    finally:
        await bot.session.close()
