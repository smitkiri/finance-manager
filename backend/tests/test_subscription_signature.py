import pytest

from app.utils.subscription_signature import merge_key, normalize_signature


@pytest.mark.parametrize(
    "description,expected",
    [
        ("NETFLIX.COM 866-579-7172 CA", "netflix"),
        ("PAYPAL *SPOTIFYUSA 4029357733 NY", "spotifyusa"),
        ("AMAZON PRIME*ABC1D2EF3", "amazon prime"),
        ("POS PURCHASE STARBUCKS #1234", "starbucks"),
        ("DEBIT CARD PAYMENT TO COSTCO", "costco"),
        ("Trader Joe's #42", "trader joes"),
        ("   Extra   Whitespace   ", "extra whitespace"),
        (
            "TAITON REALTY DES:FUNDING ID:XXXXX1234 INDN:SMIT KIRI CO ID:XXXXX WEB",
            "taiton realty",
        ),
        ("Zelle payment to Kunjan Khatri Conf# abc123", "zelle kunjan khatri"),
        ("CLUBS AT CHARLESBOSTON MA", "clubs at charlesboston"),
        ("APPLE.COM/BILL INTERNET CHARGE CA", "apple bill internet charge"),
    ],
)
def test_normalize_signature(description: str, expected: str) -> None:
    assert normalize_signature(description) == expected


def test_normalize_signature_empty_returns_empty() -> None:
    assert normalize_signature("") == ""


def test_normalize_signature_drops_trailing_single_letters() -> None:
    # Trailing single-letter tokens (state codes after city, etc.)
    assert normalize_signature("CHEVRON 0123 SAN JOSE CA") == "chevron san jose"
    # But internal single letters that are part of a brand survive.
    assert normalize_signature("H&M USA") == "hm usa"


def test_normalize_signature_keeps_lone_state_like_token() -> None:
    # A single remaining token is never dropped, even if it looks like a state.
    assert normalize_signature("OK") == "ok"


@pytest.mark.parametrize(
    "a,b",
    [
        ("clubs at charlesboston", "club at charles boston"),
        ("netflix", "netflix"),
        ("club at charles riv", "clubs at charles riv"),
    ],
)
def test_merge_key_equivalent(a: str, b: str) -> None:
    assert merge_key(a) == merge_key(b)
