from urllib.parse import parse_qs, urlsplit

import pytest

from app.links import find_avby_url, miniapp_page_url, new_report_url, path_for_start_payload

MINIAPP_URL = "https://app.example.test"
REPORT_ID = "5b0c7f0e-1d2a-4a47-9a33-6f0e4b3e9d21"


@pytest.mark.parametrize(
    "payload, expected_path",
    [
        (None, "/"),
        ("", "/"),
        ("new", "/reports/new"),
        ("demand", "/demand"),
        ("report_" + REPORT_ID, "/reports/" + REPORT_ID),
        ("report_" + REPORT_ID + "x", "/"),
        ("report_", "/"),
        ("report_../admin", "/"),
        ("NEW", "/"),
        ("unknown", "/"),
    ],
)
def test_path_for_start_payload(payload, expected_path):
    assert path_for_start_payload(payload) == expected_path


def test_miniapp_page_url_keeps_home_as_is_and_ignores_trailing_slash():
    assert miniapp_page_url(MINIAPP_URL) == MINIAPP_URL
    assert miniapp_page_url(MINIAPP_URL + "/") == MINIAPP_URL
    assert miniapp_page_url(MINIAPP_URL + "/", "/demand") == MINIAPP_URL + "/demand"


def test_new_report_url_without_link():
    assert new_report_url(MINIAPP_URL) == MINIAPP_URL + "/reports/new"


def test_new_report_url_encodes_link_completely():
    link = "https://cars.av.by/vw/passat/1?a=b&c=d"

    url = new_report_url(MINIAPP_URL, link)

    parts = urlsplit(url)
    assert parts.path == "/reports/new"
    # & и ? из самой ссылки не должны превратиться в параметры нашего URL
    assert list(parse_qs(parts.query).keys()) == ["url"]
    assert parse_qs(parts.query)["url"] == [link]


@pytest.mark.parametrize(
    "text, expected",
    [
        ("https://cars.av.by/vw/passat/1", "https://cars.av.by/vw/passat/1"),
        ("смотри https://cars.av.by/vw/passat/1, годится?", "https://cars.av.by/vw/passat/1"),
        ("(https://cars.av.by/vw/passat/1)", "https://cars.av.by/vw/passat/1"),
        ("cars.av.by/vw/passat/1", "https://cars.av.by/vw/passat/1"),
        ("HTTPS://CARS.AV.BY/vw/passat/1", "HTTPS://CARS.AV.BY/vw/passat/1"),
        ("http://av.by/x", "http://av.by/x"),
        ("https://av.by", "https://av.by"),
        ("https://cars.av.by/vw/passat/1?utm=tg#photo", "https://cars.av.by/vw/passat/1?utm=tg#photo"),
        ("1) https://cars.av.by/a/b/1 2) https://cars.av.by/a/b/2", "https://cars.av.by/a/b/1"),
    ],
)
def test_find_avby_url_finds_link(text, expected):
    assert find_avby_url(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "",
        "привет",
        "https://example.com/page",
        "notav.by/x",
        "https://notav.by/x",
        "https://av.by.evil.com/x",
        "https://evil.com/cars.av.by/x",
        "пишите на info@av.by",
    ],
)
def test_find_avby_url_ignores_other_text(text):
    assert find_avby_url(text) is None
