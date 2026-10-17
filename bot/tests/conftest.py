import pytest

from app.config import Settings

MINIAPP_URL = "https://app.example.test"


@pytest.fixture
def settings() -> Settings:
    # _env_file=None: тесты не должны зависеть от настоящего .env разработчика
    return Settings(
        telegram_bot_token="123456789:AAFakeTokenForTestsFakeTokenForTests",
        miniapp_url=MINIAPP_URL,
        _env_file=None,
    )
