from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.types import Message

from app.config import Settings
from app.keyboards import CREATE_REPORT_TEXT, open_app_keyboard
from app.links import find_avby_url, new_report_url

router = Router(name="fallback")
router.message.filter(F.chat.type == ChatType.PRIVATE)

FALLBACK_TEXT = "Отчёты создаются и редактируются в приложении. Нажмите кнопку ниже, чтобы открыть его."
AVBY_LINK_TEXT = "Создайте отчёт в приложении: ссылка на объявление av.by подставится сама."


# Роутер подключается последним: сюда попадает любой текст, который не разобрали остальные хендлеры
@router.message(F.text)
async def any_text(message: Message, settings: Settings) -> None:
    avby_url = find_avby_url(message.text)
    if avby_url:
        await message.answer(
            AVBY_LINK_TEXT,
            reply_markup=open_app_keyboard(new_report_url(settings.miniapp_url, avby_url), CREATE_REPORT_TEXT),
        )
        return
    await message.answer(FALLBACK_TEXT, reply_markup=open_app_keyboard(settings.miniapp_url))
