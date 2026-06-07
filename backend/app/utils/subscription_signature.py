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
    }
)

# Characters that should NOT split a token (the surrounding letters get glued
# together): apostrophes and ampersands. "Joe's" → "joes", "H&M" → "hm".
_INTRA_TOKEN_RE = re.compile(r"['&]")
# Everything else that isn't a letter/digit/whitespace acts as a separator.
_NON_WORD_RE = re.compile(r"[^a-z0-9\s]")
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_signature(description: str) -> str:
    """Return the matching signature for a transaction description.

    Lowercases, drops digits/punctuation, drops noise tokens, drops trailing
    single-letter tokens (often store/state codes). Returns an empty string
    for empty/whitespace-only input.
    """
    if not description or not description.strip():
        return ""

    lowered = description.lower()
    # Apostrophes and ampersands don't break tokens.
    glued = _INTRA_TOKEN_RE.sub("", lowered)
    # All other punctuation is treated as a separator.
    spaced = _NON_WORD_RE.sub(" ", glued)
    tokens = [t for t in _WHITESPACE_RE.split(spaced) if t]
    # Drop pure-digit tokens and mixed-alnum tokens (transaction IDs, etc.).
    tokens = [t for t in tokens if t.isalpha()]
    tokens = [t for t in tokens if t not in _NOISE_TOKENS]

    while len(tokens) > 1 and len(tokens[-1]) == 1:
        tokens.pop()

    return " ".join(tokens)
