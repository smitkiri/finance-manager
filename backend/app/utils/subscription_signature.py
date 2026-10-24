"""Normalize a transaction description into a subscription matching signature."""

import re

# Tokens that don't help identify the merchant.
_NOISE_TOKENS: frozenset[str] = frozenset(
    {
        "pos",
        "purchase",
        "payment",
        "debit",
        "credit",
        "card",
        "to",
        "from",
        "tst",
        "sq",
        "paypal",
        "the",
        "com",
        "www",
    }
)

# Trailing US state / territory codes ("... BOSTON MA") vary by processor and
# don't identify the merchant.
_STATE_CODES: frozenset[str] = frozenset(
    "al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms "  # noqa: SIM905
    "mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi "
    "wy pr".split()
)

# Bank-appended detail after the merchant: ACH "DES:FUNDING ID:123 INDN:..."
# and Zelle "Conf# abc123". Everything from the marker on is dropped.
_BANK_TAIL_RE = re.compile(r"\s(?:des\s*:|conf\s*#).*$", re.IGNORECASE)
# Characters that should NOT split a token (the surrounding letters get glued
# together): apostrophes and ampersands. "Joe's" → "joes", "H&M" → "hm".
_INTRA_TOKEN_RE = re.compile(r"['&]")
# Everything else that isn't a letter/digit/whitespace acts as a separator.
_NON_WORD_RE = re.compile(r"[^a-z0-9\s]")
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_signature(description: str) -> str:
    """Return the matching signature for a transaction description.

    Lowercases, drops bank-appended ACH/Zelle detail, digits/punctuation,
    noise tokens, and trailing single-letter or state-code tokens. Returns an
    empty string for empty/whitespace-only input.
    """
    if not description or not description.strip():
        return ""

    lowered = _BANK_TAIL_RE.sub("", description).lower()
    # Apostrophes and ampersands don't break tokens.
    glued = _INTRA_TOKEN_RE.sub("", lowered)
    # All other punctuation is treated as a separator.
    spaced = _NON_WORD_RE.sub(" ", glued)
    tokens = [t for t in _WHITESPACE_RE.split(spaced) if t]
    # Drop pure-digit tokens and mixed-alnum tokens (transaction IDs, etc.).
    tokens = [t for t in tokens if t.isalpha()]
    tokens = [t for t in tokens if t not in _NOISE_TOKENS]

    while len(tokens) > 1 and (len(tokens[-1]) == 1 or tokens[-1] in _STATE_CODES):
        tokens.pop()

    return " ".join(tokens)


def merge_key(signature: str) -> str:
    """Spacing- and plural-insensitive form of a signature, used to cluster
    descriptor variants of one merchant ("clubs at charlesboston" and
    "club at charles boston" → "clubatcharleboton").

    Every "s" is dropped rather than just trailing ones: processors glue words
    together, so a plural can land mid-token ("clubsat...").
    """
    return signature.replace(" ", "").replace("s", "")
