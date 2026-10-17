import re
from typing import Optional
from urllib.parse import quote

# Допустимые payload'ы `/start <payload>` и пути Mini App — таблица start_param из плана (раздел 1.3)
_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_REPORT_PAYLOAD_RE = re.compile(r"report_(" + _UUID + r")")

# Простой поиск домена av.by (или его поддомена, например cars.av.by), схема необязательна.
# Строгая нормализация и проверка — в Mini App (MINI-07), бот только передаёт строку дальше.
# Lookbehind не даёт начать посреди другого хоста или адреса: `notav.by`, `user@av.by`, `evil.com/cars.av.by`.
# Lookahead не даёт принять `av.by.evil.com`. Длина ограничена: URL в кнопке Telegram не бесконечный.
_AVBY_URL_RE = re.compile(
    r"(?<![\w.@/-])(?:https?://)?(?:[a-z0-9-]+\.)*av\.by(?=[/?#\s]|$)[^\s]{0,500}",
    re.IGNORECASE,
)
_TRAILING_PUNCTUATION = ".,;:!?)»\"'"


def path_for_start_payload(payload: Optional[str]) -> str:
    """Путь внутри Mini App для `/start <payload>`. Неизвестный или пустой payload ведёт на главную."""
    if payload == "new":
        return "/reports/new"
    if payload == "demand":
        return "/demand"
    match = _REPORT_PAYLOAD_RE.fullmatch(payload or "")
    if match:
        return "/reports/" + match.group(1)
    return "/"


def miniapp_page_url(miniapp_url: str, path: str = "/") -> str:
    """Полный URL страницы Mini App. Для главной возвращает сам MINIAPP_URL."""
    base = miniapp_url.rstrip("/")
    if path == "/":
        return base
    return base + path


def new_report_url(miniapp_url: str, avby_url: Optional[str] = None) -> str:
    """URL экрана создания отчёта; ссылка av.by, если она есть, уходит в `?url=` целиком закодированной."""
    url = miniapp_page_url(miniapp_url, "/reports/new")
    if avby_url:
        url += "?url=" + quote(avby_url, safe="")
    return url


def find_avby_url(text: str) -> Optional[str]:
    """Первая ссылка av.by в тексте или None. Если схемы нет, подставляется https://."""
    match = _AVBY_URL_RE.search(text)
    if not match:
        return None
    url = match.group(0).rstrip(_TRAILING_PUNCTUATION)
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    return url
