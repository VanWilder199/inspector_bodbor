import pytest
from pydantic import ValidationError

from app.config import Settings

TOKEN = "123456789:AAFakeTokenForTestsFakeTokenForTests"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in ("TELEGRAM_BOT_TOKEN", "MINIAPP_URL", "MINIAPP_DIRECT_LINK", "TELEGRAM_TEST_ENV", "LOG_LEVEL"):
        monkeypatch.delenv(name, raising=False)


def test_reads_settings_from_env(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("MINIAPP_URL", "https://app.site.by")
    monkeypatch.setenv("MINIAPP_DIRECT_LINK", "https://t.me/podbor_bot/app")
    monkeypatch.setenv("TELEGRAM_TEST_ENV", "true")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")

    settings = Settings(_env_file=None)

    assert settings.telegram_bot_token == TOKEN
    assert settings.miniapp_url == "https://app.site.by"
    assert settings.miniapp_direct_link == "https://t.me/podbor_bot/app"
    assert settings.telegram_test_env is True
    assert settings.log_level == "DEBUG"


def test_defaults(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("MINIAPP_URL", "https://app.site.by")

    settings = Settings(_env_file=None)

    assert settings.miniapp_direct_link is None
    assert settings.telegram_test_env is False
    assert settings.log_level == "INFO"


def test_token_is_required(monkeypatch):
    monkeypatch.setenv("MINIAPP_URL", "https://app.site.by")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_empty_miniapp_url_is_rejected(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("MINIAPP_URL", "")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
