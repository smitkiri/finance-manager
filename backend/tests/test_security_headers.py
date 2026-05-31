"""Asserts that the production nginx config includes the security-header
directives Phase 1 added. We parse `nginx/prod.conf` as text since the
nginx container is not part of the pytest harness — the goal is to fail
the build if someone removes a required directive."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PROD_CONF = REPO_ROOT / "nginx" / "prod.conf"


def test_prod_conf_sets_security_headers():
    text = PROD_CONF.read_text()
    required_directives = [
        "add_header Strict-Transport-Security",
        'add_header X-Frame-Options "DENY"',
        'add_header X-Content-Type-Options "nosniff"',
        "add_header Referrer-Policy",
        "add_header Content-Security-Policy",
        "add_header Permissions-Policy",
        "frame-ancestors 'none'",
        "default-src 'self'",
        "connect-src 'self'",
        "server_tokens off",
    ]
    missing = [d for d in required_directives if d not in text]
    assert not missing, f"prod.conf is missing required directives: {missing}"
