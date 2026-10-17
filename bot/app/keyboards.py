from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

OPEN_APP_TEXT = "Открыть приложение"
CREATE_REPORT_TEXT = "Создать отчёт"


def open_app_keyboard(miniapp_url: str, text: str = OPEN_APP_TEXT) -> InlineKeyboardMarkup:
    """Inline-кнопка запуска Mini App (miniapp_url — главная или конкретная страница).

    Только inline: Mini App, открытый из кнопки обычной клавиатуры, не получает initData,
    и все запросы к /inspector/** будут падать с 401.
    """
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=text, web_app=WebAppInfo(url=miniapp_url))]
        ]
    )
