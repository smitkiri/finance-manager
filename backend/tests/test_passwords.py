"""Tests for argon2 password hashing helpers."""

from app.utils.passwords import hash_password, verify_password


def test_hash_password_returns_argon2_string():
    hashed = hash_password("hunter22")
    assert hashed.startswith("$argon2id$")


def test_hash_password_produces_different_hashes_for_same_input():
    # Salts must be random; equal inputs must produce different hashes.
    assert hash_password("hunter22") != hash_password("hunter22")


def test_verify_password_accepts_correct_password():
    hashed = hash_password("hunter22")
    assert verify_password("hunter22", hashed) is True


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("hunter22")
    assert verify_password("wrong", hashed) is False


def test_verify_password_returns_false_for_invalid_hash():
    # Malformed hash string must not raise; just return False.
    assert verify_password("anything", "not-a-real-hash") is False


def test_verify_password_returns_false_for_empty_hash():
    # Existing migrated users have `password_hash = ''`; verify must fail safely.
    assert verify_password("anything", "") is False
