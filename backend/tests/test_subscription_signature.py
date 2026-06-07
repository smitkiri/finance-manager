import pytest

from app.utils.subscription_signature import normalize_signature


@pytest.mark.parametrize(
    "description,expected",
    [
        ("NETFLIX.COM 866-579-7172 CA", "netflix com ca"),
        ("PAYPAL *SPOTIFYUSA 4029357733 NY", "spotifyusa ny"),
        ("AMAZON PRIME*ABC1D2EF3", "amazon prime"),
        ("POS PURCHASE STARBUCKS #1234", "starbucks"),
        ("DEBIT CARD PAYMENT TO COSTCO", "costco"),
        ("Trader Joe's #42", "trader joes"),
        ("   Extra   Whitespace   ", "extra whitespace"),
    ],
)
def test_normalize_signature(description: str, expected: str) -> None:
    assert normalize_signature(description) == expected


def test_normalize_signature_empty_returns_empty() -> None:
    assert normalize_signature("") == ""


def test_normalize_signature_drops_trailing_single_letters() -> None:
    # Trailing single-letter tokens (state codes after city, etc.)
    assert normalize_signature("CHEVRON 0123 SAN JOSE CA") == "chevron san jose ca"
    # But internal single letters that are part of a brand survive.
    assert normalize_signature("H&M USA") == "hm usa"
