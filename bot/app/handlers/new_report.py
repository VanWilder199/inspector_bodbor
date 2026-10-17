from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.filters import Command
from aiogram.types import Message

from app.config import Settings
from app.keyboards import CREATE_REPORT_TEXT, open_app_keyboard
from app.links import new_report_url

router = Router(name="new_report")
# Кнопка web_app работает только в личном чате с ботом
router.message.filter(F.chat.type == ChatType.PRIVATE)

NEW_REPORT_TEXT = "Вставьте ссылку на объявление av.by в приложении — кнопка ниже откроет создание отчёта."


@router.message(Command("new_report"))
async def cmd_new_report(message: Message, settings: Settings) -> None:
    await message.answer(
        NEW_REPORT_TEXT,
        reply_markup=open_app_keyboard(new_report_url(settings.miniapp_url), CREATE_REPORT_TEXT),
    )
