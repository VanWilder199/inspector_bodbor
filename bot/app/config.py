from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки бота. Читаются из переменных окружения и (для локального запуска) из `.env`."""

    # extra="ignore": в .env могут лежать посторонние переменные, падать из-за них не нужно
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Тот же токен, что и telegram.bot-token у бэкенда: иначе подпись initData не сойдётся
    telegram_bot_token: str = Field(min_length=1)
    # Адрес Mini App (HTTPS), без завершающего слеша
    miniapp_url: str = Field(min_length=1)
    # https://t.me/<bot>/app — понадобится для ссылок startapp (BOT-02)
    miniapp_direct_link: Optional[str] = None
    # true — работать с тестовым окружением Telegram
    telegram_test_env: bool = False
    log_level: str = "INFO"
