from unittest.mock import AsyncMock
from urllib.parse import quote

import pytest
from aiogram.filters import CommandObject
from aiogram.types import InlineKeyboardMarkup

from app.handlers.fallback import AVBY_LINK_TEXT, FALLBACK_TEXT, any_text
from app.handlers.new_report import NEW_REPORT_TEXT, cmd_new_report
from app.handlers.start import HELP_TEXT, WELCOME_TEXT, cmd_help, cmd_start
from app.keyboards import CREATE_REPORT_TEXT, OPEN_APP_TEXT

from tests.conftest import MINIAPP_URL

REPORT_ID = "5b0c7f0e-1d2a-4a47-9a33-6f0e4b3e9d21"


def assert_answered_with_button(
    message: AsyncMock, expected_text: str, expected_url: str, expected_button_text: str = OPEN_APP_TEXT
) -> None:
    message.answer.assert_awaited_once()
    args = message.answer.await_args.args
    kwargs = message.answer.await_args.kwargs

    assert args[0] == expected_text
    keyboard = kwargs["reply_markup"]
    assert isinstance(keyboard, InlineKeyboardMarkup)
    button = keyboard.inline_keyboard[0][0]
    assert button.text == expected_button_text
    assert button.web_app.url == expected_url


async def test_start_greets_and_offers_to_open_app(settings):
    message = AsyncMock()

    await cmd_start(message, settings, CommandObject(command="start", args=None))

    assert_answered_with_button(message, WELCOME_TEXT, MINIAPP_URL)


@pytest.mark.parametrize(
    "payload, expected_url",
    [
        ("new", MINIAPP_URL + "/reports/new"),
        ("demand", MINIAPP_URL + "/demand"),
        ("report_" + REPORT_ID, MINIAPP_URL + "/reports/" + REPORT_ID),
        ("report_not-a-uuid", MINIAPP_URL),
        ("garbage", MINIAPP_URL),
    ],
)
async def test_start_deep_link_opens_matching_page(settings, payload, expected_url):
    message = AsyncMock()

    await cmd_start(message, settings, CommandObject(command="start", args=payload))

    assert_answered_with_button(message, WELCOME_TEXT, expected_url)


async def test_help_explains_and_offers_to_open_app(settings):
    message = AsyncMock()

    await cmd_help(message, settings)

    assert_answered_with_button(message, HELP_TEXT, MINIAPP_URL)


async def test_new_report_opens_report_creation(settings):
    message = AsyncMock()

    await cmd_new_report(message, settings)

    assert_answered_with_button(message, NEW_REPORT_TEXT, MINIAPP_URL + "/reports/new", CREATE_REPORT_TEXT)


async def test_text_with_avby_link_passes_encoded_link_to_mini_app(settings):
    message = AsyncMock()
    message.text = "Посмотри https://cars.av.by/volkswagen/passat/112233445?utm=tg, что скажешь?"

    await any_text(message, settings)

    expected_link = quote("https://cars.av.by/volkswagen/passat/112233445?utm=tg", safe="")
    assert_answered_with_button(
        message, AVBY_LINK_TEXT, MINIAPP_URL + "/reports/new?url=" + expected_link, CREATE_REPORT_TEXT
    )


async def test_other_text_suggests_open_app(settings):
    message = AsyncMock()
    message.text = "Привет"

    await any_text(message, settings)

    assert_answered_with_button(message, FALLBACK_TEXT, MINIAPP_URL)
