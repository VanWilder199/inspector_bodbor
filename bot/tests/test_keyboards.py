import re
from pathlib import Path

from aiogram.types import InlineKeyboardMarkup, ReplyKeyboardMarkup

from app.keyboards import CREATE_REPORT_TEXT, OPEN_APP_TEXT, open_app_keyboard

APP_DIR = Path(__file__).resolve().parent.parent / "app"


def test_open_app_keyboard_is_inline_with_web_app():
    keyboard = open_app_keyboard("https://app.example.test")

    assert isinstance(keyboard, InlineKeyboardMarkup)
    assert not isinstance(keyboard, ReplyKeyboardMarkup)
    assert len(keyboard.inline_keyboard) == 1
    assert len(keyboard.inline_keyboard[0]) == 1

    button = keyboard.inline_keyboard[0][0]
    assert button.text == OPEN_APP_TEXT
    assert button.web_app is not None
    assert button.web_app.url == "https://app.example.test"


def test_open_app_keyboard_with_custom_text_and_page_is_still_inline_with_web_app():
    keyboard = open_app_keyboard("https://app.example.test/reports/new", CREATE_REPORT_TEXT)

    assert isinstance(keyboard, InlineKeyboardMarkup)
    button = keyboard.inline_keyboard[0][0]
    assert button.text == CREATE_REPORT_TEXT
    assert button.web_app.url == "https://app.example.test/reports/new"


def test_no_reply_keyboards_in_code():
    """Кнопки обычной клавиатуры с web_app не передают initData: в коде их быть не должно."""
    forbidden = re.compile(r"ReplyKeyboardMarkup|ReplyKeyboardBuilder|(?<!Inline)KeyboardButton\(")

    offenders = [
        str(path.relative_to(APP_DIR))
        for path in APP_DIR.rglob("*.py")
        if forbidden.search(path.read_text(encoding="utf-8"))
    ]

    assert offenders == []
