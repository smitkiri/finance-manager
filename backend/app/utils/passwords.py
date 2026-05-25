"""Argon2id password hashing helpers.

argon2-cffi defaults (memory_cost, time_cost, parallelism) are tuned for
interactive logins on modern hardware. We use the library defaults.
"""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Return an argon2id hash string for `password`."""
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Return True iff `password` matches `hashed`.

    Returns False (never raises) for malformed or empty hash strings — this
    keeps existing migrated users (placeholder empty hash) and any historical
    junk in the column from crashing the login path.
    """
    if not hashed:
        return False
    try:
        return _hasher.verify(hashed, password)
    except VerifyMismatchError, InvalidHashError:
        return False
