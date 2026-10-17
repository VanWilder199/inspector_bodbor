from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import Message

from app.config import Settings
from app.keyboards import open_app_keyboard
from app.links import miniapp_page_url, path_for_start_payload

router = Router(name="start")
# Кнопка web_app работает только в личном чате с ботом
router.message.filter(F.chat.type == ChatType.PRIVATE)

WELCOME_TEXT = (
    "Маркетплейс автоотчётов: создавайте отчёты об осмотре авто с av.by "
    "и продавайте их покупателям.\n\n"
    "Нажмите кнопку ниже, чтобы открыть приложение."
)

HELP_TEXT = (
    "Как это работает:\n"
    "1. Откройте приложение кнопкой ниже и зарегистрируйтесь.\n"
    "2. После проверки аккаунта создайте отчёт: вставьте ссылку на объявление av.by.\n"
    "3. Заполните осмотр по шагам, загрузите фото и видео и отправьте отчёт на модерацию.\n\n"
    "Команды:\n"
    "/start — открыть приложение\n"
    "/new_report — создать отчёт по ссылке av.by\n"
    "/help — эта справка"
)


# CommandStart() срабатывает и на `/start <payload>` (deep link t.me/<bot>?start=<payload>):
# кнопка ведёт на страницу Mini App по таблице start_param, неизвестный payload — на главную
@router.message(CommandStart())
async def cmd_start(message: Message, settings: Settings, command: CommandObject) -> None:
    url = miniapp_page_url(settings.miniapp_url, path_for_start_payload(command.args))
    await message.answer(WELCOME_TEXT, reply_markup=open_app_keyboard(url))


@router.message(Command("help"))
async def cmd_help(message: Message, settings: Settings) -> None:
    await message.answer(HELP_TEXT, reply_markup=open_app_keyboard(settings.miniapp_url))
