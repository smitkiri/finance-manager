from datetime import date

import pytest

from app.utils.date_parser import parse_date


def test_returns_date_object_unchanged():
    d = date(2024, 1, 15)
    assert parse_date(d) is d


def test_parses_iso_format():
    assert parse_date("2024-01-15") == date(2024, 1, 15)


def test_parses_us_slash_format():
    assert parse_date("04/30/2026") == date(2026, 4, 30)


def test_parses_us_dash_format():
    assert parse_date("04-30-2026") == date(2026, 4, 30)


def test_parses_iso_slash_format():
    assert parse_date("2026/04/30") == date(2026, 4, 30)


def test_strips_whitespace():
    assert parse_date("  04/30/2026  ") == date(2026, 4, 30)


def test_raises_on_unrecognized_format():
    with pytest.raises(ValueError, match="Unrecognized date format"):
        parse_date("not a date")


def test_raises_on_empty_string():
    with pytest.raises(ValueError):
        parse_date("")
