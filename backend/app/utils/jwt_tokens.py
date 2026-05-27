"""HS256 JWT encode/decode using pyjwt + app settings.

Tokens carry `sub` (user id), `iat`, and `exp`. Lifetime is controlled by
`settings.jwt_access_token_ttl_days`. The signing secret comes from
`settings.jwt_signing_secret`; the app refuses to start if it's unset
(see app/main.py).

Tokens issued before phase B carried a `household_id` claim too. Decode
is permissive — extra claims are ignored — so legacy tokens still work;
the household is now resolved from the user row, not from the claim.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt as pyjwt

from app.config import settings


class InvalidTokenError(Exception):
    """Raised when a JWT fails signature, expiry, or structural validation."""


_ALGORITHM = "HS256"


def encode_access_token(*, user_id: str) -> str:
    now = datetime.now(UTC)
    exp = now + timedelta(days=settings.jwt_access_token_ttl_days)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return pyjwt.encode(payload, settings.jwt_signing_secret, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return pyjwt.decode(
            token,
            settings.jwt_signing_secret,
            algorithms=[_ALGORITHM],
        )
    except pyjwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
