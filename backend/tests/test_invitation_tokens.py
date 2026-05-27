from app.utils.invitation_tokens import generate_invitation_token


def test_token_is_url_safe_and_long():
    t = generate_invitation_token()
    assert len(t) >= 40
    # token_urlsafe(32) -> 43 chars, all url-safe
    assert all(c.isalnum() or c in "-_" for c in t)


def test_token_is_unique_across_calls():
    seen = {generate_invitation_token() for _ in range(100)}
    assert len(seen) == 100
